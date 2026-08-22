# CtxBench native host context bake-off (holdout v0.1)

Label: `public-repo-holdout` / `native-host`. Measurement infrastructure only; not a performance claim.

Native columns run each host's own context manager on the same 10 holdout traces. Adapter columns (PCR 0008) replay FreshCtx-through-the-adapter for contrast.

- hosts.lock SHA-256: `54ab03119a253b8afa2dd7c8e392e74a5fad169b75df21958aa97b1df82a8b77`
- pi host SHA: `c49906ec77788625aacbdc53ebca6fbe65bd20f5`
- hermes host SHA: `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`

Generated: 2026-08-22T16:41:10.241Z

## Per-cell metrics (10 traces)

| baseline | repo | family | exact-current | stale | stale-bytes | duplicate | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 604 |
| freshctx-file | go-tools | append | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 6290 |
| pi-adapter | go-tools | append | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 604 |
| hermes-adapter | go-tools | append | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 604 |
| pi-native | go-tools | append | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 277 |
| hermes-native | go-tools | append | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 277 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| freshctx-file | go-tools | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-adapter | go-tools | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| hermes-adapter | go-tools | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-native | go-tools | delete | 0.000 | 1.000 | 66 | 0.0 | 1.000 | 124 |
| hermes-native | go-tools | delete | 0.000 | 1.000 | 66 | 0.0 | 1.000 | 124 |
| freshctx-region | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 809 |
| freshctx-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 6501 |
| pi-adapter | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 809 |
| hermes-adapter | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 809 |
| pi-native | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 522 |
| hermes-native | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 522 |
| freshctx-region | go-tools | interior-edit | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 562 |
| freshctx-file | go-tools | interior-edit | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 6289 |
| pi-adapter | go-tools | interior-edit | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 562 |
| hermes-adapter | go-tools | interior-edit | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 562 |
| pi-native | go-tools | interior-edit | 0.000 | 1.000 | 137 | 0.0 | 0.000 | 185 |
| hermes-native | go-tools | interior-edit | 0.000 | 1.000 | 137 | 0.0 | 0.000 | 185 |
| freshctx-region | go-tools | move-in-file | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 538 |
| freshctx-file | go-tools | move-in-file | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 6265 |
| pi-adapter | go-tools | move-in-file | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 538 |
| hermes-adapter | go-tools | move-in-file | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 538 |
| pi-native | go-tools | move-in-file | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 205 |
| hermes-native | go-tools | move-in-file | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 205 |
| freshctx-region | neovim | append | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 1029 |
| freshctx-file | neovim | append | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 7484 |
| pi-adapter | neovim | append | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 1029 |
| hermes-adapter | neovim | append | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 1029 |
| pi-native | neovim | append | 0.000 | 1.000 | 645 | 0.0 | 0.000 | 705 |
| hermes-native | neovim | append | 0.000 | 1.000 | 645 | 0.0 | 0.000 | 705 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| freshctx-file | neovim | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-adapter | neovim | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| hermes-adapter | neovim | delete | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-native | neovim | delete | 0.000 | 1.000 | 69 | 0.0 | 1.000 | 127 |
| hermes-native | neovim | delete | 0.000 | 1.000 | 69 | 0.0 | 1.000 | 127 |
| freshctx-region | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 561 |
| freshctx-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 7518 |
| pi-adapter | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 561 |
| hermes-adapter | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 561 |
| pi-native | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 254 |
| hermes-native | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 254 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 872 |
| freshctx-file | neovim | interior-edit | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 7483 |
| pi-adapter | neovim | interior-edit | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 872 |
| hermes-adapter | neovim | interior-edit | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 872 |
| pi-native | neovim | interior-edit | 0.000 | 1.000 | 444 | 0.0 | 0.000 | 506 |
| hermes-native | neovim | interior-edit | 0.000 | 1.000 | 444 | 0.0 | 0.000 | 506 |
| freshctx-region | neovim | move-in-file | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 698 |
| freshctx-file | neovim | move-in-file | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 7457 |
| pi-adapter | neovim | move-in-file | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 698 |
| hermes-adapter | neovim | move-in-file | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 698 |
| pi-native | neovim | move-in-file | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 363 |
| hermes-native | neovim | move-in-file | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 363 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | baseline | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6290 | 5686 |
| go-tools | append | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | pi-native | 1.000 | 0.000 | 0.000 | 0 | 277 | -327 |
| go-tools | append | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 277 | -327 |
| go-tools | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | pi-native | 1.000 | 0.000 | 1.000 | 66 | 124 | -40 |
| go-tools | delete | hermes-native | 1.000 | 0.000 | 1.000 | 66 | 124 | -40 |
| go-tools | duplicate-boundary | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6501 | 5692 |
| go-tools | duplicate-boundary | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | pi-native | 1.000 | 0.000 | 0.000 | 0 | 522 | -287 |
| go-tools | duplicate-boundary | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 522 | -287 |
| go-tools | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6289 | 5727 |
| go-tools | interior-edit | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | pi-native | 0.000 | 0.000 | 1.000 | 137 | 185 | -377 |
| go-tools | interior-edit | hermes-native | 0.000 | 0.000 | 1.000 | 137 | 185 | -377 |
| go-tools | move-in-file | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6265 | 5727 |
| go-tools | move-in-file | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | pi-native | 1.000 | 0.000 | 0.000 | 0 | 205 | -333 |
| go-tools | move-in-file | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 205 | -333 |
| neovim | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7484 | 6455 |
| neovim | append | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | pi-native | 0.000 | 0.000 | 1.000 | 645 | 705 | -324 |
| neovim | append | hermes-native | 0.000 | 0.000 | 1.000 | 645 | 705 | -324 |
| neovim | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | pi-native | 1.000 | 0.000 | 1.000 | 69 | 127 | -37 |
| neovim | delete | hermes-native | 1.000 | 0.000 | 1.000 | 69 | 127 | -37 |
| neovim | duplicate-boundary | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7518 | 6957 |
| neovim | duplicate-boundary | pi-adapter | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | hermes-adapter | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | pi-native | 1.000 | 0.000 | 0.000 | 0 | 254 | -307 |
| neovim | duplicate-boundary | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 254 | -307 |
| neovim | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7483 | 6611 |
| neovim | interior-edit | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | pi-native | 0.000 | 0.000 | 1.000 | 444 | 506 | -366 |
| neovim | interior-edit | hermes-native | 0.000 | 0.000 | 1.000 | 444 | 506 | -366 |
| neovim | move-in-file | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7457 | 6759 |
| neovim | move-in-file | pi-adapter | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | hermes-adapter | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | pi-native | 1.000 | 0.000 | 0.000 | 0 | 363 | -335 |
| neovim | move-in-file | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 363 | -335 |
