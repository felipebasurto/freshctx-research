# PCR 0007 — Sealed holdout protocol, first execution (holdout v0.1 slice)

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/sealed-holdout-protocol-05ab`
- Commit: (pending push)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `public-repo-holdout`

## Hypothesis or change

Preregister and execute the **first holdout measurement** on pinned `go-tools` +
`neovim` with a hand-authored five-family trace slice — no policy retune, no Level
4 claim.

## Preregistration (before trace generation)

Recorded in [`bench/corpus-split.json`](../../../bench/corpus-split.json) at
`2026-08-20T20:45:00.000Z`, **before** holdout traces were built or executed.

| Item | Preregistered value |
|---|---|
| Smoke/train repos | `flask`, `express` (unchanged lock SHAs) |
| Holdout repos | `go-tools`, `neovim` |
| Holdout label | `public-repo-holdout` |
| Trace pack scope | First unsealed holdout slice; five smoke-parity families only |
| Materiality (proposal) | ≥10% relative byte/latency improvement; ≤2pp prefix reuse regression; ≤5% relative regression elsewhere |
| Claims **not** made | Level 4 / SOTA; beat CORVUS; agents program better; full 50×family suite; Pi/Hermes on holdout |

Secrecy note: this PR commits traces — holdout v0.1 is **unsealed**. A later
benchmark version needs new seeds/commits.

## What we did

1. Preregistered split + tolerances in `bench/corpus-split.json` and this PCR draft.
2. Fetched holdout repos only (`npm run repos:fetch:holdout`); merged into
   `bench/repos.lock.json` without changing Flask/Express SHAs.
3. Hand-authored 10 holdout traces (5 families × 2 repos) via
   `scripts/build-holdout-traces.mjs`; documented rejected candidates in
   `bench/traces/holdout/candidates-rejected.json`.
4. Added `bench/holdout.mjs` and `npm run ctxbench:holdout` (same five baselines as smoke).
5. Executed holdout **once** with frozen policy; recorded one gate failure without retuning.
6. Did **not** tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`.

Lock SHAs:

| repo | commit |
|---|---|
| flask (smoke, unchanged) | `d318b683471101618febed18996405ad26462110` |
| express (smoke, unchanged) | `a3714473feb3d2908add734d340e7755fd85e0a3` |
| go-tools (holdout, new) | `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` |
| neovim (holdout, new) | `2dd6e9d6a2482069cfe9d12a09f761c5713f246b` |
| manifest | `4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **42/42** (+1 holdout runner test) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs main |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 0 | git available; 4 pinned checkouts verified |
| `npm run ctxbench:smoke` | yes | 0 | regression board unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | regression unchanged |
| `npm run ctxbench:hermes-smoke` | yes | 0 | regression unchanged |
| `npm run ctxbench:holdout` | yes | 1 | gate failure recorded (see below); report written |

## Metric snapshot

**Measured** `synthetic`: no delta vs PCR 0006. Score 89.107165; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** `public-repo-holdout`: full table
[`bench/reports/holdout.md`](../../../bench/reports/holdout.md); raw JSONL
`bench/reports/public-repo-holdout.jsonl`.

### Holdout gate failure (recorded, not tuned)

| trace | baseline | failure |
|---|---|---|
| `go-tools/interior-edit/parse-file-body` | `freshctx-region` | required recall 0 (unit omitted after interior token edit; fail-closed) |

All other `freshctx-region` / `freshctx-file` cells: stale 0, duplicate 0 on
families with satisfiable gold.

### Holdout `freshctx-region` vs smoke `freshctx-region` (projection-bytes)

| family | smoke (express/flask avg) | holdout go-tools | holdout neovim |
|---|---|---|---|
| interior-edit | 961 / 1458 | **164** (recall 0) | 872 |
| append | 948 / 1426 | 604 | 1075 |
| delete | 164 / 164 | 164 | 164 |
| move-in-file | 455 / 502 | 538 | 698 |
| duplicate-boundary | 644 / 676 | 809 | 561 |

Holdout go-tools uses `go/buildutil/util.go` (~6 KiB); smoke Flask/Express regions
 differ in size — bytes are not directly comparable across repos; stale/recall/exact
 columns are the primary holdout read.

## Gold audit sample

Human-checkable subset (path, selector, pre/post gold SHA-256):

| repo | family | path | selector | pre-mutation sha256 | post-mutation sha256 |
|---|---|---|---|---|---|
| go-tools | interior-edit | `go/buildutil/util.go` | `ParseFile.body` (L32–38) | `68de6d76…e553` | `6a17f180…c23fc` |
| go-tools | delete | `internal/holdouttemp/temp.go` | (file) | `78eb3b21…3ecc` | (deleted) |
| neovim | interior-edit | `runtime/lua/vim/secure.lua` | `read_trust.fn` (L6–22) | `dbfac959…b750` | `009dd119…407d` |
| neovim | move-in-file | `runtime/lua/vim/secure.lua` | `write_trust.fn` (L79–89) | `5e88f1dd…b67c` | `5e88f1dd…b67c` (relocated) |

Rejected candidates: `bench/traces/holdout/candidates-rejected.json`.

## Comparison

**Not** a CORVUS comparison, **not** Level 4, **not** SOTA. First holdout slice
documents raw deterministic metrics on Go + C/Lua with smoke-parity families only.

Preregistered materiality tolerances were **not** evaluated for Level 4 (proposal
only; no ranking claim).

## Conflicts with constitutions

- `docs/EVALUATION.md` §5.1 automated unit sampling is not implemented; traces are
  hand-authored with documented rejection — conflict recorded, not silently resolved.
- §14 updated in a separated hunk for partial holdout facts; full suite / reviewed
  CORVUS / Pi+Hermes holdout remain open.
- Label `public-repo-holdout` added to `docs/BENCHMARK.md` (measurement label, not SOTA).

## Limitations

- First slice only: 10 traces, five families, two repos; not 50×family×language.
- No language parsers; no deterministic public-repo generator (§14).
- One `freshctx-region` required-recall failure on go-tools interior-edit (omission
  vs stale injection — fail-closed behavior).
- Pi/Hermes not run on holdout traces (deferred).
- Single-shot timing cells; not publishable latency.
- Holdout pack unsealed on commit; v0.2 needs new commits/seeds for fresh holdout.

## What we can claim

On holdout v0.1, FreshCtx passed freshness/uniqueness gates on 9/10 trace×region
cells, with one documented fail-closed omission on go-tools interior-edit — **measured**
`public-repo-holdout` only, not state-of-the-art and not a CORVUS beat.

## Next measurement

Expand holdout families (rename, cross-file move, budget-pressure) **or** Pi/Hermes
request-capture on holdout traces — pick one; do not combine in the same PR. See
[NEXT-PROMPT.md](../NEXT-PROMPT.md).
