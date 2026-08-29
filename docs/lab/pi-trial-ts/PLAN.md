# Pi-only TypeScript measure pack

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question (do not answer until a run exists)

Does FreshCtx beat Pi-alone on TypeScript, and does Tree-sitter beat
FreshCtx-without-Tree-sitter or is it noise?

## Arms

Same fixture, same interior flip (`ST0` → `ST1` in `settleDailyLedger`), same
turn-2 user prompt. Turn-1 read instructions differ only where scope requires it.

| Arm | Pi | FreshCtx | Read scope | Sidecar |
|---|---|---|---|---|
| A `without` | yes | no | whole file | n/a |
| B `with-file` | yes | yes | whole file | not used |
| C `with-symbol` | yes | yes | `scope=symbol` on target + sibling | used on refresh |

## Fixture

`fixture/src/settlement.ts` exports several lookalike `settle*` helpers. A
whole-file read includes sibling bodies and padding noise. The flip is an
interior edit on `settleDailyLedger` only (`MARKER_SETTLE`).

## Turns

1. **t1-read.** Read (file or symbol per arm). Pi reports initial markers.
2. **flip-settle.** Runner mutates disk (`ST0` → `ST1`) without Pi re-reading.
3. **t2-settle.** Same prompt on all arms: quote current `MARKER_SETTLE` with
   no tools.

## Printed columns

After a capture exists, run:

```bash
node docs/lab/pi-trial-ts/print-columns.mjs
```

| column | meaning |
|---|---|
| `t2_exact_new_bytes` | turn-2 provider request contains `ST1` |
| `sibling_bytes_in_request` | turn-2 request still contains sibling marker `SW0` |
| `request_bytes` | UTF-8 bytes of serialized request JSON for the turn |
| `prompt_tokens` | provider `usage.prompt_tokens` when present, else `—` |
| `pi_stdout_current` | Pi stdout matches `SETTLE=ST1` |
| `resolution` | `none` (arm A), `file`, or `sidecar` (mechanism only) |

No `AUTORESEARCH_SCORE` in this pack.

## Drivers

1. **Manual battery.** `BATTERY.md` plus `live.mjs` reset/mutate/status.
2. **RPC harness.** `auto-rpc.mjs` when official `pi` is on PATH. Model pinned
   to `deepseek-v4-flash`.

Working copies: `docs/lab/pi-trial-ts/.work/` (gitignored).

## Out of scope

- Hermes
- Holdout gold, policy, anchors, projector edits
- Official TAP / ctxbench retune
- `--relock`

## Base

Prepared from main `4e4a930d3adce05da6bc304a27fee8d6b0172539`. Official table
388/0/17/405, score 89.107165. Door `f8771c93`, lock `79e29d09` frozen.
