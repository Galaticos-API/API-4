import unittest
from pathlib import Path
from analyzer.pipeline import Analyzer, STAGE_KEYS, STAGE_LABELS
from analyzer.config import AnalyzerSettings
from analyzer.scanner import detect_language, python_symbols, is_probably_binary
from analyzer.models import RunState


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


if __name__ == "__main__":
    unittest.main()
