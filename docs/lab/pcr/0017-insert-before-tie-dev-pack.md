# PCR 0017 — insert-before structural-tie pack

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (insert-before-tie-dev-pack)
- Branch / PR: `cursor/insert-before-structural-tie-e30e` ([PR #11](https://github.com/felipebasurto/freshctx/pull/11))
- Base SHA: `19f7bbbec5db462cf768e212605e4d5b14ffbf33` (main after PR 10 squash, PCR 0016)
- Freeze commit: `a1c5a0b21244efe28878f961eeb0453e8da0caee`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `insert-before-tie-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

When cheap first+last proofs cannot uniquely pick a pair, does the door already on main resolve via `structural-anchors-with-boundaries` with recall 1 / exact 1, and still fail-close (no stretch) on a competing last-boundary and on Codex renamed-header+insert?

PCR 0016 door resolved via `boundary-anchors` because the first line was unique and the historical 7-line span won. This pack forces the missing-or-tie branch. It does not change the door.

## What we did

1. Probed locked `ParseFile.body` (32–38) on go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Did not freeze until `resolveRegion` entered the structural branch.
2. Registered pack `insert-before-tie-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/insert-before-tie-dev-v0.1/` from locked `go/buildutil/util.go`. Holdout traces were not copied or edited.
4. Did not edit `src/anchors.mjs` or `src/structural-consensus.mjs`.
5. Did not rewrite PCR 0015 or PCR 0016 traces, hashes, or records.

## Probe (before freeze)

Control (PCR 0016 mutation) stayed `boundary-anchors`. Unique first line. Historical spanDelta 0 won.

A first-boundary copy at original line 30 did not tie. Real pair kept spanDelta 0. Competing pair had spanDelta 1.

A 7-line competing first+last pair inserted immediately before

`// components are joined using JoinPath; dir must be absolute.`

plus the JoinPath interior comment produced the tie.

| pair | startLine | span | spanDelta | locationDelta |
|---|---:|---:|---:|---:|
| competing | 25 | 7 | 0 | 7 |
| real body | 39 | 7 | 0 | 7 |

`resolveRegion` then returned `ambiguous-boundary-anchors`. Direct `resolveRegionByStructuralConsensus` returned `offset-shift-without-boundaries`. Interior unique survivors were still 2 (`rd, err := OpenFile` and `return nil, err`). The reject is the later `}` lines. At the inferred start, `currentBoundaryPairs` contains one pair per later closer, so `matchingBoundaries.length !== 1`.

Removing the historical closer also entered the branch and fail-closed the same way. That fixture was not used. The competing-pair insert keeps the real 7-span pair in the file.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/insert-before/parse-file-body-tie` | competing 7-line first+last pair before the components comment, plus `// lab-tie-interior-e30e` on JoinPath | oracle fallback to current lines 32–38 (first line is now duplicated). SHA `57821045…`, not the original body `68de6d76…` |
| decoy | `go-tools/insert-before/parse-file-body-tie-trailing-decoy` | same, plus a later `\t}` in `labTieDecoy` | same fallback SHA as door |
| Codex | `go-tools/insert-before/parse-file-renamed-header-tie` | insert above `func ParseFile`, rename to `ParseFileSnapshot` | original 31–44 window after the first line disappears |

## Measured cells

`freshctx-region` on `insert-before-tie-dev-v0.1` after freeze commit `a1c5a0b`.

| cell | recall | exact | stale | dup | method | proj bytes | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|
| door | 0 | 0 | 0 | 0 | unresolved | 164 | `887b57a2…` |
| decoy | 0 | 0 | 0 | 0 | unresolved | 164 | `887b57a2…` |
| Codex | 0 | 0 | 0 | 0 | unresolved | 164 | `d7332ce2…` |

Door entered the structural branch and fail-closed. Payload method is `unresolved`, not `structural-anchors-with-boundaries`. Production method on the resolver is `ambiguous-boundary-anchors`. 164 bytes is the empty live block, same class as PCR 0015/0016 Codex and holdout delete cells. Valid 0.

Decoy used the same empty payload as door. The live block does not include `labTieDecoy`. No stretch.

Codex stayed unresolved. Empty live block.

The pre-run hypothesis that the door accepts the real body via `structural-anchors-with-boundaries` with recall 1 / exact 1 is discarded. The tie branch is reachable on real go-tools bytes. Accept still fails because last is `}` and later closers keep more than one pair at the inferred start.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007/0008/0013/0015/0016 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **92/92** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null |
| `npm run holdout:verify -- --manifest=bench/splits/insert-before-tie-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015/0016, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `26e135a51801d8897ee1cb27c19292796ffff4b1ff765ff61b2315e6e40bf0ab`. Lab pack `resultSetHash` `467f095b9d1296a9560172a2844252785701ab4ddd648a1395ccb1375dfca6ff`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015 and PCR 0016 remain frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- The independent oracle follows a unique first line. Duplicating that line makes gold fall back to lines 32–38, which are comments after the insert. Recall 0 is still correct because nothing was projected.
- Last boundary `}` is common after `ParseFile.body`. The door's unique-pair check cannot fire on this region without deleting or rewriting later closers. That would not be insert-before.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether `structural-anchors-with-boundaries` can *accept* on real bytes, pick a region whose last boundary is unique after the inferred start, or review whether `currentBoundaryPairs` should be the tied pairs only. That second option is a door change. Do not retune the door to force this cell to 1.
