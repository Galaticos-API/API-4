import hmac
import math
from fastapi import Request
from fastapi.responses import JSONResponse
from document_text import extract_document_text
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from config import settings
from services.ollama_client import ollama_client
from services.chunker import chunk_document_text, create_structured_chunk
from analyzer import Analyzer, AnalysisError, AnalyzerSettings

analyzer = Analyzer(AnalyzerSettings())


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    analyzer.client.close()


app = FastAPI(
    title="Sinapse AI Service",
    description="Serviço de IA, RAG, Chunking, RepoAnalyzer e Integração com Ollama para o Sinapse",
    version="0.2.0",
    lifespan=lifespan,
)

@app.middleware("http")
async def authenticate_service(request: Request, call_next):
    if request.url.path != "/health":
        expected = settings.AI_SERVICE_TOKEN
        supplied = request.headers.get("x-service-token", "")
        if not expected:
            return JSONResponse(status_code=503, content={"detail": "Autenticação interna não configurada"})
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            return JSONResponse(status_code=401, content={"detail": "Autenticação interna necessária"})
    return await call_next(request)


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
    
    if not req.project_id or not chunks:
        raise HTTPException(status_code=422, detail="Projeto e texto são obrigatórios")
    processed = []
    for idx, chunk in enumerate(chunks):
        try:
            vector = await ollama_client.get_embedding(chunk)
            if len(vector) != 1024:
                raise ValueError("Dimensão de vetor inválida")
        except Exception:
            raise HTTPException(status_code=502, detail="Não foi possível gerar embeddings")
        processed.append({"chunk_index": idx, "text": chunk, "embedding": vector,
                          "vector_dimension": len(vector), "project_id": req.project_id})
    return {"document_id": req.document_id, "project_id": req.project_id,
            "total_chunks": len(chunks), "status": "prepared", "chunks": processed}


class IngestFileRequest(BaseModel):
    document_id: str
    project_id: str
    file_name: str
    content_base64: str


@app.post("/ingest/file")
async def ingest_file(req: IngestFileRequest):
    try:
        text = extract_document_text(req.file_name, req.content_base64)
    except Exception:
        raise HTTPException(status_code=422, detail="Não foi possível extrair texto do documento")
    return await ingest_document(IngestDocumentRequest(document_id=req.document_id,
        project_id=req.project_id, text_content=text))


@app.post("/ingest/entity", status_code=status.HTTP_200_OK)
async def ingest_structured_entity(req: IngestEntityRequest):
    """
    Endpoint para ingestão de entidades estruturadas (Requisito, Épico, Feature, Decisão).
    Gera 1 chunk atômico conforme PRD 10.3.
    """
    chunk = create_structured_chunk(req.entity_type, req.data)
    try:
        vector = await ollama_client.get_embedding(chunk["content"])
        if len(vector) != 1024 or not all(math.isfinite(v) for v in vector) or not any(vector):
            raise ValueError("Embedding inválido")
        vector_dim = len(vector)
    except Exception:
        raise HTTPException(status_code=502, detail="Não foi possível gerar embeddings")

    return {
        "entity_type": req.entity_type,
        "content": chunk["content"],
        "metadata": chunk["metadata"],
        "vector_dimension": vector_dim,
        "embedding": vector,
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
        "Cite os trechos usados com seus IDs exatamente entre colchetes, como [ID], conforme o contexto. Nunca invente IDs."
    )
    
    if not req.project_id:
        raise HTTPException(status_code=422, detail="Projeto obrigatório")
    if not req.context_chunks:
        return {"response": "Informação não encontrada no acervo do projeto.", "project_id": req.project_id}
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


# ==============================================================================
# Endpoints do RepoAnalyzer (Integração Protótipo DanielDPereira/RepoAnalyzer)
# ==============================================================================

class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="URL pública do repositório GitHub")


@app.post("/api/analyze", status_code=status.HTTP_200_OK)
def analyze_repository(req: AnalyzeRequest):
    """Inicia a análise assíncrona de um repositório GitHub."""
    try:
        run_id = analyzer.start(str(req.url))
        return {"run_id": run_id, "status": "started"}
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@app.get("/api/runs")
def list_analysis_runs():
    """Lista as execuções de análise ativas e persistidas."""
    return analyzer.list_runs()


@app.get("/api/runs/{run_id}")
def get_analysis_run_status(run_id: str):
    """Consulta o status detalhado, etapa atual e métricas de uma execução."""
    try:
        return analyzer.status(run_id)
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@app.get("/api/runs/{run_id}/report", response_class=PlainTextResponse)
def get_analysis_report(run_id: str):
    """Recupera o relatório consolidado em formato Markdown."""
    try:
        return analyzer.report(run_id)
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.AI_SERVICE_HOST, port=settings.AI_SERVICE_PORT, reload=True)

