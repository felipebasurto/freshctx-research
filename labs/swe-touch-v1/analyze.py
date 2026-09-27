"""Preregistered analysis for swe-touch-v1 (PROTOCOL.md). Standard library only.

    python3 analyze.py runs/main            # tests, decision, measures -> results/analysis/main.json
    python3 analyze.py runs/pilot --gate    # pilot gate (exit 1 if the pilot must stop)

Per trial it reads Harbor's `result.json` and, in the agent log directory, the
Mini-SWE-Agent trajectory, `swe_touch_interventions.jsonl` and `freshctx.jsonl`.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from spend import usage_of  # noqa: E402

ARMS = ["V", "V+FC", "S", "S+FC", "S+N"]
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", re.M)
READ_TOOLS = re.compile(r"^\s*(?:cd \S+ && )?(cat|nl|sed -n|head|tail|grep|rg|awk|less|more)\b")
EDIT_HINT = re.compile(r"(sed -i|perl -pi|>\s*\S|\.write|write_text|replace\(|patch\b|applypatch|str_replace)")
FAIL_HINT = re.compile(r"(not found|no match|0 replacements|did not change|Traceback|Error:)", re.I)


# ---------------------------------------------------------------- statistics

def mcnemar_one_sided(pairs: list[tuple[bool, bool]]) -> dict:
    """Exact one-sided McNemar: P(X >= b) with X ~ Bin(b + c, 1/2); H1 first arm better."""
    b = sum(1 for x, y in pairs if x and not y)
    c = sum(1 for x, y in pairs if y and not x)
    n = b + c
    p = sum(math.comb(n, k) for k in range(b, n + 1)) / 2 ** n if n else 1.0
    return {"pairs": len(pairs), "first_only": b, "second_only": c, "p_one_sided": p}


def wilson(successes: int, n: int, z: float) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p = successes / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half


def newcombe_paired(pairs: list[tuple[bool, bool]], z: float = 1.6448536269514722) -> dict:
    """Newcombe (1998) method 10 interval for p(first) - p(second), paired. z=1.645: one-sided 95% bounds."""
    n = len(pairs)
    a = sum(1 for x, y in pairs if x and y)
    b = sum(1 for x, y in pairs if x and not y)
    c = sum(1 for x, y in pairs if y and not x)
    d = n - a - b - c
    if n == 0:
        return {"difference": None, "lower": None, "upper": None}
    p1, p2 = (a + b) / n, (a + c) / n
    l1, u1 = wilson(a + b, n, z)
    l2, u2 = wilson(a + c, n, z)
    denominator = math.sqrt((a + b) * (c + d) * (a + c) * (b + d))
    if denominator == 0:
        phi = 0.0
    else:
        numerator = a * d - b * c
        numerator = max(numerator - n / 2, 0) if numerator > 0 else numerator
        phi = numerator / denominator
    delta = p1 - p2
    lower = delta - math.sqrt(max(0.0, (p1 - l1) ** 2 - 2 * phi * (p1 - l1) * (u2 - p2) + (u2 - p2) ** 2))
    upper = delta + math.sqrt(max(0.0, (u1 - p1) ** 2 - 2 * phi * (u1 - p1) * (p2 - l2) + (p2 - l2) ** 2))
    return {"difference": delta, "lower": lower, "upper": upper}


# ---------------------------------------------------------------- trials

def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()] if path.exists() else []


def task_name(result: dict, trial_dir: Path) -> str:
    task = result.get("task_name") or (result.get("task_id") or {}).get("path") or trial_dir.name.rsplit("__", 1)[0]
    return Path(str(task)).name


def resolved(result: dict) -> bool | None:
    if result.get("exception_info") or not result.get("verifier_result"):
        return None
    rewards = result["verifier_result"].get("rewards") or {}
    if "reward" in rewards:
        return float(rewards["reward"]) >= 1.0
    return float(next(iter(rewards.values()))) >= 1.0 if len(rewards) == 1 else None


def commands_of(trajectory: dict) -> list[dict]:
    """Agent commands in execution order, with their observation output and return code."""
    outputs = {m.get("tool_call_id"): m for m in trajectory.get("messages", []) if m.get("role") == "tool"}
    commands = []
    for message in trajectory.get("messages", []):
        for action in (message.get("extra") or {}).get("actions", []) if message.get("role") == "assistant" else []:
            observation = outputs.get(action.get("tool_call_id"), {})
            extra = observation.get("extra") or {}
            commands.append({"command": action.get("command", ""), "output": extra.get("raw_output", ""),
                             "returncode": extra.get("returncode"), "call": len(commands)})
    return commands


def patch_lines(diff: str) -> tuple[str | None, list[tuple[int, int]], list[str]]:
    """(path, changed line ranges in the post-image, added lines) of a one-file scenario diff."""
    path = next((line[6:].strip() for line in diff.splitlines() if line.startswith("+++ b/")), None)
    ranges = [(int(m.group(1)), int(m.group(1)) + int(m.group(2) or 1) - 1) for m in HUNK.finditer(diff)]
    added = [line[1:] for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++") and line[1:].strip()]
    return path, ranges, added


def read_range(command: str) -> tuple[int, int] | None:
    match = re.search(r"sed -n ['\"]?(\d+)(?:,(\d+))?p", command)
    if match:
        return int(match.group(1)), int(match.group(2) or match.group(1))
    match = re.search(r"head -n (\d+)", command)
    if match:
        return 1, int(match.group(1))
    return None


def mechanism(commands: list[dict], touch: list[dict], diff: str, submission: str) -> dict:
    applied = [row for row in touch if row.get("event_type") == "swe_touch_intervention" and row.get("patch_applied")]
    path, ranges, added = patch_lines(diff)
    out = {"interventions_applied": len(applied), "first_intervention_command": None, "reinspected_strict": None,
           "reinspected_loose": None, "stale_edit_failures": None, "steps_after_edit": None,
           "final_keeps_user_code": None}
    submitted_added = {line[1:] for line in submission.splitlines() if line.startswith("+") and not line.startswith("+++")}
    if added:
        kept = sum(1 for line in added if line in submitted_added)
        out["final_keeps_user_code"] = "all" if kept == len(added) else "some" if kept else "none"
    if not applied or not path:
        return out
    first = min(row["command_index"] for row in applied)
    out["first_intervention_command"] = first
    after = [c for c in commands if c["call"] + 1 > first]
    name = Path(path).name
    about = [c for c in after if name in c["command"]]
    out["steps_after_edit"] = len(after)
    reads = [c for c in about if READ_TOOLS.match(c["command"])]
    out["reinspected_loose"] = bool(reads)
    strict = False
    for c in reads:
        span = read_range(c["command"])
        whole = re.match(r"^\s*(?:cd \S+ && )?(cat|nl -ba|cat -n) \S+\s*$", c["command"]) is not None
        if whole or (span and any(span[0] <= end and start <= span[1] for start, end in ranges)):
            strict = True
    out["reinspected_strict"] = strict
    edits = [c for c in about if EDIT_HINT.search(c["command"]) and not READ_TOOLS.match(c["command"])]
    out["stale_edit_failures"] = sum(1 for c in edits if (c["returncode"] not in (0, None)) or FAIL_HINT.search(c["output"] or ""))
    return out


def load(runs: Path, diffs: dict[str, str]) -> list[dict]:
    rows = []
    for result_path in sorted((runs / "jobs").glob("*/*/result.json")):
        trial = result_path.parent
        arm = trial.parent.name.split("__")[-1].replace("_", "+")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        trajectories = list(trial.rglob("mini-swe-agent.trajectory.json"))
        agent_dir = trajectories[0].parent if trajectories else trial
        trajectory = json.loads(trajectories[0].read_text(encoding="utf-8")) if trajectories else {}
        info = trajectory.get("info", {})
        task = task_name(result, trial)
        fc = read_jsonl(agent_dir / "freshctx.jsonl")
        coverage = [row for row in fc if row.get("event") == "coverage"]
        commands_log = [row for row in fc if row.get("event") == "command" and row.get("status") != "not_read"]
        rows.append({
            "arm": arm, "task": task, "trial": trial.name,
            "resolved": resolved(result),
            "infra_error": (result.get("exception_info") or {}).get("exception_type"),
            "exit_status": info.get("exit_status"),
            "blocked": sum(1 for row in fc if row.get("event") == "request" and row.get("blocked")),
            "coverage_round1": next((row["covered"] for row in coverage if row.get("intervention_index") == 1), None),
            "coverage": [row["covered"] for row in coverage],
            "reads_allowlisted": len(commands_log),
            "reads_observed": sum(1 for row in commands_log if row.get("status") == "observed"),
            "skip_reasons": [row.get("reason") for row in commands_log if row.get("status") == "skipped"],
            "unavailable_markers": sum(row.get("unavailable_markers", 0) for row in fc if row.get("event") == "request"),
            "projection_bytes": [row.get("projection_bytes") for row in fc if row.get("event") == "request" and "projection_bytes" in row],
            "usage": usage_of(trajectories[0]) if trajectories else None,
            **mechanism(commands_of(trajectory), read_jsonl(agent_dir / "swe_touch_interventions.jsonl"),
                        diffs.get(task, ""), info.get("submission") or ""),
        })
    return rows


# ---------------------------------------------------------------- report

def paired(rows: list[dict], first: str, second: str, rep: int = 1, tasks: set[str] | None = None) -> list[tuple[bool, bool]]:
    def by_task(arm: str) -> dict[str, dict]:
        seen: dict[str, list[dict]] = {}
        for row in rows:
            if row["arm"] == arm:
                seen.setdefault(row["task"], []).append(row)
        return {task: sorted(items, key=lambda r: r["trial"])[rep - 1] for task, items in seen.items() if len(items) >= rep}
    a, b = by_task(first), by_task(second)
    common = sorted(set(a) & set(b) & (tasks if tasks is not None else set(a)))
    return [(a[t]["resolved"], b[t]["resolved"]) for t in common if a[t]["resolved"] is not None and b[t]["resolved"] is not None]


def decide(h1: dict, h2: dict, s_fc_resolved: int, s_n_resolved: int) -> dict:
    return {
        "recovers_silent_edit_loss": h1["p_one_sided"] < 0.05,
        "h2": ("verified refresh beats a diff notice here" if h2["p_one_sided"] < 0.05
               else "a diff notice is enough here" if s_n_resolved >= s_fc_resolved - 4
               else "inconclusive"),
    }


def summarize(rows: list[dict]) -> dict:
    table = {}
    for arm in ARMS:
        group = [row for row in rows if row["arm"] == arm]
        verified = [row for row in group if row["resolved"] is not None]
        usage = [row["usage"] for row in group if row["usage"]]
        solved = sum(1 for row in verified if row["resolved"])
        cost = sum(u["usd_cached"] for u in usage)
        applied = [row for row in group if row["interventions_applied"]]
        cov = [row["coverage_round1"] for row in applied if row["coverage_round1"] is not None]
        table[arm] = {
            "trials": len(group), "verified": len(verified), "resolved": solved,
            "resolve_rate": solved / len(verified) if verified else None,
            "infra_errors": len(group) - len(verified), "blocked_runs": sum(1 for row in group if row["blocked"]),
            "exit_statuses": _count(row["exit_status"] for row in group),
            "interventions_applied_runs": len(applied),
            "coverage_round1": _count(cov),
            "reads_observed_share": _ratio(sum(r["reads_observed"] for r in group), sum(r["reads_allowlisted"] for r in group)),
            "skip_reasons": _count(reason for row in group for reason in row["skip_reasons"]),
            "reinspected_strict": _count(row["reinspected_strict"] for row in applied),
            "reinspected_loose": _count(row["reinspected_loose"] for row in applied),
            "final_keeps_user_code": _count(row["final_keeps_user_code"] for row in applied),
            "stale_edit_failures": sum(row["stale_edit_failures"] or 0 for row in applied),
            "steps_after_edit_mean": _mean(row["steps_after_edit"] for row in applied),
            "tokens": {key: sum(u[key] for u in usage) for key in ("prompt", "hit", "miss", "output")},
            "cache_hit_share": _ratio(sum(u["hit"] for u in usage), sum(u["prompt"] for u in usage)),
            "cost_usd": cost, "cost_per_resolved_usd": cost / solved if solved else None,
            "served_models": _merge(u["served"] for u in usage),
        }
    return table


def analyze(rows: list[dict]) -> dict:
    h1 = mcnemar_one_sided(paired(rows, "S+FC", "S"))
    h2 = mcnemar_one_sided(paired(rows, "S+FC", "S+N"))
    harm_pairs = paired(rows, "V+FC", "V")
    h3 = {**newcombe_paired(harm_pairs), "mcnemar_v_over_vfc": mcnemar_one_sided([(y, x) for x, y in harm_pairs])}
    h3["verdict"] = ("no harm shown" if h3["lower"] is not None and h3["lower"] > -0.02
                     else "harm" if h3["mcnemar_v_over_vfc"]["p_one_sided"] < 0.05 else "inconclusive")
    pairs_h2 = paired(rows, "S+FC", "S+N")
    applied_everywhere = {task for task in {row["task"] for row in rows}
                          if all(any(r["task"] == task and r["arm"] == arm and r["interventions_applied"] for r in rows)
                                 for arm in ("S", "S+FC", "S+N"))}
    return {
        "arms": summarize(rows),
        "tests": {
            "H1 S+FC>S": h1, "H2 S+FC>S+N": h2, "H3 V+FC vs V": h3,
            "S+N>S": mcnemar_one_sided(paired(rows, "S+N", "S")),
            "V>S (silent-edit loss)": mcnemar_one_sided(paired(rows, "V", "S")),
        },
        "decision": decide(h1, h2, sum(x for x, _ in pairs_h2), sum(y for _, y in pairs_h2)),
        "secondary_applied_in_all_S_arms": {
            "tasks": len(applied_everywhere),
            "H1": mcnemar_one_sided(paired(rows, "S+FC", "S", tasks=applied_everywhere)),
            "H2": mcnemar_one_sided(paired(rows, "S+FC", "S+N", tasks=applied_everywhere)),
        },
        "rep2": {"H1": mcnemar_one_sided(paired(rows, "S+FC", "S", rep=2)),
                 "H2": mcnemar_one_sided(paired(rows, "S+FC", "S+N", rep=2))},
    }


def gate(report: dict, planned_main_trials: dict[str, int], caps_left_usd: float) -> dict:
    arms = report["arms"]
    fc = arms["S+FC"]
    applied = sum(fc["coverage_round1"].values())
    coverage = fc["coverage_round1"].get("full", 0) / applied if applied else 0.0
    trials = sum(a["trials"] for a in arms.values())
    infra = sum(a["infra_errors"] for a in arms.values()) / trials if trials else 1.0
    projected = sum((arms[arm]["cost_usd"] / arms[arm]["trials"] if arms[arm]["trials"] else 0) * n
                    for arm, n in planned_main_trials.items())
    blocked = sum(a["blocked_runs"] for a in arms.values())
    reasons = []
    if coverage < 0.5:
        reasons.append(f"coverage {coverage:.0%} < 50%")
    if projected > caps_left_usd:
        reasons.append(f"projected main-run model cost ${projected:.2f} > ${caps_left_usd:.2f} left")
    if infra > 0.10:
        reasons.append(f"infrastructure errors {infra:.0%} > 10%")
    if blocked:
        reasons.append(f"{blocked} runs had a blocked (unverifiable) request")
    return {"coverage_full_round1": coverage, "infra_error_rate": infra, "projected_main_usd": projected,
            "blocked_runs": blocked, "stop": bool(reasons), "reasons": reasons,
            "manual_audit_required": "5 rewritten requests per FreshCtx arm from freshctx-audit.jsonl"}


def _count(values) -> dict:
    counts: dict[str, int] = {}
    for value in values:
        counts[str(value)] = counts.get(str(value), 0) + 1
    return counts


def _merge(dicts) -> dict:
    merged: dict[str, int] = {}
    for item in dicts:
        for key, value in item.items():
            merged[key] = merged.get(key, 0) + value
    return merged


def _ratio(num: float, den: float) -> float | None:
    return num / den if den else None


def _mean(values) -> float | None:
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def scenario_diffs(swe_touch: Path) -> dict[str, str]:
    diffs = {}
    path = swe_touch / "data/v0.1.2/swe_bench_verified.jsonl"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            patch = row["counter_edit"]["interventions"][0].get("patch") or {}
            diffs[row["instance_id"]] = patch.get("diff", "")
    return diffs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("runs", type=Path)
    parser.add_argument("--swe-touch", type=Path, default=HERE.parents[3] / "swe-touch")
    parser.add_argument("--gate", action="store_true")
    parser.add_argument("--main-plan", type=Path, help="plan.json of the main run, for the gate's cost projection")
    args = parser.parse_args()
    plan = json.loads((args.runs / "plan.json").read_text())
    rows = load(args.runs, scenario_diffs(args.swe_touch))
    report = {"phase": plan["phase"], "planned": {a: e["trials"] for a, e in plan["arms"].items()}, **analyze(rows), "trials": rows}
    if args.gate:
        spent = json.loads((HERE / "results" / ".spent.json").read_text()) if (HERE / "results" / ".spent.json").exists() else {"model_usd": 0.0}
        main_trials = ({a: e["trials"] for a, e in json.loads(args.main_plan.read_text())["arms"].items()} if args.main_plan
                       else {arm: 192 for arm in ARMS})
        report["gate"] = gate(report, main_trials, 150.0 - spent.get("model_usd", 0.0))
    out = HERE / "results" / "analysis" / f"{plan['phase']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "trials"}, indent=2, default=str))
    if args.gate and report["gate"]["stop"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
