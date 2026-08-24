# PCR 0068 — header 1-1 delete re-observe (measurement)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0068-header-1-1-delete-reobserve-50ff`
- Commit: (this docs commit)
- Merge-base: `9f906b5bdfd66a52710dcb46df9b6afbf43ca82f` (main; PCR 0066)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-repin`; `measurement`
- Decision: **review** (measurement + regression lock; no identity product change)

## Hypothesis or change

PCR 0067 Board A started from a region **2–2** observe, deleted the header, then
re-observed **1–1**. That path migrates the old 2–2 unit via door `exact` before
re-observe and mints a duplicate 1–1 unit. This PCR measures the **distinct**
identity path: observe Hermes region **1–1** (header) on the usual
three-content-line + trailing-NL fixture (`lineCount()=4`), delete line 1, then
re-observe **1–1** on the post-delete file. No product change. Door frozen. Does
not revive persist-38.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0068-header-1-1-delete-reobserve.test.mjs`: primary board on
  core path with observe-then-mutate sequencing; gold is first/last lines, span,
  location, exact bytes (language-agnostic).
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, adapters,
  holdout traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Board (synthetic)

Three-content-line file `ws/region_b.txt` with trailing newline (`lineCount()=4`):

```text
line1 header                              ← line 1 (tracked region)
BETA_OLD_INTERIOR keep this line unique   ← line 2
line3 footer                              ← line 3
```

Observe: Hermes-equivalent region `offset=1`, `limit=1` → `scope=region`,
`startLine=1`, `endLine=1`, content = `line1 header` (**12** bytes),
`observedFileLineCount=4`.

### Primary board — delete header, then Hermes region 1–1 re-observe

| field | value |
|---|---|
| Mutation | delete line 1 (header) only |
| Post-mutate file | interior + footer (`lineCount()=3`) |
| Post-delete refresh (no re-observe) | **unresolved** (`anchors-not-found`; 0059 fail-close) |
| Re-observe | `offset=1`, `limit=1` → region 1–1, content = interior (**39** bytes), `observedFileLineCount=3` |
| Unit identity | **re-pin** — same id (`path` + `region` + `1:1`) |
| After re-observe + refresh | **resolved** `exact`, span **1–1** |
| `first_line` / `last_line` | interior / interior |
| Neighbor footer in projection | **no** (before or after re-observe) |
| Door exact | **fires** on re-pin (interior bytes at new line 1) |
| Projection envelope | `selected=1`, `unresolved=0` (post re-observe) |

Unlike PCR 0067 Board A (2–2 start), header-delete alone does **not** migrate the
old 1–1 unit via door exact; re-observe re-pins the same id rather than minting
a second unit.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 165 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes confirm | no | — | synthetic lock only |

## Metric snapshot

| metric | before (main @ 0066) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 163/163 runnable | 165/165 runnable | +2 tests (1 file) |
| Header 1–1 delete fail-close (synthetic) | unmeasured | pass | locked |
| Header 1–1 delete + re-observe re-pin (synthetic) | unmeasured | pass (exact 1–1 interior) | locked |

## Comparison

- PCR 0059: delete tracked interior fail-closes; neighbor footer not served.
- PCR 0065: delete triad from region 2–2 observe (fail-close, path-only, footer re-pin).
- PCR 0067 Board A: 2–2 start → header delete migrates via door exact; duplicate 1–1 units on re-observe.
- PCR 0068: 1–1 start → header delete fail-closes; re-observe re-pins same id with door exact on interior.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic core path only; no live Hermes confirm on this board.
- Primary board only; optional contrast (distinct replacement at new line 1 vs old
  footer bytes) not run in this PCR.
- Re-pin overwrites observe-time header metadata; door exact resolves interior only
  after re-observe clears 0059 fail-close.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

Optional contrast board: replace new line 1 with distinct non-footer bytes, then
re-observe 1–1; live confirm if adapter path diverges from core replay.
