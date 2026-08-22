# PCR 0027 — move-lookalike development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (move-lookalike-dev-pack)
- Branch / PR: `cursor/move-lookalike-dev-aa32`
- Base SHA: `d99fe15c7886ed48023e77078986da338d3702ed` (main after PCR 0025 history-only doc)
- Freeze commit: `17b1a377a1655947bf5b3108f8344fa714e38e94`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `move-lookalike-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`. Frozen door. Measurement only.

## Hypothesis or change

PCR 0023 could not ship a first+last lookalike decoy at the old struct slot: `goldBytesForRead` in `bench/oracle.mjs` uses unique first-line (`Name`) then falls back to stored lines 29–36, so a leftover `Name`+`Ord` at the old slot makes the independent oracle pin the lookalike SHA and the trace runner fail-closes. PCR 0023 used a full duplicate instead.

This pack ships that omitted decoy with lab-local gold pinning (same idea as PCR 0022 `delete-unit-fail-close-lab.mjs`): second-capture gold is the relocated eight-line `Benchmark.fields` bytes (SHA `4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7`) even when `Name` appears twice.

Question: after move-out + move-in, does production recover the relocated 8-line block, fail-close, or emit the 2-line lookalike at the stored start?

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Did not `--relock`.
2. Cloned PCR 0023 geometry in `bench/move-lookalike-lab.mjs` with decoy mutation `lookalike-at-old` (Name+Ord only, not full duplicate).
3. Lab-local gold pin on decoy second capture; shared `bench/oracle.mjs` unchanged.
4. Registered pack `move-lookalike-dev-v0.1` via freeze → commit → generate → run → report.
5. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
6. Did not rewrite holdout v0.1, PCR 0023 frozen hashes, or the 20-cell board.

## Language-generic invariant

Locked go-tools `parse.go` is only the fixture. No Go parser, treesitter, identifier/keyword tables, or language-specific selectors were added. Door, oracle, and lab gold stay byte/line generic: first/last meaningful lines, span, location, exact bytes. A leftover first+last after move, or two tied first×last copies, must be the same problem in JS/Python/Rust as in Go.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/move-lookalike/benchmark-fields` | cut fields from struct; insert before `Set` godoc | relocated eight-line block (SHA `4e8c2b5c…`) |
| decoy | `go-tools/move-lookalike/benchmark-fields-lookalike-decoy` | same move, plus Name+Ord only at old struct slot | relocated eight-line block (lab-pinned; SHA `4e8c2b5c…`) |
| Codex | `go-tools/move-lookalike/benchmark-fields-leftover-markers` | move out; markers + renamed header at old slot; insert renamed-first block before `Set` | generator-recorded post-move bytes (SHA `a7148f66…`; production unresolved) |

Decoy is NOT a full duplicate. Lookalike sits at stored start lines 29–30; lines 31–36 span struct close and following ParseLine header.

## Measured cells

`freshctx-region` on `move-lookalike-dev-v0.1` after freeze commit `17b1a37`.

| cell | recall | exact | stale | dup | method | proj bytes | lookalike in live | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|
| door | 1 | 1 | 0 | 0 | `exact` | 841 | no | `7b5675cc…` |
| decoy | 1 | 1 | 0 | 0 | `exact` | 842 | no | `f1ceef16…` |
| Codex | 0 | 0 | 0 | 0 | `unresolved` | 164 | no | `7cffff1f…` |

Door recovered the relocated eight-line block via `exact`. Stale 0.

Decoy recovered the relocated eight-line block via `exact`, not the 2-line lookalike at the stored start. Unique `Name` at the relocation site wins over the in-place first+last pair. Stale 0. `liveIncludesLookalike` false.

Codex stayed unresolved. Empty live block (164 bytes).

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board.
- No rewrite of holdout v0.1, PCR 0023 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **104/104** |
| `npm run check` | yes | 0 |  |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/move-lookalike-dev-v0.1.json` | yes | 0 | locally-frozen |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| `npm run papers:verify` | yes | 0 | manifest digest `442cd9e2…` unchanged |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `dea036a907551fc24b391bf0bcaccae31c0a48159f3cb22e4bd851346a6d3eb4`. Lab pack `resultSetHash` `0e8e84748ad64c1decc8d1e5c7c4c46de3709c0d47d0f73d41ad610c7856681f`. Hashes from `bench/packs/move-lookalike-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

PCR 0023 decoy used a full duplicate and recovered via `boundary-anchors`. This pack's lookalike decoy recovers via `exact` on the relocated unique `Name` anchor. PCR 0022 only fail-closes displaced shrink (`locationDelta > 0`); this lookalike sits at the stored start, so in-place shrink plus a later unique 8-line pair is what was measured.

## Conflicts with constitutions

none observed.

## Limitations

- Three enumerated cells. Not §5.1 sampled.
- Decoy oracle cannot declare relocated gold without lab pin; trace runner uses `runMoveLookalikeTrace` for decoy only.
- `locally-frozen` only. No remote attestation.

## Next measurement

If the next question is whether production should fail-close when a stored-start lookalike matches first+last but a unique full block exists elsewhere, that requires a door change. Do not retune the door to force a number on this decoy.
