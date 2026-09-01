# PCR 0138 — SWE-bench-like host trial scaffold

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/swe-host-trial-0138-0f7b` (draft)
- Base SHA: `4ab081fd8d81335cc58dd776f2d3726ce73920ac`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `live-host`; `harness-only`; `synthetic`
- Decision: **review** (PR stays draft)

## Hypothesis or change

A later operator needs a SWE-bench-like host-eval scaffold without importing
the SWE-bench corpus. This leftover is that scaffold only: task pack shape,
FreshCtx on/off, and how to run on Pi or Hermes. It is **not a full SWE-bench
dump**. Do not invent SWE scores. Official table stays **549/0/0/549**.

## What we did

1. Added `docs/lab/swe-host-trial/` with `pack.mjs`, `run.mjs`,
   `print-columns.mjs`, PLAN, BATTERY, SCOPE, and one synthetic task card.
2. Arms are `nothing` (FreshCtx off) and `freshctx` (FreshCtx on). No third
   Isolated Semantic Engine (Tree-sitter) arm. The host never exposes a
   Tree-sitter toggle.
3. Model pin is `deepseek-v4-flash` only. `run.mjs how-to` never prints API
   keys. Never paste an API key.
4. Added `test/pcr-0138-swe-host-trial.test.mjs`.
5. Did not edit `docs/lab/INDEX.md`, `docs/lab/METRICS.md`, README PCR counts,
   `src/`, door, or lock.
6. Did not `--relock`. No apex or GHA work.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | `scope=symbol`, selector `settleDaily` |
| `freshctx` | yes | FreshCtx default if installed; not a host toggle | same |

Model remains `deepseek-v4-flash` only.

## Benchmarks run

Canonical TAP from this HEAD after `npm test` is pending the official run
on this branch. Official accepted TAP remains **549/0/0/549**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending | n/a | fill after official run on this HEAD |
| `npm run evaluate` | no | n/a | harness-only; no policy, door, or lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `79958de` | PCR 0138 (this run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 549 | pending this HEAD | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | pending this HEAD | fill after official run |
| `npm test` TAP `# fail` | 0 | pending this HEAD | fill after official run |
| `npm test` TAP `# skipped` | 0 | pending this HEAD | fill after official run |
| SWE scores | n/a | `null` | do not invent |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No live Pi or Hermes table. Do not invent `request_bytes` or Pass@1.

## Comparison

No Level 4 sentence.
Harness only.
Not a SWE-bench dump.
Not a CORVUS comparison.
Cited CORVUS SWE-PolyBench / SWE-Bench Pro numbers stay cited, not reproduced.

## Conflicts with constitutions

none observed.

## Limitations

`run.mjs` does not call a model.
Official `pi` or `hermes` plus a key are required for a later live run.
This leftover does not ship that capture.
Isolated Semantic Engine (Tree-sitter) WASM is not reinstalled here.

## Recommended next experiment

Run the two-arm battery on Pi or Hermes with DeepSeek v4 flash.
Fill columns from dumps. Keep scores `null` until measured.
Keep door and lock frozen. No `--relock`.
