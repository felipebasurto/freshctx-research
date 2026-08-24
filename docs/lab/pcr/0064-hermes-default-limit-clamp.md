# PCR 0064 — Hermes default limit=2000 pagination fail-safe

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0064-hermes-default-limit-clamp-1e1c` (draft PR)
- Commit: (this docs commit)
- Merge-base: `2e208c4` (main; PCR 0063)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `default-pagination`
- Decision: **review** (product change + regression tests; live gold confirm)

## Hypothesis or change

PCR 0059 mapped Hermes `{offset, limit}` to FreshCtx region metadata. Hermes's
default page is `limit=2000`. On a small file that becomes region `1-2000` or
`2-2001`, not file-scope.

Live gold on 2026-08-24 (`main` `3bcbfb5b`, workdir
`freshctx-live-2026-08-24-limit2000`): after an interior line-2 replace, the
blown region fail-closed to an empty projection (`NEW` absent). Control
`{offset:2, limit:1}` still tracked region `2-2` and served `NEW` via
`stored-line-span`. Path-only stayed file-scope.

**Root cause:** multi-line regions whose `endLine` is far past EOF cannot refresh
after interior edits (door misses; `stored-line-span` is single-line only).
`selectContext` also re-merged raw message scope over observe-time enrichment,
undoing any normalization stored in session state.

**Fix (adapter-only):** in `adapters/hermes/bridge.mjs`:

1. `normalizeHermesReadScope()` — when `endLine > fileLineCount`, promote to
   `scope=file` (fail-safe whole-file refresh; no invented neighbor lines).
2. Apply normalization in `enrichTrackedWithLineCounts()` using workspace line
   count at observe time.
3. Re-run `enrichTrackedWithLineCounts()` in `selectContext()` after merge so
   raw message scope cannot overwrite the promotion.

Clamping to EOF was rejected: a clamped multi-line region (`2-4`) still fails
door refresh on interior replace in synthetic replay.

Not a paper result. Not SOTA.

## What we did

- Added `normalizeHermesReadScope()` and wired it through observe + select.
- Added `test/pcr-0064-hermes-default-limit-clamp.test.mjs` (default
  `{offset:1, limit:2000}` + `{offset:2, limit:2000}` interior replace,
  control `{offset:2, limit:1}`, path-only file-scope).
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, holdout
  traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 147 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes default-limit confirm | no | — | box-side after review |

## Metric snapshot

| metric | before (0063 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 141/141 runnable (0063 ledger) | 148/148 runnable | +6 tests (0064) |
| default `{offset:1,limit:2000}` interior replace (synthetic) | empty projection | `NEW` via whole-file | fixed |
| `{offset:2,limit:2000}` interior replace (synthetic) | empty projection | `NEW` via whole-file | fixed |
| control `{offset:2,limit:1}` → region 2–2 (synthetic) | pass | pass | 0 |
| path-only → file-scope (synthetic) | pass | pass | 0 |

## Comparison

- PCR 0059: Hermes offset/limit → region; delete fail-close on line-count shift.
- PCR 0064: blown default pagination (`endLine > fileLineCount`) → file-scope;
  select re-enriches so promotion survives merge.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (lines, span, exact bytes).

## Limitations

- Promotion uses observe-time `lineCount()`; observe and refresh must agree on
  file bytes (same as 0059).
- Whole-file promotion serves the entire file, not just the paginated tail; acceptable
  fail-safe for default `limit=2000` on small files.
- In-bounds multi-line pagination (`limit` fits within file) stays region-scoped.
- n=1 live Hermes confirm not run in this VM.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched.

## Next measurement

On the research box: repeat live `read_file` with default `{offset:1, limit:2000}`
on `region_b.txt` after interior line-2 replace; confirm `BETA_NEW_INTERIOR` in
the request projection (not empty). Repeat `{offset:2, limit:2000}` and control
`{offset:2, limit:1}` cells from live gold.
