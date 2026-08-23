# PCR 0055 — region single-line interior refresh (`stored-line-span`)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent
- Branch / PR: `cursor/region-interior-refresh-61c4` (draft PR)
- Commit: (this docs commit)
- Merge-base: `88e9bfaba781b275b69b65b6225a101ff5df5b47` (main; PCR 0054 docs)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`
- Decision: **review** (product change + regression test; live box confirm pending)

## Hypothesis or change

PCR 0047 measured a real region miss on Hermes after fixing the driver to write
real `0x0a` newlines. Cell B-interior (`scope=region`, `startLine=2`,
`endLine=2`) kept `BETA_OLD_INTERIOR` in the turn-2 request while
`BETA_NEW_INTERIOR` was on disk. B2 (whole-file read on the same mutation)
stayed current. FreshCtx ran (`mode_detail=fresh-select`) but the region unit
resolved **unresolved** — not an install/extract hole (0050–0054 closed).

**Root cause verified:** for a **single-line region read** whose entire observed
content is replaced, `resolveRegion` in the frozen door has no surviving first/
last anchor or structural-consensus vote (`minSupportingLines=2`). Refresh
returned unresolved; projection was empty while the historical tool-result stub
still referenced the old marker.

**Fix:** in `src/registry.mjs` refresh, after door resolution fails for
`scope=region`, fall back to **`stored-line-span`** when `startLine ===
endLine`: re-slice the current file at the explicit line address from the read
contract. Multi-line regions stay on the door only (ambiguous-region test
unchanged).

Not a paper result. Not SOTA. Live Hermes B-interior confirm is n=1 box-side
after merge.

## What we did

- Added `test/region-interior-line-refresh.test.mjs` (fails on main, passes after
  fix): PCR 0047 B-interior shape + B2 file-scope non-regression + core engine
  path.
- Implemented `resolveStoredLineSpan` in `src/registry.mjs` (refresh layer only).
- Did **not** edit `src/anchors.mjs` (door), holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, or sealed protocol.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 122 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes B-interior rerun | no | — | box-side after merge |

## Metric snapshot

| metric | before (main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 121/121 runnable | 122/122 runnable | +1 test file |
| B-interior regression (synthetic) | fail (unresolved) | pass (`stored-line-span`) | fixed |
| B2 file-scope regression (synthetic) | pass | pass | 0 |

## Comparison

- PCR 0047: measured live B-interior region miss with honest newlines.
- PCR 0054: install.mjs turn-2 **file-scope** append fresh (unrelated hole).
- PCR 0055: closes the **region single-line interior replace** refresh gap in
  core/adapters without door retune.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (marker tokens, line span, bytes).

## Limitations

- Fallback applies only when `startLine === endLine` (explicit single-line
  region reads). Multi-line interior edits still rely on the door.
- Line-addressed refresh serves whatever bytes are at the stored line number;
  insert/delete above the span can change semantics without content-anchor
  fail-close — that matches the host read contract (`startLine`/`endLine`).
- n=1 live Hermes B-interior confirm not run in this VM; synthetic regression
  only until box rerun.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched.

## Next measurement

On the research box: repeat PCR 0047 B-interior with the same newline proof
artifact; confirm `BETA_NEW_INTERIOR` in turn-2 request and
`resolution="stored-line-span"` (or equivalent) in the projection unit.
