# PCR 0023 — move-in-file development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (move-in-file-dev-pack)
- Branch / PR: `cursor/lab-move-in-file-c6b5`
- Base SHA: `c2513a3807a4d306f2a19a551f97a2e7fb8d9612` (main after PCR 0021)
- Freeze commit: `ded6fb4b3bf858f1dec954ceaafbdc0c7a2e65bf`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `move-in-file-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

After a tracked locked unit is cut from its old place and pasted elsewhere in the same file, does production recover the same bytes (interiors still present, only location changed) or fail-close? A leftover first+last at the old location, or a second full copy, must not be emitted as the moved identity. Codex leftovers must fail-close.

EVALUATION.md §5.2 names family `move-in-file`. Holdout v0.1 already has whole-file move cells on other paths. This pack does not copy or edit those traces. It measures region move on locked go-tools bytes.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Neovim was not needed. Did not `--relock`.
2. Registered pack `move-in-file-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/move-in-file-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
5. Did not rewrite PCR 0007, 0008, 0013, or 0015–0022 traces, hashes, or records.

## Probe (before freeze)

Eligible unit: `Benchmark.fields` in `benchmark/parse/parse.go` lines 29–36. First and last are unique in the locked file. SHA `4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7`.

Door move: cut the eight field lines from the struct body, insert before the `Set` godoc. After move, the unique `Name` anchor appears once at the new location. Direct `resolveRegion` accepts via `exact`. Gold is the generator-recorded relocated eight-line block (same bytes, new location).

Decoy uses a second full copy at the old struct slot (not a first+last lookalike). Lookalike was probed and rejected: when the historical first duplicates at the old slot, the independent oracle cannot declare moved gold and the trace runner fail-closes on sha mismatch. Duplicate copies share bytes with gold; production must not treat the old-slot copy as a distinct moved identity.

Codex: move out, insert unique markers plus renamed leftover struct header at the old slot, then insert a relocated block whose first line is renamed. No honest unique recovery. Expect unresolved.

Rejected as the door unit (recorded, not used):

| candidate | why ineligible as the door |
|---|---|
| `ParseLine.fn` (41–62) | last is `}`; not unique in the locked file |
| `parseMeasurement.fn` / `String.fn` / `ParseSet.fn` | last is `}` |
| `Benchmark.type` (28–37) | last is `}`; grow-inside codex already uses the type header |
| first+last lookalike decoy | independent oracle cannot pin post-move gold when `Name` duplicates; trace sha validation fails |

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/move-in-file/benchmark-fields` | cut fields from struct; insert before `Set` godoc | relocated eight-line block (SHA `4e8c2b5c…`) |
| decoy | `go-tools/move-in-file/benchmark-fields-duplicate-decoy` | same move, plus a second full copy left in the struct body | same relocated gold as door |
| Codex | `go-tools/move-in-file/benchmark-fields-leftover-markers` | move out; markers + renamed header at old slot; insert renamed-first block before `Set` | generator-recorded post-move bytes (SHA `a7148f66…`; production unresolved) |

Gold is generator-recorded post-move unit bytes from the trace builder oracle path. Last-known line-29..36 bytes are not pinned when the unit relocates.

## Measured cells

`freshctx-region` on `move-in-file-dev-v0.1` after freeze commit `ded6fb4`.

| cell | recall | exact | stale | dup | method | proj bytes | lookalike in live | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|
| door | 1 | 1 | 0 | 0 | `exact` | 841 | no | `7b5675cc…` |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 851 | no | `a1c3cfde…` |
| Codex | 0 | 0 | 0 | 0 | `unresolved` | 164 | no | `7cffff1f…` |

Door recovered the relocated eight-line block via `exact`. Stale 0. Same bytes at a new location.

Decoy did not stretch onto the old-slot duplicate. Method is `boundary-anchors`; live block matches relocated gold. Stale 0.

Codex stayed unresolved. Empty live block (164 bytes). Renamed-first relocation plus leftover markers/header at the old slot fail-closed as required.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007 / 0008 / 0013 / 0015–0022 artifacts, or `bench/traces/holdout/`.
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
| `npm run holdout:verify -- --manifest=bench/splits/move-in-file-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015–0022, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `e85efaec8011c5ce32f2750e311fb22e1bc0970df2c86622568dee8a750b046c`. Lab pack `resultSetHash` `b0691f1dae8eca26ede184bf5cc4f48d8fc69cc319af7e3b85546869c9773274`. Hashes are from `bench/packs/move-in-file-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015–0022 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.
- Decoy uses a second full copy, not a first+last lookalike, because the lookalike breaks independent-oracle gold declaration for relocated units.
- Identical byte content at old and new slots makes duplicate-vs-moved discrimination a boundary-ranking question only; both copies share SHA `4e8c2b5c…`.

## Next measurement

If the next question is whether a first+last lookalike at the old slot should fail-close after move when the relocated block is unique, that requires either oracle support for relocated gold or a door change. Do not retune the door to force a 0 on the current duplicate decoy.
