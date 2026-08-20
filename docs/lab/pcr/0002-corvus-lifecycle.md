# PCR 0002 — Documented CORVUS `sync_file` / `sync_context` lifecycle

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/ctxbench-smoke-v0.1-ede8` / pull request 2
- Commit: `fbf13d64a46aed6ec909e3b3b44e239075d39eac` (implementation); lab note
  follows on the same branch
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- CORVUS PDF sha256: `204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf`
- Result labels used: `synthetic`; `public-repo-smoke`

## Hypothesis or change

Mapping each smoke-trace `read` to CORVUS `sync_file` and each
`capture-request` to `sync_context` makes the `corvus-file` baseline a
**documented reproduction of the paper’s file lifecycle**, with every
deviation written down. This does not claim that FreshCtx beats CORVUS.

## What we did

Read [CORVUS](https://arxiv.org/abs/2607.22711) from the verified local PDF.
Implemented Algorithm 1 operations in `bench/corvus.mjs`:

- `sync_file(f_j)`: \(S \leftarrow S \cup \{f_j\}\); observation
  `"sync: <path>"` (paper: \(o_t \leftarrow\) `"sync:"` \(f_j\)).
- `sync_context`: \(C_t = \{(f_j, c_j(t)) : f_j \in S\}\) from workspace
  bytes; missing files omitted; no last-known injection.
- Prompt order: history then \(C_t\) (paper default, Appendix C).

Added ADR [0003](../../decisions/0003-corvus-reproduction-deviations.md) and
invariant tests in `test/corvus-baseline.test.mjs`. Did not retune policy.
Did not retarget `bench/repos.lock.json`. Did not run `repos:fetch`.
`docs/EVALUATION.md` §14 was left unchanged.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **26/26** (18 original + 4 runner + 4 CORVUS) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs `main` synthetic |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 0 | Flask/Express lock matches the reviewed freeze |
| `npm run ctxbench:smoke` | yes | 0 | FreshCtx hard gates passed |

## Metric snapshot

**Measured** `synthetic` (`evaluate` / `ctxbench`): no delta vs prior landing
on this branch. Score 89.107165; stale 0; one current copy; recall 1;
deterministic agreement 1.0; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** `public-repo-smoke` after the lifecycle change. Full table:
[`bench/reports/latest.md`](../../../bench/reports/latest.md) (generated
2026-08-20T20:12:44Z).

`corvus-file` **projection-bytes** vs the previous CORVUS-shaped row on
`0644400` (same traces and lock; marker serialization changed):

| repo | family | shaped bytes (`0644400`) | lifecycle bytes (`fbf13d6`) | delta |
|---|---|---|---|---|
| express | append | 1717 | 1696 | −21 |
| express | delete | 131 | 49 | −82 |
| express | duplicate-boundary | 1740 | 1719 | −21 |
| express | interior-edit | 1695 | 1674 | −21 |
| express | move-in-file | 1693 | 1672 | −21 |
| flask | append | 7055 | 7034 | −21 |
| flask | delete | 138 | 56 | −82 |
| flask | duplicate-boundary | 7306 | 7285 | −21 |
| flask | interior-edit | 7053 | 7032 | −21 |
| flask | move-in-file | 7031 | 7010 | −21 |

Correctness columns for `corvus-file` did not change: stale 0.000, duplicate
0.0, required-recall 1.000 on every family. `exact-current` remains 0.000
because gold units are often regions while this baseline injects whole files.

FreshCtx file/region rows are unchanged in correctness and projection-bytes
versus `0644400`. Timing cells are single-shot and are **not** a latency claim.

## Comparison

Paper claims of 9–50% fewer input tokens and fewer reasoning cycles
([CORVUS](https://arxiv.org/abs/2607.22711) abstract) are **cited**. They use
SWE-PolyBench Verified / SWE-Bench Pro and four LLMs. This PCR measures
payload composition on Frozen Flask/Express traces with no model.

This iteration’s claim is only: the `corvus-file` baseline now follows the
quoted `sync_file` / `sync_context` lifecycle, and deviations are in ADR 0003.
It is **not** a reviewed reproduction and **not** a statement that FreshCtx
outperforms CORVUS.

## Conflicts with constitutions

- `docs/EVALUATION.md` §14 still says the lock, trace pack, and “reviewed
  CORVUS reproduction” are unimplemented. This PR adds a lock, a smoke trace
  pack, and a **documented** (not reviewed) lifecycle reproduction. §14 was
  not edited.
- ROADMAP M1’s eight-family / ten-unit target remains unmet (see PCR 0001).

## Limitations

- Host is CtxBench replay, not Strands Agents. `read` events are mapped to
  `sync_file`.
- No `Msys` / `Tschema` in the captured prompt.
- No `desync_file` (paper future work).
- `budgetChars` is accepted for interface parity and is not used to truncate
  \(C_t\).
- `exact-current` under-counts whole-file projections against region gold.

## Next measurement

Pi request-capture of the same smoke traces, or a reviewer-facing deviation
checklist against Algorithm 1. See [NEXT-PROMPT.md](../NEXT-PROMPT.md).
