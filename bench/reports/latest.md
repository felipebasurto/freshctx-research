# CtxBench smoke v0.1

Label: `public-repo-smoke`. Measurement infrastructure only; not a performance claim.

Generated: 2026-08-20T20:12:44.226Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| append-only | express | append | 0.000 | 0.000 | 0.0 | 1.000 | 635 | 1.000 | 0.00 | 0.00 |
| append-only | express | delete | 0.000 | 1.000 | 0.0 | 1.000 | 127 | 1.000 | 0.00 | 0.00 |
| append-only | express | duplicate-boundary | 0.000 | 1.000 | 0.0 | 1.000 | 287 | 1.000 | 0.00 | 0.00 |
| append-only | express | interior-edit | 0.000 | 1.000 | 0.0 | 0.000 | 635 | 1.000 | 0.00 | 0.00 |
| append-only | express | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 133 | 1.000 | 0.00 | 0.00 |
| append-only | flask | append | 0.000 | 0.000 | 0.0 | 1.000 | 1132 | 1.000 | 0.00 | 0.00 |
| append-only | flask | delete | 0.000 | 1.000 | 0.0 | 1.000 | 88 | 1.000 | 0.00 | 0.00 |
| append-only | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 375 | 1.000 | 0.00 | 0.00 |
| append-only | flask | interior-edit | 0.000 | 1.000 | 0.0 | 0.000 | 1132 | 1.000 | 0.00 | 0.00 |
| append-only | flask | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 183 | 1.000 | 0.00 | 0.00 |
| corvus-file | express | append | 0.000 | 0.000 | 0.0 | 1.000 | 1696 | 0.435 | 0.11 | 0.11 |
| corvus-file | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 49 | 0.297 | 0.04 | 0.04 |
| corvus-file | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 1719 | 0.962 | 0.09 | 0.09 |
| corvus-file | express | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 1674 | 0.550 | 0.09 | 0.09 |
| corvus-file | express | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 1672 | 0.784 | 0.10 | 0.10 |
| corvus-file | flask | append | 0.000 | 0.000 | 0.0 | 1.000 | 7034 | 0.060 | 0.10 | 0.10 |
| corvus-file | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 56 | 0.427 | 0.03 | 0.03 |
| corvus-file | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7285 | 0.431 | 0.08 | 0.08 |
| corvus-file | flask | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7032 | 0.190 | 0.09 | 0.09 |
| corvus-file | flask | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7010 | 0.042 | 0.08 | 0.08 |
| freshctx-file | express | append | 0.000 | 0.000 | 0.0 | 1.000 | 2046 | 0.155 | 0.15 | 0.15 |
| freshctx-file | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.239 | 0.11 | 0.11 |
| freshctx-file | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 2069 | 0.155 | 0.13 | 0.13 |
| freshctx-file | express | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 2024 | 0.164 | 0.11 | 0.11 |
| freshctx-file | express | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 2022 | 0.164 | 0.08 | 0.08 |
| freshctx-file | flask | append | 0.000 | 0.000 | 0.0 | 1.000 | 7385 | 0.045 | 0.20 | 0.20 |
| freshctx-file | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.264 | 0.02 | 0.02 |
| freshctx-file | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7636 | 0.045 | 0.21 | 0.21 |
| freshctx-file | flask | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7383 | 0.048 | 0.23 | 0.23 |
| freshctx-file | flask | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7361 | 0.045 | 0.17 | 0.17 |
| freshctx-region | express | append | 1.000 | 0.000 | 0.0 | 1.000 | 948 | 0.114 | 0.12 | 0.12 |
| freshctx-region | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.217 | 0.10 | 0.10 |
| freshctx-region | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 644 | 0.174 | 0.19 | 0.19 |
| freshctx-region | express | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 961 | 0.114 | 0.09 | 0.09 |
| freshctx-region | express | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 455 | 0.215 | 0.04 | 0.04 |
| freshctx-region | flask | append | 1.000 | 0.000 | 0.0 | 1.000 | 1426 | 0.081 | 0.07 | 0.07 |
| freshctx-region | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.239 | 0.02 | 0.02 |
| freshctx-region | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 676 | 0.158 | 0.05 | 0.05 |
| freshctx-region | flask | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 1458 | 0.081 | 0.14 | 0.14 |
| freshctx-region | flask | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 502 | 0.204 | 0.06 | 0.06 |
| observation-mask | express | append | 0.000 | 0.000 | 0.0 | 0.000 | 120 | 1.000 | 0.00 | 0.00 |
| observation-mask | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 115 | 1.000 | 0.00 | 0.00 |
| observation-mask | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 127 | 1.000 | 0.00 | 0.00 |
| observation-mask | express | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 120 | 1.000 | 0.00 | 0.00 |
| observation-mask | express | move-in-file | 0.000 | 0.000 | 0.0 | 0.000 | 115 | 1.000 | 0.00 | 0.00 |
| observation-mask | flask | append | 0.000 | 0.000 | 0.0 | 0.000 | 136 | 1.000 | 0.00 | 0.00 |
| observation-mask | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 122 | 1.000 | 0.00 | 0.00 |
| observation-mask | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 132 | 1.000 | 0.00 | 0.00 |
| observation-mask | flask | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 136 | 1.000 | 0.00 | 0.00 |
| observation-mask | flask | move-in-file | 0.000 | 0.000 | 0.0 | 0.000 | 124 | 1.000 | 0.00 | 0.00 |
