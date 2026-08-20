# CtxBench Hermes adapter smoke v0.1

Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.

Hermes ContextEngine plugin contract: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md

Generated: 2026-08-20T21:25:36.262Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hermes-adapter | express | append | 1.000 | 0.000 | 0.0 | 1.000 | 948 | 0.124 | 1.20 | 1.20 |
| hermes-adapter | express | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.219 | 0.39 | 0.39 |
| hermes-adapter | express | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 644 | 0.194 | 0.37 | 0.37 |
| hermes-adapter | express | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 961 | 0.124 | 0.49 | 0.49 |
| hermes-adapter | express | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 455 | 0.221 | 0.30 | 0.30 |
| hermes-adapter | flask | append | 1.000 | 0.000 | 0.0 | 1.000 | 1426 | 0.095 | 0.33 | 0.33 |
| hermes-adapter | flask | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.245 | 0.65 | 0.65 |
| hermes-adapter | flask | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 676 | 0.178 | 0.32 | 0.32 |
| hermes-adapter | flask | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 1458 | 0.095 | 0.38 | 0.38 |
| hermes-adapter | flask | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 502 | 0.216 | 0.40 | 0.40 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | hermes stale | core stale | hermes recall | core recall | hermes exact-current | core exact-current | hermes projection-bytes | core projection-bytes |
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

## Delta vs Pi adapter (final capture per trace)

| repo | family | hermes stale | pi stale | hermes recall | pi recall | hermes projection-bytes | pi projection-bytes | delta-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| express | append | 0.000 | 0.000 | 1.000 | 1.000 | 948 | 948 | 0 |
| express | delete | 0.000 | 0.000 | 1.000 | 1.000 | 164 | 164 | 0 |
| express | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 644 | 644 | 0 |
| express | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 961 | 961 | 0 |
| express | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 455 | 455 | 0 |
| flask | append | 0.000 | 0.000 | 1.000 | 1.000 | 1426 | 1426 | 0 |
| flask | delete | 0.000 | 0.000 | 1.000 | 1.000 | 164 | 164 | 0 |
| flask | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 676 | 676 | 0 |
| flask | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1458 | 1458 | 0 |
| flask | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 502 | 502 | 0 |
