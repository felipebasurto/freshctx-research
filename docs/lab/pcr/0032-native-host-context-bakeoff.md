# PCR 0032 — native host context bake-off scaffold

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0032-native-host-bakeoff-9e8c`
- Commit: pending
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-holdout`; `native-host`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0008 proved Pi/Hermes **adapters** match FreshCtx core on holdout v0.1 replay. This pack adds **native host context** baselines that run the same 10 holdout traces through each host's own context manager (not FreshCtx-through-the-adapter), then places native and adapter columns on one bake-off table next to `freshctx-region` / `freshctx-file`.

## What we did

- Added `bench/hosts.manifest.json`, `bench/hosts.lock.json`, and `scripts/hosts.mjs` (`hosts:fetch`, `hosts:verify`) pinning detached checkouts under `bench/hosts/` (gitignored).
- Added `pi-native` replay (`bench/pi-native-trace-runner.mjs`): Pi default request assembly with zero `context` extension handlers — full tool results appended, no `adapters/pi/extension.ts`.
- Added `hermes-native` replay (`bench/hermes-native-trace-runner.mjs`, `bench/hermes-native-bridge.py`): frozen `ContextCompressor` from NousResearch/hermes-agent via library import; `select_context` no-op path + `should_compress`/`prune_tool_results_only`; live summarization skipped without API key (`hermes-native-precompress` label when blocked).
- Added `bench/native-holdout.mjs` (`ctxbench:native-holdout`) emitting the same language-agnostic oracle metrics (recall, exact-current, stale, stale-bytes, projection-bytes) for all 10 traces alongside adapter and core columns.
- Added tests asserting native payloads are not byte-identical to adapter payloads unless coincidentally equal.
- Did **not** edit `src/` resolver code, holdout v0.1 traces/gold, `bench/repos.lock.json`, benchmark weights, or seal state.

## Host lock SHAs

| host | commit | context module |
|---|---|---|
| pi (`earendil-works/pi`) | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `packages/coding-agent/src/core/extensions/runner.ts` |
| hermes (`NousResearch/hermes-agent`) | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `agent/context_engine.py` |

`bench/repos.lock.json` unchanged (`go-tools/neovim` lock sha256 `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **114/114** (+3 native bake-off tests) |
| `npm run check` | yes | 0 | includes native runners + Hermes bridge |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run hosts:verify` | yes | 0 | pi + hermes context modules present |
| `npm run ctxbench:native-holdout` | yes | 0 | bake-off table written |

## Metric snapshot

**Measured** `synthetic`: score **89.107165** (no delta vs PCR 0031).

**Measured** native bake-off: [`bench/reports/native-holdout.md`](../../../bench/reports/native-holdout.md).

### 10-cell table vs `freshctx-region` (from report; native + adapter columns)

| repo | family | baseline | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |
|---|---|---|---|---|---|---|---|---|
| go-tools | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | pi-native | 1.000 | 0.000 | 0.000 | 0 | 277 | -327 |
| go-tools | append | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 277 | -327 |
| go-tools | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | pi-native | 1.000 | 0.000 | 1.000 | 66 | 124 | -40 |
| go-tools | delete | hermes-native | 1.000 | 0.000 | 1.000 | 66 | 124 | -40 |
| go-tools | duplicate-boundary | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | pi-native | 1.000 | 0.000 | 0.000 | 0 | 522 | -287 |
| go-tools | duplicate-boundary | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 522 | -287 |
| go-tools | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | pi-native | 0.000 | 0.000 | 1.000 | 137 | 185 | -377 |
| go-tools | interior-edit | hermes-native | 0.000 | 0.000 | 1.000 | 137 | 185 | -377 |
| go-tools | move-in-file | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | pi-native | 1.000 | 0.000 | 0.000 | 0 | 205 | -333 |
| go-tools | move-in-file | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 205 | -333 |
| neovim | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | pi-native | 0.000 | 0.000 | 1.000 | 645 | 705 | -324 |
| neovim | append | hermes-native | 0.000 | 0.000 | 1.000 | 645 | 705 | -324 |
| neovim | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | pi-native | 1.000 | 0.000 | 1.000 | 69 | 127 | -37 |
| neovim | delete | hermes-native | 1.000 | 0.000 | 1.000 | 69 | 127 | -37 |
| neovim | duplicate-boundary | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | pi-native | 1.000 | 0.000 | 0.000 | 0 | 254 | -307 |
| neovim | duplicate-boundary | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 254 | -307 |
| neovim | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | pi-native | 0.000 | 0.000 | 1.000 | 444 | 506 | -366 |
| neovim | interior-edit | hermes-native | 0.000 | 0.000 | 1.000 | 444 | 506 | -366 |
| neovim | move-in-file | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | pi-native | 1.000 | 0.000 | 0.000 | 0 | 363 | -335 |
| neovim | move-in-file | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 363 | -335 |

Native columns diverge from adapter columns on every cell (payload sha256 differs). Hermes `ContextCompressor.select_context` is a no-op on holdout-sized traces; `should_compress` false → `native-no-op` (pre-compress assembled messages). No fake compressed bytes.

## Language-generic confirmation

Gold labels and the holdout oracle are unchanged (`bench/oracle.mjs`); no Go-specific parsers were added. Native runners measure provider-visible request payload bytes against the same path/content gold units as holdout v0.1.

## Limitations

- Hermes live summarization not exercised on holdout v0.1 (context under compression threshold; no API key in CI). Label stays `hermes-native` with `native-no-op` mode, not `hermes-native-precompress`.
- Pi native replay simulates default `context` event semantics in Node; does not boot the Pi CLI.
- Host checkouts are gitignored; `hosts:fetch` required before native runs in fresh environments.
- Not a performance or SOTA claim; scaffold only.

## Protocol gap?

**No gap for scaffold intent.** Native columns are intentionally **not** FreshCtx-through-adapter. Adapter parity remains covered by PCR 0008 tests.

## Next measurement

Run native bake-off on budget-pressure traces where Hermes `should_compress` fires, with capture-provider stub for live summarization, and compare lossy compression recall vs region-grain FreshCtx.
