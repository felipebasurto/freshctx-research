#!/usr/bin/env bash
# swe-touch-v1 runner (PROTOCOL.md). Stops at every gate.
#
#   SWE_TOUCH=<SWE-Touch checkout> FRESHCTX=<freshctx checkout> ENV_TYPE=modal \
#   USD_PER_RUN=<estimate> SANDBOX_USD_PER_HOUR=<rate> NOTICE=once ./run.sh smoke|pilot|main [--reps-s 2]
#
# smoke: 3 V tasks end to end (Step 0: wall time and cost per task).
# pilot: 15 tasks x 5 arms, then the pilot gate (analyze.py --gate).
# main:  192 tasks x 5 arms (+ --reps-s 2 for S, S+FC, S+N), then analyze.py.
set -euo pipefail
phase="${1:?smoke|pilot|main}"; shift || true
lab="$(cd "$(dirname "$0")" && pwd)"
: "${SWE_TOUCH:?set SWE_TOUCH}" "${FRESHCTX:?set FRESHCTX}"
ENV_TYPE="${ENV_TYPE:-}"; NOTICE="${NOTICE:-once}"
USD_PER_RUN="${USD_PER_RUN:?set USD_PER_RUN (pilot: a guess; main: from results/spend/pilot.json)}"
SANDBOX_USD_PER_HOUR="${SANDBOX_USD_PER_HOUR:-0}"
export UV_NO_DEV=1
harbor() { uv run --project "$SWE_TOUCH/harbor" "$@"; }

# Secrets: presence only, never printed.
[ -n "${DEEPSEEK_API_KEY:-}" ] || { echo "missing DEEPSEEK_API_KEY"; exit 2; }
case "$ENV_TYPE" in
  modal) [ -n "${MODAL_TOKEN_ID:-}" ] && [ -n "${MODAL_TOKEN_SECRET:-}" ] || [ -f "$HOME/.modal.toml" ] || { echo "missing Modal credentials"; exit 2; } ;;
  daytona) [ -n "${DAYTONA_API_KEY:-}" ] || { echo "missing DAYTONA_API_KEY"; exit 2; } ;;
  e2b) [ -n "${E2B_API_KEY:-}" ] || { echo "missing E2B_API_KEY"; exit 2; } ;;
  runloop) [ -n "${RUNLOOP_API_KEY:-}" ] || { echo "missing RUNLOOP_API_KEY"; exit 2; } ;;
  "") docker info >/dev/null 2>&1 && [ "$(uname -m)" = x86_64 ] || { echo "local Docker needs x86_64 and a daemon"; exit 2; } ;;
esac

# The FreshCtx patch must be applied, unchanged.
(cd "$SWE_TOUCH" && git diff 4bd121b -- harbor | cmp -s - "$lab/harbor/swe-touch-freshctx.patch") \
  || { echo "SWE-Touch tree differs from harbor/swe-touch-freshctx.patch on 4bd121b"; exit 2; }
[ -d "$SWE_TOUCH/tasks/swebench-verified" ] || harbor harbor download swebench-verified@1.0 --output-dir "$SWE_TOUCH/tasks" --export
echo "freshctx $(git -C "$FRESHCTX" rev-parse HEAD)  research $(git -C "$lab" rev-parse HEAD)" | tee -a "$lab/results/run-log.txt"

out="$lab/runs/$phase"
jobs_args=(--tasks "$SWE_TOUCH/tasks/swebench-verified" --freshctx-bridge "$FRESHCTX/bridges/mini-swe-agent" --out "$out" --notice "$NOTICE")
[ -n "$ENV_TYPE" ] && jobs_args+=(--env-type "$ENV_TYPE")
case "$phase" in
  smoke) harbor python "$lab/make_jobs.py" jobs --phase pilot --arms V "${jobs_args[@]}" "$@"
         python3 - "$out" <<'EOF'
import json, sys, pathlib
out = pathlib.Path(sys.argv[1]); plan = json.loads((out / "plan.json").read_text())
config = json.loads((out / "V.json").read_text())
config["datasets"][0]["task_names"] = config["datasets"][0]["task_names"][:3]
config["job_name"] = "swe-touch-v1__smoke__V"
(out / "V.json").write_text(json.dumps(config, indent=2))
plan.update(phase="smoke", items=plan["items"][:3]); plan["arms"]["V"]["trials"] = 3
(out / "plan.json").write_text(json.dumps(plan, indent=2))
EOF
         arms=(V); planned=3 ;;
  pilot) harbor python "$lab/make_jobs.py" jobs --phase pilot "${jobs_args[@]}" "$@"; arms=(V V_FC S S_FC S_N); planned=75 ;;
  main)  harbor python "$lab/make_jobs.py" jobs --phase main "${jobs_args[@]}" "$@"; arms=(V V_FC S S_FC S_N)
         planned=$(python3 -c "import json;print(sum(a['trials'] for a in json.load(open('$out/plan.json'))['arms'].values()))") ;;
  *) echo "unknown phase $phase"; exit 2 ;;
esac

spend_phase=$([ "$phase" = main ] && echo main || echo pilot)
python3 "$lab/spend.py" check --runs "$planned" --usd-per-run "$USD_PER_RUN" --phase "$spend_phase"
for arm in "${arms[@]}"; do
  start=$(date +%s)
  harbor harbor run --config "$out/$arm.json"
  echo "$phase $arm $(( $(date +%s) - start ))s" | tee -a "$lab/results/run-log.txt"
  harbor python "$lab/spend.py" tally "$out" --sandbox-usd-per-hour "$SANDBOX_USD_PER_HOUR"
done
python3 "$lab/spend.py" status "$out"
case "$phase" in
  smoke) python3 "$lab/analyze.py" "$out" ;;
  pilot) python3 "$lab/analyze.py" "$out" --gate || { echo "PILOT GATE: stop and report (results/analysis/pilot.json)"; exit 1; } ;;
  main)  python3 "$lab/analyze.py" "$out" ;;
esac
