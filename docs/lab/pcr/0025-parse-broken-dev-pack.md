# PCR 0025 — parse-broken development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (parse-broken-dev-pack)
- Branch / PR: `cursor/parse-broken-dev-pack-6ce7` (draft)
- Base SHA: `c2513a3807a4d306f2a19a551f97a2e7fb8d9612`
- Freeze commit: `b3abf7dcb44a58727d10bc5e3a767d28c7b71fb2`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `parse-broken-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

EVALUATION §5.2 family `parse-broken`: capture an intermediate syntax error. Does production fall back without inventing a unit or replaying last-known bytes as current?

The pack probes locked `ParseLine.fn` (lines 41–62) in `benchmark/parse/parse.go`. Mutations are exact byte replaces; gold is generator line spans, not Tree-sitter. This pack measures what production actually does. It does not retune the door (PCR 0022 owns that).

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Chose an unclosed-string break inside the tracked unit: boundaries stay at stored lines, the file is invalid Go, and the region span remains well-defined.
2. Registered pack `parse-broken-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/parse-broken-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
5. Did not rewrite PCR 0007, 0008, 0013, or 0015–0024 artifacts, hashes, or records.

## Probe (before freeze)

`npm run repos:fetch:holdout` on this empty VM honored the existing lock. Lock sha256 stayed `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.

Eligible unit: `ParseLine.fn` lines 41–62. Unique first and last boundaries survive the interior unclosed-string break.

Door: replace `b := &Benchmark{Name: fields[0], N: n}` with an unclosed string literal. Production accepted via `boundary-anchors` with current broken bytes (recall 1 / exact 1). No replay of pre-break bytes.

Decoy: same break plus a later well-formed copy of the original unit before the Set godoc. Production replayed the pre-break healthy unit (`exact`, stale 1). It did not stretch onto the later lookalike; it served last-known bytes instead.

Codex: insert two unique markers above `ParseLine`, rename the signature to `ParseLineBroken`, then apply the same unclosed-string break. Marker shift removes a reliable first×last pair. Production fail-closed (`unresolved`, 164-byte empty block).

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/parse-broken/parse-line` | unclosed string inside `ParseLine` body | broken 41–62 (SHA `2f236abb…`) |
| decoy | `go-tools/parse-broken/parse-line-lookalike-decoy` | same break, plus a later healthy `ParseLine` copy before Set | same broken gold as door |
| Codex | `go-tools/parse-broken/parse-line-markers-shift` | markers + renamed signature + same break | oracle bytes at stored span after shift |

## Measured cells

`freshctx-region` on `parse-broken-dev-v0.1` after freeze commit `b3abf7d`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 1 | 0 | 0 | `boundary-anchors` | 1071 | `128b1d6f…` |
| decoy | 0 | 0 | 1 | 0 | `exact` | 1045 | `2628292f…` |
| Codex | 0 | 0 | 0 | 0 | `unresolved` | 164 | `a8743dce…` |

Door accepted current broken bytes via boundary anchors. No stale replay. No invention.

Decoy replayed pre-break healthy bytes (stale 1, method `exact`). Live payload equals the original 652-byte unit, not the broken gold and not a stretch onto the later lookalike. Valid 0 with a recorded stale failure.

Codex fail-closed. Empty live block. No replay.

## Explicit non-goals

- No retune of the parse-broken door on main (PCR 0022).
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007 / 0008 / 0013 / 0015–0021 artifacts, or `bench/traces/holdout/`.
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
| `npm run holdout:verify -- --manifest=bench/splits/parse-broken-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015–0021, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `c998768e6323cbe9657faaeed02652038f13d3cc72adc736e895ec7c0814cd8c`. Lab pack `resultSetHash` `e3c9e4d503799342017ab33439f8da55c23b78d44a9c7c196295d41b6c29469a`. Both 64-hex values are from `bench/packs/parse-broken-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015–0021 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Door uses one break shape (unclosed string with preserved line boundaries). Missing-brace and truncated-return variants were probed; missing-brace shifted line spans and is not pinned.
- Decoy stale replay is measured, not fixed. A valid 0.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether parse-broken fail-close holds when boundaries themselves are destroyed (not just interior syntax), probe a break that removes the closing brace and shifts the stored end line. Do not retune the door to force recall 1 on that variant.
