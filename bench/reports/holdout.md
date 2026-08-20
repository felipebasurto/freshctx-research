# CtxBench holdout v0.1 (first slice)

Label: `public-repo-holdout`. Status: `unsealed-regression-development-pack` (not preregistered; predates freeze protocol).
Measurement only; not a performance or SOTA claim.

## Provenance

- pack ID: `holdout-v0.1`
- classification: `unsealed-regression` (permanently unsealed; not preregistered)
- freeze commit: none — unsealed-regression
- manifest hash: none (predates protocol manifests)
- implementation commit: `433f7dc16f2348fd8e6893f35230daa16a7f62fa`
- repos.lock SHA-256: `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`
- flask lock SHA: `d318b683471101618febed18996405ad26462110`
- express lock SHA: `a3714473feb3d2908add734d340e7755fd85e0a3`
- go-tools lock SHA: `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49`
- neovim lock SHA: `2dd6e9d6a2482069cfe9d12a09f761c5713f246b`
- trace-set hash: `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`
- result-set hash: `cce78552d999485b75b4094494a3ecda34d92b7088b453fb38a5a7c0693c1af2`
- remote attestation: none — unsealed-regression pack predates remote freeze workflow

Generated: 2026-08-20T21:16:46.511Z

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
| corvus-file | go-tools | append | 0.000 | 0.000 | 0.0 | 1.000 | 5939 | 0.142 | 0.11 | 0.11 |
| corvus-file | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 68 | 0.366 | 0.05 | 0.05 |
| corvus-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 6150 | 0.288 | 0.13 | 0.13 |
| corvus-file | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 5938 | 0.172 | 0.10 | 0.10 |
| corvus-file | go-tools | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 5914 | 0.421 | 0.10 | 0.10 |
| corvus-file | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 7133 | 0.186 | 0.11 | 0.11 |
| corvus-file | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 73 | 0.367 | 0.05 | 0.05 |
| corvus-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7167 | 0.500 | 0.09 | 0.09 |
| corvus-file | neovim | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7132 | 0.051 | 0.08 | 0.08 |
| corvus-file | neovim | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7106 | 0.084 | 0.09 | 0.09 |
| freshctx-file | go-tools | append | 0.000 | 0.000 | 0.0 | 1.000 | 6290 | 0.054 | 0.33 | 0.33 |
| freshctx-file | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.253 | 0.12 | 0.12 |
| freshctx-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 6501 | 0.054 | 0.22 | 0.22 |
| freshctx-file | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 6289 | 0.057 | 0.22 | 0.22 |
| freshctx-file | go-tools | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 6265 | 0.054 | 0.19 | 0.19 |
| freshctx-file | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 7484 | 0.047 | 0.20 | 0.20 |
| freshctx-file | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.256 | 0.02 | 0.02 |
| freshctx-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 7518 | 0.047 | 0.22 | 0.22 |
| freshctx-file | neovim | interior-edit | 0.000 | 0.000 | 0.0 | 1.000 | 7483 | 0.049 | 0.21 | 0.21 |
| freshctx-file | neovim | move-in-file | 0.000 | 0.000 | 0.0 | 1.000 | 7457 | 0.047 | 0.20 | 0.20 |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0.0 | 1.000 | 604 | 0.176 | 0.16 | 0.16 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.231 | 0.06 | 0.06 |
| freshctx-region | go-tools | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 809 | 0.137 | 0.07 | 0.07 |
| freshctx-region | go-tools | interior-edit | 0.000 | 0.000 | 0.0 | 0.000 | 164 | 0.199 | 0.11 | 0.11 |
| freshctx-region | go-tools | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 538 | 0.195 | 0.07 | 0.07 |
| freshctx-region | neovim | append | 0.000 | 0.000 | 0.0 | 1.000 | 1075 | 0.114 | 0.18 | 0.18 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0.0 | 1.000 | 164 | 0.234 | 0.02 | 0.02 |
| freshctx-region | neovim | duplicate-boundary | 0.000 | 0.000 | 0.0 | 1.000 | 561 | 0.195 | 0.05 | 0.05 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0.0 | 1.000 | 872 | 0.139 | 0.19 | 0.19 |
| freshctx-region | neovim | move-in-file | 1.000 | 0.000 | 0.0 | 1.000 | 698 | 0.163 | 0.06 | 0.06 |
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
