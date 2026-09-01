# Success board (harness-only)

Label: `harness-only`; `synthetic`. Not a paper result. Not CtxBench.
**Not a SWE-bench dump.** Do not invent SWE scores. Do not invent Pass@1.

This leftover is a small **fail-closed task pass/fail** board.
It scores existing trial asserts `exact_current_bytes` and `stdout_current`.
It does not include cost, provider token counts, or dollar figures.

Official accepted TAP stays **549/0/0/549**.

## What this is

- A tiny synthetic pack (`synthetic-mini-board-001`).
- Arms: `nothing` vs `freshctx`. FreshCtx is Isolated Semantic Engine
  (Tree-sitter) by default. FreshCtx without Tree-sitter does not exist.
- Pass only when later-turn dumps show both asserts.
- Missing dump = **fail**, not skip-as-pass.

## What this is not

- Not SWE-PolyBench Verified.
- Not SWE-Bench Pro.
- Not Pass@1.
- Not a live measurement. `measuredSweScores()` is `null`.
- Not a cost ledger.

Isolated Semantic Engine (Tree-sitter) is the FreshCtx default. This leftover
does not add a Tree-sitter host toggle. FreshCtx without Tree-sitter does not
exist.

## Commands

```bash
node docs/lab/success-board/run.mjs validate
node docs/lab/success-board/run.mjs print-board
```

Never paste an API key into CMD, PCR, or chat.

See [SCOPE.md](SCOPE.md).
