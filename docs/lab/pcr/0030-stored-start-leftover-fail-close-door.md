# PCR 0030 — stored-start leftover fail-close door change

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (pcr-0030-stored-start-leftover-fail-close)
- Branch / PR: `cursor/pcr-0030-stored-start-leftover-fail-close-a8e9`
- Base SHA: `898510e32a5670cd31aebd1b8f3a61a88e89efa3` (PCR 0029 draft head)
- Freeze commit: `84b09c409fb6de5bfc6ae40e7693c7e2d0d3e750`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `stored-start-leftover-fail-close-dev`
- Door SHA (`src/anchors.mjs`): post-fix on branch

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

PCR 0022 fail-closes displaced shrunk first+last pairs (`locationDelta > 0`). A leftover first+last pair that stays at the recorded `startLine` (`locationDelta === 0`) still matched `boundary-anchors` when interiors were deleted, because span shrink at the stored start looked like in-place shrink.

Hypothesis: when `locationDelta === 0` and `span < lineCount`, accept only if the candidate bytes are a contiguous prefix of previous (real trailing shrink). If first+last remain but skipped interiors make the span a non-prefix lookalike, fail-close.

## Door change

In `resolveRegion` (`src/anchors.mjs`), after the PCR 0022 displaced gate and before returning `boundary-anchors`:

When `span < lineCount`, `locationDelta === 0`, and `startLine` is known, require the candidate slice to be a contiguous prefix of `previousContent`. Otherwise return `displaced-shrunk-boundary-anchors` (unresolved).

PCR 0022 unchanged: `locationDelta > 0` with span shrink still unresolved. PCR 0029 grow/shrink exact-decoy gates unchanged.

Language-generic: first/last/span/location/exact bytes/contiguous prefix only. Locked go-tools `parse.go` is fixture bytes. No parser or language selectors.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49`. Did not `--relock`.
2. Implemented stored-start non-prefix shrink gate in `src/anchors.mjs`.
3. Added regression tests in `test/anchors.test.mjs` and `test/stored-start-leftover-fail-close-lab.test.mjs`.
4. Registered pack `stored-start-leftover-fail-close-dev-v0.1` via freeze → commit → generate → run → report.
5. Did not change shared `bench/oracle.mjs`, holdout v0.1, or PCR 0029 frozen hashes.

## Language-generic invariant

Locked go-tools `parse.go` is only the fixture. No Go parser, treesitter, keyword tables, or language-specific selectors were added. Door and lab gold stay byte/line generic.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/stored-start-leftover/benchmark-fields-interior-delete` | delete interiors; Name+Ord stay at stored start; no distant exact | absence; expect unresolved |
| decoy | `go-tools/stored-start-leftover/benchmark-fields-prefix-shrink` | shrink to 6-line contiguous prefix + plant exact previous before ParseLine | generator-pinned prefix bytes |
| Codex | `go-tools/stored-start-leftover/benchmark-fields-displaced-lookalike` | delete unit + insert displaced Name+Ord lookalike (0022 geometry) | absence; expect unresolved |

## Measured cells

`freshctx-region` on `stored-start-leftover-fail-close-dev-v0.1` after run commit `6fee605`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 0 | 0 | 0 | `unresolved` | 164 | `7cffff1f…` |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 718 | `0c641112…` |
| Codex | 1 | 0 | 0 | 0 | `unresolved` | 164 | `7cffff1f…` |

Door fail-closed on stored-start Name+Ord leftover. Decoy accepted current prefix bytes (did not replay planted exact). Codex displaced lookalike stayed unresolved.

## Regression checks (must not regress)

| check | result |
|---|---|
| PCR 0022 displaced+shrunk leftover (`test/anchors.test.mjs`) | pass — `displaced-shrunk-boundary-anchors` unresolved |
| PCR 0026 parse-broken decoy (`test/parse-broken-lab.test.mjs`) | pass — `boundary-anchors`, stale 0 |
| PCR 0027 move-lookalike decoy (`test/move-lookalike-lab.test.mjs`) | pass — `exact` on relocated block |
| PCR 0029 grow/shrink exact-decoy (`test/grow-shrink-exact-decoy-lab.test.mjs`) | pass — door/decoy `boundary-anchors`, Codex `exact` |
| Real contiguous-prefix shrink (`test/anchors.test.mjs`) | pass — `boundary-anchors` via exact-decoy gate |
| Relocated exact over non-prefix lookalike (`test/anchors.test.mjs`) | pass — `exact` wins |

## Explicit non-goals

- No rewrite of holdout v0.1, PCR 0029 artifacts, or the 20-cell board.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag. No PCR 0031.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **110/110** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null |
| `npm run holdout:verify -- --manifest=bench/splits/stored-start-leftover-fail-close-dev-v0.1.json` | yes | 0 | locally-frozen |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `696f760b4cea0701acd31bf619eeac67efe6cee659fc0ac3e21421a5ccf6ab8e`. Lab pack `resultSetHash` `27fae8489c9393b1e6a9c730416660a38d9ba3833c277596786a066f17df6d47`. Hashes from `bench/packs/stored-start-leftover-fail-close-dev-v0.1/state.json`.

## Conflicts with constitutions

none observed.

## Limitations

- Three enumerated cells. Not §5.1 sampled.
- Decoy uses lab-local prefix gold pin plus planted exact (same pattern as PCR 0029 decoy) because trailing-prefix shrink drops the original last boundary line.
- PCR 0022 shrink cell live-runs unresolved post-fix; frozen PCR 0022 pack hashes unchanged (historical stretch control).
- `locally-frozen` only. No remote attestation.

## Next measurement

If the next question is whether a stored-start prefix shrink without any planted exact copy should resolve through the non-exact boundary path, probe that as a separate cell. Do not retune the door to force a number on that variant.
