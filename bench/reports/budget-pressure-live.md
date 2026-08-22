# CtxBench budget-pressure live summarizer (budget-pressure-live-dev-v0.1)

**Summarization: live** — Hermes `compress()` invoked with auxiliary model `deepseek-chat` at `api.deepseek.com` (not the `FRESHCTX_CAPTURE_OK` capture stub).

- pack traces: `budget-pressure-dev-v0.1`
- model id: `deepseek-chat`
- base host: `api.deepseek.com`
- hermes cells live compress: 6/6
- stub cells: 0
- hosts.lock SHA-256: `54ab03119a253b8afa2dd7c8e392e74a5fad169b75df21958aa97b1df82a8b77`
- pi host SHA: `c49906ec77788625aacbdc53ebca6fbe65bd20f5`
- hermes host SHA: `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`

Generated: 2026-08-22T17:38:49.837Z

## Per-cell metrics (final capture)

| baseline | repo | family | hermes-mode | exact-current | stale | stale-bytes | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | n/a | 1.000 | 0.000 | 0 | 1.000 | 604 |
| freshctx-file | go-tools | append | n/a | 0.000 | 0.000 | 0 | 0.000 | 164 |
| pi-native | go-tools | append | n/a | 0.000 | 0.000 | 0 | 1.000 | 19053 |
| hermes-native | go-tools | append | compress | 0.000 | 0.000 | 0 | 1.000 | 4039 |
| freshctx-region | go-tools | delete | n/a | 0.000 | 0.000 | 0 | 1.000 | 164 |
| freshctx-file | go-tools | delete | n/a | 0.000 | 0.000 | 0 | 1.000 | 164 |
| pi-native | go-tools | delete | n/a | 0.000 | 0.200 | 66 | 1.000 | 18900 |
| hermes-native | go-tools | delete | compress | 0.000 | 0.200 | 66 | 1.000 | 3886 |
| freshctx-region | go-tools | interior-edit | n/a | 1.000 | 0.000 | 0 | 1.000 | 562 |
| freshctx-file | go-tools | interior-edit | n/a | 0.000 | 0.000 | 0 | 0.000 | 164 |
| pi-native | go-tools | interior-edit | n/a | 0.000 | 0.200 | 137 | 0.000 | 18961 |
| hermes-native | go-tools | interior-edit | compress | 0.000 | 0.200 | 137 | 0.000 | 3947 |
| freshctx-region | neovim | append | n/a | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| freshctx-file | neovim | append | n/a | 0.000 | 0.000 | 0 | 0.000 | 164 |
| pi-native | neovim | append | n/a | 0.000 | 0.200 | 645 | 0.000 | 19481 |
| hermes-native | neovim | append | compress | 0.000 | 0.200 | 645 | 0.000 | 4467 |
| freshctx-region | neovim | delete | n/a | 0.000 | 0.000 | 0 | 1.000 | 164 |
| freshctx-file | neovim | delete | n/a | 0.000 | 0.000 | 0 | 1.000 | 164 |
| pi-native | neovim | delete | n/a | 0.000 | 0.200 | 69 | 1.000 | 18903 |
| hermes-native | neovim | delete | compress | 0.000 | 0.200 | 69 | 1.000 | 3889 |
| freshctx-region | neovim | interior-edit | n/a | 1.000 | 0.000 | 0 | 1.000 | 872 |
| freshctx-file | neovim | interior-edit | n/a | 0.000 | 0.000 | 0 | 0.000 | 164 |
| pi-native | neovim | interior-edit | n/a | 0.000 | 0.200 | 444 | 0.000 | 19282 |
| hermes-native | neovim | interior-edit | compress | 0.000 | 0.200 | 444 | 0.000 | 4268 |
