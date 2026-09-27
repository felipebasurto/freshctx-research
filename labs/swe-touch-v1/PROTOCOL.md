# swe-touch-v1 protocol — FreshCtx on SWE-Touch's silent-edit condition (written before any model call)

Preregistration for TODO item 1 (`PLAN.md`). Nothing below has been run with a
model. Earlier labs are not modified. Where this file and `PLAN.md` differ, this
file governs.

## Question

SWE-Touch (arXiv 2608.02499, data v0.1.2) applies a validated user edit to
task-critical code when the agent reaches it. Applied silently (`patch_only`),
it lowers SWE-bench Verified resolve rate for every model tested. On real SWE
tasks, **does FreshCtx recover the silent-edit loss, and does it beat a notice
carrying the diff?**

E11c (`labs/jev-stale-view-v1`) found plain Pi 4/34, diff notice 34/34 and
FreshCtx 31/34 on resumed sessions, and concluded "a diff notice is enough here"
for one edit to one file. That predicts a tie between S+FC and S+N. A tie is a
result, not a failure. The two can come apart here because:

- the agent keeps working after the edit (the notice appears in one request;
  FreshCtx keeps the current code in every request);
- the agent must edit the changed code (stale `sed`/heredoc edits);
- SWE-Touch re-applies the same patch up to twice more when the agent edits the
  region again (`max_interventions` 3; rounds 2 and 3 trigger on `edit` only),
  so one task can see several edits.

## Software (fixed before the pilot)

