from contextlib import asynccontextmanager
import base64
import binascii
import hmac
import io
from pathlib import PurePath
import zipfile
from typing import Any, Literal
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from docx import Document as WordDocument
from docx.table import Table as WordTable
from docx.text.paragraph import Paragraph as WordParagraph
from pypdf import PdfReader

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


class ProcessDocumentRequest(BaseModel):
    document_id: str = Field(..., min_length=36, max_length=36)
    project_id: str = Field(..., min_length=36, max_length=36)
    filename: str = Field(..., min_length=1, max_length=255)
    content_base64: str = Field(..., min_length=1, max_length=28_000_000)


def extract_docx_text(content: bytes) -> str:
    """Extract body paragraphs and tables in document order (python-docx omits tables from paragraphs)."""
    document = WordDocument(io.BytesIO(content))
    parts: list[str] = []
    for element in document.element.body.iterchildren():
        if element.tag.endswith("}p"):
            paragraph = WordParagraph(element, document)
            if paragraph.text.strip():
                parts.append(paragraph.text)
        elif element.tag.endswith("}tbl"):
            table = WordTable(element, document)
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                if any(cells):
                    parts.append(" | ".join(cells))
    return "\n\n".join(parts)


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


@app.post("/documents/process")
async def process_document(req: ProcessDocumentRequest, internal_token: str | None = Header(None, alias="X-Document-Ingestion-Token")):
    """Extrai, fragmenta e vetoriza; somente o backend persiste no banco."""
    expected_token = settings.DOCUMENT_INGESTION_TOKEN
    if len(expected_token) < 32:
        raise HTTPException(status_code=503, detail="A autenticação interna da ingestão não está configurada.")
    if not internal_token or not hmac.compare_digest(internal_token, expected_token):
        raise HTTPException(status_code=401, detail="Não autorizado.")
    extension = PurePath(req.filename).suffix.lower()
    try:
        content = base64.b64decode(req.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Conteúdo do documento inválido.") from None
    if not content or len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Documento vazio ou acima do limite suportado.")
    try:
        if extension == ".pdf":
            reader = PdfReader(io.BytesIO(content), strict=True)
            if reader.is_encrypted:
                raise ValueError("encrypted PDF")
            if len(reader.pages) > 5000:
                raise HTTPException(status_code=413, detail="O PDF excede o limite de páginas suportado.")
            text_parts = []
            total_chars = 0
            for page in reader.pages:
                page_text = page.extract_text() or ""
                total_chars += len(page_text)
                if total_chars > 2_000_000:
                    raise HTTPException(status_code=413, detail="O texto extraído excede o limite de indexação.")
                text_parts.append(page_text)
            text = "\n\n".join(text_parts)
        elif extension == ".docx":
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                entries = archive.infolist()
                if len(entries) > 5000 or sum(item.file_size for item in entries) > 100_000_000:
                    raise HTTPException(status_code=413, detail="O DOCX excede os limites de conteúdo descompactado.")
                if any(item.file_size > max(item.compress_size, 1) * 100 for item in entries):
                    raise HTTPException(status_code=413, detail="O DOCX contém dados excessivamente comprimidos.")
            text = extract_docx_text(content)
            if len(text) > 2_000_000:
                raise HTTPException(status_code=413, detail="O texto extraído excede o limite de indexação.")
        elif extension in {".md", ".txt"}:
            text = content.decode("utf-8-sig", errors="strict")
            if len(text) > 2_000_000:
                raise HTTPException(status_code=413, detail="O texto extraído excede o limite de indexação.")
        else:
            raise ValueError("unsupported extension")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Não foi possível extrair texto válido do documento.") from None
    chunks = chunk_document_text(text)
    if not chunks:
        raise HTTPException(status_code=422, detail="O documento não contém texto extraível para indexação.")
    if len(chunks) > 500:
        raise HTTPException(status_code=413, detail="O documento excede o limite de 500 trechos indexáveis.")
    processed = []
    try:
        for index, chunk in enumerate(chunks):
            embedding = await ollama_client.get_embedding(chunk)
            if len(embedding) != 1024:
                raise ValueError("invalid embedding dimension")
            processed.append({
                "chunk_index": index,
                "text": chunk,
                "embedding": embedding,
                "metadata": {
                    "project_id": req.project_id,
                    "document_id": req.document_id,
                    "source_name": req.filename,
                },
            })
    except Exception:
        raise HTTPException(status_code=503, detail="Não foi possível gerar os embeddings locais.") from None
    return {"document_id": req.document_id, "project_id": req.project_id, "chunks": processed}


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


# ==============================================================================
# Endpoints do RepoAnalyzer (Integração Protótipo DanielDPereira/RepoAnalyzer)
# ==============================================================================

class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="URL pública do repositório GitHub")
    profile: Literal["quick", "balanced", "complete"] = Field(
        "quick", description="Quantidade e prioridade dos arquivos enviados ao modelo local"
    )


@app.post("/api/analyze", status_code=status.HTTP_200_OK)
def analyze_repository(req: AnalyzeRequest):
    """Inicia a análise assíncrona de um repositório GitHub."""
    try:
        run_id = analyzer.start(str(req.url), req.profile)
        return {"run_id": run_id, "status": "started"}
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@app.post("/api/runs/{run_id}/pause")
def pause_analysis(run_id: str):
    try:
        return analyzer.pause(run_id)
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@app.post("/api/runs/{run_id}/resume")
def resume_analysis(run_id: str):
    try:
        return analyzer.resume(run_id)
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@app.post("/api/runs/{run_id}/cancel")
def cancel_analysis(run_id: str):
    try:
        return analyzer.cancel(run_id)
    except AnalysisError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


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

