# PCR 0019 — grow-inside development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (grow-inside-dev-pack)
- Branch / PR: `cursor/grow-inside-dev-pack-ed22` ([PR #14](https://github.com/felipebasurto/freshctx/pull/14))
- Base SHA: `42a169ef061e56a985968a3108aab0b92f437d71` (main after PCR 0018 squash)
- Freeze commit: `b492eae6b26d65c3abe47ff0aaf59d4b9399ff4d`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `grow-inside-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

After a unique block is inserted inside a tracked locked unit, not before it and not as append-inside-before-closer, does production project the grown unit (recall 1 / exact 1, no stale, no stretch past the unit last), and still fail-close on a trailing last-boundary decoy and on Codex renamed-header?

This pack measures span change. It does not retune the door.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. `Benchmark.fields` in `benchmark/parse/parse.go` lines 29–36 is eligible. First and last are unique. An insert after the Name line and before Ord makes the prefix of `expectedLineCount-1` unstable, so the crop in `resolveRegion` does not fire.
2. Registered pack `grow-inside-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/grow-inside-dev-v0.1/`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs` or `src/structural-consensus.mjs`.
5. Did not rewrite PCR 0015, 0016, 0017, or 0018 traces, hashes, or records.
6. Did not commit a probe script.

## Probe (before freeze)

`goldBytesForRead` always uses the original line count. Unique-first crop after the insert returns Name plus the two insert lines plus four original fields and drops Measured and Ord. That is not grown gold. Door and decoy pin the generator-recorded first→last span (SHA `84b4a53a…`). Codex keeps the oracle.

Direct `resolveRegion` on the door mutation returned `boundary-anchors` for the 10-line grown window. Exact cannot win because the original 8-line bytes are gone.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/grow-inside/benchmark-fields` | two unique comment lines after `Name` and before `N` | grown fields, first through last, including the insert (SHA `84b4a53a…`) |
| decoy | `go-tools/grow-inside/benchmark-fields-trailing-decoy` | same insert, plus a later copy of the Ord line before the ParseLine godoc | same grown gold as door. Region last was not rewritten |
| Codex | `go-tools/grow-inside/benchmark-renamed-header` | same insert, rename `type Benchmark` to `BenchmarkSnapshot` | original 28–37 window after the first line disappears |

## Measured cells

`freshctx-region` on `grow-inside-dev-v0.1` after freeze commit `b492eae`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 1 | 0 | 0 | `boundary-anchors` | 938 | `bc6471a2…` |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 938 | `bc6471a2…` |
| Codex | 0 | 0 | 0 | 0 | unresolved | 164 | `4276f66f…` |

Door accepted. Method is `boundary-anchors`. Live unit is the grown 10-line field list with the insert and without the decoy Ord copy. Stale 0. No stretch.

Decoy accepted the same payload as the door. The live block does not include the trailing Ord copy. Fail-closed is false for this clean last-boundary decoy. First stays unique. The historical last still wins on `spanDelta` against the later copy.

Codex stayed unresolved. Empty live block, 164 bytes, same class as PCR 0018 Codex and holdout delete cells.

The door half of the hypothesis holds. Production projected the grown unit. The decoy fail-close half is discarded. Codex fail-closed as predicted.

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
| `npm run holdout:verify -- --manifest=bench/splits/grow-inside-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015/0016/0017/0018, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `fe9a90cf37baa434405e595129de76b2fb9b7244e213ce60b5e4cbd6d0549cdd`. Lab pack `resultSetHash` `032d64d3117c84fef2110e950dcad12890bd7df703feedee5439e3900adf07d7`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015 through 0018 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- `goldBytesForRead` cannot emit a grown span. Door and decoy gold is generator-pinned. The lab runner overlays that gold after `buildGoldMap`. Raw `runTrace` on those traces throws `independent oracle mismatch`.
- The decoy is a later copy of the historical last. It does not rewrite the region's own last. Unique first plus smaller `spanDelta` still accepts.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether a last-boundary decoy can fail-close on a grown unique-last unit, that is a door change. Do not retune the door to force the decoy to 0.
