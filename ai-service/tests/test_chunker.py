import unittest

from services.chunker import chunk_document_text, create_structured_chunk


class ChunkerTests(unittest.TestCase):
    def test_empty_document_returns_no_chunks(self):
        self.assertEqual(chunk_document_text("\n  \n"), [])

    def test_preserves_paragraph_boundaries_and_overlap(self):
        text = "Primeiro parágrafo." + " A" * 30 + "\n\nSegundo parágrafo." + " B" * 30
        chunks = chunk_document_text(text, chunk_size=45, overlap=10)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertIn("Primeiro parágrafo.", chunks[0])
        self.assertTrue(all(chunk.strip() for chunk in chunks))

    def test_structured_chunk_keeps_project_metadata_and_provenance(self):
        result = create_structured_chunk(
            "pbi",
            {
                "title": "Consultar requisito",
                "project_id": "project-1",
                "status": "ready",
                "provenance": "ai-edited",
            },
        )
        self.assertIn("Título: Consultar requisito", result["content"])
        self.assertEqual(result["metadata"]["project_id"], "project-1")
        self.assertEqual(result["metadata"]["provenance"], "ai-edited")


if __name__ == "__main__":
    unittest.main()
