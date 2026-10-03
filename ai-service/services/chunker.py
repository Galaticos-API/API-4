from typing import Any
import re


def chunk_document_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """
    Split unstructured text (e.g. uploaded documents) into chunks of ~800-1200 chars
    with an overlap of ~150 chars, breaking primarily on paragraph or sentence boundaries.
    Complies with Sinapse PRD Section 10.3.
    """
    if not text or not text.strip():
        return []

    if chunk_size < 1 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("chunk_size deve ser positivo e overlap menor que chunk_size")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # Long paragraphs are split without dropping their tail. Prefer whitespace
        # boundaries, while guaranteeing forward progress for unbroken tokens.
        pieces: list[str] = []
        remaining = para
        while len(remaining) > chunk_size:
            cut = remaining.rfind(" ", 0, chunk_size + 1)
            if cut <= 0:
                cut = chunk_size
            pieces.append(remaining[:cut].strip())
            remaining = remaining[max(1, cut - overlap):].lstrip()
        if remaining:
            pieces.append(remaining)

        for piece in pieces:
            candidate = f"{current}\n\n{piece}" if current else piece
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                carry = current[-overlap:].strip() if current and overlap else ""
                current = f"{carry}\n{piece}" if carry else piece
                if len(current) > chunk_size:
                    chunks.append(current[:chunk_size])
                    current = current[chunk_size - overlap:]
    if current:
        chunks.append(current)

    return [c.strip() for c in chunks if c.strip()]


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
