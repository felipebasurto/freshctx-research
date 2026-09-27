"""Offline check of the SWE-Touch + FreshCtx integration, no Docker and no model calls.

Runs SWE-Touch's real host bridge (`EnvironmentBridgeServer`), its real
`CounterEditController` in `patch_only` mode, and the real patched
Mini-SWE-Agent runner process, against a local git repository that stands in
for `/testbed`. A scripted model replays the same commands in every arm and
records each request it receives.

    uv run --project <SWE-Touch>/harbor python offline_touch.py \
        --freshctx-bridge <freshctx>/bridges/mini-swe-agent --out results/offline

Checks (exit status 1 on any failure):
- SWE-Touch sees the same agent command indices and interventions in every arm
  (FreshCtx's mirror reads are not agent commands);
- S and V dispatch exactly the saved history;
- S+FC replaces observed reads with markers, projects the user's edit, logs
  coverage, and leaves the saved trajectory unchanged;
- S+N appends the E11c notice once per applied intervention, outgoing copy only;
- a read that overlaps the critical region but stops above the changed lines
  triggers SWE-Touch, yet FreshCtx projects nothing the agent never read
  (coverage `none`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

from harbor.agents.external.bridge import EnvironmentBridgeServer
from harbor.agents.external.uv_runner import UvHarnessRunner
from harbor.environments.base import ExecResult
from harbor.swe_touch.records import materialize_scenarios
from harbor.swe_touch.runtime.remote import CounterEditController

HERE = Path(__file__).resolve().parent
INSTANCE = "example__offline-1"
SOURCE = '''"""Pricing helpers."""


def subtotal(items):
    total = 0
    for price, quantity in items:
        total += price * quantity
    return total


def discount(total, rate):
    if rate <= 0:
        return total
    return total * (1 - rate)


def tax(total):
    return round(total * 0.2, 2)
'''
USER_DIFF = (
    "diff --git a/pricing.py b/pricing.py\n"
    "--- a/pricing.py\n"
    "+++ b/pricing.py\n"
    "@@ -11,6 +11,8 @@ def subtotal(items):\n"
    " def discount(total, rate):\n"
    "     if rate <= 0:\n"
    "         return total\n"
    "+    if rate > 0.5:\n"
    "+        rate = 0.5\n"
    "     return total * (1 - rate)\n"
    " \n"
    " \n"
)
COMMANDS = [
    "nl -ba pricing.py | sed -n '1,16p'",  # reads the critical region: intervention 1 lands after it
    "cat pricing.py",
    "grep -n rate pricing.py",
    # The agent rewrites the file from its stale view (drops the user's lines); intervention 2 re-applies.
    "cat > pricing.py <<'EOF'\n" + SOURCE.replace("return total * (1 - rate)", "return total * (1 - min(rate, 1))") + "EOF",
    "sed -n '11,16p' pricing.py",
    "echo COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT",
]
ARMS = {
    "V": {"controller": False, "mode": "off", "notice": False},
    "V+FC": {"controller": False, "mode": "rewrite", "notice": False},
    "S": {"controller": True, "mode": "shadow", "notice": False},
    "S+FC": {"controller": True, "mode": "rewrite", "notice": False},
    "S+N": {"controller": True, "mode": "shadow", "notice": True},
    # The first read overlaps the critical region (so SWE-Touch fires) but stops above the inserted lines.
    "S+FC changed": {"controller": True, "mode": "rewrite", "notice": False, "refresh": "changed"},
    "S+FC narrow": {"controller": True, "mode": "rewrite", "notice": False,
                    "commands": [COMMANDS[0].replace("'1,16p'", "'1,12p'"), *COMMANDS[1:]]},
}


def record() -> dict:
    patch = {"id": "offline-edit", "diff": USER_DIFF, "target_regions": [{"path": "pricing.py", "start_line": 11, "end_line": 16}],
             "user_claim": "Keep the cap."}
    return {
        "schema_version": "1.0.0", "benchmark": "swe_bench_verified", "split": "test", "instance_id": INSTANCE,
        "task_critical_regions": patch["target_regions"],
        "counter_edit": {
            "mode": "patch", "max_interventions": 3, "message_prompt_id": "counter_edit_user_simulator",
            "interventions": [
                {"order": order, "delivery": "patch_and_message", "patch": patch,
                 "trigger": {"event": "read_or_edit" if order == 1 else "edit", "max_triggers": 1, "regions": patch["target_regions"]}}
                for order in range(1, 4)
            ],
            "validation": {"status": "validated_counter_edit"},
        },
    }


class LocalSandbox:
    """Duck-typed Harbor environment: `/testbed` and `/tmp/harbor-swe-user-*` map to local directories."""

    def __init__(self, repo: Path, scratch: Path) -> None:
        self.repo, self.scratch = repo, scratch

    def _map(self, text: str) -> str:
        return text.replace("/tmp/harbor-swe-user-", f"{self.scratch}/harbor-swe-user-").replace("/testbed", str(self.repo))

    async def exec(self, command: str, cwd: str | None = None, env=None, timeout_sec=None, user=None) -> ExecResult:
        done = await asyncio.to_thread(subprocess.run, ["bash", "-c", self._map(command)], cwd=self._map(cwd or "/testbed"),
                                       capture_output=True, timeout=timeout_sec or 60)
        return ExecResult(stdout=done.stdout.decode("utf-8", "replace"), stderr=done.stderr.decode("utf-8", "replace"),
                          return_code=done.returncode)

    async def upload_file(self, source_path, target_path: str) -> None:
        shutil.copyfile(source_path, self._map(target_path))

    async def download_file(self, source_path: str, target_path) -> None:
        shutil.copyfile(self._map(source_path), target_path)


def scripted_config(path: Path, commands: list[str]) -> None:
    outputs = []
    for number, command in enumerate(commands, start=1):
        call = f"call_{number}"
        outputs.append({
            "role": "assistant", "content": f"step {number}",
            "tool_calls": [{"id": call, "type": "function", "function": {"name": "bash", "arguments": json.dumps({"command": command})}}],
            "extra": {"actions": [{"command": command, "tool_call_id": call}], "cost": 0.0},
        })
    path.write_text(yaml.safe_dump({"model": {"outputs": outputs}}))


async def run_arm(name: str, arm: dict, base: Path, bridge_dir: Path) -> dict:
    root = base / name.replace(" ", "-")
    repo, scratch, logs = root / "sandbox-repo", root / "scratch", root / "logs"
    for folder in (repo, scratch, logs):
        folder.mkdir(parents=True)
    (repo / "pricing.py").write_text(SOURCE)
    for args in (["init", "-q"], ["add", "."], ["-c", "user.email=o@example.invalid", "-c", "user.name=o", "commit", "-qm", "base"]):
        subprocess.run(["git", *args], cwd=repo, check=True)
    scenarios = root / "scenarios"
    materialize_scenarios([record()], scenarios)
    controller = CounterEditController.from_directory(scenarios, intervention_mode="patch_only", current_instance_id=INSTANCE) if arm["controller"] else None
    touch_log = logs / "swe_touch.jsonl"
    server = EnvironmentBridgeServer(environment=LocalSandbox(repo, scratch), template_vars={"system": "Linux", "release": "", "version": "", "machine": "x86_64"},
                                     swe_touch_controller=controller, swe_touch_log_path=touch_log)
    config = root / "scripted.yaml"
    scripted_config(config, arm.get("commands", COMMANDS))
    (root / "instruction.txt").write_text("Cap discounts sensibly.")
    requests_log = logs / "requests.jsonl"
    env = {
        "MSWEA_SILENT_STARTUP": "1", "MSWEA_CONFIGURED": "true", "MSWEA_COST_TRACKING": "ignore_errors",
        "PYTHONPATH": str(HERE), "RECORDING_MODEL_LOG": str(requests_log),
        "FRESHCTX_MODE": arm["mode"], "FRESHCTX_NOTICE": "1" if arm["notice"] else "0",
        "FRESHCTX_BRIDGE_DIR": str(bridge_dir), "FRESHCTX_REPO_ROOT": "/testbed",
        "FRESHCTX_REFRESH": arm.get("refresh", "all"),
    }
    trajectory = logs / "mini-swe-agent.trajectory.json"
    await server.start()
    try:
        code = await UvHarnessRunner().run_module(
            module="harbor.agents.external.runners.mini_swe_agent_runner",
            args=["--bridge-url", server.url, f"--bridge-token={server.token}", "--task-file", str(root / "instruction.txt"),
                  "--output-path", str(trajectory), "--model", "offline/scripted", "--model-class", "recording_model.RecordingModel",
                  "--config", "mini", "--config", str(config), "--cost-limit", "0", "--step-limit", "100"],
            packages=["mini-swe-agent==2.4.1"], logs_dir=logs, env=env,
        )
    finally:
        await server.stop()
    read = lambda path: [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
    return {
        "code": code,
        "requests": read(requests_log),
        "saved": json.loads(trajectory.read_text())["messages"] if trajectory.exists() else [],
        "touch": [row for row in read(touch_log) if row.get("event_type") == "swe_touch_intervention"],
        "freshctx": read(logs / "freshctx.jsonl"),
        "final": (repo / "pricing.py").read_text(),
        "stderr": (logs / "external-harness.stderr.log").read_text()[-3000:],
    }


def prefix_reuse(requests: list[list[dict]]) -> float | None:
    """Share of request bytes (after the first) that repeat the previous request's leading bytes:
    what a provider's prefix cache can reuse."""
    reused = total = 0
    for previous, current in zip(requests, requests[1:]):
        a, b = json.dumps(previous), json.dumps(current)
        common = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
        reused, total = reused + common, total + len(b)
    return round(reused / total, 3) if total else None


