# PCR 0021 — rename-boundary development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (rename-boundary-dev-pack)
- Branch / PR: `cursor/lab-rename-boundary-71a1` ([PR #15](https://github.com/felipebasurto/freshctx/pull/15))
- Base SHA: `42a169ef061e56a985968a3108aab0b92f437d71` (main after PCR 0018 squash)
- Freeze commit: `6c2672abeb3fc9ffe4694f9684f08f232c62dd10`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `rename-boundary-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

After the tracked unit’s first/signature line is renamed on locked bytes, does production either recover the same unit via interior consensus (recall 1 / exact 1, no stretch) or fail-close, and still fail-close on a competing renamed lookalike and on Codex double-rename?

The first boundary is gone. Exact cannot win. First×last ranking has no historical first. Structural consensus may fire without `currentBoundaryPairs`. A shifted accept cannot fire on that branch. This pack measures that door. It does not retune it.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Neovim was not needed. Did not freeze until a real function signature accepted an in-place first-line rename on the missing-pair branch.
2. Registered pack `rename-boundary-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/rename-boundary-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs` or `src/structural-consensus.mjs`.
5. Did not rewrite PCR 0007, 0008, 0013, or 0015–0018 traces, hashes, or records.

## Probe (before freeze)

`npm run repos:fetch` on this empty VM failed on unlocked `ripgrep`. `npm run repos:fetch:holdout` honored the existing lock. Lock sha256 stayed `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.

Eligible unit: `ParseLine` in `benchmark/parse/parse.go` lines 41–62. First is the function signature. Last stays. Interiors stay. Unique interior survivors after the rename remain 13.

In-place rename of the first line to `ParseLineRenamed` removes the historical first. `resolveRegion` finds no first×last pair and calls `resolveRegionByStructuralConsensus` without `currentBoundaryPairs`. The inferred start equals the stored start, so the shift gate does not run. Production accepted (`structural-anchors`, lines 41–62). Direct helper agreed. Support 13. No stretch.

A later copy of `}` does not compete. A second empty `ParseLineRenamed` does not compete. A later copy of the renamed 22-line unit destroys interior uniqueness. That is the decoy.

Inserting two unique markers and then renaming shifts the inferred start. Missing-pair plus shift is `offset-shift-without-boundaries`. That is Codex.

Gold is the generator-recorded renamed 22-line window (SHA `6b48e107…`). Unique-first oracle cannot find the old first. Line-number fallback happens to match the in-place renamed bytes. The pack pins the generator bytes, not that fallback.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/rename-boundary/parse-line` | rename `ParseLine` to `ParseLineRenamed` | renamed 41–62 (SHA `6b48e107…`) |
| decoy | `go-tools/rename-boundary/parse-line-renamed-lookalike` | same rename, plus a later copy of the renamed unit before the Set godoc | same renamed gold as door |
| Codex | `go-tools/rename-boundary/parse-line-double-rename` | insert two markers above `ParseLine`, then rename | original 41–62 window after the first line disappears |

## Measured cells

`freshctx-region` on `rename-boundary-dev-v0.1` after freeze commit `6c2672a`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 1 | 0 | 0 | `structural-anchors` | 1063 | `f9f9565f…` |
| decoy | 0 | 0 | 0 | 0 | unresolved | 164 | `a8743dce…` |
| Codex | 0 | 0 | 0 | 0 | unresolved | 164 | `a8743dce…` |

Door accepted. Method is `structural-anchors`. Live unit is the renamed 22-line function at lines 41–62. Stale 0. No stretch.

Decoy fail-closed (`structural-anchors-not-found` on the direct structural path; pack method `unresolved`). 164 bytes is the empty live block. The live block does not include the later renamed copy. No stretch.

Codex stayed unresolved (`offset-shift-without-boundaries` on the direct structural path; pack method `unresolved`). Empty live block.

The pre-run hypothesis holds. Door recovered via interior consensus. Decoy and Codex fail-closed as required.

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
| `npm run holdout:verify -- --manifest=bench/splits/rename-boundary-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015/0016/0017/0018, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `645ed92ffdd7a71b35d5c04eda0e9405e9216f6f91c181519bef869c8abd1a17`. Lab pack `resultSetHash` `e93db3aa48ba69f3fd49e2737daffdabab7d3e36b7c70f7677aa0cf8a9e5e7d5`. Both 64-hex values are from `state.json`, not `tracesWritten`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015–0018 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- In-place rename is the only missing-pair accept path. A shifted rename fail-closes because `currentBoundaryPairs` is empty.
- The decoy has to copy the renamed unit. A later `}` or an empty second `ParseLineRenamed` does not compete.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether a later unique last can restore a first×last pair after the historical first is gone, that pair would require restoring the old first. Do not restore it. Do not retune the door to force a shifted rename to 1.
