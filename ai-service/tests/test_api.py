import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from main import app, ollama_client


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = self.enterContext(TestClient(app))
        # All model calls are mocked: tests never require a running Ollama.
        self.embedding = self.enterContext(patch.object(
            ollama_client, "get_embedding", new_callable=AsyncMock))
        self.generate = self.enterContext(patch.object(
            ollama_client, "generate_response", new_callable=AsyncMock))
        self.health = self.enterContext(patch.object(
            ollama_client, "check_health", new_callable=AsyncMock))

    def test_health_reports_unavailable_dependency(self):
        self.health.return_value = False
        result = self.client.get("/health")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["status"], "degraded")

    def test_missing_embedding_text_is_rejected_before_model_call(self):
        result = self.client.post("/embeddings", json={})
        self.assertEqual(result.status_code, 422)
        self.embedding.assert_not_awaited()

    def test_embedding_returns_model_vector_and_dimension(self):
        self.embedding.return_value = [0.25, 0.5]
        result = self.client.post("/embeddings", json={"text": "Requisito", "model": "test-model"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"model": "test-model", "dimension": 2, "embedding": [0.25, 0.5]})
        self.embedding.assert_awaited_once_with("Requisito", model="test-model")

    def test_embedding_dependency_failure_returns_502(self):
        self.embedding.side_effect = RuntimeError("test dependency unavailable")
        self.assertEqual(self.client.post("/embeddings", json={"text": "Requisito"}).status_code, 502)

    def test_rag_preserves_context_and_project_in_response(self):
        self.generate.return_value = "Resposta simulada [doc-1]"
        result = self.client.post("/rag/query", json={
            "query": "Como funciona?", "project_id": "project-1",
            "context_chunks": ["doc-1: evidência de teste"],
        })
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["project_id"], "project-1")
        self.assertEqual(result.json()["context_chunks_used"], 1)
        self.assertEqual(result.json()["response"], "Resposta simulada [doc-1]")
        self.assertIn("doc-1: evidência de teste", self.generate.await_args.args[0])

    def test_rag_dependency_failure_returns_502(self):
        self.generate.side_effect = RuntimeError("test dependency unavailable")
        self.assertEqual(self.client.post("/rag/query", json={"query": "Pergunta"}).status_code, 502)
