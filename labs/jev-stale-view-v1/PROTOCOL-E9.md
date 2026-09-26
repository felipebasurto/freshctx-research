# E9 protocol — withdraw at the tail, keep the cached prefix (written before any E9 model call)

Separate, labelled follow-up to E8c (PROTOCOL-E8c.md). Earlier experiments are not modified.

## Question

In E8c, replacing the stale claim in place (E) reached 38/38 against 17/38
with the claim intact (B). In a real session the claim was already sent to
the provider, so rewriting it changes the cached prefix: every token after
the claim is billed at the uncached price (DeepSeek: $0.44/MTok miss vs
$0.014/MTok hit, cited from the provider's price list as used in part 1).

E9 tests a cache-preserving alternative: leave the history untouched and put
the withdrawal on the new user turn, after everything that is cached.

Preregistered one-sided exact Fisher tests on first submissions (38 runs per
arm, orientative, no correction):

1. **Tail withdrawal works**: E_tail > B.
2. **Tail is not worse than in place**: reported as E − E_tail with its
   two-sided Fisher p; "not worse" is only claimed if E_tail ≥ 35/38.

Secondary (measured, descriptive): on the first measurement request, cache-hit
tokens as a share of prompt tokens per arm; E is expected to lose the hit
from the claim onwards, B and E_tail to keep it.

## Setup

E8b/E8c `neutral × cleared` cell, unchanged: neutral prompt, seeded read's
result replaced by `[tool result cleared to save context]`, Pi native `read`,
no bridge, `deepseek-v4-flash`, temperature 0, thinking off.

**Warm-up (new).** To reproduce "the claim was already sent", before the
first measurement request the proxy sends one warm request to DeepSeek with
the history as it was before the edit: the same messages up to and including
the claim (seed read already cleared, claim intact) plus a user turn
`Continue.`, `max_tokens: 1`. The response is discarded; its usage counts
toward spend. Same warm-up in every arm, so all arms start from the same
cache state. The seed read is cleared in the warm-up too, which assumes the
clearing happened earlier; it is not what is measured.

## Arms

- `B_claim`: claim intact.
- `E_jev_withdraw`: as E8c; p ≥ 0.5 replaces the claim message with the E6
  pointer (verbatim).
- `E_tail`: claim message left byte-identical. If p ≥ 0.5, the question user
  message (the first measurement user turn) gets this appended in the
  outgoing copy, on every request:
  `\n\n[FreshCtx: your earlier note about <file> is withdrawn because the file changed after it was written. Do not rely on it.]`

Jev: frozen E2 Noul, `jev-1.13.0`, same state, threshold 0.5, fail closed.

## Fixed parameters

19 items (results/e7_items.json) × 2 reps × 3 arms = 114 runs; arm order
rotated by item index + repetition. Spend cap $2 in `results/e9/.spent.json`.

## Pilot and dry run

- Dry run: all 19 items, rep 0, no DeepSeek. Check the first request: claim
  present in B and E_tail; E_tail's question carries the notice where
  p ≥ 0.5 and the claim message is byte-identical to the warm-up's; E has
  the pointer.
- Live pilot: one item, rep 0, to check that the warm-up produces cache hits
  at all. Excluded from the analysis. If DeepSeek reports no hits in any arm,
  the cache measurement is dropped and reported as not measurable here; the
  accuracy tests still run.

## Reported

Per arm: accuracy first / within two, without-read first answers and their
failures, stale-derived answers, requests, reads, prompt tokens, cache hit
and miss tokens (first request and total), cost at list price with and
without the cache discount, cost per correct first answer, Jev p.

## Limits known in advance

- The claim sits near the end of a short history, so the in-place rewrite
  loses little cache here. The measured hit shares show the mechanism; the
  dollar effect in real sessions scales with the tokens after the claim and
  is computed, not measured.
- The notice wording differs from E8c's pointer (it has to say "your earlier
  note", since the note stays visible).
- DeepSeek caching is best-effort; hits are what the provider reports.
- Same items, one model, 2 reps.
