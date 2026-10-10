import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { AppError } from "../../shared/errors.js";
import { HttpDocumentIngestionClient } from "./document-ingestion.js";
import type { PendingIngestionDocument } from "./documents.types.js";

const document: PendingIngestionDocument = {
  id: "60000000-0000-4000-8000-000000000001",
  projeto_id: "60000000-0000-4000-8000-000000000002",
  nome: "manual.txt", caminho: "60000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000001",
  status_processamento: "processando", mime: "text/plain", extensao: ".txt",
  processamento_lease_id: "60000000-0000-4000-8000-000000000003",
};
const TEST_INGESTION_TOKEN = "test-only-document-ingestion-token-0123456789abcdef";

test("cliente de ingestão transmite documento e escopo ao serviço local com autenticação interna", async () => {
  const originalPost = axios.post;
  let args: unknown[] = [];
  axios.post = (async (...values: unknown[]) => {
    args = values;
    return { data: { document_id: document.id, project_id: document.projeto_id, chunks: [{ chunk_index: 0, text: "Conteúdo", embedding: Array(1024).fill(0.1), metadata: { document_id: document.id, project_id: document.projeto_id, source_name: document.nome } }] } };
  }) as typeof axios.post;
  try {
    const chunks = await new HttpDocumentIngestionClient("http://local-ai/", TEST_INGESTION_TOKEN).process(document, Buffer.from("conteúdo"));
    assert.equal(args[0], "http://local-ai/documents/process");
    assert.deepEqual(args[1], {
      document_id: document.id, project_id: document.projeto_id, filename: document.nome,
      content_base64: Buffer.from("conteúdo").toString("base64"),
    });
    assert.equal((args[2] as { headers: Record<string, string> }).headers["X-Document-Ingestion-Token"], TEST_INGESTION_TOKEN);
    assert.equal(chunks.length, 1);
  } finally {
    axios.post = originalPost;
  }
});

test("cliente de ingestão rejeita resposta parcial ou embedding incompatível", async () => {
  const originalPost = axios.post;
  axios.post = (async () => ({ data: { chunks: [{ chunk_index: 0, text: "bad", embedding: [1], metadata: {} }] } })) as typeof axios.post;
  try {
    await assert.rejects(new HttpDocumentIngestionClient("http://local-ai/", TEST_INGESTION_TOKEN).process(document, Buffer.from("x")), /dados de processamento inválidos/);
  } finally {
    axios.post = originalPost;
  }
});

test("cliente rejeita resposta de outro escopo e metadados inconsistentes", async () => {
  const originalPost = axios.post;
  axios.post = (async () => ({ data: {
    document_id: document.id, project_id: "60000000-0000-4000-8000-000000000099",
    chunks: [{ chunk_index: 0, text: "Conteúdo", embedding: Array(1024).fill(0.1), metadata: { document_id: document.id, project_id: document.projeto_id, source_name: document.nome } }],
  } })) as typeof axios.post;
  try {
    await assert.rejects(new HttpDocumentIngestionClient("http://local-ai", TEST_INGESTION_TOKEN).process(document, Buffer.from("x")), /dados de processamento inválidos/);
  } finally {
    axios.post = originalPost;
  }
});

test("cliente rejeita chunk acima do limite contratual", async () => {
  const originalPost = axios.post;
  axios.post = (async () => ({ data: {
    document_id: document.id, project_id: document.projeto_id,
    chunks: [{ chunk_index: 0, text: "x".repeat(1001), embedding: Array(1024).fill(0.1), metadata: { document_id: document.id, project_id: document.projeto_id, source_name: document.nome } }],
  } })) as typeof axios.post;
  try {
    await assert.rejects(new HttpDocumentIngestionClient("http://local-ai", TEST_INGESTION_TOKEN).process(document, Buffer.from("x")), /dados de processamento inválidos/);
  } finally {
    axios.post = originalPost;
  }
});

test("cliente não chama a IA sem segredo interno configurado", async () => {
  const originalPost = axios.post;
  axios.post = (async () => { throw new Error("não deve chamar o serviço remoto"); }) as typeof axios.post;
  try {
    await assert.rejects(new HttpDocumentIngestionClient("http://local-ai/", "").process(document, Buffer.from("x")),
      (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_INGESTION_UNCONFIGURED");
  } finally {
    axios.post = originalPost;
  }
});
