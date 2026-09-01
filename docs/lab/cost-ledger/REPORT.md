# Cost-ledger report

Status: **harness-only**. No live long-session table.

Official accepted TAP stays **549/0/0/549**. This leftover does not replace
that table. INDEX.md and METRICS.md were not edited.

## What this leftover measured

Unit tests for `docs/lab/cost-ledger/`:

- accumulate `request_bytes` across eight turns;
- keep missing provider tokens as `—`;
- compute a cited DeepSeek v4 flash cost proxy only from provider tokens;
- label a 4-byte token estimate separately;
- compare FreshCtx off vs on, and Tree-sitter Isolated Semantic Engine off vs on.

The file `fixture/synthetic-session.json` is labeled `synthetic` /
`liveHost: false`. It is a fixture for accumulation math. It is not a live host
score.

## Live host

Not run. Do not copy two-turn PCR 0135 bytes into this report as an
eight-turn total.

`prompt_tokens` stay `—` until a dump includes provider `usage`.

## Model

`deepseek-v4-flash` only.

## Next

A later agent may fill `.work/capture/` from official Hermes or Pi and reprint
the ledger. Door and lock stay frozen. No `--relock`.
