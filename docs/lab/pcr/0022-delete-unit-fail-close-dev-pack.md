# PCR 0022 — delete-unit fail-close door change

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (pcr-0022-fail-close-leftover)
- Branch / PR: `cursor/pcr-0022-fail-close-leftover-1c42`
- Base SHA: `c2513a3807a4d306f2a19a551f97a2e7fb8d9612` (main after PCR 0021 squash)
- Freeze commit: `dbe2cbf8c56c5ae371b3041c4dae646d957f0c23`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `delete-unit-fail-close-dev`
- Door SHA (`src/anchors.mjs`): `08561e67876515d3a582d3fde44d95fd5428cd68dcd4564edbeb32a1b0103ef9`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

After PCR 0020 recorded a stretch on the delete-unit decoy (unique leftover Name+Ord accepted via `boundary-anchors` at a displaced location), does a minimal door change fail-close that ghost without regressing grow-inside, rename-boundary, insert-before unique-last, or in-place shrink at the stored start?

EVALUATION.md §8.7 requires deleted units to be absent; a lookalike first+last pair elsewhere is not the deleted unit.

## Door change

In `resolveRegion` (`src/anchors.mjs`), before returning `boundary-anchors`:

When `span < lineCount`, `locationDelta > 0`, and `startLine` is known, return `displaced-shrunk-boundary-anchors` (unresolved).

Unique first+last alone is insufficient when the pair jumped from the recorded location and interior lines are gone. In-place shrink at the original start (`locationDelta === 0`) still resolves. Offset-shift with interior consensus still uses `structural-anchors-with-boundaries`; the missing-pair branch does not pass `currentBoundaryPairs`, so shifted accept cannot fire there.

`src/structural-consensus.mjs` unchanged.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49`. Did not `--relock`.
2. Implemented the door gate above in `src/anchors.mjs`.
3. Added regression tests in `test/anchors.test.mjs` and `test/delete-unit-fail-close-lab.test.mjs`.
4. Registered pack `delete-unit-fail-close-dev-v0.1` via freeze → commit → generate → run → report.
5. Did **not** rewrite PCR 0020 artifacts, traces, or hashes in `bench/packs/delete-unit-dev-v0.1/` or `docs/lab/pcr/0020-delete-unit-dev-pack.md`.

## Two cells (post-fix measurement)

| cell | trace | mutate | gold |
|---|---|---|---|
| decoy | `go-tools/delete-unit-fail-close/benchmark-fields-lookalike-decoy` | same delete as PCR 0020 decoy, plus later Name+Ord lookalike | absence; expect unresolved |
| shrink | `go-tools/delete-unit-fail-close/benchmark-fields-in-place-shrink` | remove middle six field lines; Name+Ord stay at stored start | pinned 2-line shrunk unit |

## Measured cells

`freshctx-region` on `delete-unit-fail-close-dev-v0.1` after implementation commit `b487b4d`.

| cell | recall | exact | stale | dup | method | proj bytes | lookalike in live | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|
| decoy | 1 | 0 | 0 | 0 | `unresolved` | 164 | no | `7cffff1f…` |
| shrink | 1 | 1 | 0 | 0 | `boundary-anchors` | 516 | yes (Name+Ord) | `4f623491…` |

Decoy fail-closed. Empty live block. Lookalike not projected.

Shrink accepted at stored start via `boundary-anchors`. Not treated as the displaced decoy.

## Live re-run of frozen PCR 0020 decoy (expected science)

Re-running `delete-unit-dev-v0.1` decoy trace against the post-fix door (without refreshing that pack's frozen `resultSetHash`):

| | PCR 0020 frozen | live post-fix |
|---|---|---|
| method | `boundary-anchors` | `unresolved` |
| proj bytes | 516 | 164 |
| lookalike in live | yes | no |

This is the intended outcome. PCR 0020 remains historical stretch measurement.

## Explicit non-goals

- No rewrite of PCR 0019 / 0020 / 0021 frozen hashes or traces.
- No change to score weights or holdout v0.1 fixtures.
- No seal, no v0.2, no board retune.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **99/99** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression |
| `npm run holdout:verify -- --manifest=bench/splits/delete-unit-dev-v0.1.json` | yes | 0 | locally-frozen historical; hash unchanged |
| `npm run holdout:verify -- --manifest=bench/splits/grow-inside-dev-v0.1.json` | yes | 0 | locally-frozen; not regenerated |
| `npm run holdout:verify -- --manifest=bench/splits/rename-boundary-dev-v0.1.json` | yes | 0 | locally-frozen; not regenerated |
| `npm run holdout:verify -- --manifest=bench/splits/insert-before-unique-last-dev-v0.1.json` | yes | 0 | locally-frozen; not regenerated |
| `npm run holdout:verify -- --manifest=bench/splits/delete-unit-fail-close-dev-v0.1.json` | yes | 0 | locally-frozen post-fix pack |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 10/10, exact 6/10, go-tools interior-edit 562, neovim append 1029 |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. New lab pack `traceSetHash` `f7d8d44fb0aa43b82af3f0c42ccd1b36cc16405fecf7c6951c214f6415b9e61b`. Lab pack `resultSetHash` `f740b97383ce2f0914f27008c4146f28b13e372fdf03d6a59c6bc75cae4e7de6`.

## Comparison

PCR 0020 decoy stretched; post-fix decoy is unresolved. In-place shrink control accepts. Sibling frozen packs verify unchanged.

## Conflicts with constitutions

none observed.

## Limitations

- Two enumerated cells. Not §5.1 sampled.
- Shrink gold is generator-pinned (oracle line-count window cannot emit 2-line gold).
- `locally-frozen` only. No remote attestation.

## Next measurement

If the next question is whether delete-unit Codex renamed-header leftovers need a separate gate, measure that as a new cell. Do not refresh PCR 0020 hashes to hide post-fix behavior.
