# PCR 0069 — Hermes exact-EOF page promotes to file-scope (sibling of 0064)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0069-exact-eof-file-scope-clamp-bd18` (draft PR)
- Commit: (this docs commit)
- Merge-base: `feec8fc22492626d4d6e42fd5a8b877e2b6d1e85` (main; PCR 0068)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `default-pagination`
- Decision: **review** (product change + regression tests; live gold confirm)

## Hypothesis or change

PCR 0064 promotes Hermes pagination to file-scope when `endLine > fileLineCount`
(past-EOF default `limit=2000`). PCR 0066 measured the leftover: an in-bounds
exact-EOF page `{offset:1, limit:4}` on a 4-line file (3 content + trailing NL,
`lineCount=4`) mapped to region `1–4` and projected **empty** after interior
line-2 replace — same fail-close envelope as pre-0064 blown pagination.

**Root cause:** multi-line regions whose `endLine` reaches EOF cannot refresh after
interior edits (door misses; `stored-line-span` is single-line only). Exact-EOF
spans are symmetric with past-EOF spans for this failure mode.

**Fix (adapter-only):** extend `normalizeHermesReadScope()` in
`adapters/hermes/bridge.mjs`:

```text
endLine >= fileLineCount  →  scope=file
```

This subsumes 0064 (`endLine > fileLineCount`) and adds 0069 exact-EOF
(`endLine === fileLineCount`).

### Rule shipped (0071 may lock stricter form)

| condition | promotion |
|---|---|
| `endLine > fileLineCount` | file-scope (0064) |
| `endLine === fileLineCount` | file-scope (0069) |
| `startLine === 1 && endLine === fileLineCount` | **not** required (0071 candidate) |

Example: `{offset:2, limit:3}` on a 4-line file maps to region `2–4`; under the
shipped rule `endLine === fileLineCount` promotes to file-scope even though the
span does not start at line 1. A stricter `startLine === 1 && endLine === fileLineCount`
rule would leave tail-anchored exact-EOF pages region-scoped.

Typical board `{offset:1, limit:4}` → file-scope; after interior line-2 replace,
serves `NEW` via whole-file (not the 0066 empty leftover).

Not a paper result. Not SOTA.

## What we did

- Extended `normalizeHermesReadScope()` — `endLine >= fileLineCount` promotes to
  file-scope (0064 past-EOF + 0069 exact-EOF).
- Flipped PCR 0066 Hermes integration test from empty leftover to `NEW` via
  whole-file; kept 0066 core measurement (explicit region `1–4` still fail-closes).
- Added `test/pcr-0069-exact-eof-file-scope-clamp.test.mjs` (clamp rule, partial
  page `1–3` unchanged, interior replace, controls).
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, holdout
  traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Board (synthetic)

Three-content-line file `ws/region_b.txt` (real `0x0a` newlines, trailing NL,
`lineCount=4`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique   ← line 2 (interior)
line3 footer
                              ← line 4 (empty; trailing NL)
```

### Board A — exact-EOF page interior replace (0069 fix)

| field | value |
|---|---|
| Hermes args | `{offset:1, limit:4}` |
| Mapped scope | **file-scope** (`endLine === fileLineCount`; 0069 promotes) |
| Observe payload | full file with trailing NL (**66** bytes) |
| Mutation | disk line 2 → `BETA_NEW_INTERIOR …` |
| Projection | `NEW` via `resolution="whole-file"` |

### Controls (must hold)

| Hermes args | Expected after interior replace |
|---|---|
| `{offset:2, limit:1}` | region `2–2`; `stored-line-span` serves NEW (**39** bytes interior) |
| path only | `scope=file`; whole-file serves NEW |
| `{offset:1, limit:2000}` | 0064 hold: file-scope; serves NEW (`endLine 2000 > 4`) |
| `{offset:1, limit:3}` | region `1–3`; unchanged (partial page, `endLine < fileLineCount`) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | see metric snapshot |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes exact-EOF confirm | no | — | box-side after review |

## Metric snapshot

| metric | before (0068 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 165/165 runnable (0068 ledger) | 174/174 runnable | +9 tests (0069 file) |
| exact-EOF `1/4` interior replace (synthetic) | empty projection (0066) | `NEW` via whole-file | fixed |
| control `2/1 → 2–2` (synthetic) | pass | pass | 0 |
| path-only file-scope (synthetic) | pass | pass | 0 |
| default `1/2000` file-scope 0064 hold (synthetic) | pass | pass | 0 |

## Comparison

- PCR 0064: past-EOF pagination (`endLine > fileLineCount`) → file-scope.
- PCR 0066: exact-EOF page `1–4` stayed region; empty leftover (measurement).
- PCR 0069: exact-EOF pagination (`endLine === fileLineCount`) → file-scope;
  sibling fail-safe to 0064.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (lines, span, exact bytes).

## Limitations

- Shipped rule is `endLine >= fileLineCount`, not the stricter
  `startLine === 1 && endLine === fileLineCount`; 0071 may lock either form.
- Tail-anchored exact-EOF pages (e.g. `{offset:2, limit:3} → 2–4`) also promote
  under the shipped rule.
- Promotion uses observe-time `lineCount()`; observe and refresh must agree on
  file bytes (same as 0059/0064).
- Whole-file promotion serves the entire file, not just the paginated span.
- n=1 live Hermes confirm not run in this VM.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched.

## Next measurement

PCR 0071: lock clamp predicate (`endLine === fileLineCount` vs
`startLine === 1 && endLine === fileLineCount`). Live Hermes confirm on research
box: `{offset:1, limit:4}` after interior line-2 replace serves `BETA_NEW_INTERIOR`.
