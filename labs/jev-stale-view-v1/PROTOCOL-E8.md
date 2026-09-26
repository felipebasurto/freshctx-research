# E8 protocol — real stale conclusions when the read is gone (written before any E8 model call)

## Question

E5/E6 (synthetic) showed harm from a stale conclusion; E7 (real conclusions,
complete current code in the request) hit a ceiling: 152/152. Working
hypothesis: *a stale conclusion hurts when it substitutes a read, not when it
competes with visible code.*

E8 tests that hypothesis with the same 19 real conclusions, in a setup where
**no code of the file (neither old nor current) is in the context** when the
question is asked. The model must choose between reading the file and trusting
what the history already "says".

1. Harm: with the read gone, does a real stale conclusion lower first-answer
   accuracy? (D > B)
2. Recovery: does withdrawing (E) or annotating (C) the conclusion, chosen by
   Jev, recover it? (E > B, C > B, E > C)

## Design and why

Same items as E7 (`results/e7_items.json`, unchanged, sha256 recorded per run).
Same seed: a scripted provider forces one real Pi read of the whole file
(`before`) and then replies with the claim (B, C, E) or `Ready.` (D). The
session closes, the file becomes `after`, the session reopens.

Change: **the seeded read's tool result is cleared in the outgoing copy.** The
loopback proxy replaces the content of the tool message answering the seed
call (`tool_call_id = seed_0`) with the fixed placeholder
`[tool result cleared to save context]`, in every arm and in every
post-resume request, before Jev and before the request is sent. The tool
call/tool result pair is kept (pairing preserved); the saved session is not
touched (rewrite the copy, not the record). Reads the model makes after the
question are not touched.

The FreshCtx bridge is **not loaded** (Pi's native `read`), so nothing
re-injects the file: with the bridge, FreshCtx would append a projection of
the current code and we would be back in E7.

Why this variant and not the alternatives:

- *No FreshCtx, stale read left in history* (E5 arm A): the old code itself
  answers the question wrongly, so D would fail too; it measures the harm of a
  stale read (known from E5), not of a conclusion.
- *No read at all in the seed*: equivalent in content, but the real claims say
  "I found…", "On line 120…", i.e. they refer to a read. Clearing keeps the
  real shape of the trajectory.
- Clearing old tool results is what real context managers do (observation
  masking, tool-result clearing, byte budgets). It is also the case E7
  identified as the one where retracting conclusions would matter: code that
  left the context while the conclusion stayed.

Known asymmetry, accepted and reported: the claim itself often quotes old code
(e.g. e7-08). That is the conclusion, not a read; E removes it with the
message, as E6 did.

## Arms

All arms: Pi native read, seed read cleared as above.

- `B_claim`: claim present, intact.
- `C_jev_mark`: B + Jev fan-out (frozen E2 Noul, `jev-1.13.0`,
  `state = {file: path, edit_diff: real diff}`); p ≥ 0.5 appends the E5 marker
  `[FreshCtx note: <file> changed after this message was written; claims about it may be outdated.]`.
- `D_noclaim`: seed reply `Ready.`.
- `E_jev_withdraw`: B + Jev; p ≥ 0.5 replaces the message with the E6 pointer
  `[FreshCtx: an earlier note about <file> was withdrawn because the file changed after it was written.]`.

The marker/pointer text is the E5/E6 text, verbatim (it says "FreshCtx"
although the bridge is not loaded; kept identical to stay comparable).

Threshold 0.5, unchanged. A Jev failure rejects the request (fail closed, as
E6/E7) and is reported as an error.

## Fixed parameters

Prompt, retry prompt and checker identical to E7:

- Prompt: `Answer this question about the current code in <file>: <question> You may read any required code. Return only a JSON object with the boolean field answer.`
- Retry: `The external checker rejected your answer. Inspect the current workspace as needed and return only a JSON object with the boolean field answer.`
- Checker: JSON (fences allowed) whose `answer` is a boolean equal to `gold`.

Model `deepseek-v4-flash` via loopback proxy, temperature 0, thinking
disabled, 512 output tokens, ≤ 8 post-resume requests, ≤ 64,000 bytes per
request, 2 submissions. Pi 0.85 from the `c15f5ad` export (bridge unused).
2 repetitions per item; arm order rotated by item index + repetition.
19 × 2 × 4 = 152 runs.

Spend cap: $2 for E8, counted in `results/e8/.spent.json` at peak price, as
`e7_run.mjs`.

## Dry run (before any DeepSeek call)

Scripted replies only (no `--live`). Check on the first post-resume request of
every arm: seed tool result replaced by the placeholder; no before-only or
after-only line of the file in any tool message; claim present in B/C, absent
in D, replaced in E (where Jev ≥ 0.5); marker applied in C. Jev is called in
the dry run (C, E).

## Reported

Per arm: first-submission accuracy; accuracy within two; stale-derived first
answers (`parsed === !gold`); first answers given without any read;
unparseable first answers; requests, reads, prompt tokens; Jev p on each
claim; marker/withdrawal applied; stale code in first request outside the
claim; current code in first request. Exact one-sided Fisher tests on first
submissions: D > B, E > B, C > B, E > C (directional, 38 runs per arm; no
multiple-comparison correction; orientative). Per-item table.

No prompt, threshold, placeholder or item changes after seeing results. Any
variant is a separate, labelled experiment.

## Limits known in advance

- Excerpts, not full repository files; one question per item written by the
  author; one model (deepseek-v4-flash, temperature 0).
- Temperature-0 repetitions are not identical (E5/E6).
- The placeholder itself tells the model that something was cleared; it is the
  same in all arms.
