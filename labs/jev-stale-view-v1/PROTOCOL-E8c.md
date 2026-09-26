# E8c protocol — removing the claim vs warning that the file changed (written before any E8c model call)

Separate, labelled follow-up to E8b (PROTOCOL-E8b.md). E8/E8b are not modified.

## Question

In E8b `neutral × cleared`, first-submission accuracy was B 19/38, D 26/38,
E 37/38. E beat D (not preregistered). The E6 pointer does two things: it
removes the claim and it says the file changed
(`[FreshCtx: an earlier note about <file> was withdrawn because the file changed after it was written.]`).
E8c separates the two.

Preregistered one-sided exact Fisher tests on first submissions (38 runs per
arm, orientative, no correction):

1. **Warning, given removal**: E > E_quiet.
2. **Warning, without any claim**: D_warn > D.
3. **Removal, without warning**: E_quiet > B.
4. **Warning, claim kept**: C > B.
5. Replication of E8b: E > B, D > B.

## Setup

Fixed at the E8b `neutral × cleared` cell, unchanged: neutral prompt and
neutral question rewrite, seeded read's tool result replaced by
`[tool result cleared to save context]`, Pi native `read`, no bridge.

## Arms

- `B_claim`: claim intact.
- `C_jev_mark`: B + Jev; p ≥ 0.5 appends the E5 marker
  `[FreshCtx note: <file> changed after this message was written; claims about it may be outdated.]` (verbatim).
- `D_noclaim`: seed reply `Ready.`.
- `D_warn`: seed reply `Ready.` with the same E5 marker appended in the
  outgoing copy, unconditionally (no claim, so no Jev).
- `E_jev_withdraw`: B + Jev; p ≥ 0.5 replaces the message with the E6 pointer
  (verbatim, mentions the change).
- `E_quiet`: B + Jev; p ≥ 0.5 replaces the message with
  `[FreshCtx: an earlier note was withdrawn.]` (no file, no reason, no change).

Jev: frozen E2 Noul, `jev-1.13.0`, same state, threshold 0.5, fail closed.

## Fixed parameters

As E8b. 19 items × 2 reps × 6 arms = 228 runs; arm order rotated by item
index + repetition. Spend cap $2 in `results/e8c/.spent.json`.

## Dry run

All 19 items, rep 0, no DeepSeek. Check on the first request: prompt is the
neutral one; seed cleared; no file lines outside the claim; claim present in
B and C only (C with marker where p ≥ 0.5); D_warn has `Ready.` + marker; E
and E_quiet replaced by their pointer where p ≥ 0.5.

## Reported

Per arm, as E8b (accuracy first / within two, stale-derived, without-read
first answers and their failures, requests, reads, prompt tokens, Jev p,
marker/withdrawal applied), the preregistered tests, per-item table.

## Limits known in advance

- Same items, one model, 2 reps.
- The marker text in D_warn says "claims about it may be outdated" although
  there is no claim; kept verbatim so that C and D_warn carry the same text.
- "Warning" here is one specific wording; other wordings may behave
  differently.
