# CtxBench Pi adapter smoke v0.1

Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.

Pi extension contract: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

Generated: 2026-08-25T16:04:08.583Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pi-adapter | express | append | 1.000 | 0.000 | 0.0 | 1.000 | 396 | 0.124 | 0.66 | 0.66 |
| pi-adapter | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 78 | 0.219 | 0.23 | 0.23 |
| pi-adapter | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 644 | 0.194 | 0.45 | 0.45 |
| pi-adapter | express | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 961 | 0.124 | 0.30 | 0.30 |
| pi-adapter | express | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 396 | 0.221 | 0.35 | 0.35 |
| pi-adapter | flask | append | 1.000 | 0.000 | 0.0 | 1.000 | 400 | 0.095 | 0.40 | 0.40 |
| pi-adapter | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 78 | 0.245 | 0.12 | 0.12 |
| pi-adapter | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 400 | 0.178 | 0.18 | 0.18 |
| pi-adapter | flask | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 1458 | 0.095 | 0.27 | 0.27 |
| pi-adapter | flask | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 402 | 0.216 | 0.35 | 0.35 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | pi stale | core stale | pi recall | core recall | pi exact-current | core exact-current | pi projection-bytes | core projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| express | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 396 | 948 |
| express | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 78 | 78 |
| express | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 644 | 644 |
| express | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 961 | 961 |
| express | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 396 | 455 |
| flask | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 400 | 1426 |
| flask | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 78 | 78 |
| flask | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 400 | 676 |
| flask | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1458 | 1458 |
| flask | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 402 | 502 |
