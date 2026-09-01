# SWE-bench-like host-eval scaffold

Label: `live-host`; `harness-only`. Not a paper result. Not CtxBench.
**Not a full SWE-bench dump.** Do not invent SWE scores.

FreshCtx stays a context substrate. This pack only records how a later
operator can run one synthetic task card on Pi or Hermes with FreshCtx
on or off. Official accepted TAP stays **549/0/0/549**.

## What this is

- A **task pack shape** that looks SWE-bench-like (`instance_id`,
  `problem_statement`, `fail_to_pass`) and is locally synthetic.
- Two arms: `nothing` (FreshCtx off) and `freshctx` (FreshCtx on).
- Run notes for **Pi** and **Hermes**.
- Model pin: **`deepseek-v4-flash`** only. Never pro.

## What this is not

- Not SWE-PolyBench Verified.
- Not SWE-Bench Pro.
- Not Pass@1.
- Not a CORVUS comparison.
- Not a live measurement. `measuredSweScores()` is `null`.

Isolated Semantic Engine (Tree-sitter) lives inside FreshCtx when installed.
This leftover does not add a Tree-sitter host toggle. The host never exposes
one.

## Commands

```bash
node docs/lab/swe-host-trial/run.mjs validate
node docs/lab/swe-host-trial/run.mjs how-to --host=pi --arm=nothing
node docs/lab/swe-host-trial/run.mjs how-to --host=hermes --arm=freshctx
node docs/lab/swe-host-trial/run.mjs print-columns
node docs/lab/swe-host-trial/run.mjs dry-run
```

Never paste an API key into CMD, BATTERY, PCR, or chat.

See [SCOPE.md](SCOPE.md), [PLAN.md](PLAN.md), [BATTERY.md](BATTERY.md).
