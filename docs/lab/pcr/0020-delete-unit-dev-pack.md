# PCR 0020 — delete-unit development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (delete-unit-dev-pack)
- Branch / PR: `cursor/lab-delete-unit-d5a0` ([PR #13](https://github.com/felipebasurto/freshctx/pull/13))
- Base SHA: `42a169ef061e56a985968a3108aab0b92f437d71` (main after PCR 0018 squash)
- Freeze commit: `7459ee7b104cd7d0e7c760b4bf07cf0f52098a21`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `delete-unit-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

After a tracked locked unit is removed, does production stay deletion-safe (no last-known bytes as current, no lookalike stretch) and still fail-close on Codex renamed-header leftovers?

EVALUATION.md §5.2 names family `delete-unit`. §8.7 requires deleted units to be absent and explicitly tombstoned or unresolved. Holdout v0.1 already has whole-file `delete` cells. This pack does not copy or edit those traces. It measures region delete on locked go-tools bytes.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Neovim was not needed. Did not `--relock`.
2. Registered pack `delete-unit-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/delete-unit-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
5. Did not rewrite PCR 0007, 0008, 0013, or 0015–0018 traces, hashes, or records.

## Probe (before freeze)

Eligible unit: `Benchmark.fields` in `benchmark/parse/parse.go` lines 29–36. First and last are unique in the locked file. SHA `4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7`.

After the eight field lines are deleted, exact cannot win. First and last are gone. `resolveRegion` returns `anchors-not-found`. Direct `resolveRegionByStructuralConsensus` returns `structural-anchors-not-found`. The leftover `type Benchmark struct {` header remains for the Codex cell.

A later first+last lookalike (the Name line and the Ord line only, interiors not restored) is the decoy. Production `resolveRegion` accepts that pair via `boundary-anchors` when it is the only candidate. That is the stretch this pack records. The door was not retuned.

Rejected as the door unit (recorded, not used):

| candidate | why ineligible as the door |
|---|---|
| `Benchmark.type` (28–37) | last is `}`; deleting the type removes the leftover header Codex needs |
| `ParseLine.fn` / `parseMeasurement.fn` / `ParseSet.fn` | last is `}`; Codex leftover header is gone after the whole function is deleted |
| `String.fn` | last is `}`; decoy already fail-closes by `}` ambiguity, so it does not isolate lookalike stretch |

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/delete-unit/benchmark-fields` | delete the eight `Benchmark.fields` lines | absence: second capture `requiredUnits: []` |
| decoy | `go-tools/delete-unit/benchmark-fields-lookalike-decoy` | same delete, plus a later Name+Ord lookalike before the ParseLine godoc | same absence gold; live block must not include the lookalike |
| Codex | `go-tools/delete-unit/benchmark-fields-renamed-header` | same delete, rename leftover `type Benchmark struct {` to `BenchmarkSnapshot` | absence; expect unresolved |

Gold is the generator-recorded post-mutation required set. That set is empty. Last-known field bytes are not pinned.

## Measured cells

`freshctx-region` on `delete-unit-dev-v0.1` after freeze commit `7459ee7`.

| cell | recall | exact | stale | dup | method | proj bytes | lookalike in live | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|
| door | 1 | 0 | 0 | 0 | `unresolved` | 164 | no | `7cffff1f…` |
| decoy | 1 | 0 | 0 | 0 | `boundary-anchors` | 516 | yes | `6ab1d70b…` |
| Codex | 1 | 0 | 0 | 0 | `unresolved` | 164 | no | `7cffff1f…` |

Recall 1 is the empty-required-set convention in `analyzeCapture`. The deleted unit is not current. Door and Codex project the empty live block (164 bytes). Stale 0. Last-known field bytes do not appear.

Door is deletion-safe on this unit. Exact cannot win. First and last do not project as current.

Decoy stretched. The later Name+Ord pair was emitted as the deleted identity via `boundary-anchors`. Stale stayed 0 because the lookalike is not the deleted eight-line block. The door was not changed to force this cell to 0.

Codex stayed unresolved. Empty live block.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007 / 0008 / 0013 / 0015 / 0016 / 0017 / 0018 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **94/94** |
| `npm run check` | yes | 0 |  |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/delete-unit-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015/0016/0017/0018, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `c4d8dfc566a28d2d8492062382b3a33cc247341a93534da12a4f54af0028b34a`. Lab pack `resultSetHash` `4129564b561a56a2d78ee1b9be0642b884cf64ac4fa74befdd68068ba6038514`. Hashes are from `bench/packs/delete-unit-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015–0018 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.
- Second-capture gold is an empty required set. `analyzeCapture` therefore reports recall 1 even when the live block is empty. Absence is read from method, projection bytes, and `liveIncludesLookalike`.
- The decoy lookalike is first+last only. Production unique-pair ranking accepts that span. A fuller lookalike or a tied pair would be a different cell.

## Next measurement

If the next question is whether a unique leftover first+last pair should fail-close after delete, that is a door change. Do not retune the door to force this decoy to 0.
