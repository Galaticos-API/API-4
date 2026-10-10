"""Evaluate normalized retrieval results against a versioned gold dataset."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


DEFAULT_DATASET = Path(__file__).parent / "datasets" / "search-ptbr-v1.json"
DEFAULT_LATENCY_BUDGET_MS = 2000


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def validate_dataset(dataset: dict[str, Any], minimum_queries: int = 20) -> None:
    if not isinstance(dataset, dict) or not isinstance(dataset.get("dataset"), str) or not dataset["dataset"].strip():
        raise ValueError("dataset.dataset deve ser um nome não vazio")
    if not isinstance(dataset.get("version"), int) or dataset["version"] < 1:
        raise ValueError("dataset.version deve ser um inteiro positivo")
    queries = dataset.get("queries")
    if not isinstance(queries, list) or len(queries) < minimum_queries:
        raise ValueError(f"dataset deve conter pelo menos {minimum_queries} consultas")

    source_projects = dataset.get("source_projects")
    if not isinstance(source_projects, dict) or not source_projects or any(not isinstance(key, str) or not isinstance(value, str) or not value.strip() for key, value in source_projects.items()):
        raise ValueError("dataset.source_projects deve mapear IDs para nomes de projeto")
    project_ids = set(source_projects)
    source_project_ids = dataset.get("source_project_ids")
    if not isinstance(source_project_ids, dict) or not source_project_ids or any(not isinstance(key, str) or not isinstance(value, str) for key, value in source_project_ids.items()):
        raise ValueError("dataset.source_project_ids deve mapear cada evidência ao projeto de origem")
    if not set(source_project_ids.values()) <= project_ids:
        raise ValueError("source_project_ids contém projeto ausente do catálogo")
    source_entity_types = dataset.get("source_entity_types")
    if not isinstance(source_entity_types, dict) or set(source_entity_types) != set(source_project_ids):
        raise ValueError("dataset.source_entity_types deve mapear todas as evidências do corpus")
    allowed_levels = {"documento", "decisao", "epico", "feature", "pbi"}
    if not set(source_entity_types.values()) <= allowed_levels:
        raise ValueError("source_entity_types contém nível inválido")
    query_ids: set[str] = set()
    for query in queries:
        if not isinstance(query, dict):
            raise ValueError("cada consulta deve ser um objeto")
        query_id = query.get("id")
        if not isinstance(query_id, str) or not query_id.strip() or query_id in query_ids:
            raise ValueError("cada consulta precisa ter um id único e não vazio")
        query_ids.add(query_id)
        if not isinstance(query.get("query"), str) or not query["query"].strip():
            raise ValueError(f"{query_id}: consulta vazia")
        expected = query.get("expected_source_ids")
        if not isinstance(expected, list) or any(not isinstance(item, str) or not item for item in expected):
            raise ValueError(f"{query_id}: expected_source_ids deve ser uma lista de ids")
        if len(expected) != len(set(expected)):
            raise ValueError(f"{query_id}: fonte esperada duplicada")
        if not set(expected) <= set(source_project_ids):
            raise ValueError(f"{query_id}: fonte esperada não consta no manifesto do corpus")
        project_id = query.get("project_id")
        if not isinstance(project_id, str) or project_id not in project_ids:
            raise ValueError(f"{query_id}: project_id válido é obrigatório para manter o isolamento")
        if any(source_project_ids[source_id] != project_id for source_id in expected):
            raise ValueError(f"{query_id}: evidência esperada pertence a outro projeto")
        filters = query.get("filters", {})
        if not isinstance(filters, dict):
            raise ValueError(f"{query_id}: filters deve ser um objeto")
        if filters.get("level") is not None and filters["level"] not in allowed_levels:
            raise ValueError(f"{query_id}: nível de filtro inválido")
        if filters.get("level") and any(source_entity_types[source_id] != filters["level"] for source_id in expected):
            raise ValueError(f"{query_id}: evidência esperada não corresponde ao filtro de nível")
        if filters.get("technology_id") is not None and (not isinstance(filters["technology_id"], str) or not filters["technology_id"].strip()):
            raise ValueError(f"{query_id}: technology_id deve ser texto não vazio")


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return ordered[rank - 1]


def evaluate(dataset: dict[str, Any], results_document: dict[str, Any], k: int = 5,
             latency_budget_ms: int = DEFAULT_LATENCY_BUDGET_MS) -> dict[str, Any]:
    validate_dataset(dataset)
    if not isinstance(k, int) or isinstance(k, bool) or k < 1 or not isinstance(latency_budget_ms, int) or isinstance(latency_budget_ms, bool) or latency_budget_ms < 0:
        raise ValueError("k deve ser positivo e o orçamento de latência não pode ser negativo")
    if not isinstance(results_document, dict):
        raise ValueError("results deve ser um objeto")
    if results_document.get("dataset") != dataset["dataset"]:
        raise ValueError("os resultados não correspondem ao dataset solicitado")
    if results_document.get("version") != dataset["version"]:
        raise ValueError("a versão dos resultados não corresponde ao dataset")

    expected_by_id = {query["id"]: query for query in dataset["queries"]}
    runs = results_document.get("runs")
    if not isinstance(runs, list):
        raise ValueError("results.runs deve ser uma lista")
    actual_by_id: dict[str, dict[str, Any]] = {}
    for run in runs:
        if not isinstance(run, dict):
            raise ValueError("cada execução deve ser um objeto")
        query_id = run.get("query_id")
        if query_id not in expected_by_id:
            raise ValueError(f"resultado contém query_id desconhecido: {query_id}")
        if query_id in actual_by_id:
            raise ValueError(f"resultado contém query_id duplicado: {query_id}")
        latency_value = run.get("latency_ms")
        if isinstance(latency_value, bool) or not isinstance(latency_value, (int, float)) or not math.isfinite(latency_value) or latency_value < 0:
            raise ValueError(f"{query_id}: latency_ms deve ser um número não negativo")
        items = run.get("results")
        if not isinstance(items, list):
            raise ValueError(f"{query_id}: results deve ser uma lista")
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"{query_id}: cada resultado deve ser um objeto")
            if not isinstance(item, dict) or not isinstance(item.get("source_id"), str) or not item["source_id"]:
                raise ValueError(f"{query_id}: cada resultado precisa de source_id")
            if not isinstance(item.get("project_id"), str) or not item["project_id"]:
                raise ValueError(f"{query_id}: cada resultado precisa de project_id para validar isolamento")
            if item["source_id"] in seen:
                raise ValueError(f"{query_id}: source_id duplicado nos resultados")
            seen.add(item["source_id"])
            if item["source_id"] in dataset["source_project_ids"] and item["project_id"] != dataset["source_project_ids"][item["source_id"]]:
                raise ValueError(f"{query_id}: project_id retornado contradiz a origem conhecida da evidência")
            query_project_id = expected_by_id[query_id].get("project_id")
            if item["project_id"] != query_project_id:
                raise ValueError(f"{query_id}: resultado retornado fora do projeto solicitado")
            if item["source_id"] in dataset["source_project_ids"] and dataset["source_project_ids"][item["source_id"]] != query_project_id:
                raise ValueError(f"{query_id}: fonte conhecida pertence a outro projeto")
        actual_by_id[query_id] = run

    missing = sorted(set(expected_by_id) - set(actual_by_id))
    if missing:
        raise ValueError("faltam resultados para: " + ", ".join(missing))

    answerable = []
    no_result = []
    latencies: list[float] = []
    within_budget = 0
    isolation_checks = 0
    isolation_violations = 0
    per_query = []
    category_metrics: dict[str, dict[str, list[Any]]] = {}
    for query_id, query in expected_by_id.items():
        run = actual_by_id[query_id]
        ranked = run["results"][:k]
        returned_ids = [item["source_id"] for item in ranked]
        expected_ids = set(query["expected_source_ids"])
        relevant_positions = [index + 1 for index, source_id in enumerate(returned_ids) if source_id in expected_ids]
        latency = float(run["latency_ms"])
        latencies.append(latency)
        within_budget += latency <= latency_budget_ms
        category = query.get("category", "uncategorized")
        category_bucket = category_metrics.setdefault(category, {
            "answerable": [], "no_result": [], "latencies": [],
        })
        category_bucket["latencies"].append(latency)

        if expected_ids:
            recall = len(set(returned_ids) & expected_ids) / len(expected_ids)
            precision = len(set(returned_ids) & expected_ids) / k
            reciprocal_rank = 1 / relevant_positions[0] if relevant_positions else 0.0
            answerable.append((recall, precision, reciprocal_rank))
            category_bucket["answerable"].append((recall, precision, reciprocal_rank))
        else:
            recall = None
            precision = None
            reciprocal_rank = None
            no_result.append(not returned_ids)
            category_bucket["no_result"].append(not returned_ids)

        project_id = query.get("project_id")
        isolation_checks += 1
        for item in run["results"]:
            returned_project_id = item["project_id"]
            corpus_project_id = dataset["source_project_ids"].get(item["source_id"])
            if returned_project_id != project_id or (corpus_project_id is not None and returned_project_id != corpus_project_id):
                isolation_violations += 1

        per_query.append({
            "query_id": query_id,
            "category": category,
            "filters": query.get("filters", {}),
            "expected_source_ids": sorted(expected_ids),
            "returned_source_ids_at_k": returned_ids,
            "returned_results_at_k": [
                {"rank": index + 1, "source_id": item["source_id"],
                 "relevance_score": item.get("relevance_score")}
                for index, item in enumerate(ranked)
            ],
            "recall_at_k": recall,
            "precision_at_k": precision,
            "reciprocal_rank_at_k": reciprocal_rank,
            "latency_ms": latency,
            "within_latency_budget": latency <= latency_budget_ms,
        })

    by_category = {}
    for category, values in sorted(category_metrics.items()):
        answerable_category = values["answerable"]
        no_result_category = values["no_result"]
        category_latencies = values["latencies"]
        by_category[category] = {
            "queries": len(category_latencies),
            "answerable_queries": len(answerable_category),
            "recall_at_k_macro": sum(item[0] for item in answerable_category) / len(answerable_category) if answerable_category else None,
            "precision_at_k_macro": sum(item[1] for item in answerable_category) / len(answerable_category) if answerable_category else None,
            "mrr_at_k": sum(item[2] for item in answerable_category) / len(answerable_category) if answerable_category else None,
            "no_result_queries": len(no_result_category),
            "no_result_accuracy": sum(no_result_category) / len(no_result_category) if no_result_category else None,
            "latency_p50_ms": _percentile(category_latencies, 0.50),
            "latency_p95_ms": _percentile(category_latencies, 0.95),
        }

    return {
        "dataset": dataset["dataset"],
        "version": dataset["version"],
        "queries": len(expected_by_id),
        "k": k,
        "latency_budget_ms": latency_budget_ms,
        "retrieval": {
            "answerable_queries": len(answerable),
            "recall_at_k_macro": sum(x[0] for x in answerable) / len(answerable) if answerable else None,
            "precision_at_k_macro": sum(x[1] for x in answerable) / len(answerable) if answerable else None,
            "mrr_at_k": sum(x[2] for x in answerable) / len(answerable) if answerable else None,
            "no_result_queries": len(no_result),
            "no_result_accuracy": sum(no_result) / len(no_result) if no_result else None,
        },
        "latency": {
            "p50_ms": _percentile(latencies, 0.50),
            "p95_ms": _percentile(latencies, 0.95),
            "within_budget_count": within_budget,
            "within_budget_rate": within_budget / len(latencies),
        },
        "project_isolation": {
            "scoped_queries": isolation_checks,
            "violations": isolation_violations,
        },
        "by_category": by_category,
        "per_query": per_query,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--results", type=Path, required=True, help="JSON normalizado produzido pelo adaptador da busca")
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--latency-budget-ms", type=int, default=DEFAULT_LATENCY_BUDGET_MS)
    args = parser.parse_args(argv)
    try:
        report = evaluate(load_json(args.dataset), load_json(args.results), args.k, args.latency_budget_ms)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Erro na avaliação: {error}", file=sys.stderr)
        return 2
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
