import json
import unittest
from copy import deepcopy
import httpx
from main import app, settings
from unittest.mock import AsyncMock, MagicMock, patch
from services.ollama_client import OllamaClient, grammar_schema
from query_planner import QUERY_PLAN_SCHEMA

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
        self.assertEqual(response.status_code, 503)

    async def test_other_callers_keep_their_schema_unchanged(self):
        response = MagicMock(json=lambda: {"response": "{}"}, raise_for_status=lambda: None)
        post = AsyncMock(return_value=response)
        with patch("services.ollama_client.httpx.AsyncClient.post", post):
            await OllamaClient("http://ollama.test").generate_response("p", output_schema=QUERY_PLAN_SCHEMA)
        self.assertEqual(post.call_args.kwargs["json"]["format"], QUERY_PLAN_SCHEMA)
