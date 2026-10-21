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
            expected=json.loads(json.dumps(FIXTURE["schemas"]["questionar"]["pbi"]))
            expected["properties"]["questions"]["maxItems"]=6
            self.assertEqual(model.call_args.kwargs["output_schema"], expected)
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

    async def test_rejects_all_external_reference_keywords_before_generation(self):
        from harness import has_reference
        for keyword in ["$ref", "$dynamicRef", "$recursiveRef"]:
            with self.subTest(keyword=keyword):
                schema={"properties":{"nested":{"anyOf":[{keyword:"https://example.invalid/schema"}]}}}
                self.assertTrue(has_reference(schema))
                with patch("harness.ollama_client.generate_response",new=AsyncMock()) as model:
                    response=await self.post(self.request(output_schema=schema))
                    self.assertEqual(response.status_code,422)
                    model.assert_not_called()

    async def test_editing_context_is_structured_and_free_text_is_preserved(self):
        context={"requer_interface":False,"criterios_salvos":[{"dado":"Cliente","quando":"Consultar","entao":"Exibir"}],"ignorar":"Não deve ser encaminhado"}
        answer='{"questions":[],"summary":"Análise concluída"}'
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value=answer)) as model:
            response=await self.post(self.request(fields={"titulo":"Consultar","texto_livre":json.dumps(context)}))
            self.assertEqual(response.status_code,200)
            sent=json.loads(model.call_args.args[0])
            self.assertFalse(sent["editing_context"]["requer_interface"])
            self.assertNotIn("ignorar",sent["editing_context"])
            self.assertNotIn("texto_livre",sent["fields"])
            await self.post(self.request(fields={"texto_livre":"Descrição livre original"}))
            self.assertEqual(json.loads(model.call_args.args[0])["fields"]["texto_livre"],"Descrição livre original")

    async def test_applicable_schema_blocks_interface_and_unnecessary_null_proposal(self):
        context=json.dumps({"requer_interface":False,"criterios_salvos":[]})
        answer={"questions":[{"dimension":"interface","question":"Qual tela?"}],"summary":"Lacuna"}
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value=json.dumps(answer))) as model:
            response=await self.post(self.request(fields={"titulo":"Consultar","texto_livre":context}))
            self.assertEqual(response.status_code,503)
            dimensions=model.call_args.kwargs["output_schema"]["properties"]["questions"]["items"]["properties"]["dimension"]["enum"]
            self.assertNotIn("interface",dimensions)
        fields={"titulo":"Consultar pedido","historia_como_um":"cliente","historia_eu_quero":"consultar pedido","historia_para_que":"acompanhar entrega","regras_observacoes":""}
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value='{"proposal":null,"questions":["Qual ator?"]}')) as model:
            response=await self.post(self.request(operation="padronizar",fields=fields,output_schema=FIXTURE["schemas"]["padronizar"]["pbi"]))
            self.assertEqual(response.status_code,503)
            self.assertEqual(model.call_args.kwargs["output_schema"]["properties"]["proposal"]["type"],"object")

    async def test_fast_condition_is_questioned_only_when_no_measurable_limit_exists(self):
        answer='{"questions":[],"summary":"Sem lacunas"}'
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value=answer)):
            fields={"historia_eu_quero":"consultar pedido rapidamente"}
            response=await self.post(self.request(fields=fields))
            self.assertEqual(response.status_code,200)
            question=response.json()["result"]["questions"][0]
            self.assertEqual(question["dimension"],"validacoes")
            self.assertIn("consultar pedido rapidamente",question["question"])
            fields["texto_livre"]=json.dumps({"criterios_salvos":[{"entao":"Exibir em até 2 segundos"}]})
            measured=await self.post(self.request(fields=fields))
            self.assertEqual(measured.json()["result"]["questions"],[])

    async def test_generation_has_bounded_output_budget(self):
        answer='{"questions":[],"summary":"Nenhuma lacuna relevante."}'
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value=answer)) as model:
            response=await self.post(self.request())
            self.assertEqual(response.status_code,200)
            self.assertEqual(model.call_args.kwargs["max_tokens"],1024)
            self.assertEqual(model.call_args.kwargs["output_schema"]["properties"]["questions"]["maxItems"],6)

    async def test_named_main_scenario_is_not_requested_again(self):
        context={"criterios_salvos":[{"nome":"Caminho principal","dado":"Cliente autenticado","quando":"Consultar","entao":"Exibir"}]}
        with patch("harness.ollama_client.generate_response",new=AsyncMock(return_value='{"questions":[],"summary":"Análise"}')) as model:
            response=await self.post(self.request(fields={"titulo":"Consultar pedido","texto_livre":json.dumps(context)}))
            self.assertEqual(response.status_code,200)
            dimensions=model.call_args.kwargs["output_schema"]["properties"]["questions"]["items"]["properties"]["dimension"]["enum"]
            self.assertNotIn("caminho_principal",dimensions)

    def scenarios_request(self, **fields):
        story = {"titulo":"Consultar pedido", "historia_como_um":"cliente", "historia_eu_quero":"consultar meus pedidos", "historia_para_que":"acompanhar a entrega", **fields}
        return self.request(operation="cenarios", output_schema=FIXTURE["schemas"]["cenarios"]["pbi"], fields=story)

    async def test_scenarios_are_named_typed_and_at_least_one(self):
        answer={"scenarios":[{"nome":"Consultar pedido existente","tipo":"caminho_principal","dado":"que há um pedido","quando":"o cliente consulta","entao":"o pedido é exibido"}],"questions":[]}
        with patch("harness.ollama_client.generate_response", new=AsyncMock(return_value=json.dumps(answer))) as model:
            response=await self.post(self.scenarios_request())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["result"], answer)
            schema=model.call_args.kwargs["output_schema"]["properties"]["scenarios"]
            self.assertEqual((schema["minItems"], schema["maxItems"]), (1, 8))
            self.assertIn("caminho_principal", model.call_args.kwargs["system_prompt"])
            self.assertNotIn("obrigatoriamente", model.call_args.kwargs["system_prompt"])
        for invalid in [{"scenarios":[],"questions":["Qual?"]}, {"scenarios":[{**answer["scenarios"][0],"tipo":"outro"}],"questions":[]}]:
            with self.subTest(invalid=invalid), patch("harness.ollama_client.generate_response", new=AsyncMock(return_value=json.dumps(invalid))):
                self.assertEqual((await self.post(self.scenarios_request())).status_code, 503)

    async def test_permission_story_requires_unauthorized_access_scenario_in_prompt(self):
        answer='{"scenarios":[{"nome":"x","tipo":"caminho_principal","dado":"a","quando":"b","entao":"c"}],"questions":[]}'
        for fields, expected in [({"historia_eu_quero":"aprovar pedidos com perfil de administrador"}, True), ({"regras_observacoes":"Somente o Proprietário altera o pedido."}, True), ({}, False)]:
            with self.subTest(fields=fields), patch("harness.ollama_client.generate_response", new=AsyncMock(return_value=answer)) as model:
                await self.post(self.scenarios_request(**fields))
                self.assertEqual("acesso_nao_autorizado, em que um usuário sem permissão" in model.call_args.kwargs["system_prompt"], expected)

    async def test_scenarios_have_larger_output_budget(self):
        with patch("harness.ollama_client.generate_response", new=AsyncMock(return_value='{"scenarios":[{"nome":"x","tipo":"caminho_principal","dado":"a","quando":"b","entao":"c"}],"questions":[]}')) as model:
            await self.post(self.scenarios_request())
            self.assertEqual(model.call_args.kwargs["max_tokens"], 2048)
