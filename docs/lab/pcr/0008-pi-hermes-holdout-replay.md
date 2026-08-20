# PCR 0008 — Pi/Hermes request-capture replay on holdout v0.1

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/pi-hermes-holdout-replay-820d`
- Commit: (filled at merge)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `public-repo-holdout`; `replay`

## Hypothesis or change

Pi and Hermes request-capture replay on the **existing** holdout trace pack
(`bench/traces/holdout/`) reproduces core `freshctx-region` metrics cell-for-cell,
including the documented go-tools interior-edit fail-closed omission.

## What we did

Added `bench/pi-holdout.mjs`, `bench/hermes-holdout.mjs`, and
`bench/adapters-holdout.mjs` (runs both). Added npm scripts
`ctxbench:pi-holdout`, `ctxbench:hermes-holdout`, and `ctxbench:adapters-holdout`.
Each adapter board compares final-capture metrics against core
`freshctx-region` on the same 10 holdout traces from PCR 0007. Added holdout
adapter tests asserting the go-tools interior-edit recall miss is recorded (not
silently passed). Did not expand holdout families, retune policy, or change gold
labels, weights, thresholds, or lock SHAs.

Lock SHAs (unchanged):

| repo | commit |
|---|---|
| flask (smoke) | `d318b683471101618febed18996405ad26462110` |
| express (smoke) | `a3714473feb3d2908add734d340e7755fd85e0a3` |
| go-tools (holdout) | `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` |
| neovim (holdout) | `2dd6e9d6a2482069cfe9d12a09f761c5713f246b` |
| manifest | `4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **44/44** (+2 holdout adapter tests) |
| `npm run check` | yes | 0 | includes new holdout adapter modules |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs main |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 1 | `spawnSync git ENOENT` in cloud agent VM |
| `npm run ctxbench:smoke` | yes | 0 | regression board unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | regression unchanged |
| `npm run ctxbench:hermes-smoke` | yes | 0 | regression unchanged |
| `npm run ctxbench:holdout` | yes | 1 | same gate failure as PCR 0007 (recorded) |
| `npm run ctxbench:pi-holdout` | yes | 1 | reproduces core miss (recorded) |
| `npm run ctxbench:hermes-holdout` | yes | 1 | reproduces core miss (recorded) |
| `npm run ctxbench:adapters-holdout` | yes | 1 | both adapters; exit 1 on recorded miss |

## Metric snapshot

**Measured** `synthetic`: no delta vs PCR 0007. Score 89.107165; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** Pi adapter holdout: [`bench/reports/pi-holdout.md`](../../../bench/reports/pi-holdout.md).

**Measured** Hermes adapter holdout: [`bench/reports/hermes-holdout.md`](../../../bench/reports/hermes-holdout.md).

**Measured** core holdout (PCR 0007 baseline): [`bench/reports/holdout.md`](../../../bench/reports/holdout.md).

### Recorded gate failure (must not hide)

| trace | system | failure |
|---|---|---|
| `go-tools/interior-edit/parse-file-body` | core `freshctx-region` | required recall 0 (fail-closed omission) |
| `go-tools/interior-edit/parse-file-body` | Pi adapter | required recall 0 (matches core) |
| `go-tools/interior-edit/parse-file-body` | Hermes adapter | required recall 0 (matches core) |

Stale 0, duplicate 0 on all three systems for this cell. Projection-bytes 164
(core / Pi / Hermes). **No protocol gap** — adapters reproduce the core board,
including the miss.

### Pi/Hermes vs core `freshctx-region` (final capture; 0-byte delta every cell)

| repo | family | core recall | pi recall | hermes recall | core bytes | pi bytes | hermes bytes | core exact | pi exact | hermes exact |
|---|---|---|---|---|---|---|---|---|---|---|
| go-tools | append | 1.000 | 1.000 | 1.000 | 604 | 604 | 604 | 1.000 | 1.000 | 1.000 |
| go-tools | delete | 1.000 | 1.000 | 1.000 | 164 | 164 | 164 | 0.000 | 0.000 | 0.000 |
| go-tools | duplicate-boundary | 1.000 | 1.000 | 1.000 | 809 | 809 | 809 | 0.000 | 0.000 | 0.000 |
| go-tools | interior-edit | **0.000** | **0.000** | **0.000** | 164 | 164 | 164 | 0.000 | 0.000 | 0.000 |
| go-tools | move-in-file | 1.000 | 1.000 | 1.000 | 538 | 538 | 538 | 1.000 | 1.000 | 1.000 |
| neovim | append | 1.000 | 1.000 | 1.000 | 1075 | 1075 | 1075 | 0.000 | 0.000 | 0.000 |
| neovim | delete | 1.000 | 1.000 | 1.000 | 164 | 164 | 164 | 0.000 | 0.000 | 0.000 |
| neovim | duplicate-boundary | 1.000 | 1.000 | 1.000 | 561 | 561 | 561 | 0.000 | 0.000 | 0.000 |
| neovim | interior-edit | 1.000 | 1.000 | 1.000 | 872 | 872 | 872 | 1.000 | 1.000 | 1.000 |
| neovim | move-in-file | 1.000 | 1.000 | 1.000 | 698 | 698 | 698 | 1.000 | 1.000 | 1.000 |

Hermes projection-bytes are **0 bytes delta** vs Pi on every cell (same as smoke).

Timing cells are single-shot replay overhead; **not** a latency claim.

## Comparison

**Measured** adapter parity on holdout v0.1 — not CORVUS comparison, not Level 4,
not SOTA. Pi and Hermes replay boards now cover smoke **and** holdout with
region-grain tracking. The go-tools interior-edit omission is shared with core
(fail-closed anchor resolution after interior token edit), not an adapter-only
artifact.

## Conflicts with constitutions

- `docs/EVALUATION.md` §11 pinned Pi/Hermes package version matrix remains open;
  this PR extends replay harness only.
- `SOUL.md` adapter-only scope: no core policy edits — satisfied.
- `npm run repos:verify` failed in cloud VM (`git` absent); lock SHAs unchanged.

## Limitations

- Holdout v0.1 only: 10 traces, five families, two repos; not expanded here.
- Adapter holdout boards exit 1 when satisfiable traces fail gates (same as core
  holdout runner); the go-tools interior-edit miss is expected and recorded.
- Live Pi/Hermes sessions still require region metadata in read tool args (PCR 0006
  caveat).
- Single-process replay; no parallel tool-call interleaving test.
- Holdout pack unsealed on commit; v0.2 needs new commits/seeds.

## Protocol gap?

**No gap for holdout replay.** Adapters match core `freshctx-region` on every
metric column, including the documented go-tools interior-edit required-recall 0.
If adapters had silently passed that cell, that would indicate a tracking or
evaluator divergence — not observed.

## Next measurement

Expand holdout trace families (rename, cross-file move, budget-pressure) on the
same locked go-tools/neovim commits. See [NEXT-PROMPT.md](../NEXT-PROMPT.md).
