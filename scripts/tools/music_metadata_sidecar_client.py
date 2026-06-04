#!/usr/bin/env python3
from __future__ import annotations

import itertools
import json
import shlex
import subprocess
import threading
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_TIMEOUT_SECONDS = 15


class _PendingResponse:
    def __init__(self):
        self.event = threading.Event()
        self.response = None


class NodeMetadataSidecarClient:
    def __init__(self, command, cwd=None, default_timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
        argv = shlex.split(str(command or "").strip())
        if not argv:
            raise ValueError("metadata sidecar command is required")

        self._command = " ".join(argv)
        self._cwd = str(cwd or ROOT_DIR)
        self._default_timeout_seconds = max(1, int(default_timeout_seconds))
        self._process = subprocess.Popen(
            argv,
            cwd=self._cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        if self._process.stdin is None or self._process.stdout is None or self._process.stderr is None:
            raise RuntimeError("metadata sidecar did not expose stdio pipes")

        self._lock = threading.Lock()
        self._pending = {}
        self._request_counter = itertools.count(1)
        self._stderr_lines = []
        self._closed = False
        self._stdout_thread = threading.Thread(
            target=self._stdout_reader_loop,
            name="music-metadata-sidecar-stdout",
            daemon=True,
        )
        self._stderr_thread = threading.Thread(
            target=self._stderr_reader_loop,
            name="music-metadata-sidecar-stderr",
            daemon=True,
        )
        self._stdout_thread.start()
        self._stderr_thread.start()

    def request(self, command, payload, timeout_seconds=None):
        pending = _PendingResponse()
        timeout = self._default_timeout_seconds if timeout_seconds is None else max(1, int(timeout_seconds))

        with self._lock:
            self._ensure_running()
            request_id = str(next(self._request_counter))
            self._pending[request_id] = pending
            try:
                self._process.stdin.write(
                    json.dumps(
                        {"id": request_id, "command": command, "input": payload},
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                )
                self._process.stdin.flush()
            except Exception as error:
                self._pending.pop(request_id, None)
                raise RuntimeError(f"failed to write metadata sidecar request: {error}") from error

        if not pending.event.wait(timeout):
            with self._lock:
                self._pending.pop(request_id, None)
            raise RuntimeError(f"metadata sidecar timed out after {timeout} seconds")

        response = pending.response or {}
        if not response.get("ok"):
            message = (((response.get("error") or {}).get("message")) if isinstance(response, dict) else "") or (
                "metadata sidecar request failed"
            )
            raise RuntimeError(message)
        return response.get("result") or {}

    def close(self):
        with self._lock:
            if self._closed:
                return
            self._closed = True

        try:
            self._process.stdin.close()
        except Exception:
            pass

        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=2)

        self._resolve_pending_with_error("metadata sidecar client closed")

    def _ensure_running(self):
        if self._closed:
            raise RuntimeError("metadata sidecar client is closed")
        if self._process.poll() is not None:
            raise RuntimeError(self._exit_message())

    def _stdout_reader_loop(self):
        try:
            for raw_line in self._process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    response = json.loads(line)
                except Exception as error:
                    self._resolve_pending_with_error(f"invalid metadata sidecar response: {error}")
                    return
                request_id = str(response.get("id") or "")
                with self._lock:
                    pending = self._pending.pop(request_id, None)
                if not pending:
                    continue
                pending.response = response
                pending.event.set()
        finally:
            self._resolve_pending_with_error(self._exit_message())

    def _stderr_reader_loop(self):
        try:
            for raw_line in self._process.stderr:
                line = raw_line.rstrip()
                if not line:
                    continue
                with self._lock:
                    self._stderr_lines.append(line)
                    if len(self._stderr_lines) > 20:
                        self._stderr_lines = self._stderr_lines[-20:]
        except Exception:
            return

    def _exit_message(self):
        code = self._process.poll()
        base = f"metadata sidecar exited unexpectedly: {self._command}"
        if code is not None:
            base = f"{base} (code={code})"
        detail = ""
        with self._lock:
            if self._stderr_lines:
                detail = "; ".join(self._stderr_lines[-3:])
        return f"{base}: {detail}" if detail else base

    def _resolve_pending_with_error(self, message):
        with self._lock:
            pending_rows = list(self._pending.values())
            self._pending.clear()
        for pending in pending_rows:
            pending.response = {"ok": False, "error": {"message": message}}
            pending.event.set()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


def default_metadata_sidecar_command():
    sidecar_path = Path(__file__).with_name("music_metadata_sidecar.mjs")
    return f"node {shlex.quote(str(sidecar_path))}"


def create_metadata_sidecar_client(command="", cwd=None, default_timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
    resolved_command = str(command or "").strip() or default_metadata_sidecar_command()
    client = NodeMetadataSidecarClient(
        resolved_command,
        cwd=cwd,
        default_timeout_seconds=default_timeout_seconds,
    )
    try:
        client.request("health", {}, timeout_seconds=min(default_timeout_seconds, 5))
    except Exception:
        client.close()
        raise
    return client
