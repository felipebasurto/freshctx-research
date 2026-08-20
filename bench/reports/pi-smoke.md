# CtxBench Pi adapter smoke v0.1

Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.

Pi extension contract: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

Generated: 2026-08-20T20:43:13.915Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pi-adapter | express | append | 1.000 | 0.000 | 0.0 | 1.000 | 948 | 0.124 | 0.31 | 0.31 |
| pi-adapter | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.219 | 0.20 | 0.20 |
| pi-adapter | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 644 | 0.194 | 0.36 | 0.36 |
| pi-adapter | express | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 961 | 0.124 | 0.22 | 0.22 |
| pi-adapter | express | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 455 | 0.221 | 0.20 | 0.20 |
| pi-adapter | flask | append | 1.000 | 0.000 | 0.0 | 1.000 | 1426 | 0.095 | 0.22 | 0.22 |
| pi-adapter | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.245 | 0.10 | 0.10 |
| pi-adapter | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 676 | 0.178 | 0.16 | 0.16 |
| pi-adapter | flask | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 1458 | 0.095 | 0.25 | 0.25 |
| pi-adapter | flask | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 502 | 0.216 | 0.15 | 0.15 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | pi stale | core stale | pi recall | core recall | pi exact-current | core exact-current | pi projection-bytes | core projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| express | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 948 | 948 |
| express | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 164 | 164 |
| express | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 644 | 644 |
| express | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 961 | 961 |
| express | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 455 | 455 |
| flask | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1426 | 1426 |
| flask | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 164 | 164 |
| flask | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 676 | 676 |
| flask | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1458 | 1458 |
| flask | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 502 | 502 |
