"""Offline estimate of what FreshCtx adds to uncached request bytes (no model, no sandbox).

A scripted Mini-SWE-Agent session on a synthetic repository: ten 200-line
files, 30 numbered range reads, a user edit after read 12 and the agent's own
edit after read 24. For each mode it records every outgoing request and counts
the bytes that do not repeat the previous request's leading bytes (what a
prefix cache cannot reuse).

    uv run --no-project --python 3.12 --with mini-swe-agent==2.4.1 \
        python cache_estimate.py --freshctx-bridge <freshctx>/bridges/mini-swe-agent --out ../results/offline
"""

import argparse
import copy
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("MSWEA_SILENT_STARTUP", "1")
os.environ.setdefault("MSWEA_CONFIGURED", "true")

from minisweagent.agents.default import DefaultAgent  # noqa: E402
from minisweagent.config import get_config_from_spec  # noqa: E402
from minisweagent.environments.local import LocalEnvironment  # noqa: E402
from minisweagent.models.test_models import DeterministicToolcallModel  # noqa: E402

MINI = get_config_from_spec("mini")
FILES = 10
LINES = 200


def source(index: int) -> str:
    body = [f'"""Module {index}."""', ""]
    for fn in range(LINES // 5):
        body += [f"def f{index}_{fn}(x):", f"    y = x * {fn + 1}", f"    return y + {index}", "", ""]
    return "\n".join(body[:LINES]) + "\n"


def commands() -> list[str]:
    reads = [f"nl -ba pkg/m{i % FILES}.py | sed -n '{1 + (i // FILES) * 60},{60 + (i // FILES) * 60}p'" for i in range(30)]
    script = reads[:24] + ["perl -pi -e 's/y = x \\* 3$/y = x * 33/' pkg/m1.py"] + reads[24:]
    return script + ["echo COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT"]


class Env(LocalEnvironment):
    def __init__(self, repo: str, **kwargs):
        super().__init__(cwd=repo, **kwargs)
        self.repo, self.count, self.pending = repo, 0, []

    def execute(self, action, cwd="", *, timeout=None):
        self.count += 1
        try:
            return super().execute(action, cwd, timeout=timeout)
        finally:
            if self.count == 12:  # the user's edit, right after read 12 (m1.py lines 61-120)
                path = Path(self.repo, "pkg/m1.py")
                before = path.read_text()
                path.write_text(before.replace("    y = x * 15\n", "    y = x * 15\n    y = max(y, 0)\n"))
                diff = subprocess.run(["git", "diff"], cwd=self.repo, capture_output=True, text=True).stdout
                self.pending.append({"scenario_id": "s", "intervention_index": 1, "patch_applied": True, "patch_diff": diff})

    def drain_interventions(self):
        pending, self.pending = self.pending, []
        return pending

    def internal_exec(self, command, cwd):
        done = subprocess.run(["bash", "-c", command], cwd=cwd or self.repo, capture_output=True)
        return done.stdout.decode(), done.returncode


class Recorder(DeterministicToolcallModel):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.requests = []

    def query(self, messages, **kwargs):
        self.requests.append([{k: v for k, v in m.items() if k != "extra"} for m in copy.deepcopy(messages)])
        return super().query(messages, **kwargs)


def run(mode: str, refresh: str, bridge_dir: Path) -> list[list[dict]]:
    sys.path.insert(0, str(bridge_dir))
    from freshctx_mini import FreshCtxEnvironment, FreshCtxModel, MiniBridge, observation_renderer

    with tempfile.TemporaryDirectory() as base:
        repo = Path(base, "repo")
        (repo / "pkg").mkdir(parents=True)
        for index in range(FILES):
            (repo / "pkg" / f"m{index}.py").write_text(source(index))
        for args in (["init", "-q"], ["add", "."], ["-c", "user.email=e@example.invalid", "-c", "user.name=e", "commit", "-qm", "base"]):
            subprocess.run(["git", *args], cwd=repo, check=True)
        outputs = []
        for number, command in enumerate(commands(), start=1):
            call = f"call_{number}"
            outputs.append({"role": "assistant", "content": f"step {number}",
                            "tool_calls": [{"id": call, "type": "function", "function": {"name": "bash", "arguments": json.dumps({"command": command})}}],
                            "extra": {"actions": [{"command": command, "tool_call_id": call}], "cost": 0.0}})
        env = Env(str(repo))
        model = Recorder(outputs=outputs, observation_template=MINI["model"]["observation_template"])
        bridge = MiniBridge(mirror_root=Path(base, "mirror"), repo_root=str(repo), internal_exec=env.internal_exec,
                            mode=mode, refresh=refresh, session_id=f"{mode}-{refresh}")
        config = {**{k: v for k, v in MINI["agent"].items() if k != "mode"}, "cost_limit": 0}
        agent = DefaultAgent(FreshCtxModel(model, bridge), FreshCtxEnvironment(env, bridge), **config)
        bridge.render = observation_renderer(model, agent)
        try:
            agent.run("Estimate.")
        finally:
            bridge.close()
        return model.requests


def uncached(requests: list[list[dict]]) -> list[int]:
    sizes, previous = [], ""
    for request in requests:
        text = json.dumps(request)
        common = next((i for i, (x, y) in enumerate(zip(previous, text)) if x != y), min(len(previous), len(text)))
        sizes.append(len(text) - common)
        previous = text
    return sizes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--freshctx-bridge", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = {}
    for label, mode, refresh in (("native", "off", "all"), ("freshctx all", "rewrite", "all"), ("freshctx changed", "rewrite", "changed")):
        requests = run(mode, refresh, args.freshctx_bridge.resolve())
        sizes = uncached(requests)
        report[label] = {"requests": len(requests), "uncached_bytes_after_first": sum(sizes[1:]),
                         "total_bytes": sum(len(json.dumps(r)) for r in requests),
                         "last_request_bytes": len(json.dumps(requests[-1]))}
    base = report["native"]["uncached_bytes_after_first"]
    for entry in report.values():
        entry["uncached_vs_native"] = round(entry["uncached_bytes_after_first"] / base, 2)
    print(json.dumps(report, indent=2))
    if args.out:
        (args.out / "cache_estimate.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
