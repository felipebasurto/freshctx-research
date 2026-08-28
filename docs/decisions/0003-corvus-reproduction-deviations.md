# ADR 0003: Documented CORVUS whole-file reproduction and deviations

Status: accepted for CtxBench smoke v0.1.

## Context

[CORVUS](https://arxiv.org/abs/2607.22711) (Zheng et al., 2026) is the closest
published whole-file synchronization baseline. `docs/EVALUATION.md` §7 requires
a CORVUS whole-file reproduction and that every deviation from the paper be
documented. FreshCtx must not claim to beat CORVUS if the baseline is knowingly
weaker or given a different budget.

The smoke control board previously used a **CORVUS-shaped** injector: historical
reads were stored, then masked with FreshCtx-style markers, and current whole
files were appended. That is not Algorithm 1.

## Decision

Replay traces map each `read` event to the paper’s `sync_file` operation and
each `capture-request` to a reasoning cycle that begins with `sync_context`.
The public baseline id remains `corvus-file` so existing smoke tables stay
comparable. The implementation is a **documented reproduction of the file
lifecycle**, not a reviewed reproduction of the full Strands Agents system and
not a claim that FreshCtx outperforms CORVUS.

### Operations implemented (quoted)

From Algorithm 1 and §4 of arXiv:2607.22711 (PDF sha256
`204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf`):

1. **Synced file set.** “CORVUS maintains a dynamic registry \(S_t \subseteq F\)
   of relevant files.” (`bench/corvus.mjs` `CorvusSyncedFileSet`)
2. **`sync_file(f_j)`.** “\(S_t \leftarrow S_{t-1} \cup \{f_j\}\)” and
   “\(o_t \leftarrow\) `"sync:"` \(f_j\)”. Registration is decoupled from
   content retrieval. History stores the marker only.
3. **`sync_context`.** “\(C_t = \{(f_j, c_j(t)) : f_j \in S_{t-1}\}\)”.
   Registered files are re-read from the workspace before each capture.
4. **Prompt composition.** “\(P_t = M_{\mathrm{sys}} \oplus T_{\mathrm{schema}}
   \oplus H_{t-1} \oplus C_t\)” with synced context **after** message history
   (default placement, Appendix C). CtxBench emits \(H \oplus C_t\) only.
5. **Uniqueness.** “at most one version of each file appears in the prompt”
   and “that version always reflects the current repository state” (§4.3).
6. **No `desync_file`.** The paper lists `desync_file` as future work
   (§7). This reproduction also has no eviction.

### Deviations

| Paper behavior | This reproduction | Why |
|---|---|---|
| Host is Strands Agents; tools include `sync_file` instead of `read_file` (§5) | CtxBench core replay; schema `read` events are mapped to `sync_file` | Smoke traces are host-neutral data, not Strands sessions |
| `llm_invoke(P_t)` selects the next action | `capture-request` is the cycle boundary; no model is called | `docs/EVALUATION.md` forbids inference in core measurement |
| Prompt includes \(M_{\mathrm{sys}}\) and \(T_{\mathrm{schema}}\) | Only task text, historical sync markers, and \(C_t\) | System and tool schemas are host-owned; including fabricated ones would not be the paper |
| \(C_t\) serialization is not specified beyond a file→bytes set | Deterministic `[corvus-file path="…"]` blocks, paths sorted | Needed for an independent byte oracle |
| Region/partial reads are out of scope (whole files only) | A region `read` still registers the **whole file** | Matches “changes only file reading” / whole-file \(c_j(t)\) |
| Deleted files are not specified | Path stays in \(S\); \(C_t\) omits it; last-known bytes are not injected | Fail-closed on missing workspace bytes (`SOUL.md` / EVALUATION freshness) |
| No character budget on \(C_t\) | Interface accepts `budgetChars` for parity with other baselines but does **not** truncate or evict \(C_t\) | Truncation would make the baseline knowingly weaker |
| Evaluation on SWE-PolyBench / SWE-Bench Pro with four LLMs (cited) | CtxBench `public-repo-smoke` traces, no model | Different object of study: the payload, not pass rate |
| `desync_file` absent (future work) | Absent | Match the paper, not an improvement |

## Consequences

- Label results `public-repo-smoke` or `synthetic`. Do not say “we beat CORVUS”
  or “state of the art.”
- A Level 4 / reviewed reproduction still requires the holdout protocol in
  `docs/EVALUATION.md` §13 and a human review of this deviation table.
- FreshCtx file/region baselines remain on the same traces and `budgetChars`.

## Review (PR-G)

Status: **reviewed** as a documented lifecycle reproduction of Algorithm 1,
not a reviewed Strands Agents or SWE-Bench clone.

- Reviewer: sealed-lab program PR-G
- Date (UTC): 2026-08-28
- Walked Algorithm 1 against `CorvusSyncedFileSet`, `syncFile`, and `syncContext`
- Same traces and `budgetChars` as FreshCtx; \(C_t\) is not truncated
- `desync_file` remains absent
- Score weights in `bench/run.mjs` are unchanged
- PDF sha256 still `204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf`

This sign-off does not authorize a “we beat CORVUS” or Level 4 sentence.