| Component | Version |
| --- | --- |
| SWE-Touch | `github.com/Trae1ounG/SWE-Touch` `4bd121b` + `harbor/swe-touch-freshctx.patch` |
| Data | `data/v0.1.2/swe_bench_verified.jsonl`, sha256 in `results/items.json` |
| Agent | `mini-swe-agent==2.4.1` (SWE-Touch's `mini-swe-agent-external`, `mini` config), `litellm==1.102.1` |
| FreshCtx | `freshctx` branch `feat/shell-read-observation` (product + `bridges/mini-swe-agent`), commit recorded per run |
| Model | `deepseek/deepseek-v4-flash` through LiteLLM (see below) |

The patch changes no intervention logic. It adds:

1. `/exec` with `freshctx_internal: true`: runs the command in the sandbox and
   returns, without a command index, a recorded agent event, or trigger
   matching. Used only for FreshCtx's mirror reads. The offline harness shows
   SWE-Touch applies the same interventions at the same agent command indices
   in S, S+FC and S+N (`results/offline/offline_touch.json`).
2. A harness-only `swe_touch_interventions` field in `/exec` responses: scenario,
   round, whether the patch applied, and the patch diff (checked against the
   recorded sha256). The runner never shows it to the model.
3. The runner installs the FreshCtx bridge when `FRESHCTX_MODE` ≠ `off` or
   `FRESHCTX_NOTICE` = 1, passes `DEEPSEEK_API_KEY` and `FRESHCTX_*` through,
   and pins `litellm==1.102.1` for every arm (the runner otherwise resolves the
   latest LiteLLM at run time).

## Model

- Requested id `deepseek/deepseek-v4-flash` (LiteLLM sends `model:
  "deepseek-v4-flash"`). The API currently serves it as `deepseek-flash`; the
  served `model` field of every response is saved in the trajectory and
  reported per arm.
- Temperature 0. **Thinking off:** `model_kwargs.extra_body.thinking = {"type":
  "disabled"}` (the E11c request body). LiteLLM's DeepSeek transform drops a
  top-level `thinking: {"type": "disabled"}` in 1.86.2 (Harbor's lockfile) and
  forwards it in 1.102.1; `extra_body` reaches the wire in both. Checked on a
  loopback server with LiteLLM 1.102.1: the body carried `temperature: 0` and
  `thinking: {"type": "disabled"}`.
- Step limit 100, as in the paper. Other agent settings are SWE-Touch's
  `write_paired_job_configs` defaults (command timeout 600 s, Harbor retry 2 on
  infrastructure errors). No simulator model: `patch_only` shows no message.

## Arms (paired by task)

| Arm | SWE-Touch | FreshCtx | Notice |
| --- | --- | --- | --- |
| V | none | off | — |
| V+FC | none | `rewrite` | — |
| S | `patch_only` | `shadow` | — |
| S+FC | `patch_only` | `rewrite` | — |
| S+N | `patch_only` | `shadow` | after each applied intervention |

- `rewrite`: the Mini-SWE-Agent bridge observes allowlisted shell reads (`cat`,
  `cat -n`, `nl -ba`, `sed -n 'A,Bp'`, `nl -ba | sed -n 'A,Bp'`, `head -n`,
  `tail -n`, optionally after `cd DIR &&`) when their output equals the
  mirrored sandbox bytes exactly, replaces observed read outputs with markers in
  the outgoing copy, appends the projection, and commits before dispatch.
  Default budget, 131,072 projection bytes. A request that fails verification
  is not dispatched and the run ends (`FreshCtxBlocked`).
- `shadow`: same observation and planning, but the native request is sent. It
  gives coverage for S and S+N without changing what the model sees. Its only
  effect is extra sandbox reads.
- Notice: E11c's exact text, one per changed file:
  `[Note: <path> was changed outside this session after your earlier work. The change:`
  + fenced unified diff (`difflib.unified_diff`, 3 lines of context, headers
  `a/<path>` `b/<path>`) + `]`. The diff is rebuilt from the sandbox file after
  the patch by reversing the scenario hunks; if that fails, the scenario's own
  hunks are used and the log says so. It is appended as a user message to the
  **next request only**, in the outgoing copy; the saved trajectory never
  contains it. **Open decision for the owner:** a real harness (Claude Code)
  keeps its reminder in the conversation for later requests. This protocol
  follows the brief ("append it to the next request, once"; `--notice once`).
  The bridge also implements `--notice persist` (the note stays at its place in
  every later outgoing copy). Choosing `persist` is a protocol change recorded
  here before the pilot; the value used is written to each job config.

## Items

The 192 records of `swe_bench_verified.jsonl` with a code edit (the 8
message-only records are excluded), read from the data file (`make_jobs.py
select-pilot` → `results/items.json`). Pilot: 15 of them, drawn with seed
`swe-touch-v1-pilot` (listed in `results/items.json`). **Pilot runs are
excluded from the analysis;** as in E11c, the main run re-runs all 192,
including the pilot tasks.

## Runs

- Pilot: 15 tasks × 5 arms × 1 rep = 75 trials.
- Main: 192 × 5 × 1 = 960 trials; a second rep of S, S+FC and S+N (576 more) if
  the budget allows after rep 1. The primary tests use rep 1.
- Before each batch: `spend.py check`. After each batch: `spend.py tally` and
  `spend.py status`, which must show found trials = planned trials per arm
  before any analysis.

## Hypotheses and tests (rep 1, paired by task)

Outcome: resolved by the SWE-bench verifier. A trial with a Harbor
infrastructure error (after Harbor's retries) has no outcome; the pair is
dropped from that test and the count is reported per arm. Agent-side endings
(step limit, format errors, `FreshCtxBlocked`) count as unresolved for their
arm (intention to treat) and are reported separately.

- **H1 (primary): S+FC > S.** Exact one-sided McNemar (binomial on discordant
  pairs), α = 0.05.
- **H2: S+FC > S+N.** Exact one-sided McNemar, α = 0.05.
- **H3 (harm): V+FC not worse than V by more than 2 points.** One-sided 95%
  bound (Newcombe hybrid score interval for a paired difference, method 10).
  "No harm shown" if the lower bound of V+FC − V is above −2 points; "harm" if
  the exact one-sided McNemar V > V+FC gives p < 0.05; otherwise
  "inconclusive".
- Also reported: S+N > S and S > V (the paper's silent-edit loss), exact
  one-sided McNemar.

## Decision rule (fixed now, E11c wording)

- "FreshCtx recovers the silent-edit loss here" only if H1 gives p < 0.05.
- "Verified refresh beats a diff notice here" only if H2 gives p < 0.05.
- "A diff notice is enough here" if H2 gives p ≥ 0.05 **and** S+N resolves at
  least as many tasks as S+FC minus 4 (2 points of 192). A tie of this kind is
  the result E11c predicts for single-patch edits.
- Otherwise H2 is inconclusive.

Secondary (reported, not decisive): the same tests restricted to tasks where the
round-1 intervention applied in all three S arms, and on rep 2 if it runs.

Power: SWE-Touch's losses (1.0–9.5 points) give few discordant pairs on 192
tasks, so the resolve-rate tests may be inconclusive. The mechanism measures
below are reported regardless.

## Measures

From Harbor results, trajectories, `swe_touch_interventions.jsonl` and
`freshctx.jsonl`. `analyze.py` implements the tests, the decision rule, these
measures and the pilot gate; it was written and tested on synthetic trials
(`test_analyze.py`) before any model call. Re-inspection, kept user code and
stale-edit failures are heuristics over commands (documented in `analyze.py`);
the failure analysis reads trajectories by hand:

- Resolve rate per arm; infrastructure errors; agent exit statuses.
- **Coverage:** for each applied intervention in S, S+FC and S+N, whether the
  changed bytes lie inside the selected FreshCtx units of the next request
  (`full`, `partial`, `none`), and whether the path had any observed read before
  the edit. Also the share of allowlisted reads observed, and skip reasons.
- Whether the agent re-inspects the edited region after the edit (a later read
  or grep whose range overlaps the changed lines).
- Whether the final patch keeps the user's conflicting code (the added lines of
  the scenario patch present in the submitted diff's post-image or the final
  file).
- Failed edits on stale text: after the edit, agent commands that try to change
  the edited file and leave it unchanged, or return an error (`sed` no match,
  heredoc overwrite that drops the user's lines).
- Steps after the first intervention.
- Input, cached-input and output tokens; cost per run and per resolved task at
  E11c list prices ($0.44 / $0.014 / $1.32 per million miss / hit / output);
  cache-hit share per arm; served model names.
- `FreshCtxBlocked` count, unavailable markers, projection bytes.

## Spend caps

- Model: **$10 for the pilot**, **$150 in total**, at the billed rate (cache
  discount applied). `results/.spent.json` also keeps the list-price figure.
- Sandbox: a cap is stated here once the backend's price is known, before the
  pilot. Tracked as trial hours × the backend's rate.
- `spend.py check` runs before each batch and refuses one that could cross a
  cap.

## Pilot gate

15 tasks × 5 arms × 1 rep. Stop and report, without starting the main run, if
any of these hold:

- coverage below 50%: fewer than half of the applied round-1 interventions in
  S+FC have `full` coverage;
- the projected cost of the main run (pilot cost per trial per arm × planned
  trials) exceeds a cap;
- infrastructure errors in more than 10% of pilot trials;
- anything suggesting the bridge corrupts requests: any `FreshCtxBlocked`, a
  provider rejection of a rewritten request, or a defect found in a manual
  audit of the rewritten requests kept in `freshctx-audit.jsonl` (5 per FreshCtx
  arm: markers only on observed reads, projection frames equal to the sandbox
  file at that request, notice text exact).

Otherwise record the pilot outcome below, with any pilot-driven change, before
the main run. Cost-driven changes allowed in advance, applied to both FreshCtx
arms together (`make_jobs.py --refresh changed`, `--budget-bytes N`):

1. `refresh: "changed"` (cache-preserving freshness, product `c4c589a`): reads
   whose bytes are still current stay native; only units behind stale reads
   are projected. In an offline scripted session (`offline/cache_estimate.py`,
   `results/offline/cache_estimate.json`: 32 requests, ten 200-line files, one
   user edit, one agent edit), uncached request bytes were 7.17× native with
   `all` and 2.15× with `changed`. It is not the mode E11c ran.
2. Lowering the projection budget (for example to 32,768 bytes).

The default for the pilot is `all` with the product budget, as in E11c. The
projection is appended after the cached prefix, so it is re-sent uncached on
every request.

### Pilot outcome

Not run. Blocked at Step 0 (`STATUS.md`).

## Known limits

- One model, one rep for most arms, 192 tasks.
- FreshCtx tracks only what the agent read with an allowlisted command. SWE-Touch
  triggers when a read overlaps the critical region, but the patch's changed
  lines can fall outside the lines read; FreshCtx then projects nothing new,
  correctly, because the agent never saw those lines. The offline harness shows
  both cases.
- `grep -n` and other shell outputs that show code are not refreshed.
- The notice arm's diff is reconstructed from the patch; for a patch applied by
  SWE-Touch's fuzzy fallback, the reconstruction can fail and falls back to the
  scenario hunks (logged).
- Shadow mode adds sandbox reads to S and S+N; it does not change the requests.
