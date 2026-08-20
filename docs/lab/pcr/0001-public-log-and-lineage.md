# PCR 0001 — Public log and smoke v0.1 lineage

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/ctxbench-smoke-v0.1-ede8` / pull request 2
- Commit: `0644400` (smoke pack); lab files added in the same PR
- Paper-manifest digest: not required for the smoke-infrastructure landing
- Result labels used: `synthetic`; `public-repo-smoke`

## Hypothesis or change

A frozen Flask/Express smoke pack plus a public per-iteration notebook make
CtxBench measurements attributable without inventing a performance claim.

## What we did

On this branch, the smoke landing added:

- `bench/repos.lock.json` for Flask
  `d318b683471101618febed18996405ad26462110` and Express
  `a3714473feb3d2908add734d340e7755fd85e0a3` (manifest sha256
  `4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4`);
- a trace runner, independent byte oracle, and five equally budgeted baselines;
- ten traces (interior-edit, append, delete, move-in-file, duplicate-boundary)
  over Flask and Express only;
- `npm run ctxbench:smoke` writing JSONL, `bench/reports/latest.md`, and a
  `results.tsv` row.

This PCR opens `docs/lab/` on the same branch. It does not change
`src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`.

The first `corvus-file` implementation on `0644400` was **CORVUS-shaped**
(mask historical reads, inject current whole files). It did not implement
Algorithm 1 of [CORVUS](https://arxiv.org/abs/2607.22711). That gap is the
subject of PCR 0002.

## Benchmarks run

Re-run of the suite after the lab files were drafted, on this branch:

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 26/26 after CORVUS tests were added (18 original + 4 runner + 4 CORVUS) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates passed |
| `npm run ctxbench` | yes | 0 | label `synthetic`; deterministic hash agreement 1.0 |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 0 | lock unchanged; `repos:fetch` was **not** run |
| `npm run ctxbench:smoke` | yes | 0 | label `public-repo-smoke` |

## Metric snapshot

**Measured** `synthetic` on this branch (`npm run evaluate` / `npm run ctxbench`):

- stale bytes: 0; current copies: 1; gold recall: 1; fully resolved
- payload sha256:
  `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`

**Measured** `public-repo-smoke` lock: Flask and Express commits above. The
generated table is `bench/reports/latest.md`. FreshCtx hard gates on that pack:
stale bytes 0 for FreshCtx file/region; required recall 1 on satisfiable
captures.

This is measurement infrastructure, not a performance claim.

## Comparison

[CORVUS](https://arxiv.org/abs/2607.22711) (Zheng et al., 2026) is the closest
published whole-file baseline. Token and cycle figures in that paper are
**cited**, not reproduced here. Smoke v0.1 did not yet implement `sync_file`.

## Conflicts with constitutions

1. `docs/EVALUATION.md` §14 still lists a frozen `repos.lock.json` and released
   trace pack as “not yet implemented.” This branch adds both. §14 is left
   unchanged in this PCR’s iteration; the conflict is recorded rather than
   silently edited.
2. `docs/ROADMAP.md` M1 asks for at least eight mutation families and ten units
   per repository. This pack has five families over two repositories. M1 is
   not complete.
3. `docs/EVALUATION.md` §7 requires a CORVUS **reproduction** with documented
   deviations. At smoke landing the baseline was shaped only (see PCR 0002).

## Limitations

- Smoke timing is single-shot per cell, not the 100-repetition `ctxbench`
  harness. Not a latency claim.
- `exact-current` is not comparable across baselines when gold units are
  regions and a baseline injects whole files.

## Next measurement

Document and implement the paper `sync_file` / `sync_context` lifecycle
(PCR 0002).
