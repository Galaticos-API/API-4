import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class AnalyzerSettings:
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", os.getenv("OLLAMA_LLM_MODEL", "qwen2.5:1.5b"))
    max_repo_size_mb: int = int(os.getenv("MAX_REPO_SIZE_MB", "300"))
    max_file_size_kb: int = int(os.getenv("MAX_FILE_SIZE_KB", "500"))
    max_chunk_chars: int = int(os.getenv("MAX_CHUNK_CHARS", "10000"))
    max_files: int = int(os.getenv("MAX_FILES", "1000"))
    workspace_dir: Path = Path(os.getenv("WORKSPACE_DIR", "workspace_analyzer"))
    request_timeout_seconds: int = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))
    ollama_keep_alive: str = os.getenv("OLLAMA_KEEP_ALIVE", "5m")
    ollama_think: bool = False
    ollama_max_retries: int = int(os.getenv("OLLAMA_MAX_RETRIES", "2"))
    ollama_retry_backoff_seconds: float = float(os.getenv("OLLAMA_RETRY_BACKOFF_SECONDS", "3"))
    max_synthesis_chars: int = int(os.getenv("MAX_SYNTHESIS_CHARS", "60000"))
    ollama_concurrency: int = max(1, int(os.getenv("OLLAMA_CONCURRENCY", "1")))


settings = AnalyzerSettings()
settings.workspace_dir.mkdir(parents=True, exist_ok=True)
