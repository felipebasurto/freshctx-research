# Hermes TypeScript measure pack

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Hermes-alone on TypeScript after a symbol-scope read of
`settleDailyLedger` and an interior flip on that symbol? Does Tree-sitter inside
FreshCtx change the outcome vs the same adapter with the Isolated Semantic Engine off?

Tree-sitter lives inside FreshCtx. The host passes `scope=symbol` with selector
`settleDailyLedger`. The harness never exposes a Tree-sitter toggle.

## Arms

Same fixture, same symbol-scope read prompt, same interior flip (`ST0` → `ST1` in
`settleDailyLedger`), same turn-2 user prompt on every arm.

| Arm | Hermes | FreshCtx | Tree-sitter Isolated Semantic Engine |
|---|---|---|---|
| A `nothing` | yes | no | n/a |
| B `freshctx-no-ts` | yes | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` in harness) |
| C `freshctx-ts` | yes | yes | on (default `adapters/hermes/bridge.mjs`) |

Arm B and C share the same plugin install and prompts. Only harness env differs.

## Fixture

`docs/lab/pi-trial-ts/fixture/src/settlement.ts`. A symbol-scope read targets
`settleDailyLedger` only. The flip is an interior edit on that export
(`MARKER_SETTLE`).

## Turns

1. **t1-read.** Read symbol `settleDailyLedger` (`scope=symbol`). Hermes reports initial marker.
2. **flip-settle.** Runner mutates disk (`ST0` → `ST1`) without Hermes re-reading.
3. **t2-settle.** Same prompt on all arms: quote current `MARKER_SETTLE` with no tools.

## Printed columns

After a capture exists, run:

```bash
node docs/lab/hermes-trial-ts/print-columns.mjs
```

| column | meaning |
|---|---|
| `t2_exact_new_bytes` | turn-2 provider request contains `ST1` |
| `sibling_bytes_in_request` | turn-2 request still contains sibling marker `SW0` |
| `request_bytes` | UTF-8 bytes of serialized request JSON for the turn |
| `prompt_tokens` | provider `usage.prompt_tokens` when present, else `—` |
| `hermes_stdout_current` | Hermes stdout matches `SETTLE=ST1` |
| `resolution` | `none` (arm A) or FreshCtx mechanism on B/C (`isolated-semantic-engine`, `whole-file`, …) |

No `AUTORESEARCH_SCORE` in this pack.

## Drivers

1. **Manual battery.** `BATTERY.md` plus `live.mjs` reset/mutate/status.
2. **Launch-proxy harness.** `auto-rpc.mjs` when official `hermes` is on PATH.
   Dump proxy intercepts provider POSTs. `launch-hermes` stages an isolated
   `HERMES_HOME`, installs the force-host-read general plugin on all three arms,
   and installs FreshCtx on arms B/C. Model pinned to `deepseek-v4-flash`.
   Resolves repo root by walking up to `adapters/hermes/bridge.mjs`.
   CLI fallback always asserts t1 host-read tools. Empty tools fail closed.

Working copies: `docs/lab/hermes-trial-ts/.work/` (gitignored).

## Out of scope

- Holdout gold, policy, anchors, projector edits
- Official TAP / ctxbench retune
- `--relock`
- Apex / GHA
- Pi rewrite

## Base

Prepared from main `79958de3f11e852f9e101d63524ca6a1a248b4dc`. Official table
549/0/0/549. Door `f8771c93`, lock `4a953591` frozen.
