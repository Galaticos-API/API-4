from copy import deepcopy
from unittest import TestCase
from unittest.mock import MagicMock, Mock, patch

from analyzer.ollama_client import OllamaClient


class TestOllamaClient(TestCase):
    @patch("analyzer.ollama_client.httpx.Client")
    def test_chat_caps_generated_tokens(self, client_factory):
        client = client_factory.return_value
        response = Mock()
        response.iter_lines.return_value = [
            '{"message":{"content":"resumo"},"done":true}'
        ]
        client.stream.return_value.__enter__.return_value = response

        ollama = OllamaClient(
            "http://ollama:11434", "qwen2.5:1.5b", 300, "5m", num_predict=700
        )
        self.assertEqual(ollama.chat("sistema", "prompt"), "resumo")

        payload = client.stream.call_args.kwargs["json"]
        self.assertEqual(payload["options"]["num_predict"], 700)
        self.assertTrue(payload["stream"])

    @patch("analyzer.ollama_client.httpx.Client")
    def test_chat_checks_cancellation_while_streaming(self, client_factory):
        client = client_factory.return_value
        response = Mock()
        response.iter_lines.return_value = [
            '{"message":{"content":"parcial"},"done":false}',
            '{"message":{"content":"resposta"},"done":true}',
        ]
        client.stream.return_value.__enter__.return_value = response
        checks = 0

        def cancel_after_first_chunk():
            nonlocal checks
            checks += 1
            if checks == 2:
                raise RuntimeError("cancelado")

        ollama = OllamaClient("http://ollama:11434", "qwen", 300, "5m")
        with self.assertRaisesRegex(RuntimeError, "cancelado"):
            ollama.chat("sistema", "prompt", should_cancel=cancel_after_first_chunk)

    @patch("analyzer.ollama_client.httpx.Client")
    def test_chat_retries_when_model_stops_at_output_limit(self, client_factory):
        client = client_factory.return_value
        first_response = Mock()
        first_response.iter_lines.return_value = [
            '{"message":{"content":"cortada"},"done":true,"done_reason":"length"}'
        ]
        second_response = Mock()
        second_response.iter_lines.return_value = [
            '{"message":{"content":"completa"},"done":true,"done_reason":"stop"}'
        ]
        first_stream, second_stream = MagicMock(), MagicMock()
        first_stream.__enter__.return_value = first_response
        second_stream.__enter__.return_value = second_response
        streams = [first_stream, second_stream]
        payloads = []

        def stream(*_args, **kwargs):
            payloads.append(deepcopy(kwargs["json"]))
            return streams.pop(0)

        client.stream.side_effect = stream

        ollama = OllamaClient("http://ollama:11434", "qwen", 300, "5m", max_retries=1, num_predict=128)
        self.assertEqual(ollama.chat("sistema", "prompt"), "completa")
        limits = [payload["options"]["num_predict"] for payload in payloads]
        self.assertEqual(limits, [128, 256])

    def test_chat_uses_safe_default_token_limit(self):
        with patch("analyzer.ollama_client.httpx.Client"):
            ollama = OllamaClient("http://ollama:11434", "qwen", 300, "5m")
        self.assertEqual(ollama.num_predict, 1024)

    def test_chat_enforces_minimum_token_limit(self):
        with patch("analyzer.ollama_client.httpx.Client"):
            ollama = OllamaClient("http://ollama:11434", "qwen", 300, "5m", num_predict=1)
        self.assertEqual(ollama.num_predict, 128)
