# CtxBench budget-pressure live summarizer (budget-pressure-live-dev-v0.1)

**Status: BLOCKED** — live Hermes auxiliary model unavailable on this runner.

This pack requires a real auxiliary model call via pinned Hermes `ContextCompressor.compress()`. It did **not** set `FRESHCTX_CAPTURE_OK` and did **not** fall back to the capture-provider stub (`FRESHCTX_CAPTURE_OK`).

## Blocked reasons

- OPENAI_API_KEY and HERMES_API_KEY are both unset
- default base URL is stub (http://127.0.0.1:8787/v1); set OPENAI_BASE_URL or HERMES_BASE_URL

## Environment (no secrets)

- model id: `freshctx-capture`
- base host: `127.0.0.1:8787`
- api key present: false
- capture stub enabled: false

- pack traces: `budget-pressure-dev-v0.1` (reused; no holdout copy)
- hosts.lock SHA-256: `54ab03119a253b8afa2dd7c8e392e74a5fad169b75df21958aa97b1df82a8b77`
- pi host SHA: `c49906ec77788625aacbdc53ebca6fbe65bd20f5`
- hermes host SHA: `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`

Generated: 2026-08-22T17:24:01.301Z

No metrics table generated (fail-closed).
