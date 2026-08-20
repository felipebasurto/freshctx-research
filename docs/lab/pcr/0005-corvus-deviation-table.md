# PCR 0005 — CORVUS cited-vs-measured deviation table on smoke v0.1

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/corvus-deviation-table-6b2b`
- Commit: `cab3ec4`
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- CORVUS PDF sha256: `204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf`
- Result labels used: `synthetic`; `public-repo-smoke`

## Hypothesis or change

Publish a **measured** side-by-side table: every known deviation of the
documented CORVUS whole-file reproduction (`corvus-file`) from
[CORVUS](https://arxiv.org/abs/2607.22711) (ADR 0003), plus FreshCtx
`freshctx-region` and `freshctx-file` on the existing Flask/Express smoke board.
No policy retune, no new corpus, no ranking claim.

## What we did

Re-read CORVUS from the verified local PDF (arXiv:2607.22711, Zheng et al.).
Confirmed Algorithm 1 operations quoted in ADR
[0003](../../decisions/0003-corvus-reproduction-deviations.md) and
`bench/corvus.mjs`. Re-ran the full required loop on commit `54d71f8` (main
after PCR 0004). Did not tune `src/policy.mjs`, `src/anchors.mjs`, or
`src/projector.mjs`. Did not retarget `bench/repos.lock.json` commit SHAs. Did not
change gold labels, weights, thresholds, or existing test bodies.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **37/37** |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged vs main |
| `npm run demo` | yes | 0 | |
| `npm run repos:verify` | yes | 0 | Flask/Express lock SHAs unchanged |
| `npm run ctxbench:smoke` | yes | 0 | core board; correctness unchanged vs PCR 0002 |
| `npm run ctxbench:pi-smoke` | yes | 0 | regression unchanged |
| `npm run ctxbench:hermes-smoke` | yes | 0 | regression unchanged |

Lock SHAs (unchanged): Flask `d318b683471101618febed18996405ad26462110`,
Express `a3714473feb3d2908add734d340e7755fd85e0a3`, manifest
`4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4`.

## CORVUS paper operations (quoted)

From Algorithm 1 and §4 of [CORVUS](https://arxiv.org/abs/2607.22711) (PDF
sha256 above):

| Operation | Paper definition |
|---|---|
| Synced file set | “CORVUS maintains a dynamic registry \(S_t \subseteq F\) of relevant files.” (§4.1) |
| `sync_file(f_j)` | “\(S_t \leftarrow S_{t-1} \cup \{f_j\}\)” and observation \(o_t \leftarrow\) `"sync:"` \(f_j\) (Algorithm 1 lines 6–8; §4.1) |
| `sync_context` | “\(C_t = \{(f_j, c_j(t)) : f_j \in S_{t-1}\}\)” — refresh registered files before each reasoning step (Algorithm 1 line 3; §4.2) |
| Prompt composition | “\(P_t = M_{\mathrm{sys}} \oplus T_{\mathrm{schema}} \oplus H_{t-1} \oplus C_t\)” with synced context after history (Algorithm 1 line 4; §4.3) |
| Uniqueness | “at most one version of each file appears in the prompt” and “that version always reflects the current repository state” (§4.3) |
| Host | Implemented on Strands Agents; `read_file` replaced by `sync_file` (§5) |
| `desync_file` | Listed as future work: “a desync_file tool would allow agents to remove files from the synced context once they become irrelevant” (§8) |
| Partial sync | Also future work: “partial synchronization could refresh selected functions or code blocks rather than entire files” (§8) |

**Cited** evaluation claims (abstract; SWE-PolyBench Verified / SWE-Bench Pro,
four LLMs): 9–50% lower average input tokens, 15–32% shorter final prompts, up
to 37% fewer reasoning cycles, comparable pass rates. These are **not**
reproduced here.

## Cited vs reproduction vs FreshCtx (deviation table)

Full ADR: [0003](../../decisions/0003-corvus-reproduction-deviations.md).

| Paper behavior | `corvus-file` reproduction | `freshctx-file` | `freshctx-region` |
|---|---|---|---|
| `sync_file` registers whole file | **reproduced** (`bench/corvus.mjs`) | whole-file registry | region read → tracked unit |
| `sync_context` before each cycle | **reproduced** at `capture-request` | refresh + project | refresh + anchor relocate + project |
| History stores `"sync:"` marker only | **reproduced** | FreshCtx stable markers | FreshCtx stable markers |
| At most one current copy per file | **reproduced** (freshness gates pass) | **reproduced** | **reproduced** (per unit identity) |
| No last-known on resolution failure | **reproduced** (deleted file omitted) | **reproduced** | **reproduced** (unresolved omitted) |
| \(M_{\mathrm{sys}} \oplus T_{\mathrm{schema}}\) in prompt | **deviation**: omitted | **deviation**: omitted | **deviation**: omitted |
| Strands Agents host | **deviation**: CtxBench replay | same | same |
| `llm_invoke` selects next action | **deviation**: no model | **deviation**: no model | **deviation**: no model |
| \(C_t\) serialization unspecified | **deviation**: `[corvus-file path="…"]` blocks | **deviation**: `<freshctx-unit …>` XML | **deviation**: region-scoped units |
| Region/partial reads | out of scope in paper | whole file (control) | **extends** paper (partial sync is paper future work) |
| `desync_file` | absent (matches paper future work) | eviction policy (not on smoke traces) | eviction policy (not on smoke traces) |
| Character budget on \(C_t\) | not truncated (`budgetChars` ignored) | budget-aware selection | budget-aware selection |
| Evaluation corpus | SWE benchmarks + LLMs (**cited**) | CtxBench smoke (**measured**) | CtxBench smoke (**measured**) |

This table records fidelity and scope differences. It is **not** a claim that
FreshCtx beats CORVUS.

## Metric snapshot

**Measured** `synthetic`: no delta vs PCR 0004 / main `54d71f8`. Score
89.107165; stale 0; one current copy; recall 1; payload sha256
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

**Measured** `public-repo-smoke`: correctness and projection-bytes **unchanged**
vs PCR 0002 (`fbf13d6`). Single-shot timing cells moved; not interpreted as
regressions. Full table:
[`bench/reports/latest.md`](../../../bench/reports/latest.md).

### Side-by-side smoke metrics (`corvus-file` vs `freshctx-file` vs `freshctx-region`)

Gold labels are **region-scoped** on most families. Whole-file baselines therefore
report `exact-current` 0 even when bytes are fresh and required-recall is 1.

| repo | family | corvus stale | corvus recall | corvus exact | corvus bytes | file stale | file recall | file exact | file bytes | region stale | region recall | region exact | region bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| express | append | 0.000 | 1.000 | 0.000 | 1696 | 0.000 | 1.000 | 0.000 | 2046 | 0.000 | 1.000 | **1.000** | **948** |
| express | delete | 0.000 | 1.000 | 0.000 | 49 | 0.000 | 1.000 | 0.000 | 164 | 0.000 | 1.000 | 0.000 | 164 |
| express | duplicate-boundary | 0.000 | 1.000 | 0.000 | 1719 | 0.000 | 1.000 | 0.000 | 2069 | 0.000 | 1.000 | 0.000 | 644 |
| express | interior-edit | 0.000 | 1.000 | 0.000 | 1674 | 0.000 | 1.000 | 0.000 | 2024 | 0.000 | 1.000 | **1.000** | **961** |
| express | move-in-file | 0.000 | 1.000 | 0.000 | 1672 | 0.000 | 1.000 | 0.000 | 2022 | 0.000 | 1.000 | **1.000** | **455** |
| flask | append | 0.000 | 1.000 | 0.000 | 7034 | 0.000 | 1.000 | 0.000 | 7385 | 0.000 | 1.000 | **1.000** | **1426** |
| flask | delete | 0.000 | 1.000 | 0.000 | 56 | 0.000 | 1.000 | 0.000 | 164 | 0.000 | 1.000 | 0.000 | 164 |
| flask | duplicate-boundary | 0.000 | 1.000 | 0.000 | 7285 | 0.000 | 1.000 | 0.000 | 7636 | 0.000 | 1.000 | 0.000 | 676 |
| flask | interior-edit | 0.000 | 1.000 | 0.000 | 7032 | 0.000 | 1.000 | 0.000 | 7383 | 0.000 | 1.000 | **1.000** | **1458** |
| flask | move-in-file | 0.000 | 1.000 | 0.000 | 7010 | 0.000 | 1.000 | 0.000 | 7361 | 0.000 | 1.000 | **1.000** | **502** |

All three baselines: stale 0.000, duplicate 0.0, required-recall 1.000 on every
family (satisfiable gold).

### Projection-bytes delta vs PCR 0002

**0 bytes** on every cell for `corvus-file`, `freshctx-file`, and
`freshctx-region` (no implementation change since PCR 0002).

### Projection-bytes: `freshctx-region` minus `corvus-file` (smoke v0.1)

Negative = region projection smaller on that trace.

| repo | family | corvus bytes | region bytes | delta (region − corvus) |
|---|---|---|---|---|
| express | append | 1696 | 948 | −748 |
| express | interior-edit | 1674 | 961 | −713 |
| express | move-in-file | 1672 | 455 | −1217 |
| express | delete | 49 | 164 | +115 |
| express | duplicate-boundary | 1719 | 644 | −1075 |
| flask | append | 7034 | 1426 | −5608 |
| flask | interior-edit | 7032 | 1458 | −5574 |
| flask | move-in-file | 7010 | 502 | −6508 |
| flask | delete | 56 | 164 | +108 |
| flask | duplicate-boundary | 7285 | 676 | −6609 |

Region is smaller on append / interior-edit / move-in-file (the families where
region gold matches). Delete and duplicate-boundary families project similar
small marker payloads; region bytes can exceed corvus delete cells because
FreshCtx framing differs.

### `freshctx-file` minus `corvus-file` (serialization delta)

| repo | family | corvus bytes | file bytes | delta (file − corvus) |
|---|---|---|---|---|
| express | append | 1696 | 2046 | +350 |
| express | interior-edit | 1674 | 2024 | +350 |
| express | move-in-file | 1672 | 2022 | +350 |
| flask | append | 7034 | 7385 | +351 |
| flask | interior-edit | 7032 | 7383 | +351 |
| flask | move-in-file | 7010 | 7361 | +351 |

Same whole-file content; delta is FreshCtx unit framing vs `[corvus-file …]`
blocks.

## Comparison

**Cited** CORVUS claims (tokens, cycles, pass rates on SWE benchmarks) remain
**cited** from the paper abstract. **Measured** numbers above are CtxBench smoke
v0.1 payload metrics only — deterministic, model-free, two repos, five mutation
families, no pass@1.

**What we can claim:** On smoke v0.1, the documented `corvus-file` reproduction
follows the paper’s quoted `sync_file` / `sync_context` lifecycle with listed
deviations (ADR 0003); `freshctx-region` and `freshctx-file` pass the same
freshness/uniqueness/recall gates on these traces; region-grain projection is
**measured** smaller than whole-file sync on append/interior-edit/move-in-file
families while whole-file baselines report lower `exact-current` against
region gold. This is **not** a CORVUS comparison, **not** holdout evidence, and
**not** a state-of-the-art claim.

## Conflicts with constitutions

- `docs/EVALUATION.md` §14 still lists “reviewed CORVUS reproduction” as not yet
  implemented. This PCR publishes a **documented** reproduction deviation table;
  human review for Level 4 remains open. §14 was not edited.
- `docs/EVALUATION.md` §7 requires documenting every deviation — satisfied via
  ADR 0003 and the table above.
- `SOUL.md` forbids stale injection and ranking without Level 4 — satisfied; no
  stale bytes on any baseline row.
- ROADMAP eight-family / ten-unit smoke target remains unmet (PCR 0001).

## Limitations

- Smoke board only (Flask + Express, five families); not SWE-PolyBench /
  SWE-Bench Pro.
- No Strands Agents session; trace `read` → `sync_file` mapping.
- No \(M_{\mathrm{sys}}\) / \(T_{\mathrm{schema}}\) / real LLM in loop.
- `exact-current` for whole-file baselines is 0 against region gold by oracle
  design, not by freshness failure.
- Single-shot timing in reports is not publishable latency (per lab README).
- Pi/Hermes adapters remain file-grain (PCR 0003/0004); not part of this
  three-way core table.
- Partial synchronization is FreshCtx-region scope; CORVUS paper lists it as
  future work — comparing them mixes **reproduction fidelity** with **granularity
  extension**, not a controlled CORVUS A/B.

## Next measurement

Sealed holdout protocol execution (unreleased trace seeds, no tuning on holdout)
**or** region-grain Pi/Hermes adapters on the same smoke traces — pick one;
do not combine with this deviation table PR. See
[NEXT-PROMPT.md](../NEXT-PROMPT.md).
