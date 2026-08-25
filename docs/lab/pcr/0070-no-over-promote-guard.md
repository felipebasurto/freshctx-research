# PCR 0070 — do-not-over-promote guard (measurement)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0070-no-over-promote-guard-bb62` (draft PR)
- Commit: (this docs commit)
- Merge-base: `a7769c51` (main; PCR 0071 Board C core fail-close follow-up merged)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement`
- Decision: **review** (measurement + guard tests; no adapter clamp)

## Hypothesis or change

PCR 0064 promotes Hermes pagination to file-scope when `endLine > fileLineCount`.
PCR 0069 (merged on main) extends promotion to exact-EOF pages (`endLine >= fileLineCount`).
PCR 0071 (merged on main) locks Hermes exact-EOF boards A/B/C as file-scope NEW; Board C
core explicit region `2–4` fail-closes (PR 65 follow-up on main).
In-bounds pages that do **not** cover the whole file must stay region-scoped — the 0069/0071
clamps must not silently over-promote these guard boards to file-scope.

**Guard boards:** on the usual three-content-line + trailing-NL fixture (`lineCount=4`):

- `{offset:1, limit:3}` → region `1–3` (not whole file; `endLine=3 < fileLineCount=4`)
- `{offset:2, limit:2}` → region `2–3` (`endLine=3 < fileLineCount=4`)

After an interior line-2 replace, both boards fail-close to empty leftover: unit unresolved
(`displaced-shrunk-boundary-anchors`); `stored-line-span` does not apply
(`startLine !== endLine`); projection `selected=0`, `unresolved=1`. Door does **not**
serve NEW. Exact-EOF whole-file pages `{offset:1, limit:4}`, `{offset:2, limit:3}`, and
no-trailing-NL variants are covered by 0069/0071 — **not** asserted here.

This PCR is **measurement + guard tests only**. No adapter clamp. No door retune. Does
**not** revive persist-38 / PR 38. Rebased onto main after PCR 0069, 0071, and PR 65 follow-up.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0070-no-over-promote.test.mjs`: mapper + normalize guard for
  `{offset:1, limit:3}` and `{offset:2, limit:2}`; core + Hermes replay for interior
  replace (empty projection); controls for `{offset:2, limit:1}`, path-only file-scope,
  and 0064 hold `{offset:1, limit:2000}`.
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

### Board A — region 1–3 interior miss (no over-promote)

| field | value |
|---|---|
| Hermes args | `{offset:1, limit:3}` |
| Mapped scope | region `1–3` (`endLine=3 < fileLineCount=4`; must **not** promote) |
| Observe payload | full file with trailing NL (**66** bytes; synthetic replay) |
| `first_line` | `line1 header` |
| `last_line` | `` (empty line 4) |
| Mutation | disk line 2 → `BETA_NEW_INTERIOR …` |
| Region unit | **unresolved** (`displaced-shrunk-boundary-anchors`) |
| Span | 1–3 (stored address unchanged) |
| `observedFileLineCount` | 4 |
| `stored-line-span` | fail-closed (`startLine !== endLine`) |
| Projection envelope | `selected=0`, `unresolved=1`, zero units |
| NEW / OLD / header / footer in projection | **no** |

### Board B — region 2–3 interior miss (no over-promote)

| field | value |
|---|---|
| Hermes args | `{offset:2, limit:2}` |
| Mapped scope | region `2–3` (`endLine=3 === fileLineCount-1`; must **not** promote) |
| Observe payload | full file with trailing NL (**66** bytes; synthetic replay) |
| `first_line` | `line1 header` |
| `last_line` | `` (empty line 4) |
| Mutation | disk line 2 → `BETA_NEW_INTERIOR …` |
| Region unit | **unresolved** (`displaced-shrunk-boundary-anchors`) |
| Span | 2–3 (stored address unchanged) |
| Projection envelope | `selected=0`, `unresolved=1`, zero units |
| NEW / OLD / footer in projection | **no** |

Same leftover shape as PCR 0066 exact-EOF board. Honest fail-close; no invented clamp.

### Controls (must hold)

| Hermes args | Expected after interior replace |
|---|---|
| `{offset:2, limit:1}` | region `2–2`; `stored-line-span` serves NEW (**39** bytes interior) |
| path only | `scope=file`; whole-file serves NEW |
| `{offset:1, limit:2000}` | 0064 hold: file-scope; serves NEW (endLine 2000 > 4) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | see metric snapshot |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes confirm | no | — | synthetic guard only |

## Metric snapshot

| metric | before (0068 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 181/181 runnable (0071 ledger) | 196/196 runnable | +15 tests (0070 file) |
| `{offset:1, limit:3} → 1–3` mapper (synthetic) | unmeasured | locked region | new |
| `{offset:2, limit:2} → 2–3` mapper (synthetic) | unmeasured | locked region | new |
| region 1–3 interior replace (synthetic) | unmeasured | empty projection | new |
| region 2–3 interior replace (synthetic) | unmeasured | empty projection | new |
| control `2/1 → 2–2` (synthetic) | pass (0059) | pass | 0 |
| path-only file-scope (synthetic) | pass | pass | 0 |
| default `1/2000` file-scope 0064 hold (synthetic) | pass | pass | 0 |

## Comparison

- PCR 0064: past-EOF default page promotes to file-scope; in-bounds regions unchanged.
- PCR 0066: in-bounds exact-EOF page `1–4` stays region; empty leftover after interior replace.
- PCR 0068: header 1–1 delete re-observe identity path.
- PCR 0069: exact-EOF clamp (`endLine >= fileLineCount` → file-scope); `{offset:1, limit:4}` promotes.
- PCR 0070: in-bounds non-whole-file pages `1–3` and `2–3` stay region; guard against
  silent over-promotion beyond 0069's EOF rule.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic core + Hermes replay only; no live box confirm in this VM.
- Boards depend on trailing-NL tool payload (`lineCount=4`).
- No adapter clamp in this PCR; non-whole-file in-bounds pages remain region-scoped.
- Interior-only edit on multi-line spans fails door refresh despite unchanged boundary
  bytes outside the edited line (displaced-shrunk-boundary-anchors).
- Rebased onto main @ PCR 0069; guard file unchanged — boards A/B still region-scoped.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + guard tests. Holdout seal, door blob, and locks untouched.

## Next measurement

Post-0069: re-run this guard file after any adapter scope change; promotion of boards A/B
to file-scope is a regression. Optional live Hermes confirm on research box.
