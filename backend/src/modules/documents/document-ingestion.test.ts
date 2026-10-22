import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { HttpDocumentIngestionClient } from "./document-ingestion.js";
import { AppError } from "../../shared/errors.js";

const source = { id: "10000000-0000-4000-8000-000000000001", projeto_id: "20000000-0000-4000-8000-000000000001", nome: "unicode.txt" };
const cases = [
  { name: "ASCII no limite", text: "a".repeat(1000), valid: true },
  { name: "emojis no limite de pontos de código", text: "😀".repeat(1000), valid: true },
  { name: "texto misto no limite", text: ("texto 😀 ").repeat(125), valid: true },
  { name: "ASCII acima do limite", text: "a".repeat(1001), valid: false },
  { name: "Unicode acima do limite", text: "😀".repeat(1001), valid: false },
  { name: "embedding nulo", text: "Documento válido", valid: false, zero: true },
];
for (const item of cases) {
  test("Ingestão: " + item.name, async t => {
    const embedding = Array(1024).fill(item.zero ? 0 : 0.1);
    t.mock.method(axios, "post", async () => ({ data: {
      document_id: source.id, project_id: source.projeto_id,
      chunks: [{ chunk_index: 0, text: item.text, embedding,
        metadata: { document_id: source.id, project_id: source.projeto_id, source_name: source.nome } }],
    } }));
    const client = new HttpDocumentIngestionClient("http://test", "x".repeat(32));
    if (item.valid) {
      const chunks = await client.process(source, Buffer.from(item.text));
      assert.equal(chunks[0]?.text, item.text);
      assert.deepEqual(chunks[0]?.embedding, embedding);
    } else {
      await assert.rejects(client.process(source, Buffer.from(item.text)), error => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "DOCUMENT_PROCESSING_INVALID");
        return true;
      });
    }
  });
}
