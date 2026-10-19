import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
import httpx
from main import app, settings

FIXTURE = json.loads((Path(__file__).parent / "fixtures/harness.json").read_text())

class HarnessTests(unittest.IsolatedAsyncioTestCase):
    def request(self, **overrides):
        return {"mode":"levantamento", "operation":"questionar", "level":"pbi", "version":0, "schema_version":1,
                "config":FIXTURE["config"], "output_schema":FIXTURE["schemas"]["questionar"]["pbi"],
                "fields":{"titulo":"Consultar pedido"}, "context":[], **overrides}

    async def post(self, payload, token="test-secret"):
        with patch.object(settings, "AI_SERVICE_TOKEN", "test-secret"):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                return await client.post("/harness/run", json=payload, headers={"X-Service-Token":token})

    async def test_authenticated_and_strict_schema(self):
        self.assertEqual((await self.post(self.request(), token="wrong")).status_code, 401)
        answer={"questions":[], "summary":"Nenhuma lacuna relevante identificada."}
        with patch("harness.ollama_client.generate_response", new=AsyncMock(return_value=json.dumps(answer))) as model:
            response=await self.post(self.request())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["result"], answer)
            self.assertEqual(model.call_args.kwargs["output_schema"], FIXTURE["schemas"]["questionar"]["pbi"])
            self.assertIn("historia_como_um", model.call_args.kwargs["system_prompt"])

    async def test_invalid_outputs_fail_without_exposing_content(self):
        for raw in ["SEGREDO", '{}', json.dumps({"questions":[{"dimension":"inventada","question":"Qual?"}],"summary":"x"}), json.dumps({"questions":[],"summary":"ok","sql":"SEGREDO"})]:
            with self.subTest(raw=raw), patch("harness.ollama_client.generate_response",new=AsyncMock(return_value=raw)):
                response=await self.post(self.request())
                self.assertEqual(response.status_code,503)
                self.assertNotIn("SEGREDO",response.text)

    async def test_changed_configuration_is_used_on_next_call_without_reload(self):
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value='{"questions":[],"summary":"ok"}')) as model:
            await self.post(self.request())
            config={**FIXTURE["config"],"instructions":"Orientação alterada em runtime"}
            response=await self.post(self.request(version=1,config=config))
            self.assertEqual(response.json()["version"],1)
            self.assertNotIn(config["instructions"],model.call_args_list[0].kwargs["system_prompt"])
            self.assertIn(config["instructions"],model.call_args_list[1].kwargs["system_prompt"])

    async def test_timeout_is_safe_and_cancels_model(self):
        async def slow(*args,**kwargs):
            await asyncio.sleep(5)
        config={**FIXTURE["config"],"timeout_ms":1000}
        with patch("harness.ollama_client.generate_response",new=slow):
            response=await self.post(self.request(config=config))
            self.assertEqual(response.status_code,503)

    async def test_cross_mode_and_external_schema_reference_rejected(self):
        for payload in [self.request(operation="responder"), self.request(output_schema={"$ref":"https://example.invalid/schema"}),self.request(schema_version=2)]:
            self.assertEqual((await self.post(payload)).status_code,422)

    async def test_each_level_has_own_structure(self):
        proposal={"titulo":"Consultar pedido","historia_como_um":"cliente","historia_eu_quero":"consultar pedido","historia_para_que":"acompanhar entrega","regras_observacoes":""}
        raw=json.dumps({"proposal":proposal,"questions":[]})
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value=raw)):
            valid=await self.post(self.request(operation="padronizar",output_schema=FIXTURE["schemas"]["padronizar"]["pbi"]))
            self.assertEqual(valid.status_code,200)
            invalid=await self.post(self.request(operation="padronizar",level="epico",output_schema=FIXTURE["schemas"]["padronizar"]["epico"]))
            self.assertEqual(invalid.status_code,503)

    async def test_no_context_does_not_call_model_or_force_recommendation(self):
        for mode,operation in [("consulta","responder"),("recomendacao","similares")]:
            config={**FIXTURE["config"],"operation_instructions":{operation:"Usar somente evidência"}}
            with patch("harness.ollama_client.generate_response",new=AsyncMock()) as model:
                response=await self.post(self.request(mode=mode,operation=operation,config=config,output_schema=FIXTURE["schemas"][operation]["pbi"]))
                self.assertEqual(response.status_code,200)
                model.assert_not_called()

    async def test_ollama_receives_output_schema_as_format(self):
        from services.ollama_client import OllamaClient
        from unittest.mock import MagicMock
        with patch("services.ollama_client.httpx.AsyncClient") as factory:
            client=factory.return_value.__aenter__.return_value
            response=MagicMock()
            response.json.return_value={"response":'{"questions":[],"summary":"ok"}'}
            client.post=AsyncMock(return_value=response)
            schema=FIXTURE["schemas"]["questionar"]["pbi"]
            await OllamaClient().generate_response("texto", output_schema=schema)
            self.assertEqual(client.post.call_args.kwargs["json"]["format"],schema)
