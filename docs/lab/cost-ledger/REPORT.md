# Cost-ledger report

Status: **harness-only**. No live long-session table.

Official accepted TAP stays **549/0/0/549**. This leftover does not replace
that table. INDEX.md and METRICS.md were not edited.

GHA on `671b38bb`: `# tests 619` `# pass 617` `# fail 2` `# skipped 0`.
That pair is Isolated Semantic Engine vocabulary plus living-docs (next pack).
It is not a Cloud Agent Isolated Semantic Engine WASM-missing suite.

This Cloud Agent checkout has no Isolated Semantic Engine WASM.
This-run TAP: `# tests 619` `# pass 576` `# fail 43` `# skipped 0`.
That row is not GHA.
PCR 0137 tests are 13/13. PCR 0140 tests are 12/12.
Living-docs PCR count is the next pack. This leftover does not chase it.

## What this leftover measured

Unit tests for `docs/lab/cost-ledger/`:

- accumulate `request_bytes` across eight turns;
- keep missing provider tokens as `—`;
- compute a cited DeepSeek v4 flash cost proxy only from provider tokens;
- label a 4-byte token estimate separately;
- compare FreshCtx off (`nothing`) vs FreshCtx (`freshctx-ts`, Isolated Semantic Engine / Tree-sitter).

The file `fixture/synthetic-session.json` is labeled `synthetic` /
`liveHost: false`. It is a fixture for accumulation math. It is not a live host
score.

## Live host

Not run. Do not copy two-turn PCR 0135 bytes into this report as an
eight-turn total.

`prompt_tokens` stay `—` until a dump includes provider `usage`.

## Model

`deepseek-v4-flash` only.

## PCR 0140

Two-turn ingest is INVALID for long-session cost. PCR 0135 Hermes
`request_bytes` stay a two-turn table. They are not summed here.

CI reprints `fixture/long-session-ci.json` (label `fixture`, `liveHost: false`)
for `pi` and `hermes`, arms `nothing` vs FreshCtx (`freshctx-ts`). Those token and `$`
columns are the PCR 0137 unit-test provider pairs plus the cited flash
cost-proxy table. They are not a live host score.

No live long-session table. This checkout has no `DEEPSEEK_API_KEY`, no `pi`,
and no `hermes`. Missing live `prompt_tokens` stay `—`. Door and lock stay
frozen. Official table stays 549/0/0/549.

## Next

A later agent may fill `.work/capture/` from official Hermes or Pi with the
cost-ledger dump proxy (response `usage`) and reprint the ledger. Door and
lock stay frozen. No `--relock`.
