# PCR 0015 — insert-before development pack

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (insert-before-dev-pack)
- Branch / PR: `cursor/lab-insert-before-pack-4510` ([PR #9](https://github.com/felipebasurto/freshctx/pull/9))
- Base SHA: `31d624c8b485a35ce6788c9d4b3b1075ee80635c` (main after PR 8 squash)
- Freeze commit: `ba28966d73300ca3c42ef4ccc2b272864b62f044`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `insert-before-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2.

## Hypothesis or change

Measure whether the offset-shift accept path already on main (unique current first+last boundary pair, independent interior consensus ≥2, enclosure, last boundary at the historical relative endpoint) resolves a real insert-before on locked go-tools bytes, and fail-closes on the two known traps. EVALUATION §5.2 already names family `insert-before`. The frozen 20-cell holdout v0.1 board has no insert-before traces.

This PCR records the pack run. It does not change holdout v0.1 or the door.

## What we did

1. Registered pack `insert-before-dev-v0.1` via freeze → commit → generate → run → report.
2. Wrote three traces under `bench/traces/lab/` from locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` (`go/buildutil/util.go`). Holdout traces were not copied or edited.
3. Allowed `bench/traces/lab` in `scanLegacySealedReports` so the pack is not forced into `bench/traces/holdout/`.
4. Did not edit `src/anchors.mjs` or `src/structural-consensus.mjs`.
5. Did not retune golds, weights, offsets, or accept rules.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| happy | `go-tools/insert-before/parse-file-body` | two unique marker lines above `ParseFile.body` (32–38) | current body bytes at the new location (same SHA as the original body, `68de6d76…`) |
| decoy | `go-tools/insert-before/parse-file-body-trailing-decoy` | same insert, interior comment, changed closer, trailing `\t}` in `labDecoy` | relocated 7-line window including the changed closer |
| Codex | `go-tools/insert-before/parse-file-renamed-header` | insert above `func ParseFile`, rename to `ParseFileSnapshot` | oracle fallback to the original 31–44 window after the first line disappears |

## Measured cells

`freshctx-region` on `insert-before-dev-v0.1` after freeze commit `ba28966`.

| cell | recall | exact | stale | dup | method | proj bytes |
|---|---:|---:|---:|---:|---|---:|
| happy | 1 | 1 | 0 | 0 | `exact` | 524 |
| decoy | 0 | 0 | 0 | 0 | unresolved | 164 |
| Codex | 0 | 0 | 0 | 0 | unresolved | 164 |

Happy resolved. The resolver took unique exact previous bytes at the shifted location. It did not reach `structural-anchors-with-boundaries`. Region bytes were unchanged, so the offset-shift proofs were not exercised.

Decoy stayed unresolved (`ambiguous-boundary-anchors` on the production path; pack method `unresolved`). The projection did not stretch to the trailing closer (164 bytes is the empty live block, same size as holdout delete cells).

Codex stayed unresolved (`anchors-not-found` on the production path). Renamed header plus insert did not emit a live unit.

The pre-run hypothesis that happy would resolve via the offset-shift door is discarded. Happy resolved via `exact`. The fail-closed half of the hypothesis holds for decoy and Codex.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board (recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029).
- No rewrite of `holdout.md`, PCR 0007, PCR 0008, or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag, no NEXT-PROMPT §5.1 sampler / remote attest work.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **90/90** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/insert-before-dev-v0.1.json` | yes | 0 | locally-frozen; not sealed |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| live 20-cell `freshctx-region` (skipReportWrite) | yes | 0 | recall 20/20, exact 12/20, go-tools interior-edit 562, neovim append 1029 |
| `git diff --exit-code` on holdout traces, lock, PCR 0007/0008, `holdout.md` | yes | 0 | clean |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `e40b64cc9a89c5d9322d6c8d430f204473dbaeb79ebe5ffe006c410138e5935f`.

## Comparison

None. This is a new family measurement, not a CORVUS or holdout-board comparison.

## Conflicts with constitutions

none observed. The pack is labeled development, not a sealed public result.

## Limitations

- Happy never entered the offset-shift door. A later cell that also edits interior bytes would be required to measure `structural-anchors-with-boundaries` on real go-tools text.
- Codex gold uses the oracle's original line window after the header disappears. Recall 0 is fail-closed, not a statement that the gold window equals the renamed function.
- Three enumerated cells. Not §5.1 sampled. Not 50 units per family.
- `locally-frozen` only. No remote freeze attestation.

## Next measurement

If the next question is whether the offset-shift proofs hold on real bytes, add one cell that inserts unique lines and also changes an interior token so `exact` cannot short-circuit. Keep decoy and Codex as fail-closed controls. Do not retune the door to force that cell to 1.
