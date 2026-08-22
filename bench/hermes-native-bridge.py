#!/usr/bin/env python3
"""Hermes native context bake-off bridge.

Invokes the frozen checkout's built-in ContextCompressor without FreshCtx.
Reads JSON from stdin, writes JSON to stdout.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
HOSTS_DIR = ROOT / "bench" / "hosts" / "hermes"


def _load_lock() -> dict[str, Any]:
    lock_path = ROOT / "bench" / "hosts.lock.json"
    return json.loads(lock_path.read_text(encoding="utf-8"))


def _ensure_host_path() -> None:
    lock = _load_lock()
    expected = lock["hosts"]["hermes"]["commit"]
    if not HOSTS_DIR.is_dir():
        raise RuntimeError("Hermes host checkout missing; run npm run hosts:fetch")
    import subprocess

    actual = subprocess.check_output(
        ["git", "rev-parse", "HEAD"],
        cwd=HOSTS_DIR,
        text=True,
    ).strip()
    if actual != expected:
        raise RuntimeError(f"Hermes checkout {actual} != locked {expected}")


def _import_engine():
    sys.path.insert(0, str(HOSTS_DIR))
    from agent.context_compressor import ContextCompressor
    from agent.model_metadata import estimate_messages_tokens_rough

    return ContextCompressor, estimate_messages_tokens_rough


def _message_text(messages: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for message in messages:
        content = message.get("content")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(str(part.get("text", "")))
    return "\n\n".join(parts)


def _can_live_compress() -> bool:
    if os.environ.get("FRESHCTX_CAPTURE_OK") == "1":
        return True
    return bool(os.environ.get("OPENAI_API_KEY") or os.environ.get("HERMES_API_KEY"))


def run(payload: dict[str, Any]) -> dict[str, Any]:
    ContextCompressor, estimate_messages_tokens_rough = _import_engine()

    messages = payload["messages"]
    conversation_messages = payload.get("conversationMessages", messages)
    incoming_message = payload.get("incomingMessage")
    budget_tokens = int(payload.get("budgetTokens") or 128_000)
    budget_pressure = bool(payload.get("budgetPressure"))

    if budget_pressure:
        rough_tokens = estimate_messages_tokens_rough(messages)
        context_length = max(256, int(rough_tokens * 1.1))
    else:
        context_length = int(payload.get("contextLength") or budget_tokens or 128_000)

    engine = ContextCompressor(
        model=str(payload.get("model") or "freshctx-capture"),
        api_key=os.environ.get("OPENAI_API_KEY") or os.environ.get("HERMES_API_KEY") or "",
        base_url=os.environ.get("OPENAI_BASE_URL") or os.environ.get("HERMES_BASE_URL") or "http://127.0.0.1:8787/v1",
        config_context_length=context_length,
        quiet_mode=True,
    )
    engine.context_length = context_length
    engine.threshold_tokens = int(context_length * engine.threshold_percent)

    started = time.perf_counter()
    mode = "native-no-op"
    native_applied = False

    selected = engine.select_context(
        messages,
        conversation_messages=conversation_messages,
        incoming_message=incoming_message,
        budget_tokens=budget_tokens,
    )
    if selected is not None:
        messages = selected
        mode = "select-context"
        native_applied = True

    rough_tokens = estimate_messages_tokens_rough(messages)
    engine.last_prompt_tokens = rough_tokens

    pruned, n_pruned = engine.prune_tool_results_only(messages, rough_tokens)
    if n_pruned > 0:
        messages = pruned
        mode = "proactive-prune"
        native_applied = True
        rough_tokens = estimate_messages_tokens_rough(messages)
        engine.last_prompt_tokens = rough_tokens

    should_compress, compress_reason = engine.should_compress_info(rough_tokens)
    baseline_label = "hermes-native"

    if should_compress:
        if _can_live_compress():
            try:
                messages = engine.compress(messages, current_tokens=rough_tokens)
                mode = "compress"
                native_applied = True
            except Exception as error:  # noqa: BLE001
                baseline_label = "hermes-native-precompress"
                mode = "precompress-blocked"
                return {
                    "messages": payload["messages"] if mode == "native-no-op" else messages,
                    "baseline": baseline_label,
                    "mode": mode,
                    "nativeApplied": native_applied,
                    "shouldCompress": True,
                    "compressReason": compress_reason,
                    "error": str(error),
                    "payloadText": _message_text(messages),
                    "projectionText": "",
                    "telemetry": {"totalMs": (time.perf_counter() - started) * 1000},
                }
        else:
            baseline_label = "hermes-native-precompress"
            mode = "precompress-no-api-key"

    payload_text = _message_text(messages)
    return {
        "messages": messages,
        "baseline": baseline_label,
        "mode": mode,
        "nativeApplied": native_applied,
        "shouldCompress": should_compress,
        "compressReason": compress_reason,
        "payloadText": payload_text,
        "projectionText": "",
        "telemetry": {"totalMs": (time.perf_counter() - started) * 1000},
    }


def main() -> None:
    _ensure_host_path()
    payload = json.load(sys.stdin)
    result = run(payload)
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        sys.stderr.write(str(error))
        sys.exit(1)
