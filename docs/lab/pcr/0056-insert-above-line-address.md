# PCR 0056 — insert-above on a single-line region after PCR 0055

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0056-insert-above-line-address-c314` (draft PR)
- Commit: (this docs commit)
- Merge-base: `afd97d3732589073dfbc14d4d2a8393262c9bf4d` (main; PCR 0055 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `insert-above`; `stored-line-span`; `exact`
- Decision: **review** (measurement + regression test; no product change)

## Hypothesis or change

PCR 0055 closes the single-line region interior-replace gap with
**`stored-line-span`**: when the frozen door misses and `startLine === endLine`,
refresh re-slices the current file at the stored line number.

**Leftover:** if a line is inserted **above** that span, the host line-address
contract means line 2 now holds different bytes. We did not yet lock what
FreshCtx serves after that mutation.

**Hypothesis (discarded):** insert-above always routes through
`stored-line-span` and serves whatever bytes are now at stored line 2 (e.g.
`line1 header` while the semantic interior shifts to line 3).

**Measurement only.** No door retune. No `src/anchors.mjs` edit. No
`stored-line-span` relocation by content.

## Method

Language-agnostic board (same shape as PCR 0047 / 0055 B-interior):

| step | disk state |
|---|---|
| t0 | 3-line file: `line1 header` / interior / `line3 footer` |
| read | `scope=region`, `startLine=2`, `endLine=2`, selector = interior bytes |
| mutate | prepend one real `0x0a`-delimited line at file top (`INSERT_ABOVE_MARKER …`) |
| refresh | Hermes replay + core `FreshCtxEngine.refresh` |

Fixture uses marker tokens and explicit line spans only — no Go parser,
treesitter, or language selectors.

Also probed **insert-above + interior replace** (door miss + span fallback) to
characterize the `stored-line-span` line-address contract when the door cannot
relocate unchanged bytes.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Observed behavior

### Board: insert-above only (interior bytes unchanged)

After prepend, interior still exists verbatim at file line 3.

| path | resolution | projection bytes | lines attr |
|---|---|---|---|
| core | `exact` (door) | `BETA_OLD_INTERIOR keep this line unique` | `3-3` |
| Hermes | `exact` (door) | same | `3-3` |

The frozen door's exact-content match fires **before** `stored-line-span`.
FreshCtx serves the semantic interior relocated to its new line address; it
does **not** serve the bytes now at stored line 2 (`line1 header`).

### Probe: insert-above + interior replace (door miss)

When the interior marker is also replaced on disk, `resolveRegion` returns
`anchors-not-found` and refresh falls through to `stored-line-span`.

| path | resolution | projection bytes | lines attr |
|---|---|---|---|
| core | `stored-line-span` | `line1 header` | `2-2` |
| Hermes | `stored-line-span` | `line1 header` | `2-2` |

Here the fallback honors the **stored line number**, not the semantic interior
(now at line 3 as `BETA_NEW_INTERIOR`). Neither old nor new interior marker
appears in the projection.

## What we did

- Added `test/region-insert-above-line-address.test.mjs` locking both observed
  paths above (4 tests: core + Hermes × two mutation boards).
- Added this lab note.
- Did **not** edit `src/anchors.mjs`, `src/registry.mjs`, holdout traces/gold,
  `bench/repos.lock.json`, `docs/lab/INDEX.md`, or `docs/lab/METRICS.md`.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | +1 test file |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| live Hermes rerun | no | — | synthetic only |

## Metric snapshot

| metric | before (0055 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| door blob | `f8771c9…` | `f8771c9…` | 0 |
| repos.lock blob | `79e29d09…` | `79e29d09…` | 0 |
| npm test runnable | 122 | 126 | +4 tests |

## Comparison

- PCR 0047: measured live B-interior region miss (honest newlines).
- PCR 0055: `stored-line-span` fallback for single-line interior **replace**
  when door misses.
- PCR 0056: locks insert-above behavior — door `exact` relocation when content
  survives; `stored-line-span` serves stored line bytes when door also misses.

## Conflicts with constitutions

none observed.

## Limitations

- Insert-above **alone** does not exercise `stored-line-span`; exact match
  relocates first.
- When door and span both apply, concurrent insert-above + interior replace
  can serve stale **line-address** bytes (`line1 header`) that are neither the
  old nor new semantic interior — an honest host-contract artifact, not a
  relocation claim.
- n=1 synthetic; no live Hermes box confirm in this VM.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched.

## Next measurement

Optional live Hermes rerun of the insert-above board on the research box; confirm
`resolution="exact"` and `lines="3-3"` when only prepending a header line.
