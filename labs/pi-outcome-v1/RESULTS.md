# Status on 2026-09-05

Direction chosen: one externally scored, controlled saved-session task through
the actual Pi Chat Completions HTTP path. The runner is implemented and locally
validated. **Real-model N=0. No with-vs-without model outcome headline yet.**

The intended live pilot is one pair on `deepseek-v4-flash`, with the model,
request limits, task and scoring frozen before measurement. Live API spend
approval of up to $1 was requested but had not arrived when this report was
written. No provider generation request was made by this lab.

## Local evidence

All files below are scripted validation runs, not LLM samples.

| Artifact | Result |
| --- | --- |
| fixture-1788610076187.json | Empty reservation from sandbox loopback EPERM, before HTTP measurement. Preserved as an incomplete attempt. |
| fixture-1788610096839.json | Development fixture: baseline correction did not trigger because the fixture compared a structured user message to a string. Baseline failed; treatment passed. Invalid for regression expectations. |
| fixture-1788610131960.json | Fixed fixture message extraction: both pass; baseline 4 requests, treatment 2. |
| fixture-1788610224317.json | Final regression: both pass; baseline first submission rejected, treatment first submission accepted; 4 vs 2 requests and 2 vs 1 read calls. Initial evidence and saved history checks pass. |

The fixture's policy deliberately uses available code before rereading on
checker rejection. Its behavior cannot predict a real model, which might reread
both files immediately and erase the difference. Both arms see the same warning
that files may have changed. A header-only seed does not expose the fee body.
The independently executed current answer is 74; stale price plus freshly read
fee gives 44. The checker never reveals either value in its feedback.

## Verification

- Product at `3e3c4489969fbe02b7313b666767651d1faf133c`: `npm run verify`
  passes, including 40 core tests, package allowlist, and 14 Pi tests with resume.
- Research full suite: 517/517 pass after copying installed local sidecar
  dependencies. Initial run before dependencies were available had 39 failures;
  do not treat that initial run as a release pass.
- `npm run evaluate`: PASS. Existing evaluation results are unrelated to this
  task and are not evidence for the proposed model headline.
- `node --test labs/pi-outcome-v1/checker.test.mjs`: PASS.
- Final scripted runner assertions: PASS.
- Corpus verification remains failed: copied cached `vocc-2026.pdf` bytes differ
  from `papers.lock.json`. Initial fetch was blocked by sandbox DNS. No corpus,
  lock, frozen report or product behavior was changed to make checks pass.
- The historical research suite rewrote one tracked nested-helper report while
  running; its original committed bytes were restored in this isolated clone.
  Pre-existing user changes in the original checkout were never edited.

## Pins and delivery

Task/scorer freeze commit: `985b061`.
Runner used for final regression: `f7cfc1e`.
Each JSON records full product/research SHAs, runner/task/checker SHA-256 values,
Node version, Pi version and post-resume request payloads.

The isolated research checkout started at `e4b9ae04b63cf3b0cce673e49956cdde7a3595f2`.
A remote refresh found later research main at
`deb93a5866a12149f9fca071b2a2de58295240ce`. This work is delivered on the separate
private branch `codex/pi-outcome-v1`, retaining the original freeze commits and
avoiding changes to newer main work. Product main was verified against its
remote and required no code changes. Frozen bench was not modified.

## Honest prospective headline and blockers

Today: "FreshCtx now has a reproducible, externally scored Pi resume experiment
ready for a real-model pair." This is infrastructure progress, not an agent
performance claim.

After the approved live run, report the actual first-submission and eventual
pass counts plus requests and reads to pass, even if the arms tie or FreshCtx
loses. Inspect response model IDs, errors, usage, and freshness before drawing
conclusions. Broad claims remain blocked by N=1, a synthetic seeded history,
fixed arm order, mutable provider alias, and the absence of cross-file rename,
coding-edit, and repeated-task coverage. No cost-saving claim is supported.
