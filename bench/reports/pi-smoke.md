# CtxBench Pi adapter smoke v0.1

Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.

Pi extension contract: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

Generated: 2026-08-25T18:06:19.167Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pi-adapter | express | append | 1.000 | 0.000 | 0.0 | 1.000 | 948 | 0.124 | 0.46 | 0.46 |
| pi-adapter | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 78 | 0.219 | 0.13 | 0.13 |
| pi-adapter | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 644 | 0.194 | 0.32 | 0.32 |
| pi-adapter | express | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 961 | 0.124 | 0.27 | 0.27 |
| pi-adapter | express | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 455 | 0.221 | 0.24 | 0.24 |
| pi-adapter | flask | append | 1.000 | 0.000 | 0.0 | 1.000 | 1426 | 0.095 | 0.41 | 0.41 |
| pi-adapter | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 78 | 0.245 | 0.07 | 0.07 |
| pi-adapter | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 676 | 0.178 | 0.19 | 0.19 |
| pi-adapter | flask | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 1458 | 0.095 | 0.23 | 0.23 |
| pi-adapter | flask | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 502 | 0.216 | 0.30 | 0.30 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | pi stale | core stale | pi recall | core recall | pi exact-current | core exact-current | pi projection-bytes | core projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| express | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 948 | 948 |
| express | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 78 | 78 |
| express | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 644 | 644 |
| express | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 961 | 961 |
| express | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 455 | 455 |
| flask | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1426 | 1426 |
| flask | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 78 | 78 |
| flask | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 676 | 676 |
| flask | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1458 | 1458 |
| flask | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 502 | 502 |
