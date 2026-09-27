# swe-touch-v1 — FreshCtx on SWE-Touch (plan, 2026-09-27; nothing run yet)

TODO item 1. FreshCtx builds on CORVUS (arXiv 2607.22711); CORVUS measured
token and cost savings on static SWE tasks. This measures the case neither
CORVUS nor Part 1 measured: code changed by someone else mid-task.

## Question

SWE-Touch (arXiv 2608.02499, MIT, github.com/Trae1ounG/SWE-Touch, data v0.1.2)
applies a validated user edit to task-critical code when the agent reaches it.
Applied **silently** (`patch_only`), it lowers SWE-bench Verified resolve rate
for every model tested (−1.0 to −9.5 points, 4 models, Table 5). Announcing the
edit in a message does not reliably help.

**Does FreshCtx recover the silent-edit loss, and does it beat a Claude-Code-style
change notice?**

## What SWE-Touch gives us (checked in the repo)

- 200 SWE-bench Verified records (192 with a code edit, 8 message-only), plus
  25 SWE-Bench Pro and 25 DeepSWE.
- Harbor fork; agent `mini-swe-agent-external`. The agent loop runs **on the
  host** in a subprocess (`runners/mini_swe_agent_runner.py`); commands run in
  the task sandbox through an HTTP bridge (`/exec`). Model calls go through
  LiteLLM on the host.
- `swe_touch_intervention_mode` ∈ `patch_message` (paper default),
  `patch_only` (silent), `text_only`.
- Trigger for Verified: `read_or_edit` — the edit is applied right after the
  agent's command that touched the region, so the agent's last view of it is
  stale by construction. That is FreshCtx's exact case, **if the read was
  observed**.
- Mini-SWE-Agent is bash-only: files are read with `cat`, `sed -n`, `nl -ba … |
  sed -n`, `head`, `grep -n`. FreshCtx today observes only a structured `read`
  tool. → **TODO item 2 (shell-read observation) is a prerequisite.**

## Blocker: infrastructure (decision needed)

This machine cannot run it: **3.5 GB free disk**, no Docker daemon (CLI only),
and arm64 while SWE-bench images are x86_64. Harbor supports remote sandboxes
(Modal, Daytona, E2B, Runloop, GKE, …) with the agent loop on the host, which
fits the integration below. Options:
- A. A Harbor cloud sandbox provider (account + credit).
- B. A rented x86 Linux VM with Docker and ~200 GB disk, running everything there.
- C. Free local disk and use Docker Desktop with x86 emulation (slow; some test
  suites misbehave under emulation). Not recommended.

## Integration design (FreshCtx bridge for Mini-SWE-Agent)

All in the host-side runner; no change to SWE-Touch's intervention logic.

1. **Mirror.** FreshCtx needs a local workspace. Keep a host mirror of only the
   observed files; before each observe and each model request, refresh them
   from the sandbox through the bridge's `/exec` (`base64` of the file). The
   engine then sees the sandbox's current bytes.
2. **Observe shell reads** (item 2, minimal allowlist): `cat F`, `sed -n 'A,Bp' F`,
   `head -n N F`, `tail -n N F`, `nl -ba F | sed -n 'A,Bp'`, `cat -n F`. Rules:
   - single command, no redirection or side effects;
   - observe only if the output, after undoing a known line-number prefix,
     equals the mirrored bytes of that line range exactly; otherwise skip
     (never guess);
   - output truncated by Mini-SWE-Agent → skip.
   Line-numbered views (`nl`, `cat -n`) are the common case in Mini-SWE-Agent;
   the engine stores raw bytes, and the bridge verifies the native message by
   its own hash. Design detail to settle in the engine work.
3. **Rewrite the outgoing copy.** Wrap the model's `query(messages)`: prepare,
   replace each observed read's output inside its observation message with the
   FreshCtx marker, append the projection at the end, commit, dispatch. Saved
   trajectory unchanged. Same fail-closed rules as the Pi bridge.
4. **Coverage log.** At each intervention: was the edited region inside an
   observed, selected unit? If coverage is low, FreshCtx cannot help, and that
   is itself a result.

Offline tests first: a local Mini-SWE-Agent environment on a small checked-out
repo (no Docker), with scripted edits, checking observe/refresh/marker/commit
byte for byte.

## Arms (paired by task)

| Arm | Edit | Context |
| --- | --- | --- |
| V | none | Mini-SWE-Agent as released |
| V+FC | none | + FreshCtx (checks it does no harm; Part 1 had 3/5 vs 5/5) |
| S | silent (`patch_only`) | as released |
| S+FC | silent | + FreshCtx |
| S+N | silent | + deterministic notice after the edit: "`<file>` was modified outside your session" + unified diff (Claude Code style, TODO item 4) |

## Measures

- Primary: resolve rate (SWE-bench verifier), paired.
- Mechanism: coverage (above); whether the agent re-inspects the region after
  the edit; whether the final patch keeps the user's conflicting code (paper:
  63.3% of failures do); failed `str_replace`/`sed` edits on stale text; steps.
- Cost: input, cached-input and output tokens per run (the aggregator records
  them), cost per resolved task, prompt-cache hit share per arm.

## Preregistration (written into PROTOCOL.md before any model call)

- H1 (primary): S+FC > S, exact McNemar, one-sided.
- H2: S+FC > S+N.
- H3 (harm): V+FC not worse than V by more than 2 points.
- Decision fixed in advance. Pilot tasks excluded from the analysis.

Power caveat: a 1–10 point loss on 192 tasks gives few discordant pairs, so
the resolve-rate test may be inconclusive. The mechanism measures are more
sensitive and are reported regardless.

## Steps

1. Infra decision (above). Set up Harbor with the chosen backend; run 3 V
   tasks to confirm the pipeline and measure time and cost.
2. Engine/bridge work: shell-read observation + Mini-SWE-Agent bridge, with
   offline tests. Commits in the product repo on their own branch.
3. PROTOCOL.md.
4. Pilot: 15 Verified tasks × 5 arms, 1 rep. Checks coverage, cost and time,
   and failure modes. Stop for a decision if coverage < ~50% or cost projects
   over the cap.
5. Main run: 192 Verified patch records × 5 arms, 1 rep (a second rep for S
   and S+FC if the budget allows).
6. Analysis, README section, blog §28.

## Model and budget

- `deepseek-v4-flash`, temperature 0, same as the lab (the paper used DeepSeek
  V4 Pro: 74.8% vanilla). Step limit 100 as in the paper.
- Rough model cost from Mini-SWE-Agent context growth: ~$0.05–0.15 per run with
  caching, so ~960 runs ≈ $50–150. Sandbox cost depends on the backend. The
  pilot replaces these guesses with measurements. Cap to be set in PROTOCOL.md.

## Risks

- **Seeing the edit may not help.** A counter-edit conflicts with the task; one
  failure mode in the paper is deferring to the user's code. FreshCtx makes the
  edit visible; it does not make the agent reconcile it.
- Low observation coverage (grep-heavy exploration, truncated outputs).
- Line-numbered reads need engine support before anything runs.
- DeepSeek nondeterminism at temperature 0; 1 rep.
