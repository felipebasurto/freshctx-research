# Multi-turn host trial

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.
Harness leftover after PCR 0135. The 2-turn packs stop at `t2-settle`.

## Question

After a symbol-scope host read of `settleDailyLedger`, does FreshCtx keep the
current interior marker across later mutate/flip turns? Does Isolated Semantic
Engine still omit sibling `SW0` after turn 2?

The 2-turn packs (`docs/lab/pi-trial-ts`, `docs/lab/hermes-trial-ts`) answer
turn 2 only (`ST0` → `ST1`). This pack continues the same session:

| turn | mutate | expected marker |
|---|---|---|
| 1 `t1-read` | none | `ST0` |
| 2 `t2-settle` | `flip-settle` | `ST1` |
| 3 `t3-settle` | `flip-settle-2` | `ST2` |
| 4 `t4-unchanged` | none | `ST2` |

Tree-sitter lives inside FreshCtx as the Isolated Semantic Engine.
The host still passes `scope=symbol` with selector `settleDailyLedger`.
The harness never exposes a Tree-sitter toggle.

## Arms

Same fixture and prompts on every arm and both hosts.

| Arm | Host | FreshCtx | Isolated Semantic Engine |
|---|---|---|---|
| A `nothing` | Pi or Hermes | no | n/a |
| B `freshctx-no-ts` | Pi or Hermes | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) |
| C `freshctx-ts` | Pi or Hermes | yes | on (default adapter factory) |

Model is `deepseek-v4-flash` only. Never pro.

## Fixture

`docs/lab/pi-trial-ts/fixture/src/settlement.ts`. Working copies live under
`docs/lab/multi-turn-trial/.work/{host}/{arm}/`.

## Launch

Reuse existing launch patterns. Do not invent a new host protocol.

- Pi: `piArgsForArm` + force-host-read + `dump-request.ts` from `pi-trial-ts`.
- Hermes: `launchHermes` + dump proxy + force-host-read plugin from `hermes-trial-ts`.

## Printed columns

```bash
node docs/lab/multi-turn-trial/print-columns.mjs
```

| column | meaning |
|---|---|
| `exact_current_bytes` | later-turn request contains the expected marker for that turn |
| `stale_prior_bytes` | later-turn request still contains an older settle marker |
| `sibling_bytes_in_request` | later-turn request still contains sibling `SW0` |
| `request_bytes` | UTF-8 bytes of serialized request JSON for the turn |
| `prompt_tokens` | provider `usage.prompt_tokens` when present, else `—` |
| `stdout_current` | host stdout matches `SETTLE=<expected>` |
| `resolution` | `none` (arm A) or FreshCtx mechanism on B/C |

No `AUTORESEARCH_SCORE`. Do not invent live `request_bytes`.

## Drivers

1. Manual battery. `BATTERY.md` plus `live.mjs` reset/mutate/status.
2. `auto-rpc.mjs --host=pi|hermes|both` when the official host is on PATH.

## Out of scope

- Holdout gold, policy, anchors, projector edits
- Official TAP / ctxbench retune
- `--relock`
- INDEX / METRICS / README PCR-count edits
- Live scores in this leftover (harness + unit tests first)

## Base

Prepared from main `4ab081fd8d81335cc58dd776f2d3726ce73920ac` (PCR 0135).
Official table 549/0/0/549. Door `f8771c93`, lock `4a953591` frozen.
