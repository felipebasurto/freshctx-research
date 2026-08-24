# PCR 0060 — post-0059/0057 evaluate record (main)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0060-post-0059-evaluate-8442` (draft PR)
- Commit: (this docs commit)
- Main HEAD measured: `3bcbfb5b89fdb25645d27c6a2eaed2ae1202451e` (PCR 0057 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `multi-line`; `measurement`
- Decision: **review** (docs-only benchmark ledger; no product change)

## Hypothesis or change

PCR 0059 and PCR 0057 landed on main after PCR 0055. This PCR records the
**post-merge evaluate snapshot** on current main without retuning the door,
locks, or benchmark fixtures.

**Main now contains:**

| PCR | Squash commit | Change |
|---|---|---|
| [0059](0059-offset-region-and-delete-failclose.md) | `3b85a892` | Hermes `offset`/`limit` → region span; `stored-line-span` fail-closes when `observedFileLineCount` shifts |
| [0057](0057-multiline-region-interior.md) | `3bcbfb5b` | Multi-line region interior measurement locked (middle-only door-resolve; boundary wipe unresolved) |

**Not merged:** PCR 0056 (insert-above line address) and PCR 0058 (delete
single-line region neighbor serve). Draft PR 49 and PR 51 were **closed**, not
merged. PCR 0059 superseded PR 51’s neighbor-serve expectation with fail-close.

**Live confirm (0059, 2026-08-24):** on the research box, extract
`06f657504a07db789c16aa574c25fc7a77264261`:

- `read_file` with `offset=2`, `limit=1` on a 3-line region file; interior
  replace served `BETA_NEW_INTERIOR` via `stored-line-span` at lines 2–2.
- Delete line 2 cell stayed **unresolved**; projection did **not** serve the
  neighbor footer (`line3 footer`).

Not a paper result. Not SOTA. Not holdout.

## What we did

- Re-ran `npm test` and `npm run evaluate` on main @ `3bcbfb5b`.
- Recorded door and lock git blobs; confirmed unchanged from PCR 0055 baseline.
- Added this PCR and updated `docs/lab/INDEX.md` / `docs/lab/METRICS.md` only.
- Did **not** edit `src/anchors.mjs`, `src/registry.mjs`, holdout traces/gold,
  `bench/repos.lock.json`, or benchmark score weights.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

Door blob matches last known (`f8771c93…`). Lock blob matches last known
(`79e29d09…`). Score matches last known (`89.107165`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **132 pass**, **22 skip**, **0 fail** (154 total) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |

## Metric snapshot

| metric | before (0055 main) | after (main @ 0060) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 122/122 runnable | **132/132 runnable** | +10 (0059 +6, 0057 +4) |
| npm test skip | 22 | 22 | 0 |
| npm test fail | 0 | 0 | 0 |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |
| Hermes offset/limit → region (0059) | whole-file | `stored-line-span` | merged |
| delete tracked line (0059) | neighbor serve | unresolved | merged |
| multi-line middle-only (0057) | unmeasured | pass (`boundary-anchors`) | merged |

## Comparison

- PCR 0055: single-line `stored-line-span` when door misses.
- PCR 0059: Hermes pagination → region; line-count-shift fail-close; live box
  confirmed 2026-08-24.
- PCR 0057: multi-line middle-only door-resolve; boundary wipe fail-closed.
- PCR 0058 (closed PR 51): neighbor-serve on delete — **superseded** by 0059.
- PCR 0060: ledger row after both merges; no metric drift.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (lines, span, location, exact
bytes). No door retune. No benchmark fixture change.

## Limitations

- Evaluate score and ctxbench payload unchanged; +10 tests are regression locks
  only (0059 product + 0057 measurement).
- Live confirm for 0059 is n=1 on the research box; 0057 multi-line board
  remains synthetic-only on this VM.
- PCR 0056 and 0058 remain unmerged; do not cite as on main.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched. No score retune.

## Next measurement

Hold main at this ledger until the next product or protocol change. Optional:
live Hermes rerun of PCR 0057 five-line multi-line board on the research box.
