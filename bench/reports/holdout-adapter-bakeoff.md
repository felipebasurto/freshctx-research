# CtxBench holdout adapter bake-off (holdout-adapter-bakeoff-dev-v0.1)

Label: `public-repo-holdout` / `holdout-adapter-bakeoff`. Replay table on unsealed holdout v0.1 regression traces; not a performance or SOTA claim.

- pack: `holdout-v0.1`
- status: candidate
- resultSetHash: null
- HEAD: `3a886516a9194fa282e6579a9a5a038c485b93cf`
- merge-base vs e45b2cdb: `e45b2cdbf15aec2b4133e232e5b005dd832f49cb`
- door blob (src/anchors.mjs): `f8771c93894095348185ef3453a3c2498355b3c6`
- repos.lock blob: `79e29d09a9ec12b1128617f683f50a35a3c8809e`
- hosts.lock SHA-256: `54ab03119a253b8afa2dd7c8e392e74a5fad169b75df21958aa97b1df82a8b77`
- pi host SHA: `c49906ec77788625aacbdc53ebca6fbe65bd20f5`
- hermes host SHA: `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`
- hermes-native source: replayed from bench/reports/native-holdout.md (PCR 0032; holdout window native-no-op)
- corvus-file source: live run (bench/corvus.mjs via trace-runner; not replayed)

## corvus-file vs freshctx-region (stale/recall)

**Finding:** corvus-file matched freshctx-region on required-recall and stale-bytes for all 10 holdout cells.

## hermes-fresh vs freshctx-region (stale/recall)

**Finding:** hermes-fresh matched freshctx-region on required-recall and stale-bytes for all 10 holdout cells.

## Hermes native compression (holdout window)

**Finding:** Hermes native stayed **native-no-op** on all 10 cells (holdout window below `should_compress` threshold; no Hermes quality number claimed).

Generated: 2026-08-25T18:07:03.038Z

## Per-cell metrics (10 traces)

