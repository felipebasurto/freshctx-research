# CtxBench budget-pressure Hermes FreshCtx adapter (budget-pressure-hermes-fresh-dev-v0.1)

Label: `budget-pressure-dev` / `hermes-fresh`. FreshCtx region grain on the Hermes request path (adapter), not native Hermes compression.

- pack: `budget-pressure-dev-v0.1`
- status: candidate
- resultSetHash: null
- HEAD: `fa6e2011d08b2f5f0ace283d866c0ea6a416b8af`
- merge-base vs fa6e2011: `fa6e2011d08b2f5f0ace283d866c0ea6a416b8af`
- door blob (src/anchors.mjs): `f8771c93894095348185ef3453a3c2498355b3c6`
- repos.lock blob: `79e29d09a9ec12b1128617f683f50a35a3c8809e`
- hosts.lock SHA-256: `54ab03119a253b8afa2dd7c8e392e74a5fad169b75df21958aa97b1df82a8b77`
- pi host SHA: `c49906ec77788625aacbdc53ebca6fbe65bd20f5`
- hermes host SHA: `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`
- hermes-native source: replayed from bench/reports/budget-pressure-native.md (PCR 0033; trace-set hash verified)

## hermes-fresh vs freshctx-region (stale/recall)

**Finding:** hermes-fresh matched freshctx-region on required-recall and stale-bytes for all 6 cells.

Generated: 2026-08-22T17:46:45.284Z

## Per-cell metrics (final capture)

| baseline | repo | family | exact-current | stale | stale-bytes | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| hermes-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 4039 |
| hermes-fresh | go-tools | append | 0.200 | 0.000 | 0 | 1.000 | 20300 |
| pi-fresh | go-tools | append | 0.200 | 0.000 | 0 | 1.000 | 20300 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | go-tools | delete | 0.000 | 0.200 | 66 | 1.000 | 3886 |
| hermes-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 19860 |
| pi-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 19860 |
| freshctx-region | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| hermes-native | go-tools | interior-edit | 0.000 | 0.200 | 137 | 0.000 | 3947 |
| hermes-fresh | go-tools | interior-edit | 0.200 | 0.000 | 0 | 1.000 | 20258 |
| pi-fresh | go-tools | interior-edit | 0.200 | 0.000 | 0 | 1.000 | 20258 |
| freshctx-region | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| hermes-native | neovim | append | 0.000 | 0.200 | 645 | 0.000 | 4467 |
| hermes-fresh | neovim | append | 0.200 | 0.000 | 0 | 1.000 | 20725 |
| pi-fresh | neovim | append | 0.200 | 0.000 | 0 | 1.000 | 20725 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | neovim | delete | 0.000 | 0.200 | 69 | 1.000 | 3889 |
| hermes-fresh | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 19860 |
| pi-fresh | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 19860 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| hermes-native | neovim | interior-edit | 0.000 | 0.200 | 444 | 0.000 | 4268 |
| hermes-fresh | neovim | interior-edit | 0.200 | 0.000 | 0 | 1.000 | 20568 |
| pi-fresh | neovim | interior-edit | 0.200 | 0.000 | 0 | 1.000 | 20568 |

## Delta vs core `freshctx-region` (final capture per trace)

| repo | family | baseline | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | hermes-native | 1.000 | 0.000 | 0.000 | 0 | 4039 | 3435 |
| go-tools | append | hermes-fresh | 1.000 | 0.200 | 0.000 | 0 | 20300 | 19696 |
| go-tools | append | pi-fresh | 1.000 | 0.200 | 0.000 | 0 | 20300 | 19696 |
| go-tools | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | hermes-native | 1.000 | 0.000 | 0.200 | 66 | 3886 | 3722 |
| go-tools | delete | hermes-fresh | 1.000 | 0.000 | 0.000 | 0 | 19860 | 19696 |
| go-tools | delete | pi-fresh | 1.000 | 0.000 | 0.000 | 0 | 19860 | 19696 |
| go-tools | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | hermes-native | 0.000 | 0.000 | 0.200 | 137 | 3947 | 3385 |
| go-tools | interior-edit | hermes-fresh | 1.000 | 0.200 | 0.000 | 0 | 20258 | 19696 |
| go-tools | interior-edit | pi-fresh | 1.000 | 0.200 | 0.000 | 0 | 20258 | 19696 |
| neovim | append | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | hermes-native | 0.000 | 0.000 | 0.200 | 645 | 4467 | 3438 |
| neovim | append | hermes-fresh | 1.000 | 0.200 | 0.000 | 0 | 20725 | 19696 |
| neovim | append | pi-fresh | 1.000 | 0.200 | 0.000 | 0 | 20725 | 19696 |
| neovim | delete | freshctx-region | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | hermes-native | 1.000 | 0.000 | 0.200 | 69 | 3889 | 3725 |
| neovim | delete | hermes-fresh | 1.000 | 0.000 | 0.000 | 0 | 19860 | 19696 |
| neovim | delete | pi-fresh | 1.000 | 0.000 | 0.000 | 0 | 19860 | 19696 |
| neovim | interior-edit | freshctx-region | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | hermes-native | 0.000 | 0.000 | 0.200 | 444 | 4268 | 3396 |
| neovim | interior-edit | hermes-fresh | 1.000 | 0.200 | 0.000 | 0 | 20568 | 19696 |
| neovim | interior-edit | pi-fresh | 1.000 | 0.200 | 0.000 | 0 | 20568 | 19696 |
