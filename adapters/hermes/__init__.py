"""FreshCtx preview context engine for Hermes Agent.

The class extends Hermes' built-in ContextCompressor, retaining its existing
compaction behavior while adding request-only live-file synchronization through
the select_context/on_turn_complete lifecycle.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import types
from typing import Any, Dict, List, Optional

from agent.context_compressor import ContextCompressor

# Hermes routes plugin loggers into HERMES_HOME/logs/agent.log, the file the
# trial harness reads per query. A bridge that fell open used to leave no
# trace there (PCR 0168).
logger = logging.getLogger("freshctx.hermes")

# Mirrors READ_TOOLS in bridge.mjs.
READ_TOOLS = frozenset({"read", "read_file", "read_text_file"})

# Executed read arguments by tool_call_id. Hermes `pre_tool_call` `modify`
# changes what a read executes with but not the persisted tool_calls, so the
# transcript alone can name the wrong path. Hermes deep-copies the registered
# engine per agent and imports this file once per loader (`plugins.context_engine`
# selects the engine with a no-op `register_hook`; the general plugin loader's
# copy is the one whose hook fires), so the store is per process, not per
# instance or per module.
_STORE_MODULE = "freshctx_hermes_executed_read_args"


def _executed_read_args() -> Dict[str, Dict[str, Any]]:
    store = sys.modules.get(_STORE_MODULE)
    if store is None:
        store = types.ModuleType(_STORE_MODULE)
        store.by_call_id = {}
        sys.modules[_STORE_MODULE] = store
    return store.by_call_id


def record_executed_read_args(
    tool_name: str = "",
    args: Optional[Dict[str, Any]] = None,
    tool_call_id: str = "",
    **kwargs: Any,
) -> None:
    """Hermes `post_tool_call` observer."""
    if tool_name not in READ_TOOLS or not tool_call_id or not isinstance(args, dict):
        return None
    _executed_read_args()[tool_call_id] = dict(args)
    return None


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
            logger.warning(
                "FreshCtx bridge %s fell open: no state file, on_session_start has not run",
                operation,
            )
            return None

        payload = {
            "operation": operation,
            "messages": messages,
            "cwd": self._workspace_cwd(),
            "stateFile": str(state_file),
            "executedReadArgsByCallId": dict(_executed_read_args()),
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
                logger.warning(
                    "FreshCtx bridge %s fell open (exit %s): %s",
                    operation,
                    completed.returncode,
                    (completed.stderr or "").strip()[:400] or "no stderr",
                )
                return None
            result = json.loads(completed.stdout)
            if not isinstance(result, dict):
                logger.warning("FreshCtx bridge %s fell open: stdout is not a JSON object", operation)
                return None
            return result
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            logger.warning("FreshCtx bridge %s fell open: %r", operation, error)
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
        if not isinstance(result, dict):
            return None
        logger.info(
            "FreshCtx bridge select: applied=%s selected=%s unresolved=%s",
            result.get("applied"),
            result.get("selected"),
            result.get("unresolved"),
        )
        if result.get("applied") is not True:
            return None
        selected = result.get("messages")
        if not isinstance(selected, list) or not all(isinstance(item, dict) for item in selected):
            return None
        return selected

    def on_turn_complete(
        self,
        messages: List[Dict[str, Any]],
        usage: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        result = self._call_bridge("observe", messages, usage=usage, turn=kwargs)
        if result is not None:
            # The bridge persisted them in the session state file.
            _executed_read_args().clear()


def register(ctx):
    """Register the engine so isolated HERMES_HOME can load name `freshctx`."""
    ctx.register_context_engine(FreshCtxContextEngine())
    ctx.register_hook("post_tool_call", record_executed_read_args)

