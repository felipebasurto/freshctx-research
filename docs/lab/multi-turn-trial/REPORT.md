# Multi-turn host trial report

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx keep the current `settleDailyLedger` marker across later
mutate/flip turns after the 2-turn Pi/Hermes packs? Does Isolated Semantic
Engine still omit sibling `SW0` after turn 2?

## Status

Harness + unit tests only. No live Pi or Hermes capture on this leftover.
Do not invent `request_bytes`, `prompt_tokens`, or `SETTLE=` replies.

| field | value |
|---|---|
| Date (UTC) | 2026-09-01 |
| Harness base | `4ab081fd8d81335cc58dd776f2d3726ce73920ac` |
| Model | `deepseek-v4-flash` |
| Fixture | `docs/lab/pi-trial-ts/fixture/src/settlement.ts` |
| Flips | `ST0` → `ST1` → `ST2` in `settleDailyLedger` only |
| Turns | 4 (`t1-read`, `t2-settle`, `t3-settle`, `t4-unchanged`) |
| Hosts | Pi and Hermes |
| Driver | `auto-rpc.mjs --host=pi\|hermes\|both` |

## Measure table

Pending a real host run. After capture:

```bash
node docs/lab/multi-turn-trial/print-columns.mjs
```

Paste that TSV here. Leave cells as `—` when a dump is missing.
Do not invent live columns.

## Notes

Dump-only proxy answers with a dummy completion when no key is present.
That dummy is not a live score.
The 2-turn dump scanners still treat `ST1` as `t2ExactNewBytes`.
This pack overlays `scan.mjs` on the raw dump bodies so later turns can
score `ST2` without editing the shared 2-turn packs.
