import os
import threading
import time
import subprocess
import sys
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from analyzer.config import AnalyzerSettings
from analyzer.pipeline import Analyzer, AnalysisBusy, AnalysisError
from analyzer.scanner import scan_repository, read_repository_text
from services.chunker import chunk_document_text


class SafetyTests(unittest.TestCase):
    def test_git_subprocess_enforces_memory_file_and_cpu_limits(self):
        with TemporaryDirectory() as folder:
            fake_git = Path(folder) / 'git'
            fake_git.write_text(f'#!{sys.executable}\n' + '''import resource, json, os
memory_limited = False
try:
    data = bytearray(256 * 1024**2)
except MemoryError:
    memory_limited = True
file_limited = False
try:
    with open(os.environ['LIMIT_TEST_FILE'], 'wb') as f:
        f.write(b'x' * (2 * 1024**2))
except OSError:
    file_limited = True
print(json.dumps([memory_limited, file_limited, resource.getrlimit(resource.RLIMIT_CPU)[0]]))
''')
            fake_git.chmod(0o755)
            result = subprocess.run([sys.executable, '-m', 'analyzer.limited_git', '1', '128', '2'],
                env={**os.environ, 'PATH': folder + os.pathsep + os.environ['PATH'], 'LIMIT_TEST_FILE': str(Path(folder) / 'data')},
                capture_output=True, text=True, timeout=5, check=True)
            self.assertEqual(json.loads(result.stdout), [True, True, 2])
            self.assertLessEqual((Path(folder) / 'data').stat().st_size, 1024**2)

    def test_links_chains_directories_and_fifo_never_enter_inventory(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / 'repo'
            root.mkdir()
            (Path(folder) / 'private.txt').write_text('private')
            (root / 'normal.py').write_text('print(1)')
            (root / 'link.txt').symlink_to(Path(folder) / 'private.txt')
            (root / 'chain.txt').symlink_to(root / 'link.txt')
            (root / 'directory').symlink_to(Path(folder), target_is_directory=True)
            os.mkfifo(root / 'fifo')
            inventory = scan_repository(root, 1000, 100)
            self.assertEqual([f.path for f in inventory['files']], ['normal.py'])
            for path in ['link.txt', 'chain.txt', 'fifo', 'directory/private.txt', '../private.txt']:
                with self.assertRaises((ValueError, OSError)):
                    read_repository_text(root, root / path, 1000)
            (root / 'normal.py').unlink()
            (root / 'normal.py').symlink_to(Path(folder) / 'private.txt')
            with self.assertRaises(OSError):
                read_repository_text(root, root / inventory['files'][0].path, 1000)

    def test_text_encodings_and_file_size(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            for encoding in ['utf-8', 'utf-8-sig', 'utf-16', 'utf-32']:
                path = root / 'text.txt'
                path.write_text('ação 😊', encoding=encoding)
                self.assertEqual(read_repository_text(root, path, 100), 'ação 😊')
                with self.assertRaises(ValueError):
                    read_repository_text(root, path, 2)

    def test_chunk_bounds_overlap_and_complete_reconstruction(self):
        for text in ['x'*60000, 'á😊漢'*5000, 'a'*1000, 'abc\n\ndef'*1000, 'x'*1001]:
            for overlap in [0, 150]:
                chunks = chunk_document_text(text, 1000, overlap)
                self.assertTrue(all(0 < len(c) <= 1000 for c in chunks))
                restored = chunks[0] + ''.join(c[overlap:] for c in chunks[1:])
                self.assertEqual(restored, text)
        for size, overlap in [(0,0),(10,10),(10,-1)]:
            with self.assertRaises(ValueError):
                chunk_document_text('text', size, overlap)

    def test_global_concurrency_queue_and_idempotent_start(self):
        with TemporaryDirectory() as folder:
            analyzer = Analyzer(AnalyzerSettings(workspace_dir=Path(folder), max_active_runs=1, max_queued_runs=1))
            self.addCleanup(analyzer.client.close)
            release = threading.Event()
            started = threading.Event()
            calls = []
            def run(run_id):
                calls.append(run_id)
                started.set()
                release.wait(3)
                analyzer._push(run_id, status='completed')
            analyzer._run = run
            try:
                analyzer.start('https://github.com/acme/repo', run_id='first')
                self.assertTrue(started.wait(1))
                analyzer.start('https://github.com/acme/repo', run_id='second')
                self.assertEqual(analyzer.start('https://github.com/acme/repo', run_id='first'), 'first')
                with self.assertRaises(AnalysisBusy):
                    analyzer.start('https://github.com/acme/repo', run_id='third')
                self.assertEqual(calls, ['first'])
                analyzer.cancel('second')
                analyzer.runs['second'].worker_thread.join(2)
                self.assertEqual(analyzer.status('second')['status'], 'cancelled')
                self.assertEqual(calls, ['first'])
            finally:
                release.set()
                analyzer.runs['first'].worker_thread.join(3)

    def test_clone_disk_limit_kills_process_and_removes_partial_clone(self):
        with TemporaryDirectory() as folder:
            analyzer = Analyzer(AnalyzerSettings(workspace_dir=Path(folder), max_repo_size_mb=1))
            self.addCleanup(analyzer.client.close)
            destination = Path(folder) / 'runs' / 'big' / 'repo'
            class Process:
                pid = 12345
                def poll(self): return None
                def wait(self): return 0
            def launch(*args, **kwargs):
                destination.mkdir(parents=True)
                (destination / 'large').write_bytes(b'x' * (1024**2 + 1))
                return Process()
            with patch('analyzer.pipeline.subprocess.Popen', side_effect=launch), patch('analyzer.pipeline.os.killpg') as kill:
                with self.assertRaisesRegex(AnalysisError, 'cota de disco'):
                    analyzer._clone('https://github.com/acme/big', destination)
                kill.assert_called_once()
                self.assertFalse(destination.exists())

    def test_checkpoint_without_completed_clone_reclones_before_scan(self):
        with TemporaryDirectory() as folder:
            from analyzer.models import RunState
            analyzer = Analyzer(AnalyzerSettings(workspace_dir=Path(folder)))
            self.addCleanup(analyzer.client.close)
            state = RunState(run_id='interrupted', url='https://github.com/acme/repo', status='paused', stage='clone')
            analyzer.runs[state.run_id] = state
            repo = Path(folder) / 'runs' / state.run_id / 'repo'
            repo.mkdir(parents=True)
            (repo / 'incomplete.txt').write_text('incomplete')
            with patch.object(analyzer.client, 'check'), patch.object(analyzer, '_clone', side_effect=AnalysisError('reclone')) as clone:
                analyzer._run(state.run_id)
                clone.assert_called_once()
                self.assertEqual(state.status, 'failed')
