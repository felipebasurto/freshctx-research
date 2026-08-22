"""FreshCtx preview context engine for Hermes Agent.

The class extends Hermes' built-in ContextCompressor, retaining its existing
compaction behavior while adding request-only live-file synchronization through
the select_context/on_turn_complete lifecycle.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
from typing import Any, Dict, List, Optional

from agent.context_compressor import ContextCompressor


class FreshCtxContextEngine(ContextCompressor):
    """Compose FreshCtx selection with Hermes' normal compressor."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        if model is None:
            model = (
                os.environ.get("HERMES_MODEL")
                or os.environ.get("OPENAI_MODEL")
                or "deepseek-chat"
            )
        if api_key is None:
            api_key = (
                os.environ.get("DEEPSEEK_API_KEY")
                or os.environ.get("OPENAI_API_KEY")
                or os.environ.get("HERMES_API_KEY")
                or ""
            )
        if base_url is None:
            base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get("HERMES_BASE_URL")

        super_kwargs: Dict[str, Any] = dict(kwargs)
        if base_url is not None:
            super_kwargs.setdefault("base_url", base_url)

        super().__init__(model=model, api_key=api_key, **super_kwargs)
        self._freshctx_session_id: Optional[str] = None
        self._freshctx_state_file: Optional[Path] = None

    @property
    def name(self) -> str:
        return "freshctx"

    def _bridge_path(self) -> Path:
        return Path(__file__).with_name("bridge.mjs")

    def _resolve_hermes_home(self, kwargs: Dict[str, Any]) -> Path:
        hermes_home = kwargs.get("hermes_home")
        if hermes_home:
            return Path(str(hermes_home))
        env_home = os.environ.get("HERMES_HOME")
        if env_home:
            return Path(env_home)
        return Path.home() / ".hermes"

    def _state_root(self, kwargs: Dict[str, Any]) -> Path:
        override = os.environ.get("FRESHCTX_STATE_DIR")
        if override:
            return Path(override)
        return self._resolve_hermes_home(kwargs) / "artifacts" / "freshctx-state"

    def _session_state_path(self, session_id: str, kwargs: Dict[str, Any]) -> Path:
        session_key = hashlib.sha256(session_id.encode("utf8")).hexdigest()[:20]
        return self._state_root(kwargs) / f"{session_key}.json"

    def _ensure_state_file(
        self,
        session_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Optional[Path]:
        existing = getattr(self, "_freshctx_state_file", None)
        if existing is not None:
            return Path(existing)

        sid = (
            session_id
            or getattr(self, "_freshctx_session_id", None)
            or getattr(self, "_session_id", None)
            or "default"
        )
        self._freshctx_session_id = str(sid)
        path = self._session_state_path(self._freshctx_session_id, kwargs)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text(
                    json.dumps({"calls": {}, "tracked": {}}, indent=2) + "\n",
                    encoding="utf8",
                )
                try:
                    os.chmod(path, 0o600)
                except OSError:
                    pass
            self._freshctx_state_file = path
            return path
        except OSError:
            return None

    def _workspace_cwd(self) -> str:
        terminal_cwd = os.environ.get("TERMINAL_CWD", "").strip()
        if terminal_cwd:
            return terminal_cwd
        return os.getcwd()

    def _call_bridge(self, operation: str, messages: List[Dict[str, Any]], **extra: Any):
        bridge_kwargs: Dict[str, Any] = {}
        turn = extra.get("turn")
        if isinstance(turn, dict):
            bridge_kwargs.update(turn)

        state_file = self._ensure_state_file(
            session_id=getattr(self, "_freshctx_session_id", None),
            **bridge_kwargs,
        )
        if state_file is None:
            return None

        payload = {
            "operation": operation,
            "messages": messages,
            "cwd": self._workspace_cwd(),
            "stateFile": str(state_file),
            **extra,
        }
        try:
            completed = subprocess.run(
                [os.environ.get("FRESHCTX_NODE", "node"), str(self._bridge_path())],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                timeout=float(os.environ.get("FRESHCTX_BRIDGE_TIMEOUT", "2.0")),
                check=False,
            )
            if completed.returncode != 0:
                return None
            result = json.loads(completed.stdout)
            return result if isinstance(result, dict) else None
        except (OSError, ValueError, subprocess.SubprocessError):
            return None

    def on_session_start(self, session_id: str, **kwargs: Any) -> None:
        self._freshctx_session_id = session_id
        self._ensure_state_file(session_id, **kwargs)

        parent = getattr(super(), "on_session_start", None)
        if callable(parent):
            try:
                parent(session_id, **kwargs)
            except Exception:
                # Parent compression bind may fail without session_db; FreshCtx
                # state must still persist for select_context/on_turn_complete.
                pass

    def select_context(
        self,
        request_messages: List[Dict[str, Any]],
        *,
        conversation_messages: Optional[List[Dict[str, Any]]] = None,
        incoming_message: Optional[Dict[str, Any]] = None,
        budget_tokens: int = 0,
    ) -> Optional[List[Dict[str, Any]]]:
        result = self._call_bridge(
            "select",
            request_messages,
            budgetTokens=budget_tokens,
            incomingMessage=incoming_message,
        )
        selected = result.get("messages") if result else None
        if not isinstance(selected, list) or not all(isinstance(item, dict) for item in selected):
            return None
        return selected

    def on_turn_complete(
        self,
        messages: List[Dict[str, Any]],
        usage: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        self._call_bridge("observe", messages, usage=usage, turn=kwargs)
