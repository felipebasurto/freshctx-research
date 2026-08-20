# PCR 0006 — Region-grain Pi/Hermes adapters on smoke traces

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/region-grain-adapters-0f7d`
- Commit: `aa129b0`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `replay`

## Hypothesis or change

When Pi and Hermes replay harnesses pass smoke trace region metadata
(`scope`, `startLine`, `endLine`, `selector`) through read tool arguments and
track observed tool-result bytes at region granularity, adapter payloads match
core `freshctx-region` on `exact-current` and projection-bytes for region-gold
families.

## What we did

Extended `adapters/pi/replay.mjs` and `adapters/pi/extension.ts` to call
`trackRead` with `scope: "region"` when read tool arguments include region
metadata; whole-file reads unchanged. Extended `adapters/hermes/bridge.mjs` and
`adapters/hermes/replay.mjs` to persist and replay region metadata in bridge
state (`discoveredCalls` / `tracked`). Updated `bench/pi-trace-runner.mjs` and
`bench/hermes-trace-runner.mjs` to embed trace region fields in simulated read
tool calls and `onToolResult` input. Added adapter tests for region metadata
parsing and `exact-current` parity with core on `express/interior-edit`. Did not
retune policy. Did not change gold labels, weights, thresholds, or
`bench/repos.lock.json` commit SHAs.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **41/41** (37 prior + 4 region adapter) |
| `npm run check` | yes | 0 | includes updated adapter/replay modules |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs main |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 1 | `spawnSync git ENOENT` in cloud agent VM; lock file unchanged (see limitations) |
| `npm run ctxbench:smoke` | yes | 0 | core board unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | region-grain; matches core-region bytes |
| `npm run ctxbench:hermes-smoke` | yes | 0 | region-grain; byte-identical to Pi |

Lock SHAs (unchanged): Flask `d318b683471101618febed18996405ad26462110`,
Express `a3714473feb3d2908add734d340e7755fd85e0a3`, manifest
`4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4`.

## Metric snapshot

**Measured** `synthetic`: no delta vs PCR 0005 / main `074d887`. Score
89.107165; stale 0; one current copy; recall 1; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** Pi adapter (`npm run ctxbench:pi-smoke`). Full table:
[`bench/reports/pi-smoke.md`](../../../bench/reports/pi-smoke.md).

**Measured** Hermes adapter (`npm run ctxbench:hermes-smoke`). Full table:
[`bench/reports/hermes-smoke.md`](../../../bench/reports/hermes-smoke.md).

### Pi/Hermes vs core `freshctx-region` (final capture per trace)

| repo | family | pi exact | core exact | pi bytes | core bytes | hermes exact | hermes bytes |
|---|---|---|---|---|---|---|---|
| express | append | 1.000 | 1.000 | 948 | 948 | 1.000 | 948 |
| express | delete | 0.000 | 0.000 | 164 | 164 | 0.000 | 164 |
| express | duplicate-boundary | 0.000 | 0.000 | 644 | 644 | 0.000 | 644 |
| express | interior-edit | 1.000 | 1.000 | 961 | 961 | 1.000 | 961 |
| express | move-in-file | 1.000 | 1.000 | 455 | 455 | 1.000 | 455 |
| flask | append | 1.000 | 1.000 | 1426 | 1426 | 1.000 | 1426 |
| flask | delete | 0.000 | 0.000 | 164 | 164 | 0.000 | 164 |
| flask | duplicate-boundary | 0.000 | 0.000 | 676 | 676 | 0.000 | 676 |
| flask | interior-edit | 1.000 | 1.000 | 1458 | 1458 | 1.000 | 1458 |
| flask | move-in-file | 1.000 | 1.000 | 502 | 502 | 1.000 | 502 |

All families: stale 0.000, duplicate 0.0, required-recall 1.000. Hermes
projection-bytes are **0 bytes delta** vs Pi on every cell.

### Delta vs PCR 0003/0004 (file-grain adapters)

PCR 0003/0004 tracked whole files; `exact-current` was 0.000 on region-gold
families and projection-bytes matched `freshctx-file`.

| repo | family | PCR 0003 exact | PCR 0006 exact | PCR 0003 bytes | PCR 0006 bytes | bytes delta (0006 − 0003) |
|---|---|---|---|---|---|---|
| express | append | 0.000 | **1.000** | 2046 | **948** | −1098 |
| express | interior-edit | 0.000 | **1.000** | 2024 | **961** | −1063 |
| express | move-in-file | 0.000 | **1.000** | 2022 | **455** | −1567 |
| express | delete | 0.000 | 0.000 | 164 | 164 | 0 |
| express | duplicate-boundary | 0.000 | 0.000 | 2069 | 644 | −1425 |
| flask | append | 0.000 | **1.000** | 7385 | **1426** | −5959 |
| flask | interior-edit | 0.000 | **1.000** | 7383 | **1458** | −5925 |
| flask | move-in-file | 0.000 | **1.000** | 7361 | **502** | −6859 |
| flask | delete | 0.000 | 0.000 | 164 | 164 | 0 |
| flask | duplicate-boundary | 0.000 | 0.000 | 7636 | 676 | −6960 |

Hermes PCR 0004 rows matched Pi PCR 0003 on every column; PCR 0006 Hermes deltas
are identical to the Pi column above.

Timing cells are single-shot replay overhead; **not** a latency claim.

## Comparison

Smoke replay now exercises the same region unit identities as core
`freshctx-region`. This is **measured** adapter parity on Flask/Express smoke
v0.1 — not a CORVUS comparison, not holdout evidence, and not a state-of-the-art
claim.

## Conflicts with constitutions

- `docs/EVALUATION.md` §11 pinned release-matrix tests remain open; this PR extends
  the **replay** harness only.
- `SOUL.md` adapter-only scope: no core policy edits — satisfied.
- Region metadata in live Pi/Hermes sessions depends on read tool arguments carrying
  `scope`/`startLine`/`endLine`/`selector`; hosts do not infer selectors from
  partial reads alone. Smoke traces supply metadata explicitly; documented below
  as a portability caveat, not a missing `context` / `select_context()` hook.

## Limitations

- Replay harness injects region fields from trace schema into simulated read tool
  calls; a live agent must pass the same fields (or equivalent line-range args)
  for region tracking outside CtxBench replay.
- Pi `offset`/`limit` partial-read args are not mapped to line ranges yet.
- `npm run repos:verify` returned exit 1 (`spawnSync git ENOENT`) in the cloud
  agent environment; `bench/repos.lock.json` commit SHAs were not modified.
- No pinned Pi/Hermes package version matrix (ROADMAP M2/M4).
- Single-process replay; no parallel tool-call interleaving test.

## Protocol gap?

**No gap for smoke replay.** Trace `read` events declare region scope and line
metadata; adapters consume them via tool-call arguments and observed tool-result
bytes. **Live-session caveat:** without region metadata in read tool args, adapters
still fall back to whole-file tracking (PCR 0003 behavior).

## Next measurement

Sealed holdout protocol execution (unreleased trace seeds, no tuning on holdout).
See [NEXT-PROMPT.md](../NEXT-PROMPT.md).
