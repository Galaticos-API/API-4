import json
import unittest
from copy import deepcopy
import httpx
from main import app, settings
from unittest.mock import AsyncMock, MagicMock, patch
from services.ollama_client import OllamaClient, grammar_schema
from query_planner import QUERY_PLAN_SCHEMA
from harness import extract_evidence_candidates, IncrementalEvidenceParser

TEXT = {"type":"string", "minLength":1, "maxLength":12000}
# Mesma forma do schema de cenários publicado pelo harness do backend.
SCENARIOS_SCHEMA = {"type":"object", "properties":{"scenarios":{"type":"array", "maxItems":30, "items":{"type":"object", "properties":{"nome":{"type":"string", "minLength":1, "maxLength":255}, "tipo":{"type":"string", "enum":["caminho_principal", "acesso_nao_autorizado", "alternativo"]}, "dado":TEXT, "quando":TEXT, "entao":TEXT}, "required":["nome", "tipo", "dado", "quando", "entao"], "additionalProperties":False}}, "questions":{"type":"array", "maxItems":30, "items":TEXT}}, "required":["scenarios", "questions"], "additionalProperties":False}

def has_max_length(value):
    if isinstance(value, dict):
        return "maxLength" in value or any(has_max_length(item) for item in value.values())
    if isinstance(value, list):
        return any(has_max_length(item) for item in value)
    return False

