import json
import math
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlsplit

from .config import AnalyzerSettings
from .models import RunState
from .ollama_client import OllamaClient
from .prompts import (
    SYSTEM,
    chunk_prompt,
    file_synthesis_prompt,
    project_synthesis_prompt,
    single_chunk_prompt,
)
from .scanner import scan_repository, select_analysis_files


class AnalysisError(RuntimeError):
    pass


STAGES = [
    ("ollama", "Verificando Ollama"),
    ("clone", "Clonando repositório"),
    ("scan", "Inventariando arquivos"),
    ("files", "Analisando arquivos"),
    ("synthesis", "Gerando síntese do projeto"),
    ("done", "Concluído"),
]
STAGE_KEYS = [key for key, _ in STAGES]
STAGE_LABELS = dict(STAGES)
STAGE_LABELS["error"] = "Falha na análise"


class AnalysisPaused(Exception):
    pass


class AnalysisCancelled(Exception):
    pass


class Analyzer:
    def __init__(self, settings: AnalyzerSettings):
        self.settings = settings
        self.client = OllamaClient(
            settings.ollama_base_url,
            settings.ollama_model,
            settings.request_timeout_seconds,
            settings.ollama_keep_alive,
            think=settings.ollama_think,
            max_retries=settings.ollama_max_retries,
            retry_backoff_seconds=settings.ollama_retry_backoff_seconds,
            num_predict=settings.ollama_num_predict,
            num_ctx=settings.ollama_num_ctx,
        )
        self.runs: dict[str, RunState] = {}
        self.lock = threading.Lock()
        self.checkpoint_lock = threading.Lock()
        self._restore_runs()

    def start(self, url: str, profile: str = "quick") -> str:
        normalized_url = self._normalize_github_url(url)
        if not normalized_url:
            raise AnalysisError(
                "Informe uma URL pública válida do GitHub "
                "(ex.: https://github.com/usuario/repositorio)."
            )

        if profile not in {"quick", "balanced", "complete"}:
            raise AnalysisError("Perfil inválido. Use quick, balanced ou complete.")

        run_id = uuid.uuid4().hex[:12]
        state = RunState(run_id=run_id, url=normalized_url, status="queued", profile=profile)
        with self.lock:
            self.runs[run_id] = state
        self._persist_checkpoint(state)
        self._start_worker(state)
        return run_id

    def _start_worker(self, state: RunState) -> None:
        thread = threading.Thread(target=self._run, args=(state.run_id,), daemon=True)
        state.worker_thread = thread
        thread.start()

    def pause(self, run_id: str) -> dict:
        state = self._get_run(run_id)
        if state.status not in {"queued", "running"}:
            raise AnalysisError("Só é possível pausar uma análise em andamento.")
        self._push(run_id, status="pausing", message="Aguardando concluir a etapa atual para salvar o progresso…")
        state.pause_event.set()
        return self.status(run_id)

    def resume(self, run_id: str) -> dict:
        state = self._get_run(run_id)
        has_progress = bool(state.completed_summaries or state.partial_chunk_summaries or state.project_summary)
        if state.status != "paused" and not (state.status == "failed" and has_progress):
            raise AnalysisError("A análise não está pausada ou não possui progresso recuperável.")
        state.pause_event.clear()
        state.cancel_event.clear()
        self._push(run_id, status="queued", error="", message="Retomando do último ponto salvo…")
        self._start_worker(state)
        return self.status(run_id)

    def cancel(self, run_id: str) -> dict:
        state = self._get_run(run_id)
        if state.status not in {"queued", "running", "pausing", "paused"}:
            raise AnalysisError("Só é possível cancelar uma análise não finalizada.")
        was_paused = state.status == "paused"
        state.pause_event.clear()
        self._push(run_id, status="cancelling", message="Cancelamento solicitado. A chamada atual ao modelo será concluída.")
        state.cancel_event.set()
        if was_paused:
            self._push(run_id, status="cancelled", message="Análise cancelada pelo usuário.", current_files=[])
        return self.status(run_id)

    def _get_run(self, run_id: str) -> RunState:
        state = self.runs.get(run_id) or self._load_persisted_run(run_id)
        if not state:
            raise AnalysisError("Execução não encontrada.")
        return state

    def _restore_runs(self) -> None:
        runs_dir = self.settings.workspace_dir / "runs"
        if not runs_dir.exists():
            return
        for run_dir in runs_dir.iterdir():
            checkpoint_path = run_dir / "checkpoint.json"
            if not checkpoint_path.exists():
                continue
            try:
                data = json.loads(checkpoint_path.read_text(encoding="utf-8"))
                state = RunState(
                    run_id=data["run_id"],
                    url=data["url"],
                    profile=data.get("profile", "quick"),
                    status=data.get("status", "paused"),
                    stage=data.get("stage", ""),
                    message=data.get("message", ""),
                    error=data.get("error", ""),
                    report_path=data.get("report_path", ""),
                    started_at=data.get("started_at", 0),
                    files_total=data.get("files_total", 0),
                    files_processed=data.get("files_processed", 0),
                    files_ignored=data.get("files_ignored", 0),
                    files_candidates=data.get("files_candidates", 0),
                    files_skipped_by_scope=data.get("files_skipped_by_scope", 0),
                    language_counts=data.get("language_counts", {}),
                    selected_paths=data.get("selected_paths", []),
                    completed_summaries=data.get("completed_summaries", {}),
                    partial_chunk_summaries=data.get("partial_chunk_summaries", {}),
                    project_summary=data.get("project_summary", ""),
                    llm_calls_done=data.get("llm_calls_done", 0),
                    llm_calls_estimated=data.get("llm_calls_estimated", 0),
                )
                if state.status == "cancelling":
                    state.status = "cancelled"
                    state.message = "Análise cancelada durante o encerramento do serviço."
                elif state.status in {"queued", "running", "pausing"}:
                    state.status = "paused"
                    state.message = "Serviço reiniciado. O progresso foi salvo; retome para continuar."
                state.stats = self._snapshot(state)
                self.runs[state.run_id] = state
                self._persist_checkpoint(state)
            except (OSError, ValueError, KeyError, TypeError):
                continue

    def _load_persisted_run(self, run_id: str) -> RunState | None:
        checkpoint_path = self.settings.workspace_dir / "runs" / run_id / "checkpoint.json"
        if checkpoint_path.exists():
            try:
                data = json.loads(checkpoint_path.read_text(encoding="utf-8"))
                state = RunState(
                    run_id=data["run_id"], url=data["url"], profile=data.get("profile", "quick"),
                    status=data.get("status", "paused"), stage=data.get("stage", ""),
                    message=data.get("message", ""), error=data.get("error", ""),
                    report_path=data.get("report_path", ""), started_at=data.get("started_at", 0),
                    files_total=data.get("files_total", 0), files_processed=data.get("files_processed", 0),
                    files_ignored=data.get("files_ignored", 0), files_candidates=data.get("files_candidates", 0),
                    files_skipped_by_scope=data.get("files_skipped_by_scope", 0),
                    language_counts=data.get("language_counts", {}), selected_paths=data.get("selected_paths", []),
                    completed_summaries=data.get("completed_summaries", {}),
                    partial_chunk_summaries=data.get("partial_chunk_summaries", {}),
                    project_summary=data.get("project_summary", ""),
                    llm_calls_done=data.get("llm_calls_done", 0), llm_calls_estimated=data.get("llm_calls_estimated", 0),
                )
                if state.status == "cancelling":
                    state.status = "cancelled"
                    state.message = "Análise cancelada durante o encerramento do serviço."
                elif state.status in {"queued", "running", "pausing"}:
                    state.status = "paused"
                    state.message = "Serviço reiniciado. O progresso foi salvo; retome para continuar."
                state.stats = self._snapshot(state)
                with self.lock:
                    self.runs[run_id] = state
                self._persist_checkpoint(state)
                return state
            except (OSError, ValueError, KeyError, TypeError):
                pass

        report_dir = self.settings.workspace_dir / "reports" / run_id
        report_path = report_dir / "report.md"
        if not report_path.exists():
            return None

        url = "-"
        total_files = 0
        language_counts = {}
        inv_path = report_dir / "inventory.json"
        if inv_path.exists():
            try:
                data = json.loads(inv_path.read_text(encoding="utf-8"))
                url = data.get("url", "-")
                total_files = data.get("total_files", 0)
                language_counts = data.get("language_counts", {})
            except Exception:
                pass

        state = RunState(
            run_id=run_id,
            url=url,
            status="completed",
            stage="done",
            message="Análise concluída com sucesso.",
            report_path=str(report_path),
            files_total=total_files,
            files_processed=total_files,
            language_counts=language_counts,
        )
        state.stats = {
            "files_total": total_files,
            "files_processed": total_files,
            "files_ignored": 0,
            "files_progress_percent": 100.0,
            "language_counts": language_counts,
            "current_files": [],
            "llm_calls_done": 0,
            "llm_calls_estimated": 0,
            "calls_progress_percent": 100.0,
            "elapsed_seconds": 0.0,
            "eta_seconds": 0.0,
            "throughput_calls_per_min": None,
        }
        with self.lock:
            self.runs[run_id] = state
        return state

    def status(self, run_id: str) -> dict:
        state = self.runs.get(run_id) or self._load_persisted_run(run_id)
        if not state:
            raise AnalysisError("Execução não encontrada.")

        stage_index = STAGE_KEYS.index(state.stage) + 1 if state.stage in STAGE_KEYS else 0

        return {
            "run_id": state.run_id,
            "url": state.url,
            "status": state.status,
            "stage": state.stage,
            "stage_label": STAGE_LABELS.get(state.stage, state.stage or "-"),
            "stage_index": stage_index,
            "stage_count": len(STAGES),
            "message": state.message,
            "error": state.error,
            "report_path": state.report_path,
            "profile": state.profile,
            "can_resume": state.status == "paused" or (
                state.status == "failed" and bool(state.completed_summaries or state.partial_chunk_summaries or state.project_summary)
            ),
            "can_cancel": state.status in {"queued", "running", "pausing", "paused"},
            "stats": state.stats,
        }

    def list_runs(self) -> list[dict]:
        with self.lock:
            runs_dict = dict(self.runs)

        reports_dir = self.settings.workspace_dir / "reports"
        if reports_dir.exists():
            for entry in reports_dir.iterdir():
                if entry.is_dir() and entry.name not in runs_dict:
                    persisted = self._load_persisted_run(entry.name)
                    if persisted:
                        runs_dict[entry.name] = persisted

        states = list(runs_dict.values())
        return [
            {
                "run_id": state.run_id,
                "url": state.url,
                "status": state.status,
                "stage": state.stage,
            }
            for state in sorted(states, key=lambda s: s.run_id, reverse=True)
        ]

    def report(self, run_id: str) -> str:
        state = self.runs.get(run_id) or self._load_persisted_run(run_id)
        if not state or not state.report_path:
            raise AnalysisError("Relatório ainda não está disponível.")

        path = Path(state.report_path)
        if not path.exists():
            raise AnalysisError("Arquivo do relatório não encontrado.")
        return path.read_text(encoding="utf-8")

    def _snapshot(self, state: RunState) -> dict:
        now = time.time()
        elapsed = round(now - state.started_at, 1) if state.started_at else 0.0

        eta = None
        throughput = None
        if state.llm_calls_done > 0 and state.llm_start_time:
            call_elapsed = now - state.llm_start_time
            avg = call_elapsed / state.llm_calls_done
            remaining = max(0, state.llm_calls_estimated - state.llm_calls_done)
            eta = round(avg * remaining, 1)
            if avg > 0:
                throughput = round(60 / avg, 2)

        files_progress_percent = None
        if state.files_total:
            files_progress_percent = round(
                state.files_processed / state.files_total * 100, 1
            )

        calls_progress_percent = None
        if state.llm_calls_estimated:
            calls_progress_percent = round(
                min(100, state.llm_calls_done / state.llm_calls_estimated * 100), 1
            )

        return {
            "files_total": state.files_total,
            "files_processed": state.files_processed,
            "files_ignored": state.files_ignored,
            "files_candidates": state.files_candidates,
            "files_selected": state.files_total,
            "files_skipped_by_scope": state.files_skipped_by_scope,
            "profile": state.profile,
            "can_resume": state.status == "paused" or (
                state.status == "failed" and bool(state.completed_summaries or state.partial_chunk_summaries or state.project_summary)
            ),
            "files_progress_percent": files_progress_percent,
            "language_counts": state.language_counts,
            "current_files": list(state.current_files),
            "llm_calls_done": state.llm_calls_done,
            "llm_calls_estimated": state.llm_calls_estimated,
            "calls_progress_percent": calls_progress_percent,
            "elapsed_seconds": elapsed,
            "eta_seconds": eta,
            "throughput_calls_per_min": throughput,
        }

    def _push(self, run_id: str, **field_updates):
        with self.lock:
            state = self.runs[run_id]
            for key, value in field_updates.items():
                setattr(state, key, value)
            state.stats = self._snapshot(state)
        self._persist_checkpoint(state)

    def _persist_checkpoint(self, state: RunState) -> None:
        run_dir = self.settings.workspace_dir / "runs" / state.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        checkpoint = run_dir / "checkpoint.json"
        temporary = checkpoint.with_suffix(".json.tmp")
        with self.checkpoint_lock:
            with self.lock:
                payload = {
                    "run_id": state.run_id, "url": state.url, "profile": state.profile,
                    "status": state.status, "stage": state.stage, "message": state.message,
                    "error": state.error, "report_path": state.report_path, "started_at": state.started_at,
                    "files_total": state.files_total, "files_processed": state.files_processed,
                    "files_ignored": state.files_ignored, "files_candidates": state.files_candidates,
                    "files_skipped_by_scope": state.files_skipped_by_scope,
                    "language_counts": dict(state.language_counts), "selected_paths": list(state.selected_paths),
                    "completed_summaries": dict(state.completed_summaries),
                    "partial_chunk_summaries": {path: list(summaries) for path, summaries in state.partial_chunk_summaries.items()},
                    "project_summary": state.project_summary,
                    "llm_calls_done": state.llm_calls_done, "llm_calls_estimated": state.llm_calls_estimated,
                }
            temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(checkpoint)

    def _note_llm_call(self, run_id: str):
        with self.lock:
            state = self.runs[run_id]
            if not state.llm_start_time:
                state.llm_start_time = time.time()
            state.llm_calls_done += 1
            state.stats = self._snapshot(state)

    def _file_started(self, run_id: str, path: str):
        with self.lock:
            state = self.runs[run_id]
            state.current_files.append(path)
            state.stats = self._snapshot(state)

    def _file_finished(self, run_id: str, path: str, succeeded: bool):
        with self.lock:
            state = self.runs[run_id]
            if path in state.current_files:
                state.current_files.remove(path)
            if succeeded:
                state.files_processed += 1
            state.stats = self._snapshot(state)
        self._persist_checkpoint(state)

    def _estimate_llm_calls(self, files) -> int:
        max_chunk_chars = max(1, self.settings.max_chunk_chars)
        total_calls = 1  # síntese final
        for info in files:
            chunks_est = max(1, math.ceil(info.size / max_chunk_chars)) if info.size else 1
            total_calls += 1 if chunks_est <= 1 else chunks_est + 1
        return total_calls

    def _check_control(self, run_id: str) -> None:
        state = self.runs[run_id]
        if state.cancel_event.is_set():
            raise AnalysisCancelled()
        if state.pause_event.is_set():
            raise AnalysisPaused()

    def _run(self, run_id: str):
        state = self.runs[run_id]
        run_dir = self.settings.workspace_dir / "runs" / run_id
        repo_dir = run_dir / "repo"
        report_dir = self.settings.workspace_dir / "reports" / run_id
        report_dir.mkdir(parents=True, exist_ok=True)

        try:
            self._push(run_id, status="running", stage=state.stage or "ollama",
                       message="Verificando se o Ollama está no ar e o modelo instalado...",
                       started_at=state.started_at or time.time())
            self._check_control(run_id)
            self.client.check()

            run_dir.mkdir(parents=True, exist_ok=True)

            self._check_control(run_id)
            if not repo_dir.exists():
                self._push(run_id, stage="clone", message="Clonando repositório (raso, 1 commit)...")
                self._clone(state.url, repo_dir)

            size_mb = self._directory_size(repo_dir) / (1024 * 1024)
            if size_mb > self.settings.max_repo_size_mb:
                raise AnalysisError(
                    f"Repositório excede o limite de {self.settings.max_repo_size_mb} MB."
                )

            self._check_control(run_id)
            self._push(run_id, stage="scan", message="Inventariando arquivos do repositório...")
            inventory = scan_repository(
                repo_dir,
                self.settings.max_file_size_kb * 1024,
                self.settings.max_files,
            )

            candidates = inventory["files"]
            files = select_analysis_files(
                candidates,
                state.profile,
                self.settings.quick_profile_files,
                self.settings.balanced_profile_files,
            )
            state.selected_paths = [item.path for item in files]
            total = len(files)
            state.files_candidates = len(candidates)
            state.files_skipped_by_scope = max(0, len(candidates) - total)
            state.files_ignored = inventory["ignored_files"]
            state.language_counts = inventory["language_counts"]
            state.files_total = total
            state.files_processed = sum(1 for item in files if item.path in state.completed_summaries)
            llm_calls_estimated = state.llm_calls_done + self._estimate_llm_calls(
                [item for item in files if item.path not in state.completed_summaries]
            )

            self._push(
                run_id,
                stage="files",
                message=(
                    f"Analisando {total} de {len(candidates)} arquivo(s) elegíveis "
                    f"(perfil {state.profile}) com o modelo "
                    f"{self.settings.ollama_model}..."
                ),
                files_total=total,
                files_candidates=len(candidates),
                files_skipped_by_scope=max(0, len(candidates) - total),
                files_processed=state.files_processed,
                files_ignored=inventory["ignored_files"],
                language_counts=inventory["language_counts"],
                llm_calls_estimated=llm_calls_estimated,
                current_files=[],
            )

            file_summaries = self._analyze_files(run_id, repo_dir, files)

            self._check_control(run_id)
            self._push(
                run_id,
                stage="synthesis",
                message="Consolidando a síntese técnica final do projeto...",
                current_files=[],
            )

            inventory_text = json.dumps({
                "total_files": inventory["total_files"],
                "analyzed_candidates": inventory["analyzed_candidates"],
                "ignored_files": inventory["ignored_files"],
                "language_counts": inventory["language_counts"],
                "ignored_examples": inventory["ignored"][:100],
                "selected_files": [item.path for item in files],
                "profile": state.profile,
            }, ensure_ascii=False, indent=2)

            synthesis_input, omitted_count = self._budget_summaries(
                file_summaries, self.settings.max_synthesis_chars
            )

            final = state.project_summary
            if not final:
                self._check_control(run_id)
                final = self.client.chat(
                    SYSTEM,
                    project_synthesis_prompt(
                        inventory_text,
                        synthesis_input,
                        compact=state.profile == "quick",
                    ),
                    should_cancel=lambda: self._check_control(run_id),
                    num_predict=self.settings.ollama_synthesis_num_predict,
                    accept_truncated=state.profile == "quick",
                )
                self._note_llm_call(run_id)
                with self.lock:
                    state.project_summary = final
                self._persist_checkpoint(state)
            self._check_control(run_id)

            if omitted_count:
                final += (
                    f"\n\n> Nota: {omitted_count} resumo(s) de arquivo não coube(ram) "
                    "no orçamento de contexto enviado ao modelo para esta síntese e "
                    "não foram considerados na etapa de síntese do projeto (continuam "
                    "detalhados individualmente na seção 'Arquivos analisados')."
                )

            coverage = (total / len(candidates) * 100) if candidates else 100

            report = self._build_report(
                state.url,
                inventory,
                final,
                file_summaries,
                coverage,
                state.profile,
                total,
                state.files_skipped_by_scope,
            )

            report_path = report_dir / "report.md"
            report_path.write_text(report, encoding="utf-8")

            (report_dir / "inventory.json").write_text(
                json.dumps({
                    "url": state.url,
                    "coverage_percent": coverage,
                    "total_files": inventory["total_files"],
                    "selected_files": total,
                    "skipped_by_scope": state.files_skipped_by_scope,
                    "profile": state.profile,
                    "ignored_files": inventory["ignored"],
                    "language_counts": inventory["language_counts"],
                }, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            self._push(
                run_id,
                status="completed",
                stage="done",
                message="Análise concluída com sucesso.",
                report_path=str(report_path),
                files_processed=total,
            )

        except AnalysisPaused:
            self._push(run_id, status="paused", message="Progresso salvo. Retome a análise quando quiser.", current_files=[])
        except AnalysisCancelled:
            self._push(run_id, status="cancelled", message="Análise cancelada pelo usuário.", current_files=[])

        except Exception as exc:
            self._push(
                run_id,
                status="failed",
                stage="error",
                error=str(exc),
                message="A análise falhou.",
                current_files=[],
            )

    def _analyze_files(self, run_id: str, repo_dir: Path, files) -> list[str]:
        max_workers = max(1, self.settings.ollama_concurrency)
        file_summaries: list[str | None] = [None] * len(files)

        for idx, info in enumerate(files):
            if info.path in self.runs[run_id].completed_summaries:
                file_summaries[idx] = self.runs[run_id].completed_summaries[info.path]

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self._process_file, run_id, repo_dir, info): idx
                for idx, info in enumerate(files)
                if file_summaries[idx] is None
            }
            try:
                for future in as_completed(futures):
                    idx = futures[future]
                    file_summaries[idx] = future.result()
            except Exception:
                executor.shutdown(wait=False, cancel_futures=True)
                raise

        return [summary or "" for summary in file_summaries]

    def _process_file(self, run_id: str, repo_dir: Path, info) -> str:
        self._check_control(run_id)
        self._file_started(run_id, info.path)
        succeeded = False
        try:
            path = repo_dir / info.path
            raw = path.read_bytes()
            if raw.startswith((b"\x00\x00\xfe\xff", b"\xff\xfe\x00\x00")):
                text = raw.decode("utf-32", errors="replace")
            elif raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                text = raw.decode("utf-16", errors="replace")
            elif raw.startswith(b"\xef\xbb\xbf"):
                text = raw.decode("utf-8-sig", errors="replace")
            else:
                text = raw.decode("utf-8", errors="replace")
            chunks = self._chunks(text, self.settings.max_chunk_chars)
            symbols_json = json.dumps(info.symbols, ensure_ascii=False)
            state = self.runs[run_id]

            if len(chunks) == 1:
                synthesis = self.client.chat(
                    SYSTEM,
                    single_chunk_prompt(
                        info.path,
                        info.language,
                        symbols_json,
                        chunks[0],
                        compact=state.profile == "quick",
                    ),
                    should_cancel=lambda: self._check_control(run_id),
                    num_predict=self.settings.ollama_file_num_predict,
                    accept_truncated=state.profile == "quick",
                )
                self._note_llm_call(run_id)
            else:
                chunk_summaries = list(state.partial_chunk_summaries.get(info.path, []))
                for chunk_index, chunk in enumerate(chunks[len(chunk_summaries):], start=len(chunk_summaries) + 1):
                    self._check_control(run_id)
                    prompt = chunk_prompt(
                        info.path,
                        info.language,
                        chunk_index,
                        len(chunks),
                        chunk,
                        symbols_json,
                        compact=state.profile == "quick",
                    )
                    chunk_summaries.append(self.client.chat(
                        SYSTEM,
                        prompt,
                        should_cancel=lambda: self._check_control(run_id),
                        num_predict=self.settings.ollama_file_num_predict,
                        accept_truncated=state.profile == "quick",
                    ))
                    self._note_llm_call(run_id)
                    with self.lock:
                        state.partial_chunk_summaries[info.path] = list(chunk_summaries)
                    self._persist_checkpoint(state)

                self._check_control(run_id)
                budgeted_chunk_summaries, omitted_chunks = self._budget_summaries(
                    chunk_summaries, self.settings.max_synthesis_chars
                )

                synthesis = self.client.chat(
                    SYSTEM,
                    file_synthesis_prompt(
                        info.path,
                        info.language,
                        symbols_json,
                        budgeted_chunk_summaries,
                        compact=state.profile == "quick",
                    ),
                    should_cancel=lambda: self._check_control(run_id),
                    num_predict=self.settings.ollama_file_num_predict,
                    accept_truncated=state.profile == "quick",
                )
                self._note_llm_call(run_id)

                if omitted_chunks:
                    synthesis += (
                        f"\n\n> Nota: {omitted_chunks} bloco(s) deste arquivo não "
                        "coube(ram) no orçamento de contexto desta consolidação."
                    )

            info.analyzed = True
            info.chunks = len(chunks)
            info.summary = synthesis
            summary = (
                f"ARQUIVO: {info.path}\n"
                f"LINGUAGEM: {info.language}\n"
                f"SÍMBOLOS: {symbols_json}\n"
                f"ANÁLISE:\n{synthesis}"
            )
            state = self.runs[run_id]
            with self.lock:
                state.completed_summaries[info.path] = summary
                state.partial_chunk_summaries.pop(info.path, None)
            succeeded = True
            return summary
        finally:
            self._file_finished(run_id, info.path, succeeded)

    @staticmethod
    def _normalize_github_url(url: str) -> str | None:
        try:
            parts = urlsplit((url or "").strip())
        except ValueError:
            return None

        if parts.scheme not in {"http", "https"}:
            return None

        host = parts.netloc.lower().split("@")[-1]
        if host not in {"github.com", "www.github.com"}:
            return None

        segments = [segment for segment in parts.path.split("/") if segment]
        if len(segments) < 2:
            return None

        owner, repo = segments[0], segments[1]
        repo = re.sub(r"\.git$", "", repo)

        valid_segment = re.compile(r"^[A-Za-z0-9._-]+$")
        if not valid_segment.match(owner) or not valid_segment.match(repo):
            return None

        return f"https://github.com/{owner}/{repo}"

    def _clone(self, url: str, destination: Path):
        if destination.exists():
            shutil.rmtree(destination)

        destination.parent.mkdir(parents=True, exist_ok=True)

        try:
            result = subprocess.run(
                [
                    "git", "clone",
                    "--depth", "1",
                    "--single-branch",
                    "--no-tags",
                    url,
                    str(destination),
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except FileNotFoundError as exc:
            raise AnalysisError(
                "Git não foi encontrado no PATH. Instale o Git e tente novamente."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise AnalysisError("O clone excedeu o tempo limite.") from exc

        if result.returncode != 0:
            raise AnalysisError(
                "Falha ao clonar o repositório:\n" +
                (result.stderr.strip() or result.stdout.strip())
            )

    @staticmethod
    def _directory_size(path: Path) -> int:
        total = 0
        for root, _, files in os.walk(path):
            for name in files:
                try:
                    total += (Path(root) / name).stat().st_size
                except OSError:
                    pass
        return total

    @staticmethod
    def _budget_summaries(summaries: list[str], max_chars: int) -> tuple[list[str], int]:
        if max_chars <= 0:
            return summaries, 0

        selected = []
        used = 0
        for summary in summaries:
            cost = len(summary) + 2
            if used + cost > max_chars and selected:
                break
            selected.append(summary)
            used += cost

        omitted = len(summaries) - len(selected)
        return selected, omitted

    @staticmethod
    def _chunks(text: str, max_chars: int) -> list[str]:
        if not text:
            return ["[arquivo vazio]"]

        lines = text.splitlines()
        chunks = []
        current = []
        size = 0

        for line in lines:
            if current and size + len(line) + 1 > max_chars:
                chunks.append("\n".join(current))
                current = []
                size = 0

            current.append(line)
            size += len(line) + 1

        if current:
            chunks.append("\n".join(current))

        return chunks

    @staticmethod
    def _build_report(url, inventory, final, file_summaries, coverage, profile="complete",
                      selected_count=None, skipped_by_scope=0):
        selected_count = len(file_summaries) if selected_count is None else selected_count
        lines = [
            "# Repository Intelligence Report",
            "",
            f"**Repositório:** {url}",
            "",
            "## Cobertura da análise",
            "",
            f"- Arquivos de texto elegíveis: **{inventory['total_files']}**",
            f"- Arquivos elegíveis encontrados: **{inventory['analyzed_candidates']}**",
            f"- Arquivos selecionados pelo perfil `{profile}`: **{selected_count}**",
            f"- Arquivos fora do escopo selecionado: **{skipped_by_scope}**",
            f"- Arquivos analisados: **{len(file_summaries)}**",
            f"- Arquivos ignorados: **{inventory['ignored_files']}**",
            f"- Cobertura de arquivos elegíveis: **{coverage:.2f}%**",
            "",
            "### Linguagens detectadas",
            "",
        ]

        for language, count in sorted(
            inventory["language_counts"].items(),
            key=lambda item: (-item[1], item[0])
        ):
            lines.append(f"- {language}: {count}")

        lines += [
            "",
            "## Síntese técnica",
            "",
            final,
            "",
            "## Arquivos analisados",
            "",
        ]

        for summary in file_summaries:
            lines.extend(["---", "", summary, ""])

        lines += [
            "## Arquivos ignorados",
            "",
        ]

        for item in inventory["ignored"]:
            lines.append(f"- `{item['path']}` - {item['reason']}")

        return "\n".join(lines)
