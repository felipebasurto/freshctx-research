# PCR 0131 — Classify sharp edges, keep the product, write the rest

- Date (UTC): 2026-08-31
- Author / agent: Cursor Grok 4.6
- Branch / PR: `fix/gotcha-pass`
- Product commit: (this commit)
- Merge-base: `e4b9ae04b63cf3b0cce673e49956cdde7a3595f2` (main)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `measurement`; `protocol-fixture`
- Decision: **review**

## Hypothesis or change

Living docs disagreed with code, or two docs disagreed with each other.
None of the product KEEP behaviors were wrong. This record writes the
disagreements in living docs, prints which evaluate judge ran, and leaves
the Go/Rust file-region sidecar gate alone.

## What we did

- Deleted the ghost `observationId` field from `docs/ARCHITECTURE.md`.
  Core `trackRead` never stored it. Adapters use `metadata.freshctx.unitId`.
- Printed `judge=pack-on-disk` or `judge=empirical-verdict` from
  `printEvaluateResult`. `--pack` without `--report` still uses
  `runPackEvaluation`. `--pack` with `--report` still uses
  `runEmpiricalEvaluation`. Record shapes are unchanged.
- Rewrote stale living docs. Pi README listed symbol as unsupported.
  Hermes README said `select_context()` never writes state. ROADMAP said
  75 PCRs. NEXT-PROMPT was still framed as post-v0.2. `bench/README.md`
  named a missing `fixture.mjs`. ARCHITECTURE called symbol "future".
- Documented the parser-vs-gate split in ADR 0004. `parse.mjs` accepts
  `.go` and `.rs`. `SIDECAR_TREE_SITTER_EXTENSIONS` does not. Symbol
  scope always calls the sidecar. File and region Go/Rust stay on
  whole-file and anchor paths.
- Added P1 apex GHA-seal and P2 LSP/SCIP sentences on ROADMAP.
- Did not add `.go`/`.rs` to the registry gate. Adapter engines inject a
  live runner by default. Core `freshctx-region` does not. Extending the
  set would break adapter/core byte-equality tests even if apex evaluate
  bytes stayed at PCR 0130 numbers.

## Architectural boundary

Docs and one evaluate printer line. No change to `src/policy.mjs`,
`src/anchors.mjs`, `src/projector.mjs`, `src/registry.mjs` extension set,
packs, gold, weights, or sealed paths.

## KEEP behaviors (do not undo)

PCR 0079 (`renderUnit` always embeds `unit.content`). PCR 0080 (same-turn
refresh bypasses the budget cap). Fail-closed freshness (no last-known
projection). Adapter fail-open. Marker text omits the revision hash.
Selection order is not render order. `parse-broken` skips stored-line-span
(PCR 0114). Empty envelope still emits.

## Rejected in this pass

- Adding unused `observationId` to core.
- Unifying the two evaluate record shapes.
- Honoring `FRESHCTX_SIDECAR` on the Hermes live bridge (vocabulary PR).
- Extracting `safeWorkspaceFile` (host-contract PR).
- Extending `SIDECAR_TREE_SITTER_EXTENSIONS` (commit 2, not this record).

## Measurement

`npm test` on this worktree: TAP `# tests 520` `# pass 519` `# fail 1`
`# skipped 0`. The one failure is `repos fetch honors existing lock
without rewriting lock bytes`, which timed out at 600s cloning go-tools
and neovim into a fresh tmpdir. That test is unchanged. PCR 0130 locked
517/517. This branch adds three evaluate-judge tests (520 total).

Empirical board (same path as `npm run evaluate` after tests):
`judge=empirical-verdict` `EVALUATE_VERDICT=PASS` on `holdout-v0.3-apex`
(`locally-frozen`). Candidate payload 8504, baseline 36701, delta -28197.
Oracle 5/5. `passAt1` null. Matches PCR 0130 payload bytes.

`npm run evaluate` re-runs the full test gate first. It will fail in a
bare worktree on the same 600s repos-fetch timeout. The empirical record
is unchanged.

## Next

If a later change adds `.go`/`.rs` to the registry gate, that is its own
commit with evaluate before and after. If payload bytes move, say so in
that PCR. Do not hide a byte delta inside a docs change.
