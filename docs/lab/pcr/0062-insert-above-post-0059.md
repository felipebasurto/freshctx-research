# PCR 0062 — insert-above post-0059 (measurement)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0062-insert-above-post-0059-acb7` (draft PR)
- Commit: (this docs commit)
- Merge-base: `1a3ae88633fc303518a51281e8dc5a2969af48e9` (main; PCR 0060 after 0057/0059)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `insert-above`; `measurement`
- Decision: **review** (measurement + regression lock; no product change)

## Hypothesis or change

PCR 0059 added `observedFileLineCount` gating for `stored-line-span`: when the
current file line count differs from the observe-time count, the fallback
fail-closes (unresolved, no neighbor/header/footer bytes). PCR 0059’s bundled
insert-above test wrote the **post-insert** file before `trackRead`, so
`observedFileLineCount=4` matched the mutated file — a confound for the live
contract, which is **observe then mutate**.

This PCR locks two boards on current main after 0057/0059 with the correct
observe-then-mutate sequence. No product change. Door frozen. Does **not**
re-lock closed PR 49’s insert+replace header-serve assertion (0056).

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0062-insert-above-post-0059.test.mjs`: observe-then-mutate
  core path; pins `observedFileLineCount=4` at pre-insert count.
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, adapters,
  holdout traces/gold, or lock files.
- Did **not** revive PR 49 insert+replace tests that locked header serve at 2–2.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Board (synthetic)

Three-line file `ws/region_b.txt` with trailing newline (`lineCount()=4`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique   ← line 2 (tracked region)
line3 footer
```

Observe: track `scope=region`, `startLine=2`, `endLine=2`, content =
`BETA_OLD_INTERIOR keep this line unique`, `observedFileLineCount=4`.
**Then** mutate disk.

### Board 1 — insert-only (prepend one line above file)

| field | value |
|---|---|
| Mutation | prepend `inserted above\n` before entire file; interior unchanged |
| Post-mutate `lineCount()` | 5 |
| Door path | **exact** — interior relocates to lines **3–3** |
| `stored-line-span` | not reached (door resolves first) |
| Served bytes | original interior only (**39** bytes) |
| Header / footer / insert line in projection | no |

Post-mutate file:

```text
inserted above
line1 header
BETA_OLD_INTERIOR keep this line unique
line3 footer
```

Core unit revision: `sha256:d1f411173006ad2d57c87c6d5566a136d6a95003ed1e3818c31d81bd7c428bea`.

### Board 2 — insert-above + interior replace (door miss)

| field | value |
|---|---|
| Mutation | prepend `inserted above\n` **and** replace line 2 interior with `BETA_NEW_INTERIOR keep this line unique` |
| `observedFileLineCount` | 4 (observe-time, pre-insert) |
| Post-mutate `lineCount()` | 5 |
| Door path | **anchors-not-found** → **unresolved** |
| `stored-line-span` | fail-closed (0059 line-count gate: 5 ≠ 4) |
| Projection envelope | `selected=0`, `unresolved=1`, zero units |
| Header / footer / new interior in projection | no |
| Leftover unit bytes | unit object may retain **old** interior (39 bytes); must **not** appear in projection |

Post-mutate file:

```text
inserted above
line1 header
BETA_NEW_INTERIOR keep this line unique
line3 footer
```

**Note:** closed PR 49 / PCR 0056 locked serving `line1 header` at stored span
2–2 on this board; post-0059 behavior is fail-closed empty projection. This PCR
documents current main and does not re-lock the header leak.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 134 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes insert-above confirm | no | — | synthetic lock only |

## Metric snapshot

| metric | before (main @ 0060) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 132/132 runnable | 134/134 runnable | +2 assertions (1 file) |
| Board 1 insert-only (synthetic) | unmeasured (observe-then-mutate) | pass (`exact` 3–3) | locked |
| Board 2 insert+replace (synthetic) | unmeasured (observe-then-mutate) | pass (unresolved empty) | locked |

## Comparison

- PCR 0055: `stored-line-span` for single-line interior replace when door misses
  (line count unchanged).
- PCR 0056 (closed PR 49): locked header serve at 2–2 on insert+replace; **superseded**
  by 0059 fail-close; not re-locked here.
- PCR 0059: `observedFileLineCount` gate; bundled insert test used post-mutate observe
  (confound).
- PCR 0062: observe-then-mutate lock for insert-only (door exact 3–3) and
  insert+replace (fail-closed empty projection).

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic core path only; no live Hermes n=1 confirm on this VM.
- Board 1 success depends on unique interior line surviving insert-above relocation
  via the frozen door (`exact`).
- Board 2 leftover bytes in the registry unit are not pruned from engine state;
  only projection is empty (0059/0040 envelope behavior).
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

On the research box: repeat both boards through live Hermes with real `0x0a`
newlines; confirm Board 1 turn-2 carries 39-byte original interior at lines 3–3
with `resolution="exact"`, and Board 2 turn-2 envelope is `selected=0`
`unresolved=1` with no header/footer/new-interior bytes.
