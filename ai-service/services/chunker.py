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

    # Normalize newlines
    text = text.replace("\r\n", "\n")
    paragraphs = re.split(r"\n\s*\n", text)
    
    chunks: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        para_len = len(para)
        
        if current_len + para_len <= chunk_size:
            current_chunk.append(para)
            current_len += para_len + 1
        else:
            if current_chunk:
                chunk_str = "\n\n".join(current_chunk)
                chunks.append(chunk_str)
                # Keep overlap if possible
                overlap_text = chunk_str[-overlap:] if len(chunk_str) > overlap else ""
                current_chunk = [overlap_text, para] if overlap_text else [para]
                current_len = sum(len(p) for p in current_chunk) + len(current_chunk) - 1
            else:
                # Single paragraph exceeds chunk_size, break by sentence or length
                chunks.append(para[:chunk_size])
                current_chunk = [para[chunk_size - overlap:]]
                current_len = len(current_chunk[0])

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

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
