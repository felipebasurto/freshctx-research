# Scope

This directory is a **host-eval scaffold**. It is **not a full SWE-bench dump**.

## In scope

1. One synthetic task card (`synthetic-mini-ledger-001`).
2. FreshCtx on/off (`nothing` / `freshctx`).
3. How to run that card on Pi or Hermes with `deepseek-v4-flash`.
4. Column names for a later live capture.

## Out of scope

- Downloading SWE-bench, SWE-Bench Pro, or SWE-PolyBench instances.
- Inventing Pass@1 or any SWE score. Do not invent numbers.
- Replacing the official accepted table. It stays **549/0/0/549**.
- Editing `src/`, door (`src/anchors.mjs`), or `bench/repos.lock.json`.
- `--relock`.
- A third Isolated Semantic Engine (Tree-sitter) arm. Tree-sitter is not a
  host switch. This leftover keeps FreshCtx on/off only.
- Pasting API keys. Never paste an API key.

## Success metric

`host-request-bytes-and-resolution` after a later live capture.
Not Pass@1. Not a SWE-bench score. Until that capture exists, print
`not measured`.
