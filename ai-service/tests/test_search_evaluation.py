import json
import sys
import unittest
from pathlib import Path

EVALUATION_DIR = Path(__file__).resolve().parents[1] / "evaluation"
sys.path.insert(0, str(EVALUATION_DIR))

from evaluate_search import DEFAULT_DATASET, evaluate, load_json, validate_dataset  # noqa: E402


class SearchEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.dataset = load_json(DEFAULT_DATASET)

    def _runs(self):
        runs = []
        for query in self.dataset["queries"]:
            ids = query["expected_source_ids"]
            runs.append({
                "query_id": query["id"],
                "latency_ms": 100,
                "results": [
                    {"source_id": source_id, "project_id": self.dataset["source_project_ids"][source_id]}
                    for source_id in ids
                ],
            })
        return {"dataset": self.dataset["dataset"], "version": self.dataset["version"], "runs": runs}

    def test_dataset_has_24_unique_queries_and_valid_source_ids(self):
        validate_dataset(self.dataset)
        self.assertEqual(len(self.dataset["queries"]), 24)
        self.assertEqual(len({query["id"] for query in self.dataset["queries"]}), 24)

    def test_dataset_rejects_duplicate_ids_and_missing_query_text(self):
        duplicate = json.loads(json.dumps(self.dataset))
        duplicate["queries"][1]["id"] = duplicate["queries"][0]["id"]
        with self.assertRaisesRegex(ValueError, "id único"):
            validate_dataset(duplicate)
        missing_text = json.loads(json.dumps(self.dataset))
        missing_text["queries"][0]["query"] = " "
        with self.assertRaisesRegex(ValueError, "consulta vazia"):
            validate_dataset(missing_text)

    def test_dataset_source_expectations_reference_the_approved_pre06_fixture(self):
        fixture = load_json(Path(__file__).resolve().parents[2] / "database/seed/fixtures/historical-v1.json")
        valid_ids = {record["values"]["id"] for record in fixture["records"] if record["table"] == "chunk"}
        expected_ids = {
            source_id
            for query in self.dataset["queries"]
            for source_id in query["expected_source_ids"]
        }
        source_projects = {
            record["values"]["id"]: record["values"]["projeto_id"]
            for record in fixture["records"]
            if record["table"] == "chunk"
        }
        self.assertTrue(expected_ids)
        self.assertLessEqual(expected_ids, valid_ids)
        self.assertEqual(self.dataset["source_project_ids"], source_projects)
        source_types = {
            record["values"]["id"]: record["values"]["entidade_tipo"]
            for record in fixture["records"]
            if record["table"] == "chunk"
        }
        self.assertEqual(self.dataset["source_entity_types"], source_types)

    def test_v2_preserves_identifier_queries_and_adds_content_queries_without_mutating_v1(self):
        v2_path = EVALUATION_DIR / "datasets" / "search-ptbr-v2.json"
        v2 = load_json(v2_path)
        fixture = load_json(Path(__file__).resolve().parents[2] / "database/seed/fixtures/historical-v2.json")
        validate_dataset(v2)
        self.assertEqual(v2["version"], 2)
        self.assertEqual(len(v2["queries"]), len(self.dataset["queries"]) + 2)
        normalized_v2_queries = json.loads(json.dumps(v2["queries"][:24]))
        for query in normalized_v2_queries:
            query["project_id"] = query["project_id"].replace("62000000", "60000000", 1)
            query["expected_source_ids"] = [source_id.replace("62000000", "60000000", 1) for source_id in query["expected_source_ids"]]
        self.assertEqual(normalized_v2_queries, self.dataset["queries"])
        self.assertEqual({q["query"] for q in v2["queries"] if q["category"] == "exact_identifier"} & {"GRF-01", "GRF-08"}, {"GRF-01", "GRF-08"})
        self.assertEqual(sum(q["category"] == "content_search" for q in v2["queries"]), 2)
        locators = {
            record["values"]["metadados_json"].get("source_locator")
            for record in fixture["records"] if record["table"] == "chunk"
        }
        self.assertTrue({"GRF-01", "GRF-08"} <= locators)

    def test_retrieval_with_all_relevant_sources_first_has_full_recall_and_mrr(self):
        report = evaluate(self.dataset, self._runs())
        self.assertEqual(report["retrieval"]["recall_at_k_macro"], 1)
        positive_queries = [query for query in self.dataset["queries"] if query["expected_source_ids"]]
        expected_precision = sum(min(len(query["expected_source_ids"]), 5) / 5 for query in positive_queries) / len(positive_queries)
        self.assertAlmostEqual(report["retrieval"]["precision_at_k_macro"], expected_precision)
        self.assertEqual(report["retrieval"]["mrr_at_k"], 1)
        self.assertEqual(report["retrieval"]["no_result_accuracy"], 1)
        self.assertEqual(report["project_isolation"]["violations"], 0)
        self.assertEqual(report["latency"]["p95_ms"], 100)

    def test_report_aggregates_retrieval_absence_and_latency_by_category(self):
        report = evaluate(self.dataset, self._runs())
        self.assertIn("exact_identifier", report["by_category"])
        self.assertIn("semantic_paraphrase", report["by_category"])
        exact = report["by_category"]["exact_identifier"]
        self.assertGreater(exact["queries"], 0)
        self.assertEqual(exact["recall_at_k_macro"], 1)
        self.assertEqual(exact["latency_p95_ms"], 100)
        no_result = report["by_category"]["no_relevant_result"]
        self.assertEqual(no_result["no_result_accuracy"], 1)

    def test_isolation_violation_is_rejected(self):
        results = self._runs()
        query = next(q for q in self.dataset["queries"] if q["id"] == "Q002")
        run = next(r for r in results["runs"] if r["query_id"] == query["id"])
        run["results"].append({
            "source_id": "60000000-0000-4000-8000-000000000008",
            "project_id": "60000000-0000-4000-8000-000000000006",
        })
        with self.assertRaisesRegex(ValueError, "fora do projeto solicitado"):
            evaluate(self.dataset, results)

    def test_no_result_queries_return_accuracy_zero_when_any_result_leaks_in(self):
        results = self._runs()
        run = next(r for r in results["runs"] if r["query_id"] == "Q017")
        run["results"].append({
            "source_id": "60000000-0000-4000-8000-000000000003",
            "project_id": "60000000-0000-4000-8000-000000000001",
        })
        with self.assertRaisesRegex(ValueError, "fora do projeto solicitado"):
            evaluate(self.dataset, results)

    def test_missing_duplicate_and_unknown_query_results_are_rejected(self):
        results = self._runs()
        results["runs"].pop()
        with self.assertRaisesRegex(ValueError, "faltam resultados"):
            evaluate(self.dataset, results)
        results = self._runs()
        results["runs"].append(results["runs"][0])
        with self.assertRaisesRegex(ValueError, "duplicado"):
            evaluate(self.dataset, results)
        results = self._runs()
        results["runs"][0]["query_id"] = "Q999"
        with self.assertRaisesRegex(ValueError, "desconhecido"):
            evaluate(self.dataset, results)

    def test_result_dataset_version_and_duplicate_source_identity_are_rejected(self):
        results = self._runs()
        results["version"] += 1
        with self.assertRaisesRegex(ValueError, "versão dos resultados"):
            evaluate(self.dataset, results)
        results = self._runs()
        run = next(r for r in results["runs"] if r["query_id"] == "Q002")
        run["results"].append(dict(run["results"][0]))
        with self.assertRaisesRegex(ValueError, "source_id duplicado"):
            evaluate(self.dataset, results)

    def test_unknown_result_source_is_counted_as_noise_but_scoped(self):
        results = self._runs()
        run = next(r for r in results["runs"] if r["query_id"] == "Q002")
        run["results"].append({
            "source_id": "unknown-source-id",
            "project_id": run["results"][0]["project_id"],
        })
        report = evaluate(self.dataset, results)
        self.assertEqual(report["retrieval"]["recall_at_k_macro"], 1)
        self.assertEqual(report["project_isolation"]["violations"], 0)
        query_report = next(item for item in report["per_query"] if item["query_id"] == "Q002")
        self.assertIn("unknown-source-id", query_report["returned_source_ids_at_k"])

    def test_isolation_uses_the_returned_project_and_known_corpus_ownership(self):
        results = self._runs()
        run = next(r for r in results["runs"] if r["query_id"] == "Q002")
        run["results"][0]["project_id"] = "60000000-0000-4000-8000-000000000006"
        with self.assertRaisesRegex(ValueError, "contradiz a origem conhecida"):
            evaluate(self.dataset, results)

    def test_known_source_cannot_be_relabelled_as_belonging_to_the_requested_project(self):
        results = self._runs()
        run = next(r for r in results["runs"] if r["query_id"] == "Q002")
        run["results"][0]["project_id"] = "60000000-0000-4000-8000-000000000006"
        query = next(q for q in self.dataset["queries"] if q["id"] == "Q002")
        query["project_id"] = "60000000-0000-4000-8000-000000000006"
        query["expected_source_ids"] = []
        with self.assertRaisesRegex(ValueError, "contradiz a origem conhecida"):
            evaluate(self.dataset, results)

    def test_rejects_non_finite_or_boolean_latency(self):
        for latency in (float("nan"), float("inf"), True):
            results = self._runs()
            results["runs"][0]["latency_ms"] = latency
            with self.subTest(latency=latency), self.assertRaisesRegex(ValueError, "latency_ms"):
                evaluate(self.dataset, results)

    def test_rejects_malformed_run_and_result_entries(self):
        results = self._runs()
        results["runs"][0] = None
        with self.assertRaisesRegex(ValueError, "cada execução"):
            evaluate(self.dataset, results)
        results = self._runs()
        results["runs"][0]["results"][0] = None
        with self.assertRaisesRegex(ValueError, "cada resultado"):
            evaluate(self.dataset, results)

    def test_scoped_result_without_project_id_is_rejected(self):
        results = self._runs()
        run = next(r for r in results["runs"] if r["query_id"] == "Q002")
        run["results"][0].pop("project_id")
        with self.assertRaisesRegex(ValueError, "precisa de project_id"):
            evaluate(self.dataset, results)

    def test_latency_budget_is_reported_per_query_and_aggregated(self):
        results = self._runs()
        results["runs"][0]["latency_ms"] = 2100
        report = evaluate(self.dataset, results, latency_budget_ms=2000)
        self.assertEqual(report["latency"]["within_budget_count"], 23)
        self.assertEqual(report["latency"]["p95_ms"], 100)
        self.assertEqual(report["per_query"][0]["returned_results_at_k"][0]["rank"], 1)


if __name__ == "__main__":
    unittest.main()
