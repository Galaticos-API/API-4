import ast
import os
from pathlib import Path
from collections import Counter

from .models import FileInfo

IGNORED_DIRS = {
    ".git", ".github", ".idea", ".vscode",
    "node_modules", "venv", ".venv", "env",
    "__pycache__", ".pytest_cache", ".mypy_cache",
    "dist", "build", "target", "coverage",
    ".next", ".nuxt", "vendor", "bin", "obj"
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
    ".pdf", ".zip", ".7z", ".rar", ".tar", ".gz",
    ".exe", ".dll", ".so", ".dylib", ".class",
    ".jar", ".woff", ".woff2", ".ttf", ".otf",
    ".mp3", ".mp4", ".avi", ".mov", ".sqlite", ".db"
}

LANGUAGES = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript/React",
    ".ts": "TypeScript",
    ".tsx": "TypeScript/React",
    ".java": "Java",
    ".kt": "Kotlin",
    ".go": "Go",
    ".rs": "Rust",
    ".c": "C",
    ".h": "C/C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".php": "PHP",
    ".rb": "Ruby",
    ".swift": "Swift",
    ".dart": "Dart",
    ".sql": "SQL",
    ".sh": "Shell",
    ".ps1": "PowerShell",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".vue": "Vue",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".md": "Markdown",
    ".txt": "Text",
    ".dockerfile": "Dockerfile",
}

IMPORTANT_FILENAMES = {
    "README", "README.md", "README.txt", "LICENSE",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "requirements.txt", "pyproject.toml", "package.json",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "pom.xml", "build.gradle", "go.mod", "Cargo.toml",
    ".env.example", ".gitignore"
}


def detect_language(path: Path) -> str:
    if path.name == "Dockerfile":
        return "Dockerfile"
    return LANGUAGES.get(path.suffix.lower(), "Unknown")


def is_probably_binary(path: Path) -> bool:
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return True
    try:
        with open(path, "rb") as handle:
            data = handle.read(4096)
        return b"\x00" in data
    except OSError:
        return True


def python_symbols(text: str) -> dict:
    result = {"functions": [], "classes": [], "imports": []}
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        result["parse_error"] = str(exc)
        return result

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            result["functions"].append({
                "name": node.name,
                "line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno)
            })
        elif isinstance(node, ast.ClassDef):
            result["classes"].append({
                "name": node.name,
                "line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno)
            })
        elif isinstance(node, ast.Import):
            for alias in node.names:
                result["imports"].append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            result["imports"].append(
                f"{node.module or ''}: " + ", ".join(a.name for a in node.names)
            )
    return result


def scan_repository(repo_dir: Path, max_file_size: int, max_files: int):
    files: list[FileInfo] = []
    ignored: list[dict] = []

    for current, dirs, filenames in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for filename in filenames:
            path = Path(current) / filename
            relative = path.relative_to(repo_dir).as_posix()

            try:
                size = path.stat().st_size
            except OSError:
                ignored.append({"path": relative, "reason": "stat_error"})
                continue

            if is_probably_binary(path):
                ignored.append({"path": relative, "reason": "binary"})
                continue

            if size > max_file_size:
                ignored.append({"path": relative, "reason": "file_too_large"})
                continue

            if len(files) >= max_files:
                ignored.append({"path": relative, "reason": "max_files_reached"})
                continue

            language = detect_language(path)
            kind = "documentation" if (
                language == "Markdown" or filename.upper().startswith("README")
            ) else "source/config"

            info = FileInfo(
                path=relative,
                size=size,
                extension=path.suffix.lower(),
                language=language,
                kind=kind,
            )

            if language == "Python":
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                    info.symbols = python_symbols(text)
                except OSError:
                    pass

            files.append(info)

    language_counts = Counter(item.language for item in files)

    return {
        "files": files,
        "ignored": ignored,
        "language_counts": dict(language_counts),
        "total_files": len(files),
        "analyzed_candidates": len(files),
        "ignored_files": len(ignored),
    }
