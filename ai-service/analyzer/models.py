from dataclasses import dataclass, field
import threading
from typing import Any


@dataclass
class FileInfo:
    path: str
    size: int
    extension: str
    language: str
    kind: str
    analyzed: bool = False
    chunks: int = 0
    symbols: dict[str, Any] = field(default_factory=dict)
    summary: str = ""


@dataclass
class RunState:
    run_id: str
    url: str
    status: str = "created"
    profile: str = "quick"
    stage: str = ""
    message: str = ""
    error: str = ""
    report_path: str = ""

    started_at: float = 0.0
    llm_start_time: float = 0.0
    llm_calls_done: int = 0
    llm_calls_estimated: int = 0
    files_total: int = 0
    files_processed: int = 0
    files_ignored: int = 0
    files_candidates: int = 0
    files_skipped_by_scope: int = 0
    language_counts: dict[str, int] = field(default_factory=dict)
    current_files: list[str] = field(default_factory=list)
    selected_paths: list[str] = field(default_factory=list)
    completed_summaries: dict[str, str] = field(default_factory=dict)
    partial_chunk_summaries: dict[str, list[str]] = field(default_factory=dict)
    project_summary: str = ""
    pause_event: Any = field(default_factory=threading.Event, repr=False)
    cancel_event: Any = field(default_factory=threading.Event, repr=False)
    worker_thread: Any = field(default=None, repr=False)

    stats: dict[str, Any] = field(default_factory=dict)
