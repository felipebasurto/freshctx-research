"""Hermes general plugin: force t1-read via handleForceHostReadToolCall.

Not a context engine. Loaded on all three trial arms, including `nothing`.
The Node hook is the only decision path; this file records tools and returns
the Hermes `pre_tool_call` directive.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

FORCE_ENV = "HERMES_TRIAL_FORCE_HOST_READ"
HOOK_ENV = "HERMES_TRIAL_FORCE_HOST_READ_HOOK"
DUMP_ENV = "HERMES_TRIAL_DUMP_DIR"
TOOLS_LOG = "force-host-read.tools.jsonl"


def _hook_path() -> str:
    env = os.environ.get(HOOK_ENV)
    if env:
        return env
    return str(Path(__file__).resolve().parent.parent / "force-host-read-hook.mjs")


def _run_hook(event: dict) -> dict:
    completed = subprocess.run(
        [os.environ.get("FRESHCTX_NODE", "node"), _hook_path()],
        input=json.dumps(event),
        capture_output=True,
        text=True,
        timeout=5.0,
        check=False,
    )
    if completed.returncode != 0:
        return {}
    try:
        parsed = json.loads(completed.stdout)
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _record_tool(tool: dict) -> None:
    dump_dir = os.environ.get(DUMP_ENV)
    if not dump_dir:
        return
    path = Path(dump_dir) / TOOLS_LOG
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(tool) + "\n")


def _replace_args(args: dict, forced: dict) -> None:
    for key in list(args):
        del args[key]
    args.update(forced)


def register(ctx):
    def on_pre_tool_call(tool_name, args, task_id, **kwargs):
        if os.environ.get(FORCE_ENV) != "1":
            return None
        target = args if isinstance(args, dict) else {}
        event = {
            "toolName": tool_name,
            "args": target,
            "input": target,
            "toolCallId": kwargs.get("tool_call_id") or kwargs.get("toolCallId") or task_id,
        }
        result = _run_hook(event)
        tool = result.get("tool")
        if isinstance(tool, dict):
            _record_tool(tool)
            forced = tool.get("args")
            if isinstance(args, dict) and isinstance(forced, dict):
                _replace_args(args, forced)
        return result.get("directive")

    ctx.register_hook("pre_tool_call", on_pre_tool_call)
