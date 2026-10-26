import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

EVALUATION = Path(__file__).resolve().parents[1] / 'evaluation'
sys.path.insert(0, str(EVALUATION))
from evaluate_search import canonical_dataset_sha256, evaluate, load_json, validate_dataset, verify_dataset_provenance
from run_search_suite import run_query, run_suite, validate_api_base_url


class SearchEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.dataset = load_json(EVALUATION / 'datasets/search-ptbr-v2.json')
        self.results = {'dataset': self.dataset['dataset'], 'version': 2, 'runs': [
            {'query_id': q['id'], 'latency_ms': 100 + index, 'results': [
                {'source_id': source, 'project_id': q['project_id']}
                for source in q['expected_source_ids']
            ]} for index, q in enumerate(self.dataset['queries'])
        ]}

    def test_both_versioned_datasets_have_at_least_twenty_scoped_queries(self):
        for version, count in [(1, 24), (2, 26)]:
            dataset = load_json(EVALUATION / f'datasets/search-ptbr-v{version}.json')
            validate_dataset(dataset)
            self.assertEqual(len(dataset['queries']), count)

    def test_supplementary_versions_preserve_published_queries_and_previous_gold(self):
        first = load_json(EVALUATION / 'datasets/search-diagnostics-draft-v1.json')
        second = load_json(EVALUATION / 'datasets/search-diagnostics-draft-v2.json')
        validate_dataset(first)
        validate_dataset(second)
        self.assertEqual(first['queries'][:26], self.dataset['queries'])
        self.assertEqual(second['queries'][:40], first['queries'])
        self.assertEqual(len(second['queries']), 48)
        self.assertEqual(second['annotation_status'], 'draft_pending_product_review')

    def test_gold_sources_exist_in_curated_corpus(self):
        corpus = load_json(EVALUATION.parents[1] / self.dataset['corpus']['file'])
        chunks = {r['values']['id']: r for r in corpus['records'] if r['table'] == 'chunk'}
        self.assertEqual(set(chunks), set(self.dataset['source_project_ids']))
        for q in self.dataset['queries']:
            for source in q['expected_source_ids']:
                self.assertEqual(chunks[source]['values']['projeto_id'], q['project_id'])
                self.assertTrue(chunks[source]['source']['locator'])

    def test_perfect_retrieval_has_full_recall_mrr_and_no_result_accuracy(self):
        report = evaluate(self.dataset, self.results)
        self.assertEqual(report['retrieval']['recall_at_k_macro'], 1)
        self.assertEqual(report['retrieval']['mrr_at_k'], 1)
        self.assertEqual(report['retrieval']['no_result_accuracy'], 1)
        self.assertEqual(report['project_isolation']['violations'], 0)
        self.assertEqual(report['latency']['p95_ms'], 124)

    def test_precision_uses_five_positions_including_empty_ones(self):
        report = evaluate(self.dataset, self.results)
        self.assertAlmostEqual(report['retrieval']['precision_at_k_macro'], .2)

    def test_missing_positive_source_reduces_recall(self):
        self.results['runs'][0]['results'] = []
        self.assertLess(evaluate(self.dataset, self.results)['retrieval']['recall_at_k_macro'], 1)

    def test_wrong_result_in_negative_query_is_not_treated_as_success(self):
        q = next(q for q in self.dataset['queries'] if not q['expected_source_ids'])
        run = next(r for r in self.results['runs'] if r['query_id'] == q['id'])
        run['results'] = [{'source_id': 'unknown-noise', 'project_id': q['project_id']}]
        self.assertLess(evaluate(self.dataset, self.results)['retrieval']['no_result_accuracy'], 1)

    def test_isolation_checks_every_result_even_after_k(self):
        q = self.dataset['queries'][0]
        other_project = next(p for p in self.dataset['source_projects'] if p != q['project_id'])
        self.results['runs'][0]['results'] = [
            {'source_id': str(i), 'project_id': q['project_id']} for i in range(5)
        ] + [{'source_id': 'leak', 'project_id': other_project}]
        with self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_source_cannot_lie_about_its_known_project(self):
        q = self.dataset['queries'][0]
        source = next(s for s, p in self.dataset['source_project_ids'].items() if p != q['project_id'])
        self.results['runs'][0]['results'] = [{'source_id': source, 'project_id': q['project_id']}]
        with self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_missing_duplicate_and_unknown_queries_are_rejected(self):
        for change in ['missing', 'duplicate', 'unknown']:
            results = copy.deepcopy(self.results)
            if change == 'missing': results['runs'].pop()
            elif change == 'duplicate': results['runs'].append(results['runs'][0])
            else: results['runs'][0]['query_id'] = 'unknown'
            with self.subTest(change=change), self.assertRaises(ValueError): evaluate(self.dataset, results)

    def test_duplicate_sources_are_rejected(self):
        self.results['runs'][0]['results'] *= 2
        with self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_invalid_latencies_are_rejected(self):
        for latency in [-1, True, float('nan'), float('inf'), '100']:
            self.results['runs'][0]['latency_ms'] = latency
            with self.subTest(latency=latency), self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_latency_budget_counts_each_query_not_only_p95(self):
        self.results['runs'][0]['latency_ms'] = 2001
        report = evaluate(self.dataset, self.results)
        self.assertEqual(report['latency']['within_budget_count'], 25)
        self.assertEqual(report['latency']['p95_ms'], 125)

    def test_latency_must_be_below_two_seconds_as_required_by_rnf06(self):
        self.results['runs'][0]['latency_ms'] = 2000
        report = evaluate(self.dataset, self.results)
        self.assertEqual(report['latency']['within_budget_count'], 25)
        self.assertFalse(report['per_query'][0]['within_latency_budget'])

    def test_categories_are_reported_separately(self):
        report = evaluate(self.dataset, self.results)
        self.assertEqual(sum(c['queries'] for c in report['by_category'].values()), 26)
        self.assertEqual(report['by_category']['content_search']['queries'], 2)

    def test_dataset_and_result_version_must_match(self):
        self.results['version'] = 1
        with self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_versions_require_integers_in_dataset_and_results(self):
        for version in [True, 2.0, [], {}, '2']:
            with self.subTest(version=version):
                dataset = copy.deepcopy(self.dataset)
                dataset['version'] = version
                with self.assertRaises(ValueError): validate_dataset(dataset)
                results = copy.deepcopy(self.results)
                results['version'] = version
                with self.assertRaises(ValueError): evaluate(self.dataset, results)

    def test_invalid_descriptors_fail_with_controlled_validation(self):
        for field in ['category', 'level', 'source_entity_type', 'corpus']:
            dataset = copy.deepcopy(self.dataset)
            if field == 'category': dataset['queries'][0]['category'] = ['invalid']
            elif field == 'level': dataset['queries'][0]['filters'] = {'level': ['documento']}
            elif field == 'corpus': dataset['corpus'] = 'invalid'
            else: dataset['source_entity_types'][next(iter(dataset['source_entity_types']))] = ['documento']
            with self.subTest(field=field), self.assertRaises(ValueError): validate_dataset(dataset)

    def test_malformed_query_ids_fail_with_controlled_validation(self):
        for query_id in [[], {}, True, None]:
            self.results['runs'][0]['query_id'] = query_id
            with self.subTest(query_id=query_id), self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_report_sources_are_valid_search_levels(self):
        dataset = copy.deepcopy(self.dataset)
        dataset['source_entity_types'] = dict.fromkeys(dataset['source_entity_types'], 'analise_repositorio')
        for q in dataset['queries']:
            if q.get('filters', {}).get('level') == 'documento': q['filters']['level'] = 'analise_repositorio'
        validate_dataset(dataset)

    def test_returned_type_must_match_manifest_and_level_filter(self):
        self.results['runs'][0]['results'][0]['entity_type'] = 'pbi'
        with self.assertRaises(ValueError): evaluate(self.dataset, self.results)

    def test_redirect_does_not_forward_session_to_another_server(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        received = []
        class Target(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(self.headers.get('Cookie'))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"items":[]}')
            def log_message(self, *_): pass
        target = ThreadingHTTPServer(('127.0.0.1', 0), Target)
        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(self.server.redirect_code)
                self.send_header('Location', f'http://127.0.0.1:{target.server_port}/capture')
                self.end_headers()
            def log_message(self, *_): pass
        origin = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        workers = [Thread(target=server.serve_forever, daemon=True) for server in [origin, target]]
        for worker in workers: worker.start()
        try:
            for code in [301, 302, 303, 307, 308]:
                origin.redirect_code = code
                with self.subTest(code=code), self.assertRaisesRegex(RuntimeError, f'HTTP {code}'):
                    run_query(f'http://127.0.0.1:{origin.server_port}', 'fake-test-session', self.dataset['queries'][0], 5, 3)
            self.assertEqual(received, [])
        finally:
            for server in [origin, target]: server.shutdown(); server.server_close()
            for worker in workers: worker.join()

    def test_runtime_parameters_are_validated_before_requests(self):
        for kwargs in [{'limit': True}, {'limit': 5.5}, {'timeout': 0}, {'timeout': -1}, {'timeout': float('nan')}, {'timeout': float('inf')}]:
            with self.subTest(kwargs=kwargs), patch('run_search_suite.run_query') as request:
                with self.assertRaises(ValueError): run_suite(self.dataset, 'http://localhost:3001', 'fake', **kwargs)
                request.assert_not_called()

    def test_provenance_rejects_changed_dataset_with_same_name_and_version(self):
        self.results['execution_metadata'] = {'dataset_sha256': '0' * 64, 'dataset_hash_kind': 'file'}
        with self.assertRaises(ValueError):
            verify_dataset_provenance(self.dataset, self.results, EVALUATION / 'datasets/search-ptbr-v2.json')

    def test_provenance_rejects_changed_corpus_even_when_dataset_is_unchanged(self):
        self.results['execution_metadata'] = {'corpus_sha256': '0' * 64}
        with self.assertRaisesRegex(ValueError, 'hash do corpus'):
            verify_dataset_provenance(self.dataset, self.results, EVALUATION / 'datasets/search-ptbr-v2.json')

    def test_explicit_dataset_file_must_match_executed_data(self):
        dataset = copy.deepcopy(self.dataset)
        dataset['queries'][0]['query'] += ' alterada'
        with patch('run_search_suite.run_query') as request:
            with self.assertRaises(ValueError):
                run_suite(dataset, 'http://localhost:3001', 'fake', dataset_path=EVALUATION / 'datasets/search-ptbr-v2.json')
            request.assert_not_called()

    def test_custom_dataset_without_file_records_its_actual_content_hash(self):
        dataset = copy.deepcopy(self.dataset)
        dataset['dataset'] = 'custom-diagnostic'
        def query(*args): return next(r for r in self.results['runs'] if r['query_id'] == args[2]['id'])
        with patch('run_search_suite.run_query', side_effect=query), \
             patch('run_search_suite.source_snapshot_sha256', return_value='a' * 64):
            result = run_suite(dataset, 'http://localhost:3001', 'fake')
        metadata = result['execution_metadata']
        self.assertEqual(metadata['dataset_hash_kind'], 'canonical_json')
        self.assertEqual(metadata['dataset_sha256'], canonical_dataset_sha256(dataset))
        verify_dataset_provenance(dataset, result, EVALUATION / 'datasets/search-ptbr-v2.json')

    def test_source_edits_during_measurement_invalidate_execution(self):
        def query(*args): return next(r for r in self.results['runs'] if r['query_id'] == args[2]['id'])
        with patch('run_search_suite.run_query', side_effect=query), \
             patch('run_search_suite.source_snapshot_sha256', side_effect=['a' * 64, 'b' * 64]):
            with self.assertRaisesRegex(RuntimeError, 'fontes locais mudaram'):
                run_suite(self.dataset, 'http://localhost:3001', 'fake')

    def test_expected_source_must_exist_match_scope_and_level(self):
        for change in ['source', 'project', 'level']:
            dataset = copy.deepcopy(self.dataset)
            q = dataset['queries'][0]
            if change == 'source': q['expected_source_ids'] = ['unknown']
            elif change == 'project': q['project_id'] = next(p for p in dataset['source_projects'] if p != q['project_id'])
            else: q['filters'] = {'level': 'pbi'}
            with self.subTest(change=change), self.assertRaises(ValueError): validate_dataset(dataset)

    def test_remote_or_credentialed_urls_never_receive_session_cookie(self):
        for url in ['https://example.com', 'http://host.docker.internal:3001', 'http://user:pass@localhost:3001', 'http://localhost:3001/path', 'http://localhost:3001?x=1']:
            with self.subTest(url=url), self.assertRaises(ValueError): validate_api_base_url(url)
        self.assertEqual(validate_api_base_url('http://127.0.0.1:3001/'), 'http://127.0.0.1:3001')

    def test_empty_session_does_not_send_request(self):
        with patch('run_search_suite.urlopen') as request:
            with self.assertRaises(ValueError): run_suite(self.dataset, 'http://localhost:3001', '')
            request.assert_not_called()

    def test_http_adapter_preserves_source_ids_scope_filters_and_scores(self):
        q = dict(self.dataset['queries'][0], filters={'level': 'documento', 'technology_id': 'technology'})
        payload = {'items': [{'id': q['expected_source_ids'][0], 'project_id': q['project_id'], 'entity_type': 'documento', 'relevance_score': .8}]}
        from io import BytesIO
        with patch('run_search_suite.urlopen', return_value=BytesIO(json.dumps(payload).encode())) as request:
            result = run_query('http://localhost:3001', 'test-session', q, 5, 3)
        sent = request.call_args.args[0]
        self.assertIn('projeto_id=' + q['project_id'], sent.full_url)
        self.assertIn('nivel=documento', sent.full_url)
        self.assertIn('tecnologia_id=technology', sent.full_url)
        self.assertEqual(result['results'][0]['source_id'], q['expected_source_ids'][0])
        self.assertEqual(result['results'][0]['relevance_score'], .8)
        self.assertEqual(result['results'][0]['entity_type'], 'documento')

    def test_execution_times_surround_queries_instead_of_marking_finish_as_start(self):
        from datetime import datetime, timezone
        events = []
        class Clock:
            @staticmethod
            def now(_):
                events.append('time')
                return datetime.now(timezone.utc)
        def query(*args):
            events.append('query')
            return next(r for r in self.results['runs'] if r['query_id'] == args[2]['id'])
        with patch('run_search_suite.datetime', Clock), patch('run_search_suite.run_query', side_effect=query), \
             patch('run_search_suite.working_tree_is_dirty', return_value=False), \
             patch('run_search_suite.source_snapshot_sha256', return_value='a' * 64):
            result = run_suite(self.dataset, 'http://localhost:3001', 'test-session')
        self.assertEqual(events[0], 'time')
        self.assertEqual(events[-1], 'time')
        self.assertEqual(events.count('query'), 26)
        self.assertLessEqual(result['started_at'], result['finished_at'])


if __name__ == '__main__':
    unittest.main()
