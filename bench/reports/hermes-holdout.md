# CtxBench Hermes adapter holdout v0.1

Label: `public-repo-holdout` / `replay`. Measurement infrastructure only; not a performance claim.

Hermes ContextEngine plugin contract: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md

Generated: 2026-08-20T21:28:39.435Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hermes-adapter | go-tools | append | 1.000 | 0.000 | 0.0 | 1.000 | 604 | 0.189 | 0.89 | 0.89 |
| hermes-adapter | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.242 | 0.29 | 0.29 |
| hermes-adapter | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 809 | 0.166 | 0.30 | 0.30 |
| hermes-adapter | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 164 | 0.205 | 0.33 | 0.33 |
| hermes-adapter | go-tools | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 538 | 0.206 | 0.80 | 0.80 |
| hermes-adapter | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 1075 | 0.124 | 0.35 | 0.35 |
| hermes-adapter | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.245 | 0.22 | 0.22 |
| hermes-adapter | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 561 | 0.223 | 1.04 | 1.04 |
| hermes-adapter | neovim | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 872 | 0.150 | 0.34 | 0.34 |
| hermes-adapter | neovim | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 698 | 0.174 | 0.43 | 0.43 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | hermes stale | core stale | hermes recall | core recall | hermes exact-current | core exact-current | hermes projection-bytes | core projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 604 | 604 |
| go-tools | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 164 | 164 |
| go-tools | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 809 | 809 |
| go-tools | interior-edit | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 164 | 164 |
| go-tools | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 538 | 538 |
| neovim | append | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 1075 | 1075 |
| neovim | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 164 | 164 |
| neovim | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 561 | 561 |
| neovim | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 872 | 872 |
| neovim | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 698 | 698 |

## Delta vs Pi adapter (final capture per trace)

| repo | family | hermes stale | pi stale | hermes recall | pi recall | hermes projection-bytes | pi projection-bytes | delta-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | 0.000 | 0.000 | 1.000 | 1.000 | 604 | 604 | 0 |
| go-tools | delete | 0.000 | 0.000 | 1.000 | 1.000 | 164 | 164 | 0 |
| go-tools | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 809 | 809 | 0 |
| go-tools | interior-edit | 0.000 | 0.000 | 0.000 | 0.000 | 164 | 164 | 0 |
| go-tools | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 538 | 538 | 0 |
| neovim | append | 0.000 | 0.000 | 1.000 | 1.000 | 1075 | 1075 | 0 |
| neovim | delete | 0.000 | 0.000 | 1.000 | 1.000 | 164 | 164 | 0 |
| neovim | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 561 | 561 | 0 |
| neovim | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 872 | 872 | 0 |
| neovim | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 698 | 698 | 0 |
