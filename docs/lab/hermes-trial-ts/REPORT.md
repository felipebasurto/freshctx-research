# Hermes trial TypeScript report

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Hermes-alone on TypeScript after a symbol-scope read of
`settleDailyLedger` and interior flip on that symbol? Does Tree-sitter inside
FreshCtx (host passes `scope=symbol` with selector `settleDailyLedger`) change
the outcome vs the same adapter with the Isolated Semantic Engine off?

Harness only on this PR. No live three-arm table yet. Do not invent scores.

## Setup

| field | value |
|---|---|
| Fixture | `docs/lab/pi-trial-ts/fixture/src/settlement.ts` |
| Flip | interior `ST0` → `ST1` in `settleDailyLedger` |
| Driver | `auto-rpc.mjs` + dump proxy + `launch-hermes` |
| Model | `deepseek-v4-flash` |

## Measure table

Pending live capture. Run `auto-rpc.mjs` then `print-columns.mjs`.
