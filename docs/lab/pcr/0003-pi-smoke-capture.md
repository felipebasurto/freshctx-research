# PCR 0003 — Pi request-capture on smoke traces

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/pi-smoke-capture-3703`
- Commit: `17bc65c`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `replay`

## Hypothesis or change

Replaying the frozen Flask/Express smoke traces through Pi's public
`tool_result` / `turn_start` / `context` extension seam (request-only,
fake provider, no model) yields payloads that pass the same
freshness/uniqueness gates as the core `public-repo-smoke` board.

## What we did

Read Pi's extension contract ([extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)).
Added a pure-Node replay harness (`adapters/pi/replay.mjs`) that mirrors
`adapters/pi/extension.ts` without requiring the Pi package at bench time.
Added `bench/pi-trace-runner.mjs`, `bench/pi-smoke.mjs`
(`npm run ctxbench:pi-smoke`), and `test/pi-adapter.test.mjs`.

The replay maps each trace `read` to a Pi `read` tool call + `tool_result`,
persists the session across captures (matching Pi session state), and invokes
the `context` hook before each `capture-request`. Payloads are serialized in
OpenAI chat-completions shape for the loopback capture provider. Did not retune
policy. Did not change gold labels, weights, or `bench/repos.lock.json` commit
SHAs (local `repos:fetch:smoke` updated only `resolvedAt`; reverted before
commit).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **32/32** (26 prior + 6 Pi adapter) |
| `npm run check` | yes | 0 | includes `adapters/pi/replay.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs main |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 0 | after local smoke fetch; lock SHAs unchanged |
| `npm run ctxbench:smoke` | yes | 0 | core board unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | **new**; Pi supported on freshness/uniqueness |

## Metric snapshot

**Measured** `synthetic`: no delta vs PCR 0002 / main `0247c3d`. Score
89.107165; stale 0; one current copy; recall 1; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** `public-repo-smoke` core board: unchanged vs PCR 0002 /
[`bench/reports/latest.md`](../../../bench/reports/latest.md).

**Measured** Pi adapter (`npm run ctxbench:pi-smoke`). Full table:
[`bench/reports/pi-smoke.md`](../../../bench/reports/pi-smoke.md).

Lock SHAs (unchanged): Flask `d318b683471101618febed18996405ad26462110`,
Express `a3714473feb3d2908add734d340e7755fd85e0a3`, manifest
`4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4`.

### Pi vs core freshness/uniqueness gates (final capture per trace)

| repo | family | pi stale | core stale | pi duplicate | core duplicate | pi recall | core recall |
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

Pi **passes** stale-bytes, duplicate-units, and required-recall gates on every
smoke family. Request-only invariant holds: persisted tool results keep stale
bytes; the provider payload does not.

### exact-current and projection-bytes delta vs `freshctx-region`

Pi `exact-current` is **0.000** on every family where region gold applies;
core `freshctx-region` is **1.000** on append, interior-edit, and move-in-file.
Pi projection-bytes match core **`freshctx-file`** (whole-file scope), not
`freshctx-region`. Example deltas (projection-bytes, pi minus core-region):

| repo | family | pi | core-region | delta |
|---|---|---|---|---|
| express | append | 2046 | 948 | +1098 |
| express | interior-edit | 2024 | 961 | +1063 |
| express | move-in-file | 2022 | 455 | +1567 |
| flask | append | 7385 | 1426 | +5959 |
| flask | interior-edit | 7383 | 1458 | +5925 |
| flask | move-in-file | 7361 | 502 | +6859 |

Delete and duplicate-boundary families: both pi and core-region
`exact-current` 0.000; projection-bytes differ only where whole-file vs region
projection applies.

Timing cells are single-shot replay overhead; **not** a latency claim.

## Comparison

Pi documents a modifiable `context` event before each LLM call
([extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#context)).
This iteration **reproduced** that seam in a Node replay harness aligned with
`adapters/pi/extension.ts`. It is **not** a pinned `@earendil-works/pi-coding-agent`
compatibility matrix (ROADMAP M2) and **not** a CORVUS comparison.

## Conflicts with constitutions

- `docs/EVALUATION.md` §11 lists pinned Pi compatibility tests as not yet
  implemented. This PR adds a **replay** measurement harness, not an in-process
  Pi release pin. §14 status text was not edited.
- `SOUL.md` adapter rule: request-only mutation — satisfied; tests assert
  persisted session bytes differ from provider payload when projection applies.
- File-level Pi scope vs region-gold oracle: the adapter README already states
  file-level tracking. This is a **documented granularity deviation**, not a
  missing `context` hook. Region gold can still satisfy required-recall via
  substring match inside a whole-file projection.

## Limitations

- Replay harness, not a live Pi terminal session with pinned package version.
- File-level sync only; region/selectors from smoke reads are not tracked at
  region granularity (matches `extension.ts`).
- `exact-current` under-counts against region gold labels (same as
  `freshctx-file`).
- No partial-read (`offset`/`limit`) fidelity yet (Pi read tool supports them;
  adapter ignores them).
- Single-process replay; no parallel tool-call interleaving test.

## Pi supported?

**Yes** for freshness/uniqueness gates on smoke v0.1: stale 0, duplicate 0,
required-recall 1 on all families with satisfiable gold. The remaining gap for
Level-3 portability is **file granularity and release pinning**, not a protocol
hole in the `context` event.

## Next measurement

Hermes `select_context()` replay on the same smoke traces. See
[NEXT-PROMPT.md](../NEXT-PROMPT.md).
