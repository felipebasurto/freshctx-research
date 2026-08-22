# PCR 0024 — duplicate-boundary development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (duplicate-boundary-dev-pack)
- Branch / PR: `cursor/duplicate-boundary-dev-pack-0118` ([PR #19](https://github.com/felipebasurto/freshctx/pull/19))
- Base SHA: `c2513a3807a4d306f2a19a551f97a2e7fb8d9612` (main after PCR 0021 squash)
- Freeze commit: `b385d200a374ed4c9ade78a1fc7f4d32fdf6fb6f`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `duplicate-boundary-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

On locked go-tools bytes, when two equally plausible first×last boundary pairs tie on `spanDelta` and `locationDelta`, does production stay silent (`ambiguous-boundary-anchors` / empty live block) instead of picking a copy or emitting last-known bytes?

This pack isolates duplicate-boundary on `Benchmark.fields` in `benchmark/parse/parse.go`. It is not an insert-before geometry. The door on main is frozen; this is measurement only.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Neovim was not needed.
2. Registered pack `duplicate-boundary-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/duplicate-boundary-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
5. Did not rewrite PCR 0007, 0008, 0013, or 0015–0021 traces, hashes, or records.

## Probe (before freeze)

`npm run repos:fetch:holdout` on this empty VM honored the existing lock. Lock sha256 stayed `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.

Eligible unit: `Benchmark.fields` lines 29–36. First (`Name …`) and last (`Ord …`) each appear once on locked bytes. Line count 8.

Door geometry replaces the in-struct field block with an 8-line gap at the historical site, places one copy before the const block (lines 20–27), and one copy after the struct close (lines 38–45). Both copies are identical 8-line windows. Ranking sees:

| pair | startLine | span | spanDelta | locationDelta |
|---|---:|---:|---:|---:|
| copy A | 20 | 8 | 0 | 9 |
| copy B | 38 | 8 | 0 | 9 |

Direct `resolveRegion` and the pack trace agree: `ambiguous-boundary-anchors`, empty live bytes. No stretch.

**Gold choice:** first capture pins the honest current unit (SHA `4e8c2b5c…`). Second capture uses an **empty required set** because post-mutation identity is ambiguous — do not pin either copy.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/duplicate-boundary/benchmark-fields` | strip const+struct fields → gap; insert symmetric copies | first capture SHA `4e8c2b5c…`; second capture **empty required set** |
| decoy | `go-tools/duplicate-boundary/benchmark-fields-trailing-decoy` | door, plus trailing `Ord` line before ParseLine godoc | same ambiguous gold as door |
| Codex | `go-tools/duplicate-boundary/benchmark-renamed-header` | door, plus single `type Benchmark struct {` → `BenchmarkSnapshot` rename | same ambiguous gold as door |

## Measured cells

`freshctx-region` on `duplicate-boundary-dev-v0.1` after freeze commit `b385d20`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 0 | 0 | 0 | unresolved | 164 | `7cffff1f…` |
| decoy | 1 | 0 | 0 | 0 | unresolved | 164 | `7cffff1f…` |
| Codex | 1 | 0 | 0 | 0 | unresolved | 164 | `7cffff1f…` |

All three cells fail-close. Method is `unresolved`. Live block is empty (164-byte shell). No copy bytes emitted. No stretch.

The pre-run hypothesis holds: tied boundary pairs stay ambiguous under the frozen door.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 holdout board projection bytes (go-tools interior-edit 562, neovim append 1029 on live `freshctx-region`).
- No rewrite of `holdout.md`, PCR 0007 / 0008 / 0013 / 0015–0023 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **97/97** |
| `npm run check` | yes | 0 |  |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/duplicate-boundary-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 10/10, exact 6/10, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015–0021, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `434ae790fed731ea881455574db6d6aef38c11cc7e0458eb62c0126ee98e8c23`. Lab pack `resultSetHash` `7469b3bfa853fbf154eda76a225b7136cf94a56f2e67d7f8b39c0eed85a929c5`. Both 64-hex values are from `state.json`, not `tracesWritten`.

## Comparison

None. This is a new family measurement on development bytes, not a CORVUS or holdout-board comparison. PCR 0015–0021 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Symmetric copies required removing the const block from between copy A and the gap; the gap occupies the historical in-struct site only.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.
- Codex uses a single header rename (first `type Benchmark struct {` occurrence). Gap-marker insert before rename was probed separately and would accept one copy if combined; omitted from the shipped Codex cell to preserve fail-close.

## Next measurement

If a later duplicate-boundary question needs a third competing copy that breaks the tie, that is a door change. Do not retune the door to force an accept.
