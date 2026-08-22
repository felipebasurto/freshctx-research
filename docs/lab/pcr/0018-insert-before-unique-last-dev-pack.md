# PCR 0018 — insert-before unique-last door pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (insert-before-unique-last-dev-pack)
- Branch / PR: `cursor/lab-insert-before-unique-last-7cdc` ([PR #12](https://github.com/felipebasurto/freshctx/pull/12))
- Base SHA: `ed4e0528eee77d78cde28c3c0f21afbf653b9984` (main after PCR 0017 squash)
- Freeze commit: `423af65152124a454e1471e077e1035b9062dd17`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `insert-before-unique-last-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

On locked public-repo bytes, can the door already on main *accept* via `structural-anchors-with-boundaries` (recall 1 / exact 1) when a first+last tie forces the structural branch and the region's last boundary is unique after the inferred start?

PCR 0017 reached that branch on `ParseFile.body` and fail-closed (`offset-shift-without-boundaries`) because last is `}` and later closers keep `matchingBoundaries.length !== 1`. This pack changes the region, not the door.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze, then would have probed neovim. Did not freeze until a real unit entered the tie branch with last unique after the inferred start.
2. Registered pack `insert-before-unique-last-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/insert-before-unique-last-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs` or `src/structural-consensus.mjs`.
5. Did not rewrite PCR 0015, 0016, or 0017 traces, hashes, or records.

## Probe (before freeze)

A competing pair whose last is *not* the historical last never enters `resolveRegion` ranking. Candidates are first × historical last only. PCR 0016 geometry then wins on `spanDelta` 0 (`boundary-anchors`).

A pre-start copy of the historical last, plus a whitespace-variant first so the exact first line stays unique, produces the tie while last stays unique after the inferred start. Copying last *after* the inferred start would make `matchingBoundaries.length !== 1`. That is the decoy, not the door.

Eligible unit: `Benchmark.fields` in `benchmark/parse/parse.go` lines 29–36. Last is `Ord int // ordinal position within a benchmark run`. Interior unique survivors after the N-field comment remain ≥2.

| pair | startLine | span | spanDelta | locationDelta |
|---|---:|---:|---:|---:|
| competing | 21 | 8 | 0 | 8 |
| real fields | 37 | 8 | 0 | 8 |

`resolveRegion` entered the tie and accepted (`structural-anchors-with-boundaries`, lines 37–44). Direct `resolveRegionByStructuralConsensus` with production `currentBoundaryPairs` (all first × last candidates) agreed.

Gold is the generator-recorded relocated 8-line window (SHA `d0283fc1…`). Unique-first oracle matches because the competing first is a whitespace variant. Stale lines 29–36 after the insert are the const-block plus competing closer, not the unit.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/insert-before/benchmark-fields-unique-last` | competing 8-line first+last pair before `NsPerOp = 1 << iota`, plus `// lab-unique-last-interior-7cdc` on the N field | relocated fields at 37–44 (SHA `d0283fc1…`) |
| decoy | `go-tools/insert-before/benchmark-fields-unique-last-trailing-decoy` | same, plus a later copy of the Ord line before the ParseLine godoc | same relocated gold as door |
| Codex | `go-tools/insert-before/benchmark-renamed-header-unique-last` | insert above `type Benchmark struct {`, rename to `BenchmarkSnapshot` | original 28–37 window after the first line disappears |

## Measured cells

`freshctx-region` on `insert-before-unique-last-dev-v0.1` after freeze commit `423af65`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 1 | 0 | 0 | `structural-anchors-with-boundaries` | 902 | `290287ef…` |
| decoy | 0 | 0 | 0 | 0 | unresolved | 164 | `7cffff1f…` |
| Codex | 0 | 0 | 0 | 0 | unresolved | 164 | `4276f66f…` |

Door accepted. Method is `structural-anchors-with-boundaries`. Live unit is the relocated 8-line field list with the N-field comment and without the insert markers or the competing pair. Stale 0. No stretch.

Decoy entered the tie and fail-closed (`offset-shift-without-boundaries` on the direct structural path; pack method `unresolved`). 164 bytes is the empty live block. The live block does not include the trailing Ord copy. No stretch.

Codex stayed unresolved. Empty live block.

The pre-run hypothesis holds for the door cell. Decoy and Codex fail-closed as required.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007 / 0008 / 0013 / 0015 / 0016 / 0017 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **93/93** |
| `npm run check` | yes | 0 |  |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/insert-before-unique-last-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015/0016/0017, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `891528de065ab970e0a23b9f09753aeedb1f6ac427109660625f24ff9bb4afb2`. Lab pack `resultSetHash` `a6da4d28e256206c661a184f7695b6364261ce132e537e3f951314eca796139e`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015, 0016, and 0017 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- A different last never enters first × last ranking. The tie uses a pre-start copy of the historical last. That copy sits before the inferred start, so last stays unique after that start.
- The competing first is a whitespace variant so the exact first line stays unique and the independent oracle agrees with generator-pinned gold. An exact first duplicate would make `goldBytesForRead` fall back to stale line numbers (PCR 0017).
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether a later unique-last decoy can accept the same payload as the door, that is a door change (`currentBoundaryPairs` as the tied pairs only, or a last-uniqueness rule that ignores post-region copies). Do not retune the door to force the decoy to 1.
