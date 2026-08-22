# PCR 0040 — empty envelope without boilerplate prose

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0040-empty-render-no-boilerplate-e1c2`
- Commit: `5205635`
- Merge-base vs PCR 0039 squash (`1c14fdb9`): `1c14fdb92bc4e8bee42e676bddf956f687b1d895`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-holdout`; `holdout-adapter-bakeoff`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

On holdout delete cells, `freshctx-region` (and `hermes-fresh`) emitted **164** bytes: the empty envelope plus the prose sentence *"The following code is the current workspace state. Historical read markers refer here."* CORVUS delete cells are **68** (go-tools) and **73** (neovim) because it omits missing files and has no that sentence.

This PCR is a **product change**, not a door change: when `renderOrder.length === 0`, `projectContext` omits the boilerplate sentence but keeps the `<freshctx …>` header counts and `</freshctx>` so fail-closed stays visible (`unresolved=1`, `selected=0`, no unit body). No last-known bytes are served.

**Hypothesis verified:** delete-cell projection-bytes dropped from 164 toward corvus-file; the other 8 holdout cells held stale-bytes 0 and required-recall 1.000; hermes-fresh still matches region on stale/recall/bytes.

## What we did

- Edited `src/projector.mjs` only (core): skip boilerplate prose when `renderOrder.length === 0`.
- Added unit test in `test/policy.test.mjs` asserting header+close without prose (78 bytes).
- Refreshed [`bench/reports/holdout-adapter-bakeoff.md`](../../../bench/reports/holdout-adapter-bakeoff.md) from live `ctxbench:holdout-adapter-bakeoff` run.
- Did **not** edit `src/anchors.mjs`, holdout v0.1 traces/gold, `bench/repos.lock.json`, `bench/hosts.lock.json`, benchmark weights, or door state.
- Did **not** truncate \(C_t\), add desync, or set `FRESHCTX_CAPTURE_OK`.

## Host lock SHAs (unchanged)

| host | commit |
|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` |
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` |

Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6`.  
`bench/repos.lock.json` blob unchanged (`79e29d09…` / sha256 `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **138/138** (116 pass, 22 skip host-clone-free) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:holdout-adapter-bakeoff` | yes | 0 | 70 records; delete cells 78 vs corvus 68/73 |

## Delete cells vs corvus-file (projection-bytes)

| repo | family | before (PCR 0039) | after (region) | corvus-file | delta vs corvus |
|---|---|---|---|---|---|
| go-tools | delete | 164 | 78 | 68 | +10 |
| neovim | delete | 164 | 78 | 73 | +5 |

## Other 8 cells vs PCR 0039 region

| check | result |
|---|---|
| stale-bytes | held — all 8 cells 0 |
| required-recall | held — all 8 cells 1.000 |
| projection-bytes (non-delete) | unchanged vs PCR 0039 |
| hermes-fresh vs region | matched on stale/recall/bytes (10 cells) |

## Limitations

- Empty envelope (78 bytes) still exceeds corvus-file delete framing (68/73) due to FreshCtx attribute header vs `[corvus-file …]` serialization.
- Publishable table only; not a SOTA or performance claim.
- `hermes-native` still replayed from PCR 0032 when host checkout absent.
- Holdout window does not trigger Hermes compress.
- `resultSetHash` null; holdout traces/gold untouched.

## Protocol gap?

**No.** Product rendering change on existing holdout v0.1 traces under candidate label; no seal state change.

## Next measurement

Whether a shorter empty-envelope attribute surface can close the remaining 5–10 byte gap vs corvus-file delete cells without weakening fail-closed visibility.
