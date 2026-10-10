import test from "node:test";
import assert from "node:assert/strict";
import { citedSources } from "./chat.service.js";
const a="10000000-0000-4000-8000-000000000001", b="10000000-0000-4000-8000-000000000002";
test("fontes incluem apenas IDs citados presentes no contexto",()=>{
  const chunks=[{id:a,entidade_tipo:"documento"},{id:b,entidade_tipo:"pbi"}];
  assert.deepEqual(citedSources('Resposta ['+a+'] ['+a+']',chunks).map(s=>s.id),[a]);
  assert.throws(()=>citedSources("Resposta sem referência",chunks));
  assert.throws(()=>citedSources('Resposta ['+b+']',chunks.slice(0,1)));
});
