# swe-touch-v1 — status (2026-09-27): Steps 1–2 done, blocked at Step 0 for Steps 3–4

No model calls and no sandbox runs: **$0 model, $0 sandbox.**

## Step 0: environment (owner's Mac, 2026-09-27)

| Check | Result | Needed |
| --- | --- | --- |
| `uname -m` | arm64 (Apple M4, 10 cores, 16 GB RAM) | x86_64 ✗ |
| Free disk | 54 GB of 460 GB | ~150 GB for local images ✗ |
| Docker | CLI 29.3.0; **no daemon** (`/var/run/docker.sock` missing) | running daemon ✗ |
| Remote sandbox credentials | none set (`MODAL_TOKEN_ID`/`SECRET`, `DAYTONA_API_KEY`, `E2B_API_KEY`, `RUNLOOP_API_KEY`; no `~/.modal.toml`) | one backend ✗ |
| `DEEPSEEK_API_KEY` | **not set** | set ✗ |

The earlier cloud-agent check (x86_64, 30 GB, no daemon, sandbox policy refused
`dockerd`, no key) is in this file's history (`0062f93`).

Per the brief, no x86 emulation and no accounts. Steps 3 (pilot) and 4 (main
run) have not started.

### What would unblock it

1. **`DEEPSEEK_API_KEY`** in the environment (never in chat or a file).
2. **A sandbox backend**, one of:
   - Modal (recommended): `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` in the
     environment, then `--env-type modal` in `make_jobs.py`. The agent loop,
     FreshCtx sidecar and mirror stay on the host; only commands go to Modal.
   - Daytona (`DAYTONA_API_KEY`), E2B (`E2B_API_KEY`), Runloop
     (`RUNLOOP_API_KEY`), Novita (`NOVITA_API_KEY`).
   - Or an x86_64 Linux machine with a running Docker daemon and ≥200 GB disk.
3. The sandbox price, to set the sandbox cap in `PROTOCOL.md` before the pilot.
4. A decision on the notice arm (`PROTOCOL.md`, "Open decision"): as briefed,
   the notice appears in the next request only; a harness like Claude Code
   keeps it in later requests.

Then: 3 vanilla tasks end to end for wall time and cost per task (Step 0 of
the brief), then the pilot.

## Step 1: product (done, pushed)

`freshctx` branch `feat/shell-read-observation` (base `fix/whole-file-ambiguous`
`5dc05d1`):

- `35888fc` **fix: a later partial read no longer narrows a wider unit**
  (TODO 6b). Cause: `buildProjection` kept the most recent unit and dropped any
  older unit it overlapped. Units inside another candidate now rank after it,
  and a unit is omitted as `overlap` only when admitted units cover all its
  bytes. Replaying E11c's exact read sequences offline through the Pi bridge:
  e11-24 (read without `limit`, then `offset: 200`) and e11-10 (five
  overlapping ranged reads) both carried the edited function after the fix and
  not before, with the same unit IDs and markers as the live records. Note: in
  Pi a read without `limit` returns 200 lines, so e11-24's "whole-file" read of
  a 204-line file was a region, and the fix that matters there is keeping
  partially overlapping units. e11-10's `ambiguous` marker on the 320–379 read
  is a separate cause (its 128-byte prefix anchor occurs twice after the edit);
  the covering 200–399 region now carries the edit, so the item no longer
  depends on it. Not fixed.
- `c11172c` **Mini-SWE-Agent bridge** (`bridges/mini-swe-agent`, TODO 2):
  mirror, allowlisted shell-read observation with exact output match, outgoing
  rewrite with fail-closed checks, coverage log, notice arm. 14 offline tests,
  including Mini-SWE-Agent 2.4.1's `DefaultAgent` with a scripted model on a
  local git repository (markers, projection, commit, coverage and notice
  checked byte for byte).
- `63f7eb2`, `e6dacbb`: audit dump of rewritten requests for the pilot's
  corruption check.

`npm run check && npm test && npm run pack:check` passed before each commit,
plus the Pi and OpenHands bridge checks.

## Step 1b: SWE-Touch side (done, offline)

`harbor/swe-touch-freshctx.patch` against SWE-Touch `4bd121b` (internal exec,
intervention events for the runner, bridge installation, `DEEPSEEK_API_KEY`
passthrough, LiteLLM pin). SWE-Touch's unit tests: same 24 failures before and
after the patch (all pre-existing, CLI template tests), 3,382 passed.

`offline/offline_touch.py` runs SWE-Touch's real bridge server,
`CounterEditController` (`patch_only`) and patched runner process against a
local repository, all five arms, scripted model
(`results/offline/offline_touch.json`, all checks pass):

- SWE-Touch applies the same interventions at the same agent command indices in
  S, S+FC and S+N (after commands 1 and 4; round 2 re-applies the patch after
  the agent's stale rewrite dropped it). FreshCtx's mirror reads don't count as
  agent commands.
- S+FC projects the user's edit and keeps the saved trajectory unchanged; S+N
  carries the exact E11c notice in requests 2 and 5 only.
- With the first read limited to lines 1–12, SWE-Touch still fires (the read
  overlaps the critical region), but the inserted lines fall outside what was
  read, so coverage is `none`: correct, but it will cap coverage on real tasks.

## Step 2: protocol (done)

`PROTOCOL.md`: arms, hypotheses, decision rule, measures, caps, pilot gate.
`results/items.json`: the 192 records with a code edit, read from the data file
(sha256 recorded), and the 15 pilot tasks (seed `swe-touch-v1-pilot`). All 192
resolve to Harbor `swebench-verified@1.0` tasks (`make_jobs.py jobs` dry run).

Findings recorded there:
- Each record has **three** interventions with the same patch (round 1 on
  `read_or_edit`, rounds 2–3 on `edit`), not one.
- LiteLLM 1.86.2 (Harbor's lock) drops `thinking: {"type": "disabled"}` for
  DeepSeek; the runner resolves LiteLLM freshly (1.102.1 today), so the patch
  pins it, and the protocol sends thinking-off in `extra_body`, which reaches
  the wire in both versions (loopback check).
- Cost risk: the projection (up to 131,072 bytes) is appended after the cached
  prefix and re-sent uncached on every request, so FreshCtx arms may cost
  several times the others. The pilot measures it; lowering the budget for both
  FreshCtx arms is a pre-allowed change.

## Runbook once unblocked

Everything is scripted in `run.sh` (checks keys by presence only, checks the
patch is applied unchanged, downloads tasks, generates jobs, runs
`spend.py check` before and `tally`/`status` after, then `analyze.py`):

```sh
cd <SWE-Touch> && git checkout 4bd121b && git apply <lab>/harbor/swe-touch-freshctx.patch
export SWE_TOUCH=<SWE-Touch> FRESHCTX=<freshctx checkout of feat/shell-read-observation>
export ENV_TYPE=modal SANDBOX_USD_PER_HOUR=<rate> NOTICE=once
USD_PER_RUN=0.10 ./run.sh smoke     # Step 0: 3 vanilla tasks, wall time and cost per task
USD_PER_RUN=<from smoke> ./run.sh pilot   # stops with exit 1 if the pilot gate trips
# record the pilot outcome in PROTOCOL.md, then:
USD_PER_RUN=<from pilot> ./run.sh main [--reps-s 2]
```

Offline checks that must still pass first: `python3 test_analyze.py`,
`offline/offline_touch.py` (see its docstring), and the bridge tests.
