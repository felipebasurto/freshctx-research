"""Spend and completeness for swe-touch-v1 (PROTOCOL.md, "Spend caps").

    uv run --project <SWE-Touch>/harbor python spend.py tally runs/pilot     # after a batch
    uv run --project <SWE-Touch>/harbor python spend.py check --runs 75 --usd-per-run 0.10 --phase pilot
    uv run --project <SWE-Touch>/harbor python spend.py status runs/pilot    # planned vs found trials

`tally` recomputes model spend from the saved Mini-SWE-Agent trajectories
(DeepSeek usage per response, E11c list prices) and writes
results/spend/<phase>.json and the running total in results/.spent.json.
`check` refuses (exit 1) when the planned batch could cross a cap. Run it
before every batch.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPENT = HERE / "results" / ".spent.json"
# USD per million tokens, the E11c constants for deepseek-v4-flash. Check the
# provider's price page before the pilot and record any change in PROTOCOL.md.
PRICE_MISS, PRICE_HIT, PRICE_OUT = 0.44, 0.014, 1.32
CAPS = {"pilot_model_usd": 10.0, "total_model_usd": 150.0, "total_sandbox_usd": None}  # sandbox cap: PROTOCOL.md


def usage_of(trajectory: Path) -> dict:
    data = json.loads(trajectory.read_text(encoding="utf-8"))
    totals = {"requests": 0, "prompt": 0, "hit": 0, "miss": 0, "output": 0, "served": {}}
    for message in data.get("messages", []):
        response = (message.get("extra") or {}).get("response") or {}
        usage = response.get("usage") or {}
        if not usage:
            continue
        prompt = usage.get("prompt_tokens") or 0
        hit = usage.get("prompt_cache_hit_tokens")
        if hit is None:
            hit = ((usage.get("prompt_tokens_details") or {}).get("cached_tokens")) or 0
        miss = usage.get("prompt_cache_miss_tokens", prompt - hit)
        totals["requests"] += 1
        totals["prompt"] += prompt
        totals["hit"] += hit
        totals["miss"] += miss
        totals["output"] += usage.get("completion_tokens") or 0
        served = response.get("model") or "unknown"
        totals["served"][served] = totals["served"].get(served, 0) + 1
    totals["usd_cached"] = (totals["hit"] * PRICE_HIT + totals["miss"] * PRICE_MISS + totals["output"] * PRICE_OUT) / 1e6
    totals["usd_list"] = (totals["prompt"] * PRICE_MISS + totals["output"] * PRICE_OUT) / 1e6
    return totals


def trials(runs: Path):
    for result_path in sorted((runs / "jobs").glob("*/*/result.json")):
        job = result_path.parent.parent.name
        arm = job.split("__")[-1].replace("_", "+")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        trajectories = list(result_path.parent.rglob("mini-swe-agent.trajectory.json"))
        started, finished = result.get("started_at"), result.get("finished_at")
        seconds = None
        if started and finished:
            seconds = (datetime.fromisoformat(finished) - datetime.fromisoformat(started)).total_seconds()
        yield {
            "arm": arm,
            "trial": result_path.parent.name,
            "task": (result.get("task_id") or {}).get("path", result.get("task_name", "")),
            "error": (result.get("exception_info") or {}).get("exception_type"),
            "rewards": (result.get("verifier_result") or {}).get("rewards"),
            "seconds": seconds,
            "usage": usage_of(trajectories[0]) if trajectories else None,
        }


def tally(args: argparse.Namespace) -> None:
    plan = json.loads((args.runs / "plan.json").read_text())
    rows = list(trials(args.runs))
    by_arm: dict[str, dict] = {}
    for row in rows:
        entry = by_arm.setdefault(row["arm"], {"trials": 0, "usd_cached": 0.0, "usd_list": 0.0, "hit": 0, "prompt": 0,
                                               "output": 0, "sandbox_hours": 0.0, "served": {}})
        entry["trials"] += 1
        entry["sandbox_hours"] += (row["seconds"] or 0) / 3600
        if row["usage"]:
            for key in ("usd_cached", "usd_list", "hit", "prompt", "output"):
                entry[key] += row["usage"][key]
            for name, count in row["usage"]["served"].items():
                entry["served"][name] = entry["served"].get(name, 0) + count
    phase = {"phase": plan["phase"], "arms": by_arm,
             "model_usd_cached": sum(e["usd_cached"] for e in by_arm.values()),
             "model_usd_list": sum(e["usd_list"] for e in by_arm.values()),
             "sandbox_hours": sum(e["sandbox_hours"] for e in by_arm.values())}
    out = HERE / "results" / "spend" / f"{plan['phase']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(phase, indent=2) + "\n")
    spent = json.loads(SPENT.read_text()) if SPENT.exists() else {"phases": {}}
    spent["phases"][plan["phase"]] = {"model_usd": phase["model_usd_cached"], "model_usd_list": phase["model_usd_list"],
                                      "sandbox_hours": phase["sandbox_hours"], "sandbox_usd": phase["sandbox_hours"] * args.sandbox_usd_per_hour}
    spent["model_usd"] = sum(p["model_usd"] for p in spent["phases"].values())
    spent["sandbox_usd"] = sum(p["sandbox_usd"] for p in spent["phases"].values())
    SPENT.write_text(json.dumps(spent, indent=2) + "\n")
    print(json.dumps(spent, indent=2))


def check(args: argparse.Namespace) -> None:
    spent = json.loads(SPENT.read_text()) if SPENT.exists() else {"phases": {}, "model_usd": 0.0, "sandbox_usd": 0.0}
    projected = args.runs * args.usd_per_run
    problems = []
    if spent["model_usd"] + projected > CAPS["total_model_usd"]:
        problems.append(f"model total {spent['model_usd']:.2f} + {projected:.2f} > {CAPS['total_model_usd']}")
    if args.phase == "pilot":
        pilot = spent["phases"].get("pilot", {}).get("model_usd", 0.0)
        if pilot + projected > CAPS["pilot_model_usd"]:
            problems.append(f"pilot {pilot:.2f} + {projected:.2f} > {CAPS['pilot_model_usd']}")
    if args.sandbox_cap is not None and spent["sandbox_usd"] + args.runs * args.sandbox_usd_per_run > args.sandbox_cap:
        problems.append("sandbox cap")
    if problems:
        print("REFUSED: " + "; ".join(problems))
        sys.exit(1)
    print(f"ok: spent ${spent['model_usd']:.2f} model, ${spent.get('sandbox_usd', 0):.2f} sandbox; next batch ≤ ${projected:.2f}")


def status(args: argparse.Namespace) -> None:
    plan = json.loads((args.runs / "plan.json").read_text())
    found: dict[str, int] = {}
    for row in trials(args.runs):
        found[row["arm"]] = found.get(row["arm"], 0) + 1
    report = {arm: {"planned": entry["trials"], "found": found.get(arm, 0)} for arm, entry in plan["arms"].items()}
    print(json.dumps(report, indent=2))
    if any(entry["planned"] != entry["found"] for entry in report.values()):
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    t = sub.add_parser("tally")
    t.add_argument("runs", type=Path)
    t.add_argument("--sandbox-usd-per-hour", type=float, default=0.0)
    c = sub.add_parser("check")
    c.add_argument("--runs", type=int, required=True)
    c.add_argument("--usd-per-run", type=float, required=True)
    c.add_argument("--phase", choices=["pilot", "main"], required=True)
    c.add_argument("--sandbox-cap", type=float)
    c.add_argument("--sandbox-usd-per-run", type=float, default=0.0)
    s = sub.add_parser("status")
    s.add_argument("runs", type=Path)
    args = parser.parse_args()
    {"tally": tally, "check": check, "status": status}[args.command](args)


if __name__ == "__main__":
    main()
