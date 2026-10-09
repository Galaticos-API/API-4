from typing import Any
import re


def chunk_document_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """
    Split unstructured text (e.g. uploaded documents) into chunks of ~800-1200 chars
    with an overlap of ~150 chars, breaking primarily on paragraph or sentence boundaries.
    Complies with Sinapse PRD Section 10.3.
    """
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("Require chunk_size > 0 and 0 <= overlap < chunk_size")
    if not text or not text.strip():
        return []

    # Normalize newlines
    text = text.replace("\r\n", "\n")
    text = text.strip()
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            # Prefer a paragraph boundary only when it leaves meaningful progress.
            boundary = text.rfind("\n\n", start + max(overlap + 1, chunk_size // 2), end)
            if boundary >= 0:
                end = boundary + 2
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk)
        if end == len(text):
            break
        start = end - overlap
    return chunks


def create_structured_chunk(entity_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """
    Creates an atomic chunk for structured entities (Epic, Feature, Requirement, Decision).
    Per PRD Section 10.3, structured content is not broken by fixed size; the entity itself
    is the semantic unit.
    """
    parts: list[str] = []
    if "title" in data:
        parts.append(f"Título: {data['title']}")
    if "actor" in data:
        parts.append(f"Ator / Usuário: {data['actor']}")
    if "description" in data:
        parts.append(f"Descrição: {data['description']}")
    if "businessRules" in data and isinstance(data["businessRules"], list):
        parts.append("Regras de Negócio:\n" + "\n".join(f"- {r}" for r in data["businessRules"]))
    if "acceptanceCriteria" in data and isinstance(data["acceptanceCriteria"], list):
        parts.append("Critérios de Aceitação:\n" + "\n".join(f"- {c}" for c in data["acceptanceCriteria"]))
    if "decisionsAndRationale" in data:
        parts.append(f"Decisões e Racional: {data['decisionsAndRationale']}")

    content = "\n\n".join(parts)
    
    return {
        "entity_type": entity_type,
        "content": content,
        "metadata": {
            "project_id": data.get("project_id"),
            "feature_id": data.get("feature_id"),
            "technologies": data.get("technologies", []),
            "status": data.get("status", "draft"),
            "provenance": data.get("provenance", "human-authored"),
        }
    }