| baseline | repo | family | exact-current | stale | stale-bytes | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| freshctx-file | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 6290 |
| corvus-file | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 5939 |
| hermes-fresh | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| hermes-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 277 |
| pi-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 277 |
| pi-fresh | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| freshctx-file | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| corvus-file | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 68 |
| hermes-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| hermes-native | go-tools | delete | 0.000 | 1.000 | 66 | 1.000 | 124 |
| pi-native | go-tools | delete | 0.000 | 1.000 | 66 | 1.000 | 124 |
| pi-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| freshctx-region | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 809 |
| freshctx-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 6501 |
| corvus-file | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 6150 |
| hermes-fresh | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 809 |
| hermes-native | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 522 |
| pi-native | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 522 |
| pi-fresh | go-tools | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 809 |
| freshctx-region | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| freshctx-file | go-tools | interior-edit | 0.000 | 0.000 | 0 | 1.000 | 6289 |
| corvus-file | go-tools | interior-edit | 0.000 | 0.000 | 0 | 1.000 | 5938 |
| hermes-fresh | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| hermes-native | go-tools | interior-edit | 0.000 | 1.000 | 137 | 0.000 | 185 |
| pi-native | go-tools | interior-edit | 0.000 | 1.000 | 137 | 0.000 | 185 |
| pi-fresh | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| freshctx-region | go-tools | move-in-file | 1.000 | 0.000 | 0 | 1.000 | 538 |
| freshctx-file | go-tools | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 6265 |
| corvus-file | go-tools | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 5914 |
| hermes-fresh | go-tools | move-in-file | 1.000 | 0.000 | 0 | 1.000 | 538 |
| hermes-native | go-tools | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 205 |
| pi-native | go-tools | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 205 |
| pi-fresh | go-tools | move-in-file | 1.000 | 0.000 | 0 | 1.000 | 538 |
| freshctx-region | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| freshctx-file | neovim | append | 0.000 | 0.000 | 0 | 1.000 | 7484 |
| corvus-file | neovim | append | 0.000 | 0.000 | 0 | 1.000 | 7133 |
| hermes-fresh | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| hermes-native | neovim | append | 0.000 | 1.000 | 645 | 0.000 | 705 |
| pi-native | neovim | append | 0.000 | 1.000 | 645 | 0.000 | 705 |
| pi-fresh | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| freshctx-file | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| corvus-file | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 73 |
| hermes-fresh | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| hermes-native | neovim | delete | 0.000 | 1.000 | 69 | 1.000 | 127 |
| pi-native | neovim | delete | 0.000 | 1.000 | 69 | 1.000 | 127 |
| pi-fresh | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 78 |
| freshctx-region | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 561 |
| freshctx-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 7518 |
| corvus-file | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 7167 |
| hermes-fresh | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 561 |
| hermes-native | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 254 |
| pi-native | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 254 |
| pi-fresh | neovim | duplicate-boundary | 0.000 | 0.000 | 0 | 1.000 | 561 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| freshctx-file | neovim | interior-edit | 0.000 | 0.000 | 0 | 1.000 | 7483 |
| corvus-file | neovim | interior-edit | 0.000 | 0.000 | 0 | 1.000 | 7132 |
| hermes-fresh | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| hermes-native | neovim | interior-edit | 0.000 | 1.000 | 444 | 0.000 | 506 |
| pi-native | neovim | interior-edit | 0.000 | 1.000 | 444 | 0.000 | 506 |
| pi-fresh | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| freshctx-region | neovim | move-in-file | 1.000 | 0.000 | 0 | 1.000 | 698 |
| freshctx-file | neovim | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 7457 |
| corvus-file | neovim | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 7106 |
| hermes-fresh | neovim | move-in-file | 1.000 | 0.000 | 0 | 1.000 | 698 |
| hermes-native | neovim | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 363 |
| pi-native | neovim | move-in-file | 0.000 | 0.000 | 0 | 1.000 | 363 |
| pi-fresh | neovim | move-in-file | 1.000 | 0.000 | 0 | 1.000 | 698 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | baseline | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6290 | 5686 |
| go-tools | append | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 5939 | 5335 |
| go-tools | append | hermes-fresh | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 277 | -327 |
| go-tools | append | pi-native | 1.000 | 0.000 | 0.000 | 0 | 277 | -327 |
| go-tools | append | pi-fresh | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| go-tools | delete | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| go-tools | delete | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 68 | -10 |
| go-tools | delete | hermes-fresh | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| go-tools | delete | hermes-native | 1.000 | 0.000 | 1.000 | 66 | 124 | 46 |
| go-tools | delete | pi-native | 1.000 | 0.000 | 1.000 | 66 | 124 | 46 |
| go-tools | delete | pi-fresh | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| go-tools | duplicate-boundary | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6501 | 5692 |
| go-tools | duplicate-boundary | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 6150 | 5341 |
| go-tools | duplicate-boundary | hermes-fresh | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | duplicate-boundary | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 522 | -287 |
| go-tools | duplicate-boundary | pi-native | 1.000 | 0.000 | 0.000 | 0 | 522 | -287 |
| go-tools | duplicate-boundary | pi-fresh | 1.000 | 0.000 | 0.000 | 0 | 809 | 0 |
| go-tools | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6289 | 5727 |
| go-tools | interior-edit | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 5938 | 5376 |
| go-tools | interior-edit | hermes-fresh | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | hermes-native | 0.000 | 0.000 | 1.000 | 137 | 185 | -377 |
| go-tools | interior-edit | pi-native | 0.000 | 0.000 | 1.000 | 137 | 185 | -377 |
| go-tools | interior-edit | pi-fresh | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | move-in-file | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 6265 | 5727 |
| go-tools | move-in-file | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 5914 | 5376 |
| go-tools | move-in-file | hermes-fresh | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| go-tools | move-in-file | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 205 | -333 |
| go-tools | move-in-file | pi-native | 1.000 | 0.000 | 0.000 | 0 | 205 | -333 |
| go-tools | move-in-file | pi-fresh | 1.000 | 1.000 | 0.000 | 0 | 538 | 0 |
| neovim | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7484 | 6455 |
| neovim | append | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 7133 | 6104 |
| neovim | append | hermes-fresh | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | hermes-native | 0.000 | 0.000 | 1.000 | 645 | 705 | -324 |
| neovim | append | pi-native | 0.000 | 0.000 | 1.000 | 645 | 705 | -324 |
| neovim | append | pi-fresh | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| neovim | delete | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| neovim | delete | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 73 | -5 |
| neovim | delete | hermes-fresh | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| neovim | delete | hermes-native | 1.000 | 0.000 | 1.000 | 69 | 127 | 49 |
| neovim | delete | pi-native | 1.000 | 0.000 | 1.000 | 69 | 127 | 49 |
| neovim | delete | pi-fresh | 1.000 | 0.000 | 0.000 | 0 | 78 | 0 |
| neovim | duplicate-boundary | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7518 | 6957 |
| neovim | duplicate-boundary | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 7167 | 6606 |
| neovim | duplicate-boundary | hermes-fresh | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | duplicate-boundary | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 254 | -307 |
| neovim | duplicate-boundary | pi-native | 1.000 | 0.000 | 0.000 | 0 | 254 | -307 |
| neovim | duplicate-boundary | pi-fresh | 1.000 | 0.000 | 0.000 | 0 | 561 | 0 |
| neovim | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7483 | 6611 |
| neovim | interior-edit | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 7132 | 6260 |
| neovim | interior-edit | hermes-fresh | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | hermes-native | 0.000 | 0.000 | 1.000 | 444 | 506 | -366 |
| neovim | interior-edit | pi-native | 0.000 | 0.000 | 1.000 | 444 | 506 | -366 |
| neovim | interior-edit | pi-fresh | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | move-in-file | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | freshctx-file | 1.000 | 0.000 | 0.000 | 0 | 7457 | 6759 |
| neovim | move-in-file | corvus-file | 1.000 | 0.000 | 0.000 | 0 | 7106 | 6408 |
| neovim | move-in-file | hermes-fresh | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |
| neovim | move-in-file | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 363 | -335 |
| neovim | move-in-file | pi-native | 1.000 | 0.000 | 0.000 | 0 | 363 | -335 |
| neovim | move-in-file | pi-fresh | 1.000 | 1.000 | 0.000 | 0 | 698 | 0 |

## Hermes native mode per cell

| repo | family | hermes-mode |
| --- | --- | --- |
| go-tools | append | native-no-op |
| go-tools | delete | native-no-op |
| go-tools | duplicate-boundary | native-no-op |
| go-tools | interior-edit | native-no-op |
| go-tools | move-in-file | native-no-op |
| neovim | append | native-no-op |
| neovim | delete | native-no-op |
| neovim | duplicate-boundary | native-no-op |
| neovim | interior-edit | native-no-op |
| neovim | move-in-file | native-no-op |
