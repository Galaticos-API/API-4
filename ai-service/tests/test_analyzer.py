import unittest
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
from analyzer.pipeline import Analyzer, STAGE_KEYS, STAGE_LABELS
from analyzer.config import AnalyzerSettings
from analyzer.scanner import detect_language, python_symbols, is_probably_binary, select_analysis_files
from analyzer.models import FileInfo, RunState


class TestAnalyzer(unittest.TestCase):
    def setUp(self):
        self.settings = AnalyzerSettings(workspace_dir=Path("test_workspace"))
        self.analyzer = Analyzer(self.settings)

    def test_normalize_github_url(self):
        # Valid URLs
        self.assertEqual(
            self.analyzer._normalize_github_url("https://github.com/DanielDPereira/RepoAnalyzer"),
            "https://github.com/DanielDPereira/RepoAnalyzer"
        )
        self.assertEqual(
            self.analyzer._normalize_github_url("https://github.com/DanielDPereira/RepoAnalyzer.git"),
            "https://github.com/DanielDPereira/RepoAnalyzer"
        )
        self.assertEqual(
            self.analyzer._normalize_github_url("https://www.github.com/owner/repo/"),
            "https://github.com/owner/repo"
        )
        self.assertEqual(
            self.analyzer._normalize_github_url("http://github.com/owner/repo?ref=main#readme"),
            "https://github.com/owner/repo"
        )

        # Invalid URLs
        self.assertIsNone(self.analyzer._normalize_github_url("https://gitlab.com/owner/repo"))
        self.assertIsNone(self.analyzer._normalize_github_url("not-a-url"))
        self.assertIsNone(self.analyzer._normalize_github_url("https://github.com/singlepart"))

    def test_detect_language(self):
        self.assertEqual(detect_language(Path("app.py")), "Python")
        self.assertEqual(detect_language(Path("index.ts")), "TypeScript")
        self.assertEqual(detect_language(Path("App.tsx")), "TypeScript/React")
        self.assertEqual(detect_language(Path("Dockerfile")), "Dockerfile")
        self.assertEqual(detect_language(Path("unknown.xyz")), "Unknown")

    def test_python_symbols_extraction(self):
        code = """
import os
from math import sqrt

class Calculator:
    def add(self, a, b):
        return a + b

def standalone_func():
    pass
"""
        symbols = python_symbols(code)
        self.assertIn("functions", symbols)
        self.assertIn("classes", symbols)
        self.assertIn("imports", symbols)

        func_names = [f["name"] for f in symbols["functions"]]
        self.assertIn("add", func_names)
        self.assertIn("standalone_func", func_names)

        class_names = [c["name"] for c in symbols["classes"]]
        self.assertIn("Calculator", class_names)

    def test_chunks_and_budgeting(self):
        text = "line 1\nline 2\nline 3\nline 4"
        chunks = Analyzer._chunks(text, max_chars=14)
        self.assertGreater(len(chunks), 1)

        summaries = ["resumo 1", "resumo 2", "resumo 3"]
        selected, omitted = Analyzer._budget_summaries(summaries, max_chars=20)
        self.assertEqual(len(selected) + omitted, len(summaries))

    def test_stages_consistency(self):
        self.assertIn("ollama", STAGE_KEYS)
        self.assertIn("clone", STAGE_KEYS)
        self.assertIn("scan", STAGE_KEYS)
        self.assertIn("files", STAGE_KEYS)
        self.assertIn("synthesis", STAGE_KEYS)
        self.assertIn("done", STAGE_KEYS)
        for key in STAGE_KEYS:
            self.assertIn(key, STAGE_LABELS)

    def test_analysis_profiles_prioritize_core_files_and_bound_llm_scope(self):
        files = [
            FileInfo("src/service.py", 100, ".py", "Python", "source/config"),
            FileInfo("README.md", 100, ".md", "Markdown", "documentation"),
            FileInfo("tests/test_service.py", 100, ".py", "Python", "source/config"),
            FileInfo("package-lock.json", 100, ".json", "JSON", "source/config"),
        ]
        quick = select_analysis_files(files, "quick", quick_limit=2)
        self.assertEqual([item.path for item in quick], ["README.md", "src/service.py"])
        self.assertEqual(len(select_analysis_files(files, "balanced", balanced_limit=3)), 3)
        self.assertEqual(len(select_analysis_files(files, "complete")), len(files))
        with self.assertRaises(ValueError):
            select_analysis_files(files, "unknown")

    def test_quick_profile_defaults_to_eight_priority_files(self):
        files = [
            FileInfo(f"src/module_{index}.py", 100, ".py", "Python", "source/config")
            for index in range(12)
        ]
        self.assertEqual(len(select_analysis_files(files, "quick")), 8)

    def test_failed_analysis_with_saved_summaries_can_resume_without_repeating_them(self):
        state = RunState(
            run_id="failedresume1", url="https://github.com/acme/api", status="failed",
            profile="quick", stage="files", files_total=2, files_processed=1,
            selected_paths=["README.md", "src/app.py"],
            completed_summaries={"README.md": "resumo salvo"},
        )
        self.analyzer.runs[state.run_id] = state
        state.stats = self.analyzer._snapshot(state)
        self.assertTrue(self.analyzer.status(state.run_id)["can_resume"])
        self.assertTrue(self.analyzer.status(state.run_id)["stats"]["can_resume"])

        with patch.object(self.analyzer, "_start_worker") as start_worker:
            result = self.analyzer.resume(state.run_id)

        self.assertEqual(result["status"], "queued")
        self.assertEqual(self.analyzer.runs[state.run_id].error, "")
        start_worker.assert_called_once_with(state)

    def test_checkpoint_restores_running_analysis_as_resumable_and_keeps_finished_summaries(self):
        with TemporaryDirectory() as workspace:
            settings = AnalyzerSettings(workspace_dir=Path(workspace))
            original = Analyzer(settings)
            state = RunState(
                run_id="checkpoint1", url="https://github.com/acme/api", status="running",
                stage="files", profile="quick", files_total=2, files_processed=1,
                selected_paths=["README.md", "src/app.py"],
                completed_summaries={"README.md": "resumo salvo"},
                partial_chunk_summaries={"src/app.py": ["primeiro bloco salvo"]},
            )
            original.runs[state.run_id] = state
            original._persist_checkpoint(state)

            restored = Analyzer(settings)
            saved = restored.status(state.run_id)
            self.assertEqual(saved["status"], "paused")
            self.assertTrue(saved["can_resume"])
            self.assertEqual(saved["stats"]["files_processed"], 1)
            self.assertEqual(restored.runs[state.run_id].completed_summaries, {"README.md": "resumo salvo"})
            self.assertEqual(restored.runs[state.run_id].partial_chunk_summaries, {"src/app.py": ["primeiro bloco salvo"]})
            original.client.close()
            restored.client.close()

    def test_cancel_from_paused_state_is_terminal(self):
        with TemporaryDirectory() as workspace:
            analyzer = Analyzer(AnalyzerSettings(workspace_dir=Path(workspace)))
            state = RunState(run_id="paused123", url="https://github.com/acme/api", status="paused", stage="files")
            analyzer.runs[state.run_id] = state
            result = analyzer.cancel(state.run_id)
            self.assertEqual(result["status"], "cancelled")
            self.assertFalse(result["can_resume"])
            analyzer.client.close()

    def test_service_restart_does_not_resume_an_interrupted_cancellation(self):
        with TemporaryDirectory() as workspace:
            settings = AnalyzerSettings(workspace_dir=Path(workspace))
            original = Analyzer(settings)
            original.runs["cancel123"] = RunState(
                run_id="cancel123", url="https://github.com/acme/api", status="cancelling", stage="files"
            )
            original._persist_checkpoint(original.runs["cancel123"])
            restored = Analyzer(settings)
            self.assertEqual(restored.status("cancel123")["status"], "cancelled")
            self.assertFalse(restored.status("cancel123")["can_resume"])
            original.client.close()
            restored.client.close()

    def test_pause_and_resume_reuses_completed_file_summary(self):
        with TemporaryDirectory() as workspace:
            settings = AnalyzerSettings(workspace_dir=Path(workspace), quick_profile_files=1, ollama_max_retries=0)
            analyzer = Analyzer(settings)
            state = RunState(run_id="resume123", url="https://github.com/acme/api", status="queued", profile="quick")
            analyzer.runs[state.run_id] = state

            def clone(_url, destination):
                (destination / "src").mkdir(parents=True, exist_ok=True)
                (destination / "README.md").write_text("Projeto de teste", encoding="utf-8")
                (destination / "src" / "app.py").write_text("def main():\n    return 1\n", encoding="utf-8")

            analyzer._clone = clone

            class FakeClient:
                def __init__(self):
                    self.calls = []
                    self.truncation_policies = []
                    self.pause_on_first_call = True

                def check(self):
                    return None

                def chat(self, _system, prompt, should_cancel=None, num_predict=None, accept_truncated=False):
                    self.calls.append(prompt)
                    self.truncation_policies.append(accept_truncated)
                    if self.pause_on_first_call:
                        self.pause_on_first_call = False
                        analyzer.pause(state.run_id)
                    if should_cancel:
                        should_cancel()
                    return f"resposta-{len(self.calls)}"

                def close(self):
                    return None

            client = FakeClient()
            analyzer.client = client
            analyzer._start_worker(state)
            state.worker_thread.join(timeout=5)
            self.assertFalse(state.worker_thread.is_alive())
            self.assertEqual(analyzer.status(state.run_id)["status"], "paused")
            self.assertEqual(state.files_processed, 0)
            self.assertNotIn("README.md", state.completed_summaries)

            resumed = analyzer.resume(state.run_id)
            self.assertIn(resumed["status"], {"queued", "running"})
            state.worker_thread.join(timeout=5)
            self.assertFalse(state.worker_thread.is_alive())
            self.assertEqual(analyzer.status(state.run_id)["status"], "completed")
            self.assertEqual(len(client.calls), 3)  # Refaz a chamada interrompida e depois sintetiza o projeto.
            self.assertEqual(client.truncation_policies, [True, True, True])


if __name__ == "__main__":
    unittest.main()
