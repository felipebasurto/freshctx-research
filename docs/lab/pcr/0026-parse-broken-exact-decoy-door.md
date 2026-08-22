# PCR 0026 — parse-broken exact-decoy door change

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (pcr-0026-exact-decoy)
- Branch / PR: `cursor/pcr-0026-exact-decoy-83c8`
- Base SHA: `68dd5c53b8e0f0e0e0e0e0e0e0e0e0e0e0e0e0e0` (main after PCR 0022 squash; verify with `git rev-parse 68dd5c53`)
- Freeze commit: `21e98676afbc41b06a972eec1ca39338537ad1aa`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `parse-broken-dev`
- Door SHA (`src/anchors.mjs`): `33f21b74a3c6e595a66c4f35b662b883f60cbd7b`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

PCR 0025 (draft PR 17, not merged) measured that when a tracked unit gets an interior syntax break and a later healthy copy of the original bytes also exists, production served last-known healthy bytes via method `exact` (stale). When the same break exists with no later copy, production already accepted the current broken bytes via `boundary-anchors`.

Hypothesis confirmed: `resolveRegion` returned `exact` as soon as last-known bytes appeared once anywhere in the file, winning over the still-present original span even when that span was now broken.

## Door change

In `resolveRegion` (`src/anchors.mjs`), before returning `exact`:

When a single exact substring match exists at a line other than `anchors.startLine`, the stored span differs from `previousContent`, and first/last boundary lines still match at the stored start, skip `exact` and fall through to boundary anchors.

A later identical copy must not steal identity from the stored region. Relocation (boundaries moved with content) still uses `exact`. PCR 0022 displaced-shrunk fail-close is unchanged.

`src/structural-consensus.mjs` unchanged.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49`. Did not `--relock`.
2. Implemented the exact-decoy gate above in `src/anchors.mjs`.
3. Added regression tests in `test/anchors.test.mjs` and `test/parse-broken-lab.test.mjs`.
4. Registered pack `parse-broken-dev-v0.1` via freeze → commit → generate → run → report.
5. Did **not** rewrite PCR 0025 artifacts on draft PR 17 or earlier PCR frozen hashes.

## Three cells (post-fix measurement)

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/parse-broken/parse-line` | unclosed string inside `ParseLine` body | broken 41–62 (SHA `2f236abb…`) |
| decoy | `go-tools/parse-broken/parse-line-lookalike-decoy` | same break, plus a later healthy `ParseLine` copy before Set | same broken gold as door |
| Codex | `go-tools/parse-broken/parse-line-markers-shift` | markers + renamed signature + same break | oracle bytes at stored span after shift |

## Measured cells

`freshctx-region` on `parse-broken-dev-v0.1` after implementation commit `21e9867`.

| cell | recall | exact | stale | dup | method | proj bytes | replayed original | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|
| door | 1 | 1 | 0 | 0 | `boundary-anchors` | 1071 | no | `128b1d6f…` |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 1071 | no | `128b1d6f…` |
| Codex | 0 | 0 | 0 | 0 | `unresolved` | 164 | no | `a8743dce…` |

Door accepted current broken bytes via boundary anchors. No stale replay.

Decoy accepted current broken bytes at the stored region. Did not replay the later healthy lookalike.

Codex fail-closed. Empty live block.

## Live re-run of frozen PCR 0025 decoy (expected science)

Re-running the PCR 0025 decoy trace shape against the post-fix door (without refreshing draft PR 17 frozen `resultSetHash`):

| | PCR 0025 frozen (draft PR 17) | live post-fix |
|---|---|---|
| method | `exact` | `boundary-anchors` |
| stale | 1 | 0 |
| proj bytes | 1045 | 1071 |
| replayed original | yes | no |

This is the intended outcome. PCR 0025 remains historical stretch measurement on draft PR 17.

## Explicit non-goals

- No rewrite of PCR 0025 draft PR 17 artifacts, hashes, or records.
- No change to score weights or holdout v0.1 fixtures.
- No seal, no v0.2, no board retune.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **101/101** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression |
| `npm run holdout:verify -- --manifest=bench/splits/parse-broken-dev-v0.1.json` | yes | 0 | locally-frozen post-fix pack |
| `npm run holdout:verify -- --manifest=bench/splits/delete-unit-fail-close-dev-v0.1.json` | yes | 0 | locally-frozen; PCR 0022 unchanged |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20 unchanged |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `c998768e6323cbe9657faaeed02652038f13d3cc72adc736e895ec7c0814cd8c`. Lab pack `resultSetHash` `458c30afdda011e144768a257028f34b4cb7ca42d162b6674fbec487699d53c7`. Both 64-hex values are from `bench/packs/parse-broken-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

PCR 0025 decoy replayed stale healthy bytes via `exact`; post-fix decoy matches door broken bytes. Codex stays unresolved. PCR 0022 delete-unit fail-close and in-place shrink controls unchanged.

## Conflicts with constitutions

none observed.

## Limitations

- Three enumerated cells. Not §5.1 sampled.
- Door uses one break shape (unclosed string with preserved line boundaries).
- Codex (markers + renamed signature + break) remains unresolved.
- `locally-frozen` only. No remote attestation.

## Next measurement

If the next question is whether parse-broken fail-close holds when boundaries themselves are destroyed (not just interior syntax), probe a break that removes the closing brace and shifts the stored end line. Do not retune the door to force recall 1 on that variant.
