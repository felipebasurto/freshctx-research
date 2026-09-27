"""Write the Harbor job configs for the five swe-touch-v1 arms (PROTOCOL.md).

Run inside SWE-Touch's Harbor environment, with the FreshCtx patch applied
(harbor/swe-touch-freshctx.patch):

    uv run --project <SWE-Touch>/harbor python make_jobs.py select-pilot   # once, before any run
    uv run --project <SWE-Touch>/harbor python make_jobs.py jobs \
        --phase pilot --tasks <SWE-Touch>/tasks/swebench-verified \
        --freshctx-bridge <freshctx>/bridges/mini-swe-agent \
        --env-type modal --out runs/pilot

Item IDs come from the data file, never from a numeric range. `jobs` writes
`plan.json` with the exact trials planned, for `spend.py status`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = "data/v0.1.2/swe_bench_verified.jsonl"
EXPECTED_PATCH_RECORDS = 192
PILOT_SIZE = 15
PILOT_SEED = "swe-touch-v1-pilot"
MODEL = "deepseek/deepseek-v4-flash"
STEP_LIMIT = 100
ARMS = {
    # name: (SWE-Touch intervention, FRESHCTX_MODE, FRESHCTX_NOTICE)
    "V": (None, "off", "0"),
    "V+FC": (None, "rewrite", "0"),
    "S": ("patch_only", "shadow", "0"),
    "S+FC": ("patch_only", "rewrite", "0"),
    "S+N": ("patch_only", "shadow", "1"),
}


def patch_records(swe_touch: Path) -> list[dict]:
    path = swe_touch / DATA
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    kept = [row for row in rows if row["counter_edit"]["mode"] == "patch"
            and all(item.get("patch") for item in row["counter_edit"]["interventions"])]
    if len(kept) != EXPECTED_PATCH_RECORDS:
        raise SystemExit(f"expected {EXPECTED_PATCH_RECORDS} records with a code edit, found {len(kept)}")
    return sorted(kept, key=lambda row: row["instance_id"])


def select_pilot(args: argparse.Namespace) -> None:
    rows = patch_records(args.swe_touch)
    ids = [row["instance_id"] for row in rows]
    digest = hashlib.sha256((args.swe_touch / DATA).read_bytes()).hexdigest()
    pilot = sorted(random.Random(PILOT_SEED).sample(ids, PILOT_SIZE))
    out = HERE / "results" / "items.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "data": DATA, "data_sha256": digest, "records_with_code_edit": len(ids),
        "pilot_seed": PILOT_SEED, "pilot": pilot, "main": ids,
    }, indent=2) + "\n")
    print(f"{len(ids)} items, pilot {pilot}")


def write_jobs(args: argparse.Namespace) -> None:
    from harbor.models.job.config import DatasetConfig, JobConfig, RetryConfig
    from harbor.models.trial.config import AgentConfig, EnvironmentConfig
    from harbor.swe_touch.records import materialize_scenarios
    from harbor.swe_touch.tasks import resolve_task_names

    items = json.loads((HERE / "results" / "items.json").read_text())
    rows = {row["instance_id"]: row for row in patch_records(args.swe_touch)}
    ids = items[args.phase]
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    scenarios = out / "scenarios"
    materialize_scenarios([rows[item] for item in ids], scenarios)
    task_names = resolve_task_names(args.tasks, ids)
    model_config = out / "deepseek.yaml"
    model_config.write_text(
        "model:\n  model_kwargs:\n    temperature: 0\n    extra_body:\n      thinking:\n        type: disabled\n"
    )
    arms = args.arms.split(",") if args.arms else list(ARMS)
    reps = {arm: (args.reps_s if arm.startswith("S") else args.reps) for arm in arms}
    plan = {"phase": args.phase, "items": ids, "arms": {}, "model": MODEL}
    for arm in arms:
        mode, freshctx_mode, notice = ARMS[arm]
        kwargs = {
            "step_limit": STEP_LIMIT,
            "command_timeout_sec": 600,
            "model_request_timeout_sec": 10_000,
            "model_max_retries": 1000,
            "model_retry_initial_sleep_sec": 2,
            "model_retry_max_sleep_sec": 120,
            "config_specs": ["mini", str(model_config)],
            "extra_env": {
                "FRESHCTX_MODE": freshctx_mode,
                "FRESHCTX_NOTICE": notice,
                "FRESHCTX_BRIDGE_DIR": str(args.freshctx_bridge.resolve()),
                "FRESHCTX_REPO_ROOT": "/testbed",
            },
        }
        if mode:
            kwargs.update({"swe_touch_scenarios_path": str(scenarios), "swe_touch_intervention_mode": mode})
        config = JobConfig(
            job_name=f"swe-touch-v1__{args.phase}__{arm.replace('+', '_')}",
            jobs_dir=out / "jobs",
            n_attempts=reps[arm],
            n_concurrent_trials=args.concurrency,
            agent_timeout_multiplier=1.0,
            retry=RetryConfig(max_retries=2),
            environment=EnvironmentConfig(type=args.env_type) if args.env_type else EnvironmentConfig(),
            agents=[AgentConfig(name="mini-swe-agent-external", model_name=MODEL, max_timeout_sec=10_000, kwargs=kwargs)],
            datasets=[DatasetConfig(path=args.tasks.resolve(), task_names=task_names)],
        )
        path = out / f"{arm.replace('+', '_')}.json"
        path.write_text(config.model_dump_json(indent=2) + "\n")
        plan["arms"][arm] = {"config": str(path), "trials": len(ids) * reps[arm]}
    (out / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({arm: entry["trials"] for arm, entry in plan["arms"].items()}))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--swe-touch", type=Path, default=Path(__file__).resolve().parents[3] / "swe-touch")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("select-pilot")
    jobs = sub.add_parser("jobs")
    jobs.add_argument("--phase", choices=["pilot", "main"], required=True)
    jobs.add_argument("--tasks", type=Path, required=True)
    jobs.add_argument("--freshctx-bridge", type=Path, required=True)
    jobs.add_argument("--out", type=Path, required=True)
    jobs.add_argument("--env-type", default=None, help="Harbor environment type, e.g. modal")
    jobs.add_argument("--arms", default="")
    jobs.add_argument("--reps", type=int, default=1)
    jobs.add_argument("--reps-s", type=int, default=1, help="reps for S, S+FC and S+N")
    jobs.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()
    select_pilot(args) if args.command == "select-pilot" else write_jobs(args)


if __name__ == "__main__":
    main()
