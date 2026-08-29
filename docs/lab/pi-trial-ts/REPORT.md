# Pi trial TypeScript report

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Pi-alone on TypeScript, and does Tree-sitter beat
FreshCtx-without-Tree-sitter or is it noise?

**Do not answer here until a live run fills the table below.**

## Setup

| field | value |
|---|---|
| Date (UTC) | _pending run_ |
| Base commit | `4e4a930d3adce05da6bc304a27fee8d6b0172539` |
| Pi version | _pending run_ |
| Model | `deepseek-v4-flash` |
| Fixture | `docs/lab/pi-trial-ts/fixture/src/settlement.ts` |
| Flip | interior `ST0` → `ST1` in `settleDailyLedger` |
| Driver | _manual BATTERY / auto-rpc.mjs_ |

## Measure table

Paste output of `node docs/lab/pi-trial-ts/print-columns.mjs` after capture.

```
arm	turn	t2_exact_new_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	pi_stdout_current	resolution
without	1	n/a	n/a	—	—	n/a	n/a
without	2	—	—	—	—	—	—
with-file	1	n/a	n/a	—	—	n/a	n/a
with-file	2	—	—	—	—	—	—
with-symbol	1	n/a	n/a	—	—	n/a	n/a
with-symbol	2	—	—	—	—	—	—
```

## Notes per arm

### A `without`

_Pending._

### B `with-file`

_Pending._

### C `with-symbol`

_Pending._

## Adapter smokes (synthetic)

Run after any adapter-touching PR. Not a substitute for the live table above.

| Command | Exit | Notes |
|---|---|---|
| `npm test` | _pending_ | |
| `npm run evaluate` | _pending_ | report score only if measured; do not invent |

Door `f8771c93894095348185ef3453a3c2498355b3c6`. Lock
`79e29d09a9ec12b1128617f683f50a35a3c8809e`. No `--relock`.

## Could not measure

_Pending run._
