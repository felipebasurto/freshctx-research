# Research Cost and Token Budget

## Main answer

The deterministic FreshCtx evaluator costs **zero model inference tokens**.

CtxBench applies deterministic file mutations, builds provider payloads, hashes
and compares bytes, and measures local time and memory. The request-capture
provider returns a constant sentinel without contacting an LLM. Autoresearch is
not allowed to add a hidden evaluator model.

An autonomous coding agent that proposes and implements candidate changes still
uses the normal input/output tokens of its harness. That controller usage is a
research orchestration cost, not an evaluation input, and MUST be logged
separately. FreshCtx removes model cost and variance from each candidate
measurement; it does not make the researcher itself free.

The accounting identity is:

\[
paid\ tokens = autoresearch\ controller\ tokens + optional\ provider\ studies
\]

while:

\[
CtxBench\ evaluator\ tokens = 0
\]

Actual controller usage depends on the chosen model, harness, experiment count,
and amount of source read per attempt. Freeze a maximum experiment count,
wall-clock limit, and harness spend/token cap before a campaign. Preserve raw
controller usage separately from benchmark results.

## Local resource budget

Costs that remain:

- paper downloads and local PDF storage;
- partial Git clones of public repositories;
- CPU for parsing, mutation, hashing, replay, and timing;
- disk for detached checkouts, trace packs, revision archives, and raw results;
- CI minutes for correctness tests.

Before downloading, inspect the manifests. A practical development setup should
reserve several gigabytes for the full repository corpus; exact size is recorded
after lock. `repos:fetch:smoke` limits bootstrap work to Flask and Express.

## Run tiers

| Tier | Work | Evaluator model tokens | Purpose |
|---|---|---:|---|
| Unit | Local tests and one synthetic fixture | 0 | Every code change |
| Smoke | Flask/Express trace matrix | 0 | Fast integration checks |
| Development | Train repositories and policy search | 0 | Autoresearch loop |
| Validation | Frozen validation traces | 0 | Scheduled candidate choice |
| Holdout | Sealed public-repo traces | 0 | Publication claim |
| Adapter capture | Pi/Hermes plus fake provider | 0 | Portability |
| Optional provider cache study | Real API, one fixed response token | Paid and explicit | Validate actual cache/TTFT only |
| Optional agent behavior study | Full coding agent | Paid and stochastic | Separate exploratory paper |

The table excludes the autoresearch controller that writes candidate code. Its
usage is paid according to the selected harness/model even when every core row
in the evaluator column is zero.

## Optional provider study

An actual API may be useful later to verify cache-read/cache-write accounting and
time to first token. It is not needed for core acceptance. Freeze a spend cap and
compute cost from measured provider usage:

\[
cost = U_i p_i + U_{cr} p_{cr} + U_{cw} p_{cw} + U_o p_o
\]

where \(U_i\) is uncached input, \(U_{cr}\) cache-read input, \(U_{cw}\)
cache-write input, \(U_o\) output, and \(p\) values are the provider prices at
run time. Never copy old prices into a long-lived benchmark; record the dated
pricing source and raw usage buckets.

Use the minimum valid output, randomize/interleave conditions, warm caches
explicitly, and keep these results in a `provider-cache` namespace. Network load
makes latency noisy, so report distributions and do not merge them into local
transformation time.

## Autoresearch stop rule

The autonomous loop must stop for human review before any paid inference,
external compute purchase, or expansion beyond the frozen local corpus. No
credential is required for the default project.
