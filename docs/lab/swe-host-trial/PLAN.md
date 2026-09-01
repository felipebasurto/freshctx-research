# SWE-bench-like host trial plan

Label: `live-host`. Not a paper result. Not a full SWE-bench dump.

## Question

On one synthetic SWE-shaped task card, does FreshCtx on vs off change
host request bytes or resolution on Pi or Hermes?

This leftover only ships the pack shape and run notes. The live answer
is later. Do not invent SWE scores.

## Arms

Same fixture. Same symbol-scope read of `settleDaily`. Same model.

| Arm | Host | FreshCtx | Isolated Semantic Engine (Tree-sitter) |
|---|---|---|---|
| `nothing` | Pi or Hermes | no | n/a |
| `freshctx` | Pi or Hermes | yes | FreshCtx default if installed; not a host toggle |

Model remains `deepseek-v4-flash` only.

## Task pack shape

See `tasks/synthetic-mini-ledger.json`. Fields are SWE-bench-like so a
later operator can map a real instance without importing the corpus.

Required on every card:

- `instance_id`
- `origin` (`synthetic-local-fixture` for this pack)
- `notFromSweBench` (`true` here)
- `repo` (path under this pack)
- `base_commit` (`null` here; no public SHA)
- `problem_statement`
- `fail_to_pass` / `pass_to_pass`
- `host_read` (`path`, `scope`, `selector`)
- `success_metric` = `host-request-bytes-and-resolution`
- `success_metric_not` includes `pass@1` and `swe-bench-score`

## How to run

[BATTERY.md](BATTERY.md) for the operator script.
`run.mjs how-to --host=pi|hermes --arm=nothing|freshctx` prints the CMD
block. Never paste an API key.

## Out of scope

- Holdout gold, policy, anchors, projector
- Official TAP retune (official table stays 549/0/0/549)
- `--relock`
- A SWE-bench dump

## Base

Prepared from main `4ab081fd8d81335cc58dd776f2d3726ce73920ac`.
Official table 549/0/0/549. Door `f8771c93`, lock `4a953591` hold.
