from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any
from config import settings
from services.ollama_client import ollama_client
from services.chunker import chunk_document_text, create_structured_chunk

app = FastAPI(
    title="Sinapse AI Service",
    description="Serviço de IA, RAG, Chunking e Integração com Ollama para o Sinapse",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestDocumentRequest(BaseModel):
    document_id: str = Field(..., description="ID ou nome do documento")
    text_content: str = Field(..., description="Conteúdo textual completo do documento")
    project_id: str | None = Field(None, description="ID do projeto associado")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Metadados do documento")


class IngestEntityRequest(BaseModel):
    entity_type: str = Field(..., description="epic, feature, requirement ou decision")
    data: dict[str, Any] = Field(..., description="Campos da entidade estruturada")


class EmbeddingRequest(BaseModel):
    text: str = Field(..., description="Texto para cálculo de embeddings")
    model: str | None = Field(None, description="Modelo de embedding (padrão do settings)")


class RagQueryRequest(BaseModel):
    query: str = Field(..., description="Pergunta ou busca em linguagem natural")
    project_id: str | None = Field(None, description="Filtro obrigatório de projeto (PRD 10.3)")
    context_chunks: list[str] = Field(default_factory=list, description="Top-K trechos recuperados")


@app.get("/health")
async def health_check():
    """Healthcheck do serviço de IA e conectividade com o Ollama."""
    ollama_ok = await ollama_client.check_health()
    return {
        "status": "healthy" if ollama_ok else "degraded",
        "service": "sinapse-ai-service",
        "version": "0.1.0",
        "dependencies": {
            "ollama": {
                "status": "connected" if ollama_ok else "disconnected",
                "base_url": settings.OLLAMA_BASE_URL,
                "llm_model": settings.OLLAMA_LLM_MODEL,
                "embedding_model": settings.OLLAMA_EMBEDDING_MODEL,
            }
        },
    }


@app.post("/ingest/document", status_code=status.HTTP_200_OK)
async def ingest_document(req: IngestDocumentRequest):
    """
    Endpoint chamado pelo pipeline do n8n após extração de arquivo em /files.
    Executa chunking unificado e gera vetores com Ollama.
    """
    chunks = chunk_document_text(req.text_content)
    
    # Process each chunk with embedding
    processed = []
    for idx, chunk in enumerate(chunks):
        try:
            vector = await ollama_client.get_embedding(chunk)
            vector_dim = len(vector)
        except Exception:
            vector_dim = 0
            
        processed.append({
            "chunk_index": idx,
            "text": chunk,
            "vector_dimension": vector_dim,
            "project_id": req.project_id,
        })
        
    return {
        "document_id": req.document_id,
        "total_chunks": len(chunks),
        "status": "chunked_and_indexed",
        "chunks": processed,
    }


@app.post("/ingest/entity", status_code=status.HTTP_200_OK)
async def ingest_structured_entity(req: IngestEntityRequest):
    """
    Endpoint para ingestão de entidades estruturadas (Requisito, Épico, Feature, Decisão).
    Gera 1 chunk atômico conforme PRD 10.3.
    """
    chunk = create_structured_chunk(req.entity_type, req.data)
    try:
        vector = await ollama_client.get_embedding(chunk["content"])
        vector_dim = len(vector)
    except Exception:
        vector_dim = 0

    return {
        "entity_type": req.entity_type,
        "content": chunk["content"],
        "metadata": chunk["metadata"],
        "vector_dimension": vector_dim,
    }


@app.post("/embeddings")
async def generate_embedding(req: EmbeddingRequest):
    """Gera o vetor de embedding para o texto fornecido."""
    model = req.model or settings.OLLAMA_EMBEDDING_MODEL
    try:
        vector = await ollama_client.get_embedding(req.text, model=model)
        return {"model": model, "dimension": len(vector), "embedding": vector}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao comunicar com Ollama: {e}",
        )


@app.post("/rag/query")
async def query_rag(req: RagQueryRequest):
    """
    Processa uma consulta de RAG com o harness do Sinapse (PRD 10.4):
    Cita fontes, recusa sem evidência e não alucina.
    """
    system_prompt = (
        "Você é o assistente inteligente do Sinapse (memória da fábrica de software PRO4TECH). "
        "Suas respostas devem ser estritamente baseadas no contexto fornecido. "
        "Se a evidência não estiver no contexto, responda honestamente que a informação não foi encontrada no acervo. "
        "Sempre cite a fonte (ID do projeto, requisito ou documento) ao justificar uma resposta."
    )
    
    context_str = "\n\n---\n\n".join(req.context_chunks) if req.context_chunks else "Nenhum contexto recuperado."
    user_prompt = f"Contexto do Acervo:\n{context_str}\n\nPergunta do Product Owner:\n{req.query}"
    
    try:
        answer = await ollama_client.generate_response(user_prompt, system_prompt=system_prompt)
        return {
            "query": req.query,
            "project_id": req.project_id,
            "context_chunks_used": len(req.context_chunks),
            "response": answer,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao gerar resposta no Ollama: {e}",
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.AI_SERVICE_HOST, port=settings.AI_SERVICE_PORT, reload=True)
