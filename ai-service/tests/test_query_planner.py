import unittest
import json

from query_planner import QUERY_PLAN_SCHEMA, _clean_queries, deterministic_query, plan_queries


class FakeClient:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def generate_response(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.error:
            raise self.error
        return self.response


class QueryPlannerTests(unittest.IsolatedAsyncioTestCase):
    def test_deterministic_fallback_removes_conversational_words(self):
        self.assertEqual(deterministic_query("Qual banco de dados estamos usando?"), "banco dados")

    def test_cleaner_limits_and_deduplicates_model_queries(self):
        result = _clean_queries({"queries": ["  PostgreSQL como banco de dados  ", "PostgreSQL como banco de dados", 12]}, "Qual banco usamos?")
        self.assertEqual(result, ["PostgreSQL como banco de dados"])

    async def test_uses_model_to_rewrite_question_without_answering(self):
        client = FakeClient('{"queries":["decisões técnicas registradas no projeto", "decisões técnicas"],"resolved_question":"Quais decisões já foram tomadas neste projeto?","aspects":["Quais decisões já foram tomadas neste projeto?"]}')
        result = await plan_queries(client, "Quais decisões já foram tomadas neste projeto?")
        self.assertEqual(result, {"queries":["decisões técnicas registradas no projeto", "decisões técnicas"],"resolved_question":"Quais decisões já foram tomadas neste projeto?","aspects":["Quais decisões já foram tomadas neste projeto?"]})
        self.assertIn("não responda", client.calls[0][1]["system_prompt"].lower())
        self.assertEqual(client.calls[0][1]["temperature"], 0)

    async def test_follow_up_sends_recent_dialogue_for_reference_resolution(self):
        client = FakeClient('{"queries":["PostgreSQL motivos da escolha", "decisão escolha banco de dados"],"resolved_question":"Por que o projeto escolheu PostgreSQL como banco de dados?","aspects":["Por que o projeto escolheu PostgreSQL como banco de dados?"]}')
        history = [
            {"role": "user", "content": "Qual banco de dados o projeto usa?"},
            {"role": "assistant", "content": "O projeto usa PostgreSQL. [fonte]"},
        ]
        result = await plan_queries(client, "E por que escolheram esse banco?", history)
        payload = json.loads(client.calls[0][0][0])
        self.assertEqual(result, {"queries":["PostgreSQL motivos da escolha", "decisão escolha banco de dados"],"resolved_question":"Por que o projeto escolheu PostgreSQL como banco de dados?","aspects":["Por que o projeto escolheu PostgreSQL como banco de dados?"]})
        self.assertEqual(payload, {"pergunta_atual": "E por que escolheram esse banco?", "historico": history})
        self.assertIn("resolver referências", client.calls[0][1]["system_prompt"].lower())

    async def test_topic_change_keeps_current_question_separate_from_old_context(self):
        client = FakeClient('{"queries":["layout da interface mobile"],"resolved_question":"Como funciona a navegação mobile?","aspects":["Como funciona a navegação mobile?"]}')
        history = [
            {"role": "user", "content": "Qual banco de dados o projeto usa?"},
            {"role": "assistant", "content": "O projeto usa PostgreSQL."},
        ]
        result = await plan_queries(client, "Como funciona a navegação mobile?", history)
        payload = json.loads(client.calls[0][0][0])
        self.assertEqual(result, {"queries":["layout da interface mobile"],"resolved_question":"Como funciona a navegação mobile?","aspects":["Como funciona a navegação mobile?"]})
        self.assertEqual(payload["pergunta_atual"], "Como funciona a navegação mobile?")
        self.assertIn("mudar de assunto, ignore o histórico", client.calls[0][1]["system_prompt"].lower())

    async def test_falls_back_to_keywords_when_local_model_fails(self):
        client = FakeClient(error=RuntimeError("ollama unavailable"))
        original = "E por que escolheram esse banco?"
        history = [{"role":"assistant","content":"O projeto usa PostgreSQL."}]
        result = await plan_queries(client, original, history)
        self.assertEqual(result, {"queries":[deterministic_query(original)],"resolved_question":original,"aspects":[original]})

    async def test_falls_back_when_model_returns_invalid_json(self):
        client = FakeClient("not json")
        original = "E por que escolheram esse banco?"
        history = [{"role":"assistant","content":"O projeto usa PostgreSQL."}]
        result = await plan_queries(client, original, history)
        self.assertEqual(result, {"queries":[deterministic_query(original)],"resolved_question":original,"aspects":[original]})

    async def test_plan_separates_independent_requested_facts(self):
        client = FakeClient('{"queries":["finalidade integração WhatsApp", "sistema de pagamentos"],"resolved_question":"Para que o projeto integra WhatsApp e qual sistema de pagamentos usa?","aspects":["Para que o projeto integra WhatsApp?", "Qual sistema de pagamentos o projeto usa?"]}')
        result = await plan_queries(client, "Para que o projeto integra WhatsApp e qual sistema de pagamentos usa?")
        self.assertEqual(result["aspects"], ["Para que o projeto integra WhatsApp?", "Qual sistema de pagamentos o projeto usa?"])

    async def test_sends_grammar_without_max_length_and_still_bounds_the_plan(self):
        # O Ollama 0.32 não compila a gramática com maxLength 2000; os limites ficam no _clean_plan.
        long_aspect = "Como funciona a confirmação de pagamento PIX " * 20
        client = FakeClient(json.dumps({"queries":["confirmação pagamento PIX"],"resolved_question":"Como funciona a confirmação de pagamento PIX?","aspects":[long_aspect]}))
        result = await plan_queries(client, "Como funciona a confirmação de pagamento PIX?")
        self.assertNotIn("maxLength", json.dumps(client.calls[0][1]["output_schema"]))
        self.assertIn("maxLength", json.dumps(QUERY_PLAN_SCHEMA))
        self.assertLessEqual(len(result["aspects"][0]), 500)


if __name__ == "__main__":
    unittest.main()
