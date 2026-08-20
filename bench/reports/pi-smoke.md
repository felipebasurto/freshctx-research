# CtxBench Pi adapter smoke v0.1

Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.

Pi extension contract: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

Generated: 2026-08-20T20:23:33.756Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pi-adapter | express | append | 0.000 | 0.000 | 0.0 | 1.000 | 2046 | 0.062 | 0.32 | 0.32 |
| pi-adapter | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.219 | 0.19 | 0.19 |
| pi-adapter | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 2069 | 0.065 | 0.27 | 0.27 |
| pi-adapter | express | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 2024 | 0.062 | 0.24 | 0.24 |
| pi-adapter | express | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 2022 | 0.060 | 0.23 | 0.23 |
| pi-adapter | flask | append | 0.000 | 0.000 | 0.0 | 1.000 | 7385 | 0.020 | 0.38 | 0.38 |
| pi-adapter | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.245 | 0.09 | 0.09 |
| pi-adapter | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7636 | 0.019 | 0.35 | 0.35 |
| pi-adapter | flask | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7383 | 0.020 | 0.39 | 0.39 |
| pi-adapter | flask | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7361 | 0.018 | 0.31 | 0.31 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | pi stale | core stale | pi recall | core recall | pi exact-current | core exact-current | pi projection-bytes | core projection-bytes |
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
