# PCR 0115 — File-scope sidecar unit projection (not whole-file relabel)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/file-scope-sidecar-units-c972` (draft)
- Base SHA: `8e436e73bf9b89a4d1a964fe97cad1c67453ca3b` (PCR 0114 squash on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `replay`; `adapter-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0114 routed file-scope refresh through the sidecar but `resolveFileViaSidecar`
still returned the whole file with `resolutionMethod: "sidecar"`.
Pi three-arm leftovers showed `freshctx-ts` and `freshctx-no-ts` with nearly the
same turn-2 `request_bytes` and `sibling_bytes_in_request=yes`.
Tree-sitter could not show a byte delta.
This PCR projects parsed sidecar unit spans on file-scope refresh.
Changed units are preferred.
Unchanged sibling units and non-unit padding are omitted.
Unit-less or ambiguous parses still fall back to whole-file via the 0114 gate.
`sidecar-missing` and `sidecar-error` still fail closed.
Region selector matching is unchanged.

## What we did

1. Updated `resolveFileViaSidecar` in `src/registry.mjs` to concatenate overlapping
   sidecar unit slices instead of relabeling the whole file.
2. Prefer units whose slice changed versus the tracked read.
   When nothing changed, project all overlapping units without interstitial bytes.
3. Treat parse JSON `sidecar-missing` / `sidecar-error` as fail closed, not
   whole-file fallback.
4. Added `test/pcr-0115-file-scope-sidecar-units.test.mjs` (5 tests) for TS, Python,
   and JavaScript file-scope refresh.
5. Fixed `docs/lab/pi-trial-ts/print-columns.mjs` to read `resolution=\"sidecar\"`
   from JSON-serialized provider requests when scan metadata says `none`.
6. Did not edit door, lock, holdout gold, weights, thresholds, anchors, or projector.

## Benchmarks run

Canonical TAP from this run on branch HEAD (base `8e436e7`).

```
1..424
# tests 424
# suites 0
# pass 398
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP on base `8e436e73` remains **395 pass / 0 fail / 17 skipped /
412 total** until Bench measures a squash.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above |
| `npm run check` | yes | 0 | registry + sidecar paths |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `8e436e7` (official) | PCR 0115 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 412 | **424** | **+12** |
| `npm test` TAP `# pass` | 395 | **398** | **+3** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 17 | **26** | **+9** |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Synthetic adapter replay only.
Measured: file-scope TS/Python/JS refresh with injected sidecar projects only
changed unit bodies and omits padding markers and unchanged sibling functions.
Measured: `sidecarRunner: null` arm behavior unchanged (`whole-file`).
Measured: missing runner and parse-broken file-scope paths still fail closed.
Live Pi three-arm table not rerun in this box.

## Conflicts with constitutions

none observed.

## Limitations

Live Mac three-arm battery still pending after merge.
Multi-refresh file-scope units after partial projection may need a follow-up if
observed line spans drift from full-file coordinates.
`print-columns` resolution fallback reads raw request dumps under `.work/capture/`.

## Recommended next experiment

Rerun PCR 0113 three-arm battery on Mac after this lands.
Expect arm `freshctx-ts` turn-2 `resolution=sidecar`, lower `request_bytes`, and
`sibling_bytes_in_request=no` versus `freshctx-no-ts` on the same prompts.
