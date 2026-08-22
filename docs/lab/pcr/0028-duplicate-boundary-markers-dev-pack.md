# PCR 0028 — duplicate-boundary-markers development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (duplicate-boundary-markers-dev-pack)
- Branch / PR: `cursor/duplicate-boundary-markers-dev-pack-38d8`
- Base SHA: `948840f4d334f567e31eea54cd7a9af019e1b399` (main after PCR 0027 squash)
- Freeze commit: `6fecbb101f5f276080a273ed15f5c20cf97ba905`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `duplicate-boundary-markers-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

On the PCR 0024 tied first×last pair (`Benchmark.fields` copies at spanDelta 0 / locationDelta 9), does inserting gap-markers plus a single type-header rename break the tie and let production accept one copy? PCR 0024 Codex shipped rename-only and stayed unresolved; the combined mutation was already coded as unused `gap-markers` in `bench/duplicate-boundary-lab.mjs` and was omitted to preserve fail-close.

This pack ships that omitted combo. Frozen door. Measurement only. No retune of the door on main.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Neovim was not needed. Did not `--relock`.
2. Registered pack `duplicate-boundary-markers-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/duplicate-boundary-markers-dev-v0.1/` from locked `benchmark/parse/parse.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
5. Did not rewrite PCR 0024 frozen artifacts, hashes, or records.

## Probe (before freeze)

`npm run repos:fetch:holdout` honored the existing lock. Lock sha256 stayed `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.

Eligible unit: `Benchmark.fields` lines 29–36. First (`Name …`) and last (`Ord …`) each appear once on locked bytes. Line count 8. SHA `4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7`.

Door geometry (0024 control): strip const+struct fields → gap; insert symmetric copies. Ranking sees tied pairs at spanDelta 0 / locationDelta 9. Production fail-closes.

Decoy adds `gap-markers` only (`MARKER_ALPHA` / `MARKER_BETA` before `GAP_FIRST`). Production accepts copy A at start line 20 via `boundary-anchors`.

Codex adds `gap-markers` + `rename-type-once` (single `type Benchmark struct {` → `BenchmarkSnapshot`). This is the 0024 omitted combo. Production also accepts copy A at start line 20 via `boundary-anchors`.

**Gold choices:**

| cell | second capture gold |
|---|---|
| door | empty required set (ambiguous; control) |
| decoy | pinned unit SHA `4e8c2b5c…` (production accepts copy A) |
| Codex | pinned unit SHA `4e8c2b5c…` (production accepts copy A) |

Decoy and Codex use generator-recorded copy-A bytes for second-capture gold. The independent oracle at stored span 29–36 resolves gap-marker bytes after mutation; the lab runner overrides gold to the accepted copy bytes so recall/exact are honest against production output.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/duplicate-boundary/benchmark-fields` | strip const+struct → gap; insert symmetric copies | first capture SHA `4e8c2b5c…`; second capture **empty required set** |
| decoy | `go-tools/duplicate-boundary/benchmark-fields-gap-markers` | door + `gap-markers` only | first capture SHA `4e8c2b5c…`; second capture SHA `4e8c2b5c…` |
| Codex | `go-tools/duplicate-boundary/benchmark-fields-markers-rename` | door + `gap-markers` + `rename-type-once` | first capture SHA `4e8c2b5c…`; second capture SHA `4e8c2b5c…` |

## Measured cells

`freshctx-region` on `duplicate-boundary-markers-dev-v0.1` after freeze commit `6fecbb1`.

| cell | recall | exact | stale | dup | method | proj bytes | accepted copy | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|
| door | 1 | 0 | 0 | 0 | `unresolved` | 164 | — | `7cffff1f…` |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 851 | copy A, line 20 | `f0da86b1…` |
| Codex | 1 | 1 | 0 | 0 | `boundary-anchors` | 851 | copy A, line 20 | `f0da86b1…` |

Door fail-closes as 0024 control. Empty live block (164-byte shell).

Decoy: gap-markers alone break the tied pair. Production accepts copy A (before-const placement). Not copy B (after-struct-close).

Codex: the 0024 omitted combo also breaks the tie and accepts copy A at line 20. Rename-only (0024 Codex) stayed unresolved; gap-markers are necessary for tie-break under the frozen door.

## Language-generic confirmation

Locked go-tools `parse.go` is fixture bytes only. No Go parser, treesitter, identifier/keyword tables, or language-specific selectors were added. Door, oracle, and lab gold stay byte/line generic: first/last meaningful lines, span, location, exact bytes. The leftover first+last after move and two tied first×last copies are the same ambiguity class in JS/Python/Rust as in Go.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 holdout board projection bytes.
- No rewrite of `holdout.md`, PCR 0007 / 0008 / 0013 / 0015–0027 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **105/105** |
| `npm run check` | yes | 0 |  |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/duplicate-boundary-markers-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| `npm run papers:verify` | yes | 0 | manifest digest `442cd9e2…` unchanged |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `227eaa3f2c5c7b7d1f36243a240117998c744d146813107bf4d5c93d62232e8c`. Lab pack `resultSetHash` `6c816ba9cc0a975534d9ada995a6b43f3bc1e26830f31de0612dd0a8026b9584`. Both 64-hex values are from `bench/packs/duplicate-boundary-markers-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

PCR 0024 (rename-only Codex, all three cells unresolved) vs PCR 0028 (gap-markers decoy and gap-markers+rename Codex accept copy A). Door control matches 0024 fail-close.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Gap-markers break the tie for production but not for the independent oracle at stored span 29–36; decoy/Codex second-capture gold uses lab-runner copy-A override for honest metrics.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.
- Both accepting cells pick copy A (before-const placement), not copy B.

## Next measurement

If a later question needs to measure which copy wins when markers favor copy B, that requires a different mutation geometry. Do not retune the door to force silence or acceptance.
