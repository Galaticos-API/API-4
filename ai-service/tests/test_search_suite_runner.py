import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

EVALUATION_DIR = Path(__file__).resolve().parents[1] / "evaluation"
sys.path.insert(0, str(EVALUATION_DIR))

from run_search_suite import run_query, run_suite, validate_api_base_url  # noqa: E402
from evaluate_search import load_json, DEFAULT_DATASET  # noqa: E402


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class SearchSuiteRunnerTests(unittest.TestCase):
    def test_query_sends_scope_and_secret_cookie_and_normalizes_ranked_sources(self):
        response = FakeResponse(json.dumps({"items": [
            {"id": "chunk-1", "project_id": "project-a"},
            {"id": "chunk-2", "project_id": "project-a"},
        ]}).encode())
        with patch("run_search_suite.urlopen", return_value=response) as urlopen:
            result = run_query(
                "http://localhost:3001", "session-secret",
                {"id": "Q001", "query": "login de cliente", "project_id": "project-a"}, 5, 3,
            )
        request = urlopen.call_args.args[0]
        self.assertIn("projeto_id=project-a", request.full_url)
        self.assertIn("q=login+de+cliente", request.full_url)
        self.assertEqual(request.get_header("Cookie"), "sinapse_session=session-secret")
        self.assertEqual([item["source_id"] for item in result["results"]], ["chunk-1", "chunk-2"])
        self.assertTrue(all(item["project_id"] == "project-a" for item in result["results"]))

    def test_query_passes_technology_and_level_filters(self):
        response = FakeResponse(b'{"items": []}')
        with patch("run_search_suite.urlopen", return_value=response) as urlopen:
            run_query(
                "http://localhost:3001", "session-secret",
                {"id": "Q002", "query": "login", "project_id": "project-a", "filters": {
                    "technology_id": "technology-a", "level": "pbi",
                }}, 5, 3,
            )
        url = urlopen.call_args.args[0].full_url
        self.assertIn("tecnologia_id=technology-a", url)
        self.assertIn("nivel=pbi", url)

    def test_http_failure_does_not_echo_response_body_or_credentials(self):
        error = HTTPError("http://localhost", 503, "unavailable", {}, io.BytesIO(b"private detail"))
        with patch("run_search_suite.urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "HTTP 503") as raised:
                run_query("http://localhost", "session-secret", {
                    "id": "Q001", "query": "login", "project_id": "project-a",
                }, 5, 3)
        self.assertNotIn("private detail", str(raised.exception))
        self.assertNotIn("session-secret", str(raised.exception))

    def test_suite_requires_session_cookie_before_sending_requests(self):
        dataset = load_json(DEFAULT_DATASET)
        with self.assertRaisesRegex(ValueError, "SINAPSE_SESSION_COOKIE"):
            run_suite(dataset, "http://localhost:3001", " ")

    def test_suite_refuses_to_send_session_cookie_to_remote_or_malformed_api_urls(self):
        dataset = load_json(DEFAULT_DATASET)
        for url in ("https://example.com", "http://example.com", "http://user:pass@localhost:3001",
                    "http://localhost:3001/api", "http://localhost:3001?next=remote"):
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, "HTTP local"):
                run_suite(dataset, url, "session-secret")

    def test_api_base_accepts_loopback_http(self):
        self.assertEqual(validate_api_base_url("http://localhost:3001/"), "http://localhost:3001")
        self.assertEqual(validate_api_base_url("http://127.0.0.1:3001"), "http://127.0.0.1:3001")
        self.assertEqual(validate_api_base_url("http://[::1]:3001"), "http://[::1]:3001")

    def test_suite_metadata_is_aggregated_and_does_not_record_api_url_or_cookie(self):
        dataset = load_json(DEFAULT_DATASET)
        with patch("run_search_suite.run_query", side_effect=lambda _url, _cookie, query, _limit, _timeout: {
            "query_id": query["id"], "latency_ms": 50, "results": [],
        }):
            result = run_suite(dataset, "http://localhost:3001", "session-secret")
        self.assertEqual(result["execution_metadata"]["query_count"], 24)
        self.assertEqual(result["execution_metadata"]["latency_p95_ms"], 50)
        self.assertEqual(result["execution_metadata"]["minimum_vector_similarity"], 0.55)
        self.assertRegex(result["execution_metadata"]["code_revision"], r"^[0-9a-f]{40}$")
        self.assertRegex(result["execution_metadata"]["dataset_sha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(result["execution_metadata"]["corpus_sha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(result["execution_metadata"]["source_snapshot_sha256"], r"^[0-9a-f]{64}$")
        self.assertIsInstance(result["execution_metadata"]["working_tree_dirty"], bool)
        serialized = json.dumps(result)
        self.assertNotIn("localhost", serialized)
        self.assertNotIn("session-secret", serialized)


if __name__ == "__main__":
    unittest.main()
