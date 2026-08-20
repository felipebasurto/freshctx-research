# CtxBench holdout v0.1 (first slice)

Label: `public-repo-holdout`. Measurement only; not a performance or SOTA claim.

Generated: 2026-08-20T20:43:14.300Z

| baseline | repo | family | exact-current | stale | duplicate | required-recall | projection-bytes | cache-prefix-reuse | transform-p50 | transform-p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| append-only | go-tools | append | 0.000 | 0.000 | 0.0 | 1.000 | 287 | 1.000 | 0.00 | 0.00 |
| append-only | go-tools | delete | 0.000 | 1.000 | 0.0 | 1.000 | 134 | 1.000 | 0.00 | 0.00 |
| append-only | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 532 | 1.000 | 0.00 | 0.00 |
| append-only | go-tools | interior-edit | 0.000 | 1.000 | 0.0 | 0.000 | 195 | 1.000 | 0.00 | 0.00 |
| append-only | go-tools | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 215 | 1.000 | 0.00 | 0.00 |
| append-only | neovim | append | 0.000 | 1.000 | 0.0 | 0.000 | 715 | 1.000 | 0.00 | 0.00 |
| append-only | neovim | delete | 0.000 | 1.000 | 0.0 | 1.000 | 137 | 1.000 | 0.00 | 0.00 |
| append-only | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 264 | 1.000 | 0.00 | 0.00 |
| append-only | neovim | interior-edit | 0.000 | 1.000 | 0.0 | 0.000 | 516 | 1.000 | 0.00 | 0.00 |
| append-only | neovim | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 373 | 1.000 | 0.00 | 0.00 |
| corvus-file | go-tools | append | 0.000 | 0.000 | 0.0 | 1.000 | 5939 | 0.142 | 0.12 | 0.12 |
| corvus-file | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 68 | 0.366 | 0.04 | 0.04 |
| corvus-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 6150 | 0.288 | 0.17 | 0.17 |
| corvus-file | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 5938 | 0.172 | 0.11 | 0.11 |
| corvus-file | go-tools | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 5914 | 0.421 | 0.12 | 0.12 |
| corvus-file | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 7133 | 0.186 | 0.10 | 0.10 |
| corvus-file | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 73 | 0.367 | 0.03 | 0.03 |
| corvus-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7167 | 0.500 | 0.10 | 0.10 |
| corvus-file | neovim | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7132 | 0.051 | 0.37 | 0.37 |
| corvus-file | neovim | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7106 | 0.084 | 0.10 | 0.10 |
| freshctx-file | go-tools | append | 0.000 | 0.000 | 0.0 | 1.000 | 6290 | 0.054 | 0.25 | 0.25 |
| freshctx-file | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.253 | 0.12 | 0.12 |
| freshctx-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 6501 | 0.054 | 0.30 | 0.30 |
| freshctx-file | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 6289 | 0.057 | 0.24 | 0.24 |
| freshctx-file | go-tools | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 6265 | 0.054 | 0.20 | 0.20 |
| freshctx-file | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 7484 | 0.047 | 0.22 | 0.22 |
| freshctx-file | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.256 | 0.02 | 0.02 |
| freshctx-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7518 | 0.047 | 0.23 | 0.23 |
| freshctx-file | neovim | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7483 | 0.049 | 0.20 | 0.20 |
| freshctx-file | neovim | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7457 | 0.047 | 0.22 | 0.22 |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0.0 | 1.000 | 604 | 0.176 | 0.14 | 0.14 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.231 | 0.05 | 0.05 |
| freshctx-region | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 809 | 0.137 | 0.08 | 0.08 |
| freshctx-region | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 164 | 0.199 | 0.20 | 0.20 |
| freshctx-region | go-tools | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 538 | 0.195 | 0.07 | 0.07 |
| freshctx-region | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 1075 | 0.114 | 0.17 | 0.17 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.234 | 0.02 | 0.02 |
| freshctx-region | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 561 | 0.195 | 0.08 | 0.08 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 872 | 0.139 | 0.22 | 0.22 |
| freshctx-region | neovim | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 698 | 0.163 | 0.07 | 0.07 |
| observation-mask | go-tools | append | 0.000 | 0.000 | 0.0 | 0.000 | 127 | 1.000 | 0.00 | 0.00 |
| observation-mask | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 134 | 1.000 | 0.00 | 0.00 |
| observation-mask | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 147 | 1.000 | 0.00 | 0.00 |
| observation-mask | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 121 | 1.000 | 0.00 | 0.00 |
| observation-mask | go-tools | move-in-file | 0.000 | 0.000 | 0.0 | 0.000 | 125 | 1.000 | 0.00 | 0.00 |
| observation-mask | neovim | append | 0.000 | 0.000 | 0.0 | 0.000 | 133 | 1.000 | 0.00 | 0.00 |
| observation-mask | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 139 | 1.000 | 0.00 | 0.00 |
| observation-mask | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 147 | 1.000 | 0.00 | 0.00 |
| observation-mask | neovim | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 134 | 1.000 | 0.00 | 0.00 |
| observation-mask | neovim | move-in-file | 0.000 | 0.000 | 0.0 | 0.000 | 133 | 1.000 | 0.00 | 0.00 |
