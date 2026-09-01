# Scope

This directory is a **harness-only success board**. It is **not a full SWE-bench dump**.

## In scope

1. Fail-closed task pass/fail from `exact_current_bytes` and `stdout_current`.
2. Arms `nothing` vs `freshctx` only. FreshCtx is Isolated Semantic Engine (Tree-sitter) by default.
3. A tiny synthetic pack so the board can run without a live dump.
4. Missing dump = fail. Never skip-as-pass.

## Out of scope

- Downloading SWE-bench, SWE-Bench Pro, or SWE-PolyBench instances.
- Inventing Pass@1 or any SWE score. Do not invent numbers.
- Cost, provider token counts, or dollar figures.
- Replacing the official accepted table. It stays **549/0/0/549**.
- Editing `docs/lab/INDEX.md` or `docs/lab/METRICS.md`. Living PCR count stays for the next pack.
- Editing cost-ledger or PCR 0140.
- Editing `src/`, door (`src/anchors.mjs`), or `bench/repos.lock.json`.
- `--relock`.
- A `freshctx-no-ts` arm. FreshCtx without Tree-sitter does not exist.
- A Tree-sitter host toggle. Isolated Semantic Engine (Tree-sitter) is the FreshCtx default, not a host switch.
- Pasting API keys. Never paste an API key.

## Success metric

`task-pass-fail-exact-current-and-stdout`.
Not Pass@1. Not a SWE-bench score. `measuredSweScores()` stays `null`.