def strip(messages: list[dict]) -> list[dict]:
    return [{k: v for k, v in m.items() if k != "extra"} for m in messages]


def check(results: dict) -> list[str]:
    failures = []
    expect = lambda ok, message: ok or failures.append(message)
    for name, result in results.items():
        expect(result["code"] == 0, f"{name}: runner exit {result['code']}: {result['stderr']}")
    if failures:
        return failures
    touch = {name: [(row["command_index"], row["intervention_index"], row["patch_applied"]) for row in results[name]["touch"]] for name in ("S", "S+FC", "S+N", "S+FC narrow")}
    expect(len(set(map(tuple, touch.values()))) == 1 and touch["S"], f"SWE-Touch saw different interventions per arm: {touch}")
    expect(touch["S"][:2] == [(1, 1, True), (4, 2, True)], f"expected interventions after commands 1 and 4: {touch['S']}")
    for name in ("V", "S"):
        saved = strip(results[name]["saved"])
        expect(all(request == saved[:len(request)] for request in results[name]["requests"]), f"{name}: dispatched differs from saved history")
    fc = results["S+FC"]
    after_edit = fc["requests"][1]
    projection = after_edit[-1]["content"]
    expect(after_edit[-1]["role"] == "user" and "if rate > 0.5:" in projection, "S+FC: projection lacks the user's edit")
    marker = json.loads(after_edit[3]["content"])["output"]
    expect(marker.startswith("[") and marker.endswith("]"), f"S+FC: read 1 not replaced by a marker: {marker!r}")
    saved_read = json.loads(strip(fc["saved"])[3]["content"])["output"]
    expect("if rate > 0.5" not in saved_read and "def discount" in saved_read, "S+FC: saved trajectory changed")
    coverage = [(row["intervention_index"], row["covered"]) for row in fc["freshctx"] if row["event"] == "coverage"]
    expect(coverage[:2] == [(1, "full"), (2, "full")], f"S+FC: coverage {coverage}")
    expect(not any(row.get("blocked") for row in fc["freshctx"]), "S+FC: a request was blocked")
    notice = results["S+N"]
    notes = [(index, m["content"]) for index, request in enumerate(notice["requests"]) for m in request if str(m.get("content")).startswith("[Note: ")]
    expect([index for index, _ in notes] == [1, 4], f"S+N: notices in requests {[index for index, _ in notes]}")
    expect(all(text.startswith("[Note: pricing.py was changed outside this session after your earlier work. The change:\n```diff\n--- a/pricing.py\n+++ b/pricing.py\n")
               and "+    if rate > 0.5:" in text and text.endswith("```]") for _, text in notes), "S+N: notice text")
    expect(not any(str(m.get("content")).startswith("[Note: ") for m in notice["saved"]), "S+N: notice leaked into the saved trajectory")
    expect([row["covered"] for row in notice["freshctx"] if row["event"] == "coverage"][:2] == ["full", "full"], "S+N: shadow coverage")
    narrow = results["S+FC narrow"]
    expect([row["covered"] for row in narrow["freshctx"] if row["event"] == "coverage"][:1] == ["none"], "narrow: round-1 coverage should be none")
    expect("if rate > 0.5" not in narrow["requests"][1][-1]["content"], "narrow: projected lines the agent never read")
    changed = results["S+FC changed"]
    expect(changed["requests"][0] == strip(changed["saved"])[:len(changed["requests"][0])], "changed: first request not native")
    expect("if rate > 0.5:" in changed["requests"][1][-1]["content"], "changed: edit not projected")
    vfc = results["V+FC"]
    expect(not any(row["event"] == "intervention" for row in vfc["freshctx"]), "V+FC: unexpected intervention")
    expect(any(row.get("rewritten") for row in vfc["freshctx"] if row["event"] == "request"), "V+FC: never rewrote")
    return failures


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--freshctx-bridge", required=True, type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    base = Path(tempfile.mkdtemp(prefix="swe-touch-offline-"))
    results = {name: await run_arm(name, arm, base, args.freshctx_bridge.resolve()) for name, arm in ARMS.items()}
    failures = check(results)
    summary = {
        name: {
            "exit": result["code"],
            "interventions": [(row["command_index"], row["intervention_index"], row["patch_applied"]) for row in result["touch"]],
            "requests": len(result["requests"]),
            "freshctx_events": {kind: sum(1 for row in result["freshctx"] if row["event"] == kind) for kind in ("command", "request", "intervention", "coverage")},
            "observed_reads": sum(1 for row in result["freshctx"] if row["event"] == "command" and row.get("status") == "observed"),
            "coverage": [row["covered"] for row in result["freshctx"] if row["event"] == "coverage"],
            "final_file_keeps_user_edit": "if rate > 0.5" in result["final"],
            "prefix_reuse": prefix_reuse(result["requests"]),
        }
        for name, result in results.items()
    }
    report = {"failures": failures, "arms": summary}
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "offline_touch.json").write_text(json.dumps(report, indent=2) + "\n")
        for name, result in results.items():
            (args.out / f"{name.replace('+', '_').replace(' ', '_')}.requests.json").write_text(json.dumps(result["requests"], indent=1) + "\n")
    print(json.dumps(report, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
