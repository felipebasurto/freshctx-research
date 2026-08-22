# PCR 0029 — grow-shrink exact-decoy door change

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (pcr-0029-grow-shrink-exact-decoy)
- Branch / PR: `cursor/pcr-0029-grow-shrink-exact-decoy-c2af`
- Base SHA: `43c98b143d7b0b0400553f46763f17017f2a515a` (main after PCR 0028)
- Freeze commit: `90ec3ee67ced11b631b69aea2c41598147c3dd92`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `grow-shrink-exact-decoy-dev`
- Door SHA (`src/anchors.mjs`): post-fix on branch

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`.

## Hypothesis or change

PCR 0026 fixed interior-break + distant exact decoy when first+last still matched at the old stored span. When a tracked unit **grows or shrinks in place** at the stored start, `boundariesMatchAtStoredStart` no longer holds (last moved off the old end), so a unique exact copy of the previous bytes elsewhere still won via `exact` and replayed stale previous bytes.

Hypothesis: skip distant `exact` when first still matches at stored start and the stored-start bytes are (a) a contiguous prefix shrink, or (b) a prefix-plus-tail grow ending at a later last, while rejecting non-prefix first+last lookalikes (PCR 0027 geometry).

## Door change

In `resolveRegion` (`src/anchors.mjs`), before returning distant `exact`:

1. If first+last still match at the old stored span → fall through (PCR 0026 unchanged).
2. Else if a non-prefix lookalike (first+last at stored start, span `< lineCount`, not a contiguous prefix) → keep `exact` (PCR 0027 unchanged).
3. Else if in-place grow (contiguous prefix at start, later last, grown span excludes embedded full previous) → resolve current grown bytes via `boundary-anchors`.
4. Else if in-place shrink to contiguous prefix → resolve current prefix bytes via `boundary-anchors`.

Language-generic: first/last/span/location/exact bytes/contiguous prefix only. Locked go-tools `parse.go` is fixture bytes. No parser or language selectors.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49`. Did not `--relock`.
2. Implemented grow/shrink exact-decoy gate in `src/anchors.mjs` (reuses prefix-stable logic pattern from boundary-anchor crop).
3. Added regression tests in `test/anchors.test.mjs` and `test/grow-shrink-exact-decoy-lab.test.mjs`.
4. Registered pack `grow-shrink-exact-decoy-dev-v0.1` via freeze → commit → generate → run → report.
5. Did not change shared `bench/oracle.mjs`, holdout v0.1, or PCR 0028 frozen hashes.

## Language-generic invariant

Locked go-tools `parse.go` is only the fixture. No Go parser, treesitter, keyword tables, or language-specific selectors were added. Door and lab gold stay byte/line generic.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/grow-shrink-exact/benchmark-fields-grow-decoy` | insert inside stored span + plant exact previous before `Set` | generator-pinned grown bytes |
| decoy | `go-tools/grow-shrink-exact/benchmark-fields-shrink-decoy` | shrink to 6-line contiguous prefix + plant exact previous before `Set` | generator-pinned prefix bytes |
| Codex | `go-tools/grow-shrink-exact/benchmark-fields-lookalike-relocated` | move-out + Name+Ord lookalike at old slot + move-in full block | relocated eight-line block (SHA `4e8c2b5c…`) |

## Measured cells

`freshctx-region` on `grow-shrink-exact-decoy-dev-v0.1` after run commit `bbbdbcd`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 1 | 1 | 0 | 0 | `boundary-anchors` | 950 | `d9d5e4f0…` |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 718 | `0c641112…` |
| Codex | 1 | 1 | 0 | 0 | `exact` | 842 | `f1ceef16…` |

Door and decoy accepted current in-place grown/shrunk bytes; did not replay planted exact copies. Codex recovered relocated block via `exact`; lookalike did not win.

## Regression checks (must not regress)

| check | result |
|---|---|
| PCR 0026 parse-broken decoy (`test/parse-broken-lab.test.mjs`) | pass — `boundary-anchors`, stale 0 |
| PCR 0027 move-lookalike decoy (`test/move-lookalike-lab.test.mjs`) | pass — `exact` on relocated block |
| PCR 0022 displaced+shrunk leftover (`test/anchors.test.mjs`) | pass — `displaced-shrunk-boundary-anchors` unresolved |
| Unique move, no leftover first at old start (`test/anchors.test.mjs`) | pass — `exact` relocation |

## Explicit non-goals

- No rewrite of holdout v0.1, PCR 0028 artifacts, or the 20-cell board.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag. No PCR 0030.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **109/109** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null |
| `npm run holdout:verify -- --manifest=bench/splits/grow-shrink-exact-decoy-dev-v0.1.json` | yes | 0 | locally-frozen |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `6d0b758d48bb2cbeb9a59f333024a44cd523a25e98a13fadeef37a35a72d27d6`. Lab pack `resultSetHash` `67c6d2e8745777eeadd480baf0dbd43458952987c5bc58787961e7fb5400d4bb`. Hashes from `bench/packs/grow-shrink-exact-decoy-dev-v0.1/state.json`.

## Conflicts with constitutions

none observed.

## Limitations

- Three enumerated cells. Not §5.1 sampled.
- Grow/shrink gate uses contiguous-prefix and later-last heuristics; ambiguous multi-last interiors remain edge cases.
- `locally-frozen` only. No remote attestation.

## Next measurement

If the next question is whether production should fail-close when a stored-start prefix shrink and a planted exact copy tie on span, probe a decoy with two equally-scored boundary pairs. Do not retune the door to force a number on that variant.
