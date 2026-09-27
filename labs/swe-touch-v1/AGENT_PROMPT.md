You are running a research experiment for FreshCtx, a context engine for coding agents. Work autonomously, but stop at the gates below and report.

## Background

FreshCtx builds on CORVUS (arXiv 2607.22711). A sidecar records the exact bytes an agent read. Before each model request it rewrites an outgoing copy of the conversation: old reads become short markers, and the current version of that code is appended at the end. The saved history is unchanged. It currently has a tested Pi bridge (Node) and a Python client (`bridges/openhands/freshctx_openhands.py`). Lab result so far (E11/E11b): on resumed sessions where the file changed, FreshCtx took first-answer accuracy from 2/29 to 17/29, and to 12/12 on the subset that a whole-file bug had broken. That's one model, single-file workspaces, and our own setup. We now want an external benchmark.

**SWE-Touch** (arXiv 2608.02499, github.com/Trae1ounG/SWE-Touch, MIT, data v0.1.2) applies a validated user edit to task-critical code when the agent reaches it. Applied silently (`swe_touch_intervention_mode=patch_only`), it lowers SWE-bench Verified resolve rate for every model tested (−1.0 to −9.5 points). Announcing the edit in a message does not reliably help.

**Question:** does FreshCtx recover the silent-edit loss, and does it beat a Claude-Code-style "file was modified + diff" notice?

## Repositories

- Product: `github.com/felipebasurto/freshctx`, branch `fix/whole-file-ambiguous` (includes commit `6e8fac8`, "pin short region anchors to the file edge"). Create your work branch `feat/shell-read-observation` from it. Read `AGENTS.md` and `CHANGELOG.md`. Run `npm run check && npm test && npm run pack:check` before every product commit.
- Research: `github.com/felipebasurto/freshctx-research`, branch `lab/swe-touch-v1`. Read `labs/swe-touch-v1/PLAN.md` first: it is the plan, and this prompt follows it. For lab conventions, read `labs/jev-stale-view-v1/README.md` and one protocol file, e.g. `PROTOCOL-E11.md`.
- SWE-Touch: clone it and follow its README (uv, Harbor, `harbor swe-touch prepare-paired / run-paired / aggregate`). Records: `data/v0.1.2/swe_bench_verified.jsonl`, using the 192 records that have a code edit.

## Secrets

`DEEPSEEK_API_KEY` is set in the environment. Never print it, log it, write it to a file or commit it. Model: LiteLLM `deepseek/deepseek-v4-flash`, temperature 0, thinking off (verify how LiteLLM disables thinking for this model and record it). Step limit 100, as in the paper.

## Step 0: environment check (gate)

Report `uname -m`, free disk, CPU and RAM, and whether a Docker daemon runs (`docker info`). You need x86_64 and roughly 150 GB free for SWE-bench images. If Docker isn't available or disk is short, **stop and report** which Harbor remote backend (Modal, Daytona, E2B, …) would work and which credential it needs. Don't create accounts. If the environment is fine, run 3 vanilla tasks end to end with the released harness, and report wall time and cost per task.

## Step 1: Mini-SWE-Agent FreshCtx bridge (product work, offline tests)

Mini-SWE-Agent is bash-only, so FreshCtx must observe shell reads (TODO item 2). The agent loop runs on the host (`harbor/src/harbor/agents/external/runners/mini_swe_agent_runner.py`). Commands run in the sandbox through the bridge's `/exec`. Integrate there without changing SWE-Touch's intervention logic:

1. **Mirror:** keep a host copy of only the observed files and refresh it from the sandbox via `/exec` (base64) before every observe and every model request. The FreshCtx workspace root is the mirror.
2. **Observe shell reads (allowlist):** `cat F`, `cat -n F`, `sed -n 'A,Bp' F`, `nl -ba F | sed -n 'A,Bp'`, `head -n N F`, `tail -n N F`. Only single commands with no side effects. Strip a known line-number prefix and observe the raw bytes of that line range with its byte range, **only if** they equal the mirror exactly. If the output was truncated or anything differs, skip it; never guess. To verify a native message, normalise its view back to raw bytes and compare hashes. Numbered views are the common case, so design for them.
3. **Rewrite the outgoing copy:** wrap the model call. Prepare, then replace each observed read's output inside its observation message with the FreshCtx marker. Append the projection, commit, dispatch. It must fail closed, as the Pi bridge does (`bridges/pi/src/bridge.mjs`): if a native result changed or a successful read has no observation, don't dispatch the rewrite. The saved trajectory stays unchanged.
4. **Coverage log:** at each intervention, record whether the edited region was inside an observed, selected unit.
5. **Notice arm helper:** after an intervention, inject a deterministic message: "`<path>` was modified outside your session." plus the unified diff of the edit. It's appended as the last message of the next request, in the outgoing copy only.

Test offline with a local Mini-SWE-Agent environment on a small checked-out repo (no Docker): scripted reads, external edits, and checks on markers, projection bytes and commit byte for byte. Add tests to the product repo and commit on `feat/shell-read-observation`, with a CHANGELOG entry.

## Step 2: protocol (before any SWE-Touch model call with FreshCtx)

Write `labs/swe-touch-v1/PROTOCOL.md` on `lab/swe-touch-v1` and commit it before the pilot. Contents:

- **Arms, paired by task:** V (no edit), V+FC, S (`patch_only`), S+FC, S+N (notice + diff).
- **Hypotheses:**
  - H1: S+FC > S, exact one-sided McNemar.
  - H2: S+FC > S+N.
  - H3 (harm): V+FC not worse than V by more than 2 points.
- **Decision rule**, fixed in advance.
- **Measures:** resolve rate; coverage; whether the agent re-inspects the region after the edit; whether the final patch keeps the user's conflicting code; failed edits on stale text; steps; input, cached-input and output tokens; cost per resolved task; cache-hit share.
- **Spend caps:** $10 for the pilot and $150 in total for model spend, tracked in a spent file and enforced before each run.
- Pilot tasks are excluded from the analysis.

## Step 3: pilot (gate)

Run 15 Verified tasks × 5 arms × 1 rep. **Stop and report** if any of these hold:
- coverage is below 50%;
- the projected full-run model cost exceeds $150;
- an infrastructure error rate is above 10%;
- anything suggests the bridge corrupts requests.

Otherwise record the pilot in PROTOCOL.md, noting any pilot-driven change **before** the main run, and continue.

## Step 4: main run and analysis

Run all 192 records × 5 arms × 1 rep, and a second rep for S and S+FC if the budget allows. Then:
- Write `labs/swe-touch-v1/analyze.py` and a results section in a `README.md` for the lab.
- Include a per-arm table, the preregistered tests, and the mechanism measures.
- Include a failure analysis of 10 S+FC failures and 10 S+FC-only successes, read from the trajectories.

Report numbers exactly as measured, including null or negative results and any arm that errored. Keep dataset-derived results in `results/`. Never modify earlier labs.

## Deliverables and rules

- Commits end with `Co-Authored-By: Claude <noreply@anthropic.com>`. Push only the two work branches (`feat/shell-read-observation`, `lab/swe-touch-v1`). Never push to `main`, never force-push, never `npm publish`.
- Final report: environment used, commits, spend (model and sandbox), the results table, whether the decision rule was met, coverage, and the biggest threat to validity.
- If blocked, write what you tried and what you need into `labs/swe-touch-v1/STATUS.md`, commit it, and stop.