class GrammarSchemaTests(unittest.IsolatedAsyncioTestCase):
    async def test_ollama_stream_parses_ndjson_and_emits_complete_candidates(self):
        source_id = "11111111-1111-4111-8111-111111111111"
        quote = "A decisão foi usar PostgreSQL."
        raw = json.dumps({"coverage":"complete","evidence":[{"source_id":source_id,"quote":quote}]}, ensure_ascii=False)
        fragments = [raw[:36], raw[36:71], raw[71:]]

        class FakeResponse:
            def raise_for_status(self): pass
            async def aiter_lines(self):
                for index, fragment in enumerate(fragments):
                    yield json.dumps({"response":fragment,"done":index == len(fragments)-1})

        class FakeStream:
            async def __aenter__(self): return FakeResponse()
            async def __aexit__(self, *_args): return False

        class Callback:
            def __init__(self): self.parser=IncrementalEvidenceParser(); self.values=[]
            def feed(self, fragment): return self.parser.feed(fragment)
            async def callback(self, candidate): self.values.append(candidate)

        callback=Callback()
        client=OllamaClient("http://ollama.test")
        with patch("services.ollama_client.httpx.AsyncClient.stream", return_value=FakeStream()) as stream:
            result=await client.generate_response_stream("question", output_schema={"type":"object"}, on_json_candidate=callback)
        self.assertEqual(result,raw)
        self.assertEqual(callback.values,[{"source_id":source_id,"quote":quote}])
        self.assertTrue(stream.call_args.kwargs["json"]["stream"])

    async def test_harness_stream_emits_complete_evidence_candidates_then_canonical_result(self):
        payload = {"mode":"consulta", "operation":"responder", "level":"pbi", "version":3, "schema_version":1,
            "config":{"instructions":"Responder.","operation_instructions":{"responder":"r"},"timeout_ms":5000,"rules":{}},
            "output_schema":{"type":"object","properties":{"coverage":{"type":"string","enum":["complete","partial","no_evidence","out_of_scope"]},"evidence":{"type":"array","items":{"type":"object","properties":{"source_id":{"type":"string"},"quote":{"type":"string"}},"required":["source_id","quote"],"additionalProperties":False}}},"required":["coverage","evidence"],"additionalProperties":False},
            "fields":{"pergunta":"Qual decisão?"}, "context":[{"id":"source-1","text":"A decisão foi usar SQLite."}]}
        raw = '{"coverage":"complete","evidence":[{"source_id":"source-1","quote":"A decisão foi usar SQLite."}]}'
        async def fragments(*args, on_json_candidate=None, **kwargs):
            parser = IncrementalEvidenceParser()
            for fragment in [raw[:30], raw[30:78], raw[78:]]:
                if on_json_candidate:
                    for candidate in on_json_candidate.feed(fragment):
                        await on_json_candidate.callback(candidate)
            return raw
        with patch.object(settings, "AI_SERVICE_TOKEN", "test-secret"), patch("harness.ollama_client.generate_response_stream", fragments):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/harness/run/stream", json=payload, headers={"X-Service-Token":"test-secret"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("event: evidence_candidate", response.text)
        self.assertIn('"source_id":"source-1"', response.text)
        self.assertIn('event: completed', response.text)
        self.assertIn('"version":3', response.text)

    def test_incremental_extractor_does_not_emit_partial_or_malformed_objects(self):
        parser = IncrementalEvidenceParser()
        self.assertEqual(parser.feed('{"evidence":[{"source_id":"s","quote":"a'), [])
        self.assertEqual(parser.feed('b"}'), [{"source_id":"s","quote":"ab"}])
        self.assertEqual(extract_evidence_candidates('{"answer":"x","evidence":[{"source_id":"s",'), [])
        self.assertEqual(extract_evidence_candidates('{"sources":[{"source_id":"s","quote":3}]}'), [])
        self.assertEqual(extract_evidence_candidates('{"sources":[{"source_id":"s","quote":"q"}]}'), [{"source_id":"s","quote":"q"}])

    async def test_harness_stream_has_same_canonical_result_as_run(self):
        payload = {"mode":"consulta", "operation":"responder", "level":"pbi", "version":3, "schema_version":1,
            "config":{"instructions":"Responder.","operation_instructions":{"responder":"r"},"timeout_ms":5000,"rules":{}},
            "output_schema":{"type":"object","properties":{"coverage":{"type":"string","enum":["complete","partial","no_evidence","out_of_scope"]},"evidence":{"type":"array","items":{"type":"object","properties":{"source_id":{"type":"string"},"quote":{"type":"string"}},"required":["source_id","quote"],"additionalProperties":False}}},"required":["coverage","evidence"],"additionalProperties":False},
            "fields":{"pergunta":"Qual decisão?"}, "context":[{"id":"source-1","text":"A decisão foi usar SQLite."}]}
        raw = '{"coverage":"complete","evidence":[{"source_id":"source-1","quote":"A decisão foi usar SQLite."}]}'
        async def complete(*args, **kwargs): return raw
        async def streaming(*args, **kwargs):
            callback = kwargs["on_json_candidate"]
            for item in callback.feed(raw): await callback.callback(item)
            return raw
        with patch.object(settings, "AI_SERVICE_TOKEN", "test-secret"), patch("harness.ollama_client.generate_response", complete), patch("harness.ollama_client.generate_response_stream", streaming):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                baseline = await client.post("/harness/run", json=payload, headers={"X-Service-Token":"test-secret"})
                streamed = await client.post("/harness/run/stream", json=payload, headers={"X-Service-Token":"test-secret"})
        terminal = json.loads(streamed.text.split("event: completed\ndata: ", 1)[1].split("\n", 1)[0])
        self.assertEqual(terminal, baseline.json())

    async def test_stream_malformed_output_is_safe_and_never_completes(self):
        payload = {"mode":"consulta", "operation":"responder", "level":"pbi", "version":0, "schema_version":1,
            "config":{"instructions":"x","operation_instructions":{"responder":"x"},"timeout_ms":5000,"rules":{}},
            "output_schema":{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]},"fields":{"pergunta":"q"},"context":[{"id":"source-1","text":"context"}]}
        async def malformed(*args, **kwargs): return '{"answer":"secret'
        with patch.object(settings, "AI_SERVICE_TOKEN", "test-secret"), patch("harness.ollama_client.generate_response_stream", malformed):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/harness/run/stream", json=payload, headers={"X-Service-Token":"test-secret"})
        self.assertIn("event: error", response.text)
        self.assertNotIn("event: completed", response.text)
        self.assertNotIn("secret", response.text)

    def test_removes_only_max_length_and_keeps_the_original(self):
        schema = {"type":"object", "properties":{"a":{"type":"string", "minLength":1, "maxLength":12000}, "b":{"type":"array", "maxItems":6, "items":{"type":"string", "maxLength":12000}}}, "required":["a","b"], "additionalProperties":False}
        original = deepcopy(schema)
        self.assertEqual(grammar_schema(schema), {"type":"object", "properties":{"a":{"type":"string", "minLength":1}, "b":{"type":"array", "maxItems":6, "items":{"type":"string"}}}, "required":["a","b"], "additionalProperties":False})
        self.assertEqual(schema, original)

    def test_every_published_schema_becomes_a_grammar_without_text_limits(self):
        schemas = [QUERY_PLAN_SCHEMA, SCENARIOS_SCHEMA]
        for schema in schemas:
            with self.subTest(schema=list(schema.get("properties", {}))):
                self.assertTrue(has_max_length(schema))
                self.assertFalse(has_max_length(grammar_schema(schema)))

    async def test_harness_sends_grammar_and_still_validates_text_limits(self):
        config = {"instructions":"Proponha cenários.", "operation_instructions":{"questionar":"q", "padronizar":"p", "cenarios":"c"}, "timeout_ms":5000, "rules":{"vague_terms":[], "macro_detail_terms":["botão"], "implementation_terms":["sql"], "permission_terms":["sem permissão"]}}
        payload = {"mode":"levantamento", "operation":"cenarios", "level":"pbi", "version":0, "schema_version":1, "config":config, "output_schema":SCENARIOS_SCHEMA,
                   "fields":{"titulo":"Consultar pedido", "historia_como_um":"cliente", "historia_eu_quero":"consultar pedidos", "historia_para_que":"acompanhar a entrega"}, "context":[]}
        scenario = {"nome":"Consultar pedido", "tipo":"caminho_principal", "dado":"que há um pedido", "quando":"o cliente consulta", "entao":"o pedido é exibido"}
        async def post(answer):
            model = AsyncMock(return_value=json.dumps(answer))
            with patch.object(settings, "AI_SERVICE_TOKEN", "test-secret"), patch("harness.ollama_client.generate_response", model):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    return await client.post("/harness/run", json=payload, headers={"X-Service-Token":"test-secret"}), model
        response, model = await post({"scenarios":[scenario], "questions":[]})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(has_max_length(model.call_args.kwargs["output_schema"]))
        # Sem maxLength na gramática, o limite do schema original continua barrando a resposta.
        response, _ = await post({"scenarios":[{**scenario, "nome":"x" * 256}], "questions":[]})
        self.assertEqual(response.status_code, 422)
        # JSON/schema válido, mas sem cenários nem esclarecimento, é erro de contrato
        # produzido pelo modelo e não indisponibilidade do serviço.
        response, _ = await post({"scenarios":[], "questions":[]})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "A IA local não retornou cenários nem perguntas de esclarecimento")

    async def test_other_callers_keep_their_schema_unchanged(self):
        response = MagicMock(json=lambda: {"response": "{}"}, raise_for_status=lambda: None)
        post = AsyncMock(return_value=response)
        with patch("services.ollama_client.httpx.AsyncClient.post", post):
            await OllamaClient("http://ollama.test").generate_response("p", output_schema=QUERY_PLAN_SCHEMA)
        self.assertEqual(post.call_args.kwargs["json"]["format"], QUERY_PLAN_SCHEMA)
