# CtxBench budget-pressure native bake-off (budget-pressure-dev-v0.1)

Label: `budget-pressure-dev` / `native-host`. Measurement infrastructure only; not a performance claim.

Hermes `contextLength` is derived from assembled message tokens (`rough * 1.1`) so `should_compress` fires. Live summarization uses capture-provider stub when `FRESHCTX_CAPTURE_OK=1`.

- pack: `budget-pressure-dev-v0.1`
- hosts.lock SHA-256: `54ab03119a253b8afa2dd7c8e392e74a5fad169b75df21958aa97b1df82a8b77`
- pi host SHA: `c49906ec77788625aacbdc53ebca6fbe65bd20f5`
- hermes host SHA: `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`

Generated: 2026-08-22T17:07:11.993Z

## Per-cell metrics (final capture)

| baseline | repo | family | hermes-mode | exact-current | stale | stale-bytes | duplicate | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 604 |
| freshctx-file | go-tools | append | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | go-tools | append | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 19053 |
| hermes-native | go-tools | append | compress | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 4039 |
| freshctx-region | go-tools | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| freshctx-file | go-tools | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-native | go-tools | delete | n/a | 0.000 | 0.200 | 66 | 0.0 | 1.000 | 18900 |
| hermes-native | go-tools | delete | compress | 0.000 | 0.200 | 66 | 0.0 | 1.000 | 3886 |
| freshctx-region | go-tools | interior-edit | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 562 |
| freshctx-file | go-tools | interior-edit | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | go-tools | interior-edit | n/a | 0.000 | 0.200 | 137 | 0.0 | 0.000 | 18961 |
| hermes-native | go-tools | interior-edit | compress | 0.000 | 0.200 | 137 | 0.0 | 0.000 | 3947 |
| freshctx-region | neovim | append | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 1029 |
| freshctx-file | neovim | append | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | neovim | append | n/a | 0.000 | 0.200 | 645 | 0.0 | 0.000 | 19481 |
| hermes-native | neovim | append | compress | 0.000 | 0.200 | 645 | 0.0 | 0.000 | 4467 |
| freshctx-region | neovim | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| freshctx-file | neovim | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-native | neovim | delete | n/a | 0.000 | 0.200 | 69 | 0.0 | 1.000 | 18903 |
| hermes-native | neovim | delete | compress | 0.000 | 0.200 | 69 | 0.0 | 1.000 | 3889 |
| freshctx-region | neovim | interior-edit | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 872 |
| freshctx-file | neovim | interior-edit | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | neovim | interior-edit | n/a | 0.000 | 0.200 | 444 | 0.0 | 0.000 | 19282 |
| hermes-native | neovim | interior-edit | compress | 0.000 | 0.200 | 444 | 0.0 | 0.000 | 4268 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | baseline | hermes-mode | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | freshctx-file | n/a | 0.000 | 0.000 | 0.000 | 0 | 164 | -440 |
| go-tools | append | pi-native | n/a | 1.000 | 0.000 | 0.000 | 0 | 19053 | 18449 |
| go-tools | append | hermes-native | compress | 1.000 | 0.000 | 0.000 | 0 | 4039 | 3435 |
| go-tools | delete | freshctx-region | n/a | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | freshctx-file | n/a | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | pi-native | n/a | 1.000 | 0.000 | 0.200 | 66 | 18900 | 18736 |
| go-tools | delete | hermes-native | compress | 1.000 | 0.000 | 0.200 | 66 | 3886 | 3722 |
| go-tools | interior-edit | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | freshctx-file | n/a | 0.000 | 0.000 | 0.000 | 0 | 164 | -398 |
| go-tools | interior-edit | pi-native | n/a | 0.000 | 0.000 | 0.200 | 137 | 18961 | 18399 |
| go-tools | interior-edit | hermes-native | compress | 0.000 | 0.000 | 0.200 | 137 | 3947 | 3385 |
| neovim | append | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | freshctx-file | n/a | 0.000 | 0.000 | 0.000 | 0 | 164 | -865 |
| neovim | append | pi-native | n/a | 0.000 | 0.000 | 0.200 | 645 | 19481 | 18452 |
| neovim | append | hermes-native | compress | 0.000 | 0.000 | 0.200 | 645 | 4467 | 3438 |
| neovim | delete | freshctx-region | n/a | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | freshctx-file | n/a | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | pi-native | n/a | 1.000 | 0.000 | 0.200 | 69 | 18903 | 18739 |
| neovim | delete | hermes-native | compress | 1.000 | 0.000 | 0.200 | 69 | 3889 | 3725 |
| neovim | interior-edit | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | freshctx-file | n/a | 0.000 | 0.000 | 0.000 | 0 | 164 | -708 |
| neovim | interior-edit | pi-native | n/a | 0.000 | 0.000 | 0.200 | 444 | 19282 | 18410 |
| neovim | interior-edit | hermes-native | compress | 0.000 | 0.000 | 0.200 | 444 | 4268 | 3396 |
