# PCR 0004 — Hermes request-capture on smoke traces

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/hermes-smoke-capture-5e61`
- Commit: (filled at merge)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `replay`

## Hypothesis or change

Replaying the frozen Flask/Express smoke traces through Hermes'
`on_turn_complete()` / `select_context()` seam (request-only, Node bridge /
replay harness, fake provider, no model) yields payloads that pass the same
freshness/uniqueness gates as the core `public-repo-smoke` board and match the
Pi replay in PCR 0003 on projection bytes.

## What we did

Read Hermes' ContextEngine plugin contract
([context-engine-plugin.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md)).
Refactored `adapters/hermes/bridge.mjs` to export `observeTurn()` /
`selectContext()` and to track observed read content at turn completion before
refresh (fixing delete-family stale tool-result leakage). Added a pure-Node
replay harness (`adapters/hermes/replay.mjs`) mirroring
`adapters/hermes/__init__.py` without requiring Hermes at bench time. Added
`bench/hermes-trace-runner.mjs`, `bench/hermes-smoke.mjs`
(`npm run ctxbench:hermes-smoke`), and `test/hermes-adapter.test.mjs`. Did not
retune policy. Did not change gold labels, weights, or `bench/repos.lock.json`
commit SHAs (local `repos:fetch:smoke` updated only `resolvedAt`; reverted before
commit).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **37/37** (32 prior + 5 Hermes adapter; `hermes-bridge` unchanged) |
| `npm run check` | yes | 0 | includes `adapters/hermes/bridge.mjs`, `replay.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs main |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 0 | after local smoke fetch; lock SHAs unchanged |
| `npm run ctxbench:smoke` | yes | 0 | core board unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | Pi regression unchanged |
| `npm run ctxbench:hermes-smoke` | yes | 0 | **new**; Hermes supported on freshness/uniqueness |

## Metric snapshot

**Measured** `synthetic`: no delta vs PCR 0003 / main `826a272`. Score
89.107165; stale 0; one current copy; recall 1; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** `public-repo-smoke` core board: unchanged vs PCR 0003 /
[`bench/reports/latest.md`](../../../bench/reports/latest.md).

**Measured** Hermes adapter (`npm run ctxbench:hermes-smoke`). Full table:
[`bench/reports/hermes-smoke.md`](../../../bench/reports/hermes-smoke.md).

Lock SHAs (unchanged): Flask `d318b683471101618febed18996405ad26462110`,
Express `a3714473feb3d2908add734d340e7755fd85e0a3`, manifest
`4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4`.

### Hermes vs core freshness/uniqueness gates (final capture per trace)

| repo | family | hermes stale | core stale | hermes duplicate | core duplicate | hermes recall | core recall |
|---|---|---|---|---|---|---|---|
| express | append | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| express | delete | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| express | interior-edit | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| express | move-in-file | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| flask | append | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| flask | delete | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| flask | interior-edit | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |
| flask | move-in-file | 0.000 | 0.000 | 0.0 | 0.0 | 1.000 | 1.000 |

Hermes **passes** stale-bytes, duplicate-units, and required-recall gates on
every smoke family. Request-only invariant holds: persisted tool results keep
stale bytes; the provider payload does not.

### Hermes vs Pi (PCR 0003) — projection-bytes delta

All ten families: **0 bytes delta** vs Pi (`hermes projection-bytes = pi
projection-bytes`). Stale, duplicate, and required-recall columns identical.

### exact-current and projection-bytes delta vs `freshctx-region`

Same pattern as Pi (file-level adapter scope): Hermes `exact-current` is
**0.000** on append, interior-edit, and move-in-file where region gold applies;
core `freshctx-region` is **1.000**. Hermes projection-bytes match core
**`freshctx-file`**, not `freshctx-region`. Example deltas (projection-bytes,
hermes minus core-region):

| repo | family | hermes | core-region | delta |
|---|---|---|---|---|
| express | append | 2046 | 948 | +1098 |
| express | interior-edit | 2024 | 961 | +1063 |
| express | move-in-file | 2022 | 455 | +1567 |
| flask | append | 7385 | 1426 | +5959 |
| flask | interior-edit | 7383 | 1458 | +5925 |
| flask | move-in-file | 7361 | 502 | +6859 |

Timing cells are single-shot replay overhead; **not** a latency claim.

## Comparison

Hermes documents `select_context()` for request-only message replacement and
`on_turn_complete()` for turn observation
([context-engine-plugin.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md)).
This iteration **reproduced** that seam in a Node replay harness aligned with
`adapters/hermes/__init__.py` and the subprocess bridge. It is **not** a pinned
Hermes Agent release compatibility matrix (ROADMAP M4) and **not** a CORVUS
comparison.

## Conflicts with constitutions

- `docs/EVALUATION.md` §11 lists pinned Hermes compatibility tests as not yet
  implemented. This PR adds a **replay** measurement harness, not an in-process
  Hermes release pin. §14 status text was not edited.
- `SOUL.md` adapter rule: request-only mutation — satisfied; tests assert
  persisted session bytes differ from provider payload when projection applies.
- `SOUL.md` fail-open at host boundary — satisfied; bridge/subprocess failure
  returns the original message list (tested in `hermes-adapter.test.mjs`).
- File-level Hermes scope vs region-gold oracle: documented granularity
  deviation (same as Pi PCR 0003), not a missing `select_context()` hook.

## Limitations

- Replay harness, not a live Hermes Agent session with pinned package version.
- File-level sync only; smoke region reads are tracked as whole files (matches
  bridge behavior).
- `exact-current` under-counts against region gold labels (same as
  `freshctx-file` / Pi adapter).
- Bridge subprocess path not exercised on every smoke trace (in-process replay
  used for speed); subprocess contract covered by existing
  `hermes-bridge.test.mjs`.
- No partial-read (`offset`/`limit`) fidelity yet.
- Single-process replay; no parallel tool-call interleaving test.

## Hermes supported?

**Yes** for freshness/uniqueness gates on smoke v0.1: stale 0, duplicate 0,
required-recall 1 on all families with satisfiable gold. Hermes payloads are
byte-identical to Pi on projection-bytes across all ten smoke families. The
remaining gap for Level-3 portability is **file granularity and release
pinning**, not a protocol hole in `select_context()` / `on_turn_complete()`.

## Next measurement

First faithful deviation table for the documented CORVUS whole-file reproduction
vs `freshctx-region` on the same smoke traces (ADR 0003 deviations explicit).
See [NEXT-PROMPT.md](../NEXT-PROMPT.md). Do not start holdout or ranking work in
the same iteration.
