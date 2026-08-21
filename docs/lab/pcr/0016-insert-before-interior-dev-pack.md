# PCR 0016 — insert-before interior door pack

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (insert-before-interior-dev-pack)
- Branch / PR: `cursor/lab-insert-before-interior-2dcb` ([PR #10](https://github.com/felipebasurto/freshctx/pull/10))
- Base SHA: `460224308cab148154f138a479918aae9e7fa6c0` (main after PR 9 squash, PCR 0015)
- Freeze commit: `4ae5092e197c41fa860b63bc01427fb20d74699d`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `insert-before-interior-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

After unique lines are inserted above a tracked region and one interior line of that region changes, does the door already on main resolve via `structural-anchors-with-boundaries` with recall 1 / exact 1, and still fail-close on a clean trailing last-boundary decoy and on Codex renamed-header+insert?

PCR 0015 happy resolved via `exact` because the body bytes did not change. This pack turns exact off. It does not change the door.

## What we did

1. Registered pack `insert-before-interior-dev-v0.1` via freeze → commit → generate → run → report.
2. Wrote three traces under `bench/traces/lab/insert-before-interior-dev-v0.1/` from locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` (`go/buildutil/util.go`). Holdout traces were not copied or edited.
3. Used a subdirectory of `bench/traces/lab` so generate does not see PCR 0015 files in the same traces dir.
4. Did not edit `src/anchors.mjs` or `src/structural-consensus.mjs`.
5. Did not retune golds, weights, offsets, or accept rules.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/insert-before/parse-file-body-interior` | two unique marker lines above `ParseFile.body` (32–38) and `// lab-interior-door-c4e1` on the JoinPath line | current body bytes at the new location (SHA `bd26df43…`, differs from original `68de6d76…`) |
| decoy | `go-tools/insert-before/parse-file-body-interior-trailing-decoy` | same insert and same interior change, plus a later `\t}` in `labInteriorDecoy` | same 7-line window as door. Region closer was not rewritten |
| Codex | `go-tools/insert-before/parse-file-renamed-header-interior` | insert above `func ParseFile`, rename to `ParseFileSnapshot` | oracle fallback to the original 31–44 window after the first line disappears |

## Measured cells

`freshctx-region` on `insert-before-interior-dev-v0.1` after freeze commit `4ae5092`.

| cell | recall | exact | stale | dup | method | proj bytes |
|---|---:|---:|---:|---:|---|---:|
| door | 1 | 1 | 0 | 0 | `boundary-anchors` | 561 |
| decoy | 1 | 1 | 0 | 0 | `boundary-anchors` | 561 |
| Codex | 0 | 0 | 0 | 0 | unresolved | 164 |

Door resolved. Exact could not win. The live unit is the relocated 7-line body with the JoinPath comment and without the insert markers. Method is `boundary-anchors`, not `structural-anchors-with-boundaries`. `resolveRegion` ranks first+last pairs by span, then location. The first line `\tif !IsAbsPath(ctxt, file) {` is unique. The historical 7-line closer wins on `spanDelta` before any later `\t}`. The structural door runs only when no pair exists or the top two pairs tie. This cell never reached that branch.

Decoy resolved the same way. Same payload SHA as door (`b1e1fbbd…`). The live block does not include `labInteriorDecoy`. Projection did not stretch. Fail-closed is false for this clean decoy. PCR 0015 decoy stay unresolved because that cell also rewrote the region's own closer, so the historical-span pair was gone.

Codex stayed unresolved. Empty live block, 164 bytes, same class as PCR 0015 Codex and holdout delete cells.

The pre-run hypothesis is discarded. The door cell is not 0. It did not resolve via `structural-anchors-with-boundaries`. The clean decoy did not fail-close. Codex fail-closed as predicted.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007, PCR 0008, PCR 0013, PCR 0015 artifacts, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **91/91** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/insert-before-interior-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008/0013/0015, `src/anchors.mjs`, `src/structural-consensus.mjs` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `6380334399d866356a6b92000e3aed5f2f0190ad4c71df916124b2ff434505af`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison. PCR 0015 remains frozen history.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Unique first line plus span ranking already selects the historical closer. The structural door is not on this path.
- A clean later `\t}` is not enough to make the top two pairs tie, so decoy fail-close does not trigger.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether `structural-anchors-with-boundaries` can fire on real go-tools bytes, the cell must make the top two first+last pairs tie, or remove the historical-span pair without restoring exact bytes. Do not retune the door to force that cell to 1.
