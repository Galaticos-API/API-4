from dataclasses import dataclass, field
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
    language_counts: dict[str, int] = field(default_factory=dict)
    current_files: list[str] = field(default_factory=list)

    stats: dict[str, Any] = field(default_factory=dict)
