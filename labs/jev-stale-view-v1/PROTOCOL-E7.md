# E7 protocol — E6 with real conclusions (written before any E7 model call)

## Question

E6 used one short synthetic conclusion. Does the same pattern hold when the
stale conclusion is a real assistant message from a real trajectory, the code
is real, and the question is about behaviour, not arithmetic?

1. Harm: does a stale real conclusion lower accuracy when FreshCtx already
   delivers the current code? (B vs D)
2. Recovery: does annotating (C) or withdrawing (E) the conclusion, chosen by
   Jev, recover it? (C, E vs B)

## Items (`e7_build.py`, `results/e7_items.json`)

19 real edits from E4 (all E4 edits with at least one statement the author
labelled stale and Jev scored ≥ 0.5 in single mode, except e4-11 and e4-16,
whose edits did not flip a checkable fact). For each edit:

- `before` / `after`: the real `old_str` / `new_str` of that `str_replace`,
  written as the whole content of one workspace file named after the edited
  file (an excerpt, not the full repository file).
- `claim`: the E4 statement with the highest single-mode Jev score among those
  labelled stale, verbatim (≤ 1,500 chars), as written by Qwen3-Coder.
- `question` / `gold`: one yes/no question about the current code whose answer
  the edit flipped, written by the author from the diff before any E7 call.
  Golds: 10 true, 9 false. A stale-derived answer is `!gold`.

## Procedure

As E5/E6: a scripted provider forces one real Pi read of the whole file
(`before`), then replies with the claim (or `Ready.` in D). The session closes,
the file becomes `after`, the session reopens, and only post-resume requests
reach the real model.

Prompt: `Answer this question about the current code in <file>: <question> You may read any required code. Return only a JSON object with the boolean field answer.`
Retry: `The external checker rejected your answer. Inspect the current workspace as needed and return only a JSON object with the boolean field answer.`
Checker: a JSON object (optionally fenced) whose `answer` is a boolean equal to
`gold`.

## Arms

- `B_fc`: FreshCtx bridge, claim present.
- `C_fc_jev`: B + Jev fan-out (E2 Noul, `jev-1.13.0`, `state = {file: path, edit_diff: real diff}`); p ≥ 0.5 appends the E5 marker.
- `D_fc_noclaim`: FreshCtx, seed reply `Ready.`.
- `E_fc_jev_withdraw`: B + Jev; p ≥ 0.5 replaces the message with the E6 withdrawal pointer.

Model `deepseek-v4-flash`, temperature 0, thinking disabled, 512 output tokens,
≤ 8 requests, ≤ 64,000 bytes per request, 2 submissions. 2 repetitions per
item, arm order rotated by item and repetition. Product `3e3c448` exported with
`git archive` (as E5/E6). Separate spend cap: $2.

## Reported

First-submission accuracy, accuracy within two, stale-derived first answers,
first answers given without any read, requests, tokens, Jev p on each claim,
whether the marker/withdrawal was applied. Exact one-sided Fisher tests for
B vs D, C vs B, E vs B, and E vs C (directional; 38 runs per arm).

## Setup deviations (recorded after dry runs, before any live E7 call)

- **Product version.** Dry runs with `3e3c448` showed that a whole-file read of
  a Python excerpt that Tree-sitter cannot resolve to a symbol is observed as a
  `region`. After the file grows, the projection keeps the *old byte length*
  and cuts the current code mid-line (e7-08: `completer.py:region:53` ends at
  `os.environ.get('`). The same happens on product `main` at `c15f5ad`
  (`region:53bytes`). This is a FreshCtx finding in its own right, not an E7
  result.
- To give every arm the complete current file, E7 uses a `git archive` export
  of `c15f5ad` whose Pi bridge was patched **in the export only** to pass
  `selection_granularity` from `FRESHCTX_GRANULARITY`, set to `file` (a
  documented protocol option that widens candidates to whole files). Recorded
  as `productSha: c15f5ad+granularity-env`. E5/E6 used `3e3c448` with default
  granularity; the two are not directly comparable.
- Runner fix: edits that only add lines have no before-only line; the evidence
  check now skips it instead of throwing.
- Dry-run Jev scores on the 19 real claims (two calls each): 0.43–0.88. e7-22
  scored 0.43/0.45 (below 0.5, so C and E behave like B there); e7-07 scored
  0.55 and 0.47 on identical input, so Jev is not fully deterministic near the
  threshold. The protocol threshold stays 0.5.
