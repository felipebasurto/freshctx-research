# PCR 0066 — in-bounds exact-EOF Hermes page stays region after 0064 (measurement)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0066-in-bounds-exact-eof-region-d438` (draft PR)
- Commit: (this docs commit)
- Merge-base: `a86b384866819cc0d4f20eb1c0fa5c6ae578f190` (main; PCR 0067)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement`
- Decision: **review** (measurement + regression lock; no adapter clamp)

## Hypothesis or change

PCR 0064 promotes Hermes pagination to file-scope only when `endLine > fileLineCount`.
A page that fits exactly at EOF stays region-scoped. Example: three-content-line file
with trailing NL (`lineCount()=4`); Hermes `{offset:1, limit:4}` maps to region `1–4`
(`endLine === fileLineCount`, so 0064 does **not** promote).

**Question:** after an interior line-2 replace, does that in-bounds multi-line region
project empty (same leftover shape as pre-0064 default `limit=2000`) or resolve via
door?

**Finding (synthetic replay):** empty leftover — same fail-close envelope as the blown
default page in PCR 0063. Door does **not** serve NEW. Unit stays unresolved with
`displaced-shrunk-boundary-anchors`. `stored-line-span` does not apply (`startLine !== endLine`).

This PCR is **measurement only**. No adapter clamp. No door retune. Does **not** revive
persist-38 / PR 38.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0066-in-bounds-exact-eof-region.test.mjs`: mapper lock for
  `{offset:1, limit:4} → region 1–4`; core + Hermes replay for exact-EOF board
  (empty projection after interior replace); controls for `{offset:2, limit:1}`,
  path-only file-scope, and 0064 hold `{offset:1, limit:2000}`.
- Gold is language-agnostic: first/last lines, span, location, exact bytes.
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, adapters,
  holdout traces/gold, or lock files.

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

### Board A — in-bounds exact-EOF page interior miss

| field | value |
|---|---|
| Hermes args | `{offset:1, limit:4}` |
| Mapped scope | region `1–4` (`endLine === fileLineCount`; 0064 does not promote) |
| Observe payload | full file with trailing NL (**66** bytes) |
| `first_line` | `line1 header` |
| `last_line` | `` (empty line 4) |
| Mutation | disk line 2 → `BETA_NEW_INTERIOR …` |
| Region unit | **unresolved** (`displaced-shrunk-boundary-anchors`) |
| Span | 1–4 (stored address unchanged) |
| `observedFileLineCount` | 4 |
| `stored-line-span` | fail-closed (`startLine !== endLine`) |
| Projection envelope | `selected=0`, `unresolved=1`, zero units |
| NEW / OLD / header / footer in projection | **no** |

Same leftover shape as PCR 0063 blown default page. Door does **not** resolve.

### Controls (must hold)

| Hermes args | Expected after interior replace |
|---|---|
| `{offset:2, limit:1}` | region `2–2`; `stored-line-span` serves NEW (**39** bytes interior) |
| path only | `scope=file`; whole-file serves NEW |
| `{offset:1, limit:2000}` | 0064 hold: file-scope; serves NEW (endLine 2000 > 4) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 163 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes exact-EOF confirm | no | — | synthetic lock only |

## Metric snapshot

| metric | before (main @ 0065) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 153/153 runnable (main @ 0067) | 163/163 runnable | +10 tests (0066 file) |
| exact-EOF `1/4 → 1–4` mapper (synthetic) | unmeasured | locked | new |
| exact-EOF `1–4` interior replace (synthetic) | unmeasured | empty projection | new |
| control `2/1 → 2–2` (synthetic) | pass (0059) | pass | 0 |
| path-only file-scope (synthetic) | pass | pass | 0 |
| default `1/2000` file-scope 0064 hold (synthetic) | pass | pass | 0 |

## Comparison

- PCR 0063: blown default page `1–2000` empty after interior replace.
- PCR 0064: past-EOF default page promotes to file-scope; in-bounds regions unchanged.
- PCR 0065: delete observe-then-mutate triad.
- PCR 0066: in-bounds exact-EOF page `1–4` stays region; same empty leftover as 0063.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic core + Hermes replay only; no live box confirm in this VM.
- Board A depends on trailing-NL tool payload (`lineCount=4`).
- No adapter clamp in this PCR; exact-EOF in-bounds pages remain region-scoped.
- Interior-only edit on a full-file multi-line span fails door refresh despite
  unchanged header/footer bytes (displaced-shrunk-boundary-anchors).
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

Optional later PCR: adapter clamp in-bounds multi-line regions whose span equals
observed file line count to file-scope (symmetric with 0064 past-EOF promotion).
Live Hermes confirm on research box optional.
