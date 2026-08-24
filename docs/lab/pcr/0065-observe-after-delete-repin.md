# PCR 0065 — observe-after-delete re-pin triad (measurement)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0065-observe-after-delete-repin-ac50`
- Commit: (this docs commit)
- Merge-base: `460ff944143c25a616161bee67a6c4e9f176b375` (main; PCR 0064)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-repin`; `measurement`
- Decision: **review** (measurement + regression lock; no product change)

## Hypothesis or change

After PCR 0059, deleting the tracked interior line on a three-content-line file
fail-closes the region unit (unresolved, empty projection, no neighbor footer
serve). Live box work on extract `e6e8f226` (post-0059) scored three follow-on
boards for **observe → delete line 2 → optional re-observe**. This PCR locks
those boards in synthetic replay. No product change. Door frozen. Adapter frozen.
Does **not** revive persist-38 / PR 38 / PR 49 / PR 51.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0065-observe-after-delete-repin.test.mjs`: three boards on
  core path with observe-then-mutate sequencing; gold is first/last lines, span,
  location, exact bytes (language-agnostic).
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, adapters,
  holdout traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

### Live box reference (already scored)

| field | value |
|---|---|
| Workdir | `/workspace/freshctx-live-2026-08-24-delete-repin/` |
| Extract | `e6e8f226` (post-0059) |
| Host pin | `999703fd` |
| Newlines | real `0x0a` |

## Board (synthetic)

Three-content-line file `ws/region_b.txt` with trailing newline (`lineCount()=4`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique   ← line 2 (tracked region)
line3 footer
```

Observe: Hermes-equivalent region `offset=2`, `limit=1` → `scope=region`,
`startLine=2`, `endLine=2`, content = `BETA_OLD_INTERIOR keep this line unique`
(**39** bytes), `observedFileLineCount=4`. **Then** delete line 2 on disk.

Post-delete file (`lineCount()=3`; former footer now at address 2):

```text
line1 header
line3 footer
```

### Board 1 — delete, no re-observe

| field | value |
|---|---|
| Mutation | delete interior line 2 only |
| Post-mutate `lineCount()` | 3 |
| Region unit | **unresolved** (`anchors-not-found`) |
| Span | 2–2 (stored address unchanged) |
| `observedFileLineCount` | 4 (observe-time; current file 3) |
| `stored-line-span` | fail-closed (0059 line-count gate) |
| Projection envelope | `selected=0`, `unresolved=1`, zero units |
| Neighbor footer in projection | **no** |

0059 fail-close **holds**.

### Board 2 — delete, then path-only re-observe (whole file)

| field | value |
|---|---|
| Re-observe | `scope=file`, whole post-delete bytes |
| New unit | **file** unit, span **1–3**, `observedFileLineCount=3` |
| `first_line` | `line1 header` |
| `last_line` | `line3 footer` |
| Old region unit | still **unresolved**, **not** projected |
| Re-pin? | **no** — distinct unit id (file vs region 2–2) |
| Duplicate current units | **no** |

Projection envelope: `selected=1`, `unresolved=1` (file served; stale region
counted unresolved, not rendered).

### Board 3 — delete, then Hermes region 2–2 re-observe (no selector)

| field | value |
|---|---|
| Re-observe | `offset=2`, `limit=1` → region 2–2, content = `line3 footer` (**12** bytes) |
| Unit identity | **re-pin** — same id (`path` + `region` + `2:2`; no selector) |
| After re-observe + refresh | **resolved** `exact`, span **2–2** |
| `first_line` / `last_line` | `line3 footer` / `line3 footer` |
| `observedFileLineCount` | 3 |
| Old unresolved state | **gone** (overwritten on re-pin) |
| Neighbor footer | served as that same region unit at 2–2 |

Identity is path+region+2:2 independent of bytes (Hermes does not pass a
selector). Product identity PCR is later and optional.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 151 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes delete-repin confirm | no | — | synthetic lock only; box already scored |

## Metric snapshot

| metric | before (main @ 0064) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 148/148 runnable | 151/151 runnable | +3 tests (1 file) |
| Board 1 delete fail-close (synthetic) | unmeasured (post-delete no re-observe) | pass | locked |
| Board 2 path-only re-observe (synthetic) | unmeasured | pass (new file unit) | locked |
| Board 3 region re-pin (synthetic) | unmeasured | pass (`exact` 2–2 footer) | locked |

## Comparison

- PCR 0059: delete tracked line fail-closes; neighbor footer not served.
- PCR 0058 (draft PR 51): locked neighbor serve on delete; **superseded** by 0059.
- PCR 0062: insert-above observe-then-mutate boards (line count up).
- PCR 0065: delete observe-then-mutate triad — fail-close hold, path-only new
  unit, region re-pin overwrite.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic core path only; live box already scored on extract `e6e8f226`.
- Board 2 leaves stale unresolved region in registry (projection omits it).
- Board 3 re-pin overwrites observe-time metadata; refresh resolves via frozen
  door (`exact`) when footer bytes match current line 2.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

Optional product identity PCR: formalize re-pin key (`path` + `region` +
`startLine:endLine` without selector) vs new-unit path-only observe. Live Hermes
confirm on research box if adapter path diverges from core replay.
