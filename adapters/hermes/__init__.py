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

    @property
    def name(self) -> str:
        return "freshctx"

    def _bridge_path(self) -> Path:
        return Path(__file__).with_name("bridge.mjs")

    def _workspace_cwd(self) -> str:
        for key in ("FRESHCTX_CWD", "HERMES_TRIAL_WORKSPACE"):
            value = os.environ.get(key)
            if value:
                return value
        return os.getcwd()

    def _call_bridge(self, operation: str, messages: List[Dict[str, Any]], **extra: Any):
        state_file = getattr(self, "_freshctx_state_file", None)
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
                timeout=float(os.environ.get("FRESHCTX_BRIDGE_TIMEOUT", "15.0")),
                check=False,
            )
            if completed.returncode != 0:
                return None
            result = json.loads(completed.stdout)
            return result if isinstance(result, dict) else None
        except (OSError, ValueError, subprocess.SubprocessError):
            return None

    def on_session_start(self, session_id: str, **kwargs: Any) -> None:
        parent = getattr(super(), "on_session_start", None)
        if callable(parent):
            parent(session_id, **kwargs)

        default_home = Path.home() / ".hermes"
        state_root = Path(
            os.environ.get(
                "FRESHCTX_STATE_DIR",
                str(Path(kwargs.get("hermes_home", default_home)) / "freshctx"),
            )
        )
        session_key = hashlib.sha256(session_id.encode("utf8")).hexdigest()[:20]
        self._freshctx_state_file = state_root / f"{session_key}.json"

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
            conversationMessages=conversation_messages,
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


def register(ctx):
    """Register the engine so isolated HERMES_HOME can load name `freshctx`."""
    ctx.register_context_engine(FreshCtxContextEngine())

