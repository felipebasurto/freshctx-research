# PCR 0137 — Long-session cost ledger

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/cost-ledger-pcr-0137-5d99` (draft)
- Base SHA: `4ab081fd8d81335cc58dd776f2d3726ce73920ac`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

A long session can accumulate `request_bytes`, provider tokens, and a cited
DeepSeek v4 flash cost proxy across many turns with FreshCtx off, FreshCtx with
Isolated Semantic Engine off, and FreshCtx with Tree-sitter Isolated Semantic
Engine on.
The two-turn measure packs print per-turn columns. They do not sum a session.
This leftover is the ledger only.
No live host scores are invented.
Official accepted table stays 549/0/0/549.

## What we did

1. Added `docs/lab/cost-ledger/` with pack, session (8 turns), ledger, cited
   cost-proxy table v1, ingest/redact, print-ledger, and a thin `live.mjs`.
2. Added `test/pcr-0137-cost-ledger.test.mjs` for the added code.
3. Added `fixture/synthetic-session.json` labeled `synthetic` / `liveHost: false`.
4. Did not edit `docs/lab/INDEX.md`, `docs/lab/METRICS.md`, README PCR counts,
   `src/`, door, lock, or other packs.
5. Did not `--relock`. No apex or GHA work.
6. Same Cloud Agent wrote PCR and tests.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | turns |
|---|---|---|---|
| `nothing` | no | n/a | 8 |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | 8 |
| `freshctx-ts` | yes | on (Tree-sitter default) | 8 |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.

## Cost proxy

Cited from [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
on 2026-09-01. Version 1. Default off-peak cache-miss:

| band | input cache-hit | input cache-miss | output |
|---|---:|---:|---:|
| off-peak | $0.007 / 1M | $0.22 / 1M | $0.66 / 1M |
| peak | $0.014 / 1M | $0.44 / 1M | $1.32 / 1M |

`cost_proxy_usd` uses provider tokens only.
Missing `prompt_tokens` stay `—`.
A 4-byte estimate may fill `cost_proxy_usd_estimated` and is labeled
`bytes-estimate`, not a live host score.

## Benchmarks run

Canonical TAP from this HEAD after `npm test` is recorded after the first
verification pass on this branch.

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending this HEAD | n/a | fill after verification |
| `npm run evaluate` | pending this HEAD | n/a | no policy/door/lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live long-session host | no | n/a | ledger + unit tests first |

## Metric snapshot

| metric | official `79958de` | PCR 0137 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| evaluate | n/a on official table | pending this HEAD | not a live-pack score |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |
| live long-session table | n/a | **none** | not invented |

## Comparison

No Level 4 sentence.
Harness only.
Synthetic fixture is accumulation math, not a host capture.
PCR 0135 two-turn live bytes are not summed into this ledger.

## Conflicts with constitutions

none observed.

## Limitations

No live Hermes or Pi eight-turn capture on this leftover.
Dump-only sessions still omit `prompt_tokens` unless the provider writes usage
on the request body.
Cost proxy is cited list price, cache-unaware by default, not a billed invoice.
`.work/` is local and not gitignored from this leftover (gitignore is out of
path).

## Recommended next experiment

Run the eight-turn battery on official Hermes or Pi with DeepSeek v4 flash.
Ingest real `*.scan.json` dumps.
Print the ledger.
Keep door and lock frozen.
No `--relock`.
