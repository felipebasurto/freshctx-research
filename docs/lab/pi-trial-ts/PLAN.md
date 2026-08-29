# Pi-only TypeScript measure pack

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Pi-alone on TypeScript after a symbol-scope read of
`settleDailyLedger` and an interior flip on that symbol? Does Tree-sitter inside
FreshCtx change the outcome vs the same adapter with the sidecar off?

Answered in [REPORT.md](REPORT.md) at `1a002ffa`. Tree-sitter arm t2 last
request is 7794 bytes vs Pi-alone 12044. Sidecar-off fail-closed. Not a paper
result.

Tree-sitter lives inside FreshCtx. The host passes `scope=symbol` with selector
`settleDailyLedger`. The harness never exposes a Tree-sitter toggle.

## Arms

Same fixture, same symbol-scope read prompt, same interior flip (`ST0` → `ST1` in
`settleDailyLedger`), same turn-2 user prompt on every arm.

| Arm | Pi | FreshCtx | Tree-sitter sidecar |
|---|---|---|---|
| A `nothing` | yes | no | n/a |
| B `freshctx-no-ts` | yes | yes | off (`FRESHCTX_SIDECAR=off` in harness) |
| C `freshctx-ts` | yes | yes | on (default `adapters/pi/extension.ts`) |

Arm B and C share the same extension path and prompts. Only harness env differs.

## Fixture

`fixture/src/settlement.ts` exports several lookalike `settle*` helpers. A
symbol-scope read targets `settleDailyLedger` only. The flip is an interior edit
on that export (`MARKER_SETTLE`).

## Turns

1. **t1-read.** Read symbol `settleDailyLedger` (`scope=symbol`). Pi reports initial marker.
2. **flip-settle.** Runner mutates disk (`ST0` → `ST1`) without Pi re-reading.
3. **t2-settle.** Same prompt on all arms: quote current `MARKER_SETTLE` with no tools.

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
| `resolution` | `none` (arm A) or FreshCtx mechanism on B/C (`sidecar`, `whole-file`, …) |

No `AUTORESEARCH_SCORE` in this pack.

## Drivers

1. **Manual battery.** `BATTERY.md` plus `live.mjs` reset/mutate/status.
2. **RPC harness.** `auto-rpc.mjs` when official `pi` is on PATH. Model pinned
   to `deepseek-v4-flash`. Resolves repo root by walking up to
   `adapters/pi/extension.ts`.

Working copies: `docs/lab/pi-trial-ts/.work/` (gitignored).

## Out of scope

- Holdout gold, policy, anchors, projector edits
- Official TAP / ctxbench retune
- `--relock`

## Base

Prepared from main `5bb53c3e02a3a4b3394ce7e7bb297a5316f2acd8`. Official table
395/0/17/412, score 89.107165. Door `f8771c93`, lock `79e29d09` frozen.
