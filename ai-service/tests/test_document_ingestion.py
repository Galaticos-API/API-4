import base64
import io
import unittest
import zipfile
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from document_text import extract_document_text
from main import IngestDocumentRequest, ingest_document


class ExtractionTests(unittest.TestCase):
    def test_utf8_and_docx(self):
        text = "Decisão: preservar o histórico."
        self.assertEqual(extract_document_text("decisao.md", base64.b64encode(text.encode()).decode()), text)
        content = io.BytesIO()
        with zipfile.ZipFile(content, "w") as archive:
            archive.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Requisito</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(extract_document_text("teste.docx", base64.b64encode(content.getvalue()).decode()), "Requisito")

    def test_rejects_invalid_empty_and_unsupported(self):
        for name, content in [("a.txt", "!"), ("a.txt", ""), ("a.exe", "YWJj")]:
            with self.assertRaises(Exception):
                extract_document_text(name, content)


class IngestionTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_vectors_for_node_to_persist(self):
        with patch("main.ollama_client.get_embedding", new=AsyncMock(return_value=[0.1] * 1024)):
            result = await ingest_document(IngestDocumentRequest(document_id="doc", project_id="project", text_content="Um requisito completo para cadastro de usuários."))
        self.assertEqual(result["status"], "prepared")
        self.assertEqual(len(result["chunks"][0]["embedding"]), 1024)
        self.assertEqual(result["project_id"], "project")

    async def test_embedding_failure_is_not_reported_as_indexed(self):
        with patch("main.ollama_client.get_embedding", new=AsyncMock(side_effect=RuntimeError("offline"))):
            with self.assertRaises(HTTPException) as error:
                await ingest_document(IngestDocumentRequest(document_id="doc", project_id="project", text_content="Requisito de teste."))
        self.assertEqual(error.exception.status_code, 502)
