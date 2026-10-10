import unittest
from unittest.mock import AsyncMock, patch
import httpx
from fastapi import HTTPException
from main import app, settings, ingest_structured_entity, IngestEntityRequest

class InternalSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_requires_token_for_analysis_and_ingestion(self):
        with patch.object(settings, "AI_SERVICE_TOKEN", "test-secret"):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test") as client:
                for path in ["/api/runs", "/api/runs/example/report", "/docs"]:
                    self.assertEqual((await client.get(path)).status_code,401)
                for path in ["/api/analyze", "/ingest/file", "/ingest/entity", "/rag/query"]:
                    self.assertEqual((await client.post(path,json={})).status_code,401)
                self.assertEqual((await client.get("/api/runs",headers={"X-Service-Token":"wrong"})).status_code,401)
                with patch("main.analyzer.list_runs",return_value=[]):
                    self.assertEqual((await client.get("/api/runs",headers={"X-Service-Token":"test-secret"})).status_code,200)
    async def test_missing_configuration_fails_closed(self):
        with patch.object(settings,"AI_SERVICE_TOKEN",""):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test") as client:
                self.assertEqual((await client.get("/api/runs")).status_code,503)
    async def test_entity_embedding_failure_and_invalid_vector(self):
        for vector in [[],[0.0]*1024,[float("nan")]*1024]:
            with patch("main.ollama_client.get_embedding",new=AsyncMock(return_value=vector)):
                with self.assertRaises(HTTPException) as error:
                    await ingest_structured_entity(IngestEntityRequest(entity_type="feature",data={"titulo":"Teste"}))
                self.assertEqual(error.exception.status_code,502)
        with patch("main.ollama_client.get_embedding",new=AsyncMock(side_effect=RuntimeError("secret"))):
            with self.assertRaises(HTTPException) as error:
                await ingest_structured_entity(IngestEntityRequest(entity_type="feature",data={"titulo":"Teste"}))
            self.assertNotIn("secret",error.exception.detail)
    async def test_entity_returns_real_vector(self):
        with patch("main.ollama_client.get_embedding",new=AsyncMock(return_value=[0.1]*1024)):
            result=await ingest_structured_entity(IngestEntityRequest(entity_type="feature",data={"titulo":"Teste"}))
            self.assertEqual(len(result["embedding"]),1024)
