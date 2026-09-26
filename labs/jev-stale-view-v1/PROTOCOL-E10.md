# E10 protocol — does the tail withdrawal need Jev? (written before any E10 model call)

Separate, labelled follow-up to E9 (PROTOCOL-E9.md). Earlier experiments are not modified.

## Question

In E9 the tail withdrawal (`E_tail`) reached 38/38 against 19/38 with the
claim intact. The notice only names the file. FreshCtx already knows which
files changed, so a deterministic rule could append the same notice for every
earlier assistant message about a changed file, without any model. The rule's
risk is withdrawing claims that are still true. E10 measures whether Jev's
selectivity is worth its cost (an external call of ~1 s per edit).

## Items (`e10_build.py` → `results/e10_items.json`)

- **stale (19)**: the E7/E9 items unchanged: the real edit invalidates the
  claim; gold is the answer for the after code.
- **control (19)**: same claim, same question, same before code. The edit is
  instead an unrelated one-line comment inserted above the first line of the
  excerpt, with that line's indentation: `# TODO: add type hints`. The claim
  stays true, gold is the answer for the before code (`!gold` of the stale
  item), and Jev receives the diff of the comment insertion.
- The control edit is synthetic. It is chosen to be obviously unrelated so
  that the rule's cost, not Jev's judgement on hard cases, is what is measured.

## Arms

- `B_claim`: claim intact, no notice.
- `E_tail`: E9 arm; Jev (frozen E2 Noul, `jev-1.13.0`, state = file + that
  item's diff, threshold 0.5, fail closed) decides whether the notice is
  appended to the question turn.
- `E_tail_rule`: the same notice appended unconditionally (the file changed
  in every item). No Jev call.

Notice text, verbatim from E9:
`\n\n[FreshCtx: your earlier note about <file> is withdrawn because the file changed after it was written. Do not rely on it.]`

## Setup

E9 unchanged: E8b `neutral × cleared` cell, cache warm-up with the pre-edit
history, Pi native `read`, `deepseek-v4-flash`, temperature 0, thinking off,
≤8 requests, 2 submissions. 38 items × 2 reps × 3 arms = 228 runs; arm order
rotated by item index + repetition. Spend cap $2 in `results/e10/.spent.json`.

## Preregistered analysis (first-submission accuracy, exact Fisher, orientative)

1. **Rule on stale items**: E_tail_rule vs E_tail, two-sided. Expected equal;
   the rule also covers e7-22, where Jev stays below 0.5.
2. **Rule harm on controls**: E_tail > E_tail_rule on controls, one-sided.
3. **Claim is harmless when true**: B on controls, reported (expected high).
4. **Jev false positives on controls**: count of p ≥ 0.5 among control runs.
5. Cost on controls: reads, requests, prompt tokens and cost with cache
   discount per arm; cost per correct first answer.

Decision, fixed now:
- If test 2 gives p < 0.05, or E_tail_rule's control cost per correct first
  answer is ≥ 25% higher than E_tail's, Jev's selectivity has a measured
  value in this harness.
- Otherwise the deterministic rule is sufficient here, and the tail notice is
  a candidate for the product without a model (a separate product change
  with its own PCR, not part of this lab).

## Dry run

All 38 items, rep 0, no DeepSeek. Check: control files contain the comment
and the before code; stale files the after code; notice present in all
E_tail_rule runs, in E_tail runs only where p ≥ 0.5, never in B; claim
byte-identical to the warm-up in every arm.

## Limits known in advance

- The control edit is synthetic and trivially unrelated; real "claim still
  true" cases are harder for Jev (E4: precision 0.87 at 0.5), so Jev's
  false-positive rate here is a lower bound.
- The excerpt is small and always readable, so the rule's harm can only show
  up as a wrong answer without reading or as an extra read. Claims whose
  content cannot be recovered by reading (runtime observations, other files)
  are not covered.
- In the E4 sweep most non-stale earlier messages were plans or narration
  with no checkable claim; withdrawing those under the rule is not measured.
- One model, one cell, 2 reps, author-written questions.
