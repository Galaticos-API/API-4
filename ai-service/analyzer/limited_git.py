"""Exec git with per-process bounds without unsafe preexec_fn in threaded workers."""
import os
import resource
import sys

if __name__ == "__main__":
    disk_mb, memory_mb, cpu_seconds = map(int, sys.argv[1:4])
    resource.setrlimit(resource.RLIMIT_FSIZE, (disk_mb * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_AS, (memory_mb * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds,) * 2)
    os.execvp("git", ["git", "-c", "core.hooksPath=/dev/null", *sys.argv[4:]])
