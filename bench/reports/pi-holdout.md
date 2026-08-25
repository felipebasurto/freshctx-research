# CtxBench Pi adapter holdout v0.1

Label: `public-repo-holdout` / `replay`. Measurement infrastructure only; not a performance claim.

Pi extension contract: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

Generated: 2026-08-25T18:06:19.625Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pi-adapter | go-tools | append | 1.000 | 0.000 | 0.0 | 1.000 | 604 | 0.189 | 0.43 | 0.43 |
| pi-adapter | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 78 | 0.242 | 0.12 | 0.12 |
| pi-adapter | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 809 | 0.166 | 0.30 | 0.30 |
| pi-adapter | go-tools | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 562 | 0.205 | 0.61 | 0.61 |
| pi-adapter | go-tools | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 538 | 0.206 | 0.27 | 0.27 |
| pi-adapter | neovim | append | 1.000 | 0.000 | 0.0 | 1.000 | 1029 | 0.124 | 0.35 | 0.35 |
| pi-adapter | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 78 | 0.245 | 0.08 | 0.08 |
| pi-adapter | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 561 | 0.223 | 0.20 | 0.20 |
| pi-adapter | neovim | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 872 | 0.150 | 0.30 | 0.30 |
| pi-adapter | neovim | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 698 | 0.174 | 0.30 | 0.30 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | pi stale | core stale | pi recall | core recall | pi exact-current | core exact-current | pi projection-bytes | core projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 604 | 604 |
| go-tools | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 78 | 78 |
| go-tools | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 809 | 809 |
| go-tools | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 562 | 562 |
| go-tools | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 538 | 538 |
| neovim | append | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1029 | 1029 |
| neovim | delete | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 78 | 78 |
| neovim | duplicate-boundary | 0.000 | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 561 | 561 |
| neovim | interior-edit | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 872 | 872 |
| neovim | move-in-file | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 698 | 698 |
