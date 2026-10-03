"""Run the versioned query set against the authenticated Sinapse search API."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from evaluate_search import DEFAULT_DATASET, load_json, validate_dataset


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def validate_api_base_url(value: str) -> str:
    """Refuse to send the local session cookie anywhere except loopback."""
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower()
        is_loopback = hostname == "localhost" or ipaddress.ip_address(hostname).is_loopback
        _ = parsed.port
    except (ValueError, TypeError):
        raise ValueError("A API de avaliação deve ser HTTP local (localhost/loopback), sem credenciais ou caminho") from None
    if (not is_loopback or parsed.scheme != "http" or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("A API de avaliação deve ser HTTP local (localhost/loopback), sem credenciais ou caminho")
    return value.rstrip("/")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_snapshot_sha256(root: Path = REPOSITORY_ROOT) -> str:
    """Hash tracked and non-ignored working files, excluding local env/temp data."""
    result = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard", "-z"],
        cwd=root, check=True, capture_output=True,
    )
    paths = sorted(path for path in result.stdout.decode("utf-8", errors="strict").split("\0") if path)
    digest = hashlib.sha256()
    for relative in paths:
        normalized = relative.replace("\\", "/")
        parts = normalized.split("/")
        if normalized == "tmp" or normalized.startswith("tmp/") or "node_modules" in parts:
            continue
        if any(Path(part).name.lower().startswith(".env") for part in parts):
            continue
        path = root / relative
        if path.is_symlink() or not path.is_file():
            continue
        digest.update(normalized.encode("utf-8"))
        digest.update(b"\0")
        with path.open("rb") as file:
            for block in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(block)
        digest.update(b"\0")
    return digest.hexdigest()


def working_tree_is_dirty(root: Path = REPOSITORY_ROOT) -> bool:
    result = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=normal"],
        cwd=root, check=True, capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def run_query(api_base_url: str, session_cookie: str, query: dict, limit: int, timeout: float) -> dict:
    parameters = {
        "q": query["query"],
        "projeto_id": query["project_id"],
        "limit": limit,
    }
    filters = query.get("filters", {})
    if filters.get("technology_id"):
        parameters["tecnologia_id"] = filters["technology_id"]
    if filters.get("level"):
        parameters["nivel"] = filters["level"]
    url = f"{api_base_url.rstrip('/')}/api/v1/search?{urlencode(parameters)}"
    request = Request(url, headers={
        "Accept": "application/json",
        "Cookie": f"sinapse_session={session_cookie}",
    })
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"{query['id']}: busca respondeu HTTP {error.code}") from None
    except (URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        raise RuntimeError(f"{query['id']}: não foi possível completar a consulta ({type(error).__name__})") from None
    latency_ms = round((time.perf_counter() - started) * 1000)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise RuntimeError(f"{query['id']}: resposta da busca não contém items[]")
    normalized = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not isinstance(item.get("project_id"), str):
            raise RuntimeError(f"{query['id']}: resultado sem id ou project_id verificável")
        normalized_item = {"source_id": item["id"], "project_id": item["project_id"]}
        score = item.get("relevance_score")
        if isinstance(score, (int, float)) and not isinstance(score, bool):
            normalized_item["relevance_score"] = float(score)
        normalized.append(normalized_item)
    return {"query_id": query["id"], "latency_ms": latency_ms, "results": normalized}


def run_suite(dataset: dict, api_base_url: str, session_cookie: str, limit: int = 5, timeout: float = 30,
              dataset_path: Path | None = None) -> dict:
    validate_dataset(dataset)
    api_base_url = validate_api_base_url(api_base_url)
    if not session_cookie.strip():
        raise ValueError("SINAPSE_SESSION_COOKIE não foi configurado")
    if limit < 1 or limit > 50:
        raise ValueError("limit deve estar entre 1 e 50")
    runs = [run_query(api_base_url, session_cookie, query, limit, timeout) for query in dataset["queries"]]
    run_by_id = {run["query_id"]: run for run in runs}
    categories = sorted({query.get("category", "uncategorized") for query in dataset["queries"]})
    by_category = {
        category: [run_by_id[query["id"]]["latency_ms"] for query in dataset["queries"]
                   if query.get("category", "uncategorized") == category]
        for category in categories
    }
    ordered_latency = sorted(run["latency_ms"] for run in runs)
    try:
        revision = os.getenv("SEARCH_CODE_REVISION") or subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPOSITORY_ROOT, check=True, capture_output=True, text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        revision = "unknown"
    dataset_file = dataset_path or Path(os.getenv("SEARCH_DATASET_PATH", ""))
    if not dataset_file.is_file():
        dataset_file = DEFAULT_DATASET if dataset.get("version") == 1 else Path(__file__).parent / "datasets" / "search-ptbr-v2.json"
    corpus_path = REPOSITORY_ROOT / dataset.get("corpus", {}).get("file", "")
    try:
        dirty = working_tree_is_dirty()
        snapshot_hash = source_snapshot_sha256()
    except (OSError, subprocess.CalledProcessError, UnicodeDecodeError):
        dirty, snapshot_hash = None, "unavailable"
    try:
        corpus_hash = _sha256_file(corpus_path) if corpus_path.is_file() else "unavailable"
    except OSError:
        corpus_hash = "unavailable"
    def percentile(p: float) -> int:
        import math
        return ordered_latency[max(0, math.ceil(p * len(ordered_latency)) - 1)]
    return {
        "dataset": dataset["dataset"],
        "version": dataset["version"],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "limit": limit,
        "execution_metadata": {
            "query_count": len(runs),
            "categories": {category: len(values) for category, values in by_category.items()},
            "latency_p50_ms": percentile(0.50),
            "latency_p95_ms": percentile(0.95),
            "endpoint_kind": "authenticated_local_api",
            "code_revision": revision,
            "working_tree_dirty": dirty,
            "source_snapshot_sha256": snapshot_hash,
            "dataset_sha256": _sha256_file(dataset_file),
            "corpus_sha256": corpus_hash,
            "embedding_model": os.getenv("SEARCH_EMBEDDING_MODEL", "bge-m3"),
            "minimum_vector_similarity": float(os.getenv("SEARCH_MIN_VECTOR_SIMILARITY", "0.55")),
            "minimum_text_rank": float(os.getenv("SEARCH_MIN_TEXT_RANK", "0.05")),
            "ollama_warmed_up": os.getenv("SEARCH_OLLAMA_WARMED_UP", "unknown"),
        },
        "runs": runs,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api-base-url", default=os.getenv("SINAPSE_API_BASE_URL", "http://localhost:3001"))
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args(argv)
    try:
        dataset = load_json(args.dataset)
        result = run_suite(dataset, args.api_base_url, os.getenv("SINAPSE_SESSION_COOKIE", ""), args.limit, args.timeout, args.dataset)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as error:
        print(f"Erro ao executar a bateria: {error}", file=sys.stderr)
        return 2
    print(f"Resultados da avaliação gravados em {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
