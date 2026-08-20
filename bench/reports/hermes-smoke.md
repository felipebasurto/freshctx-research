# CtxBench Hermes adapter smoke v0.1

Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.

Hermes ContextEngine plugin contract: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md

Generated: 2026-08-20T20:26:44.896Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hermes-adapter | express | append | 0.000 | 0.000 | 0.0 | 1.000 | 2046 | 0.062 | 2.89 | 2.89 |
| hermes-adapter | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.219 | 0.52 | 0.52 |
| hermes-adapter | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 2069 | 0.065 | 0.39 | 0.39 |
| hermes-adapter | express | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 2024 | 0.062 | 0.40 | 0.40 |
| hermes-adapter | express | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 2022 | 0.060 | 0.30 | 0.30 |
| hermes-adapter | flask | append | 0.000 | 0.000 | 0.0 | 1.000 | 7385 | 0.020 | 0.45 | 0.45 |
| hermes-adapter | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.245 | 0.22 | 0.22 |
| hermes-adapter | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7636 | 0.019 | 0.37 | 0.37 |
| hermes-adapter | flask | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7383 | 0.020 | 0.56 | 0.56 |
| hermes-adapter | flask | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7361 | 0.018 | 0.42 | 0.42 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | hermes stale | core stale | hermes recall | core recall | hermes exact-current | core exact-current | hermes projection-bytes | core projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| express | append | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 1.000 | 2046 | 948 |
| express | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 164 | 164 |
| express | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 2069 | 644 |
| express | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 1.000 | 2024 | 961 |
| express | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 1.000 | 2022 | 455 |
| flask | append | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 1.000 | 7385 | 1426 |
| flask | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 164 | 164 |
| flask | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 7636 | 676 |
| flask | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 1.000 | 7383 | 1458 |
| flask | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 1.000 | 7361 | 502 |

## Delta vs Pi adapter (final capture per trace)

| repo | family | hermes stale | pi stale | hermes recall | pi recall | hermes projection-bytes | pi projection-bytes | delta-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| express | append | 0.000 | 0.000 | 1.000 | 1.000 | 2046 | 2046 | 0 |
| express | delete | 0.000 | 0.000 | 1.000 | 1.000 | 164 | 164 | 0 |
| express | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 2069 | 2069 | 0 |
| express | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 2024 | 2024 | 0 |
| express | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 2022 | 2022 | 0 |
| flask | append | 0.000 | 0.000 | 1.000 | 1.000 | 7385 | 7385 | 0 |
| flask | delete | 0.000 | 0.000 | 1.000 | 1.000 | 164 | 164 | 0 |
| flask | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 7636 | 7636 | 0 |
| flask | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 7383 | 7383 | 0 |
| flask | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 7361 | 7361 | 0 |
