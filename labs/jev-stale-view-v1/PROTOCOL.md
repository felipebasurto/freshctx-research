# E3 protocol (frozen before any Jev call on E3 data)

## Question

Can Jev rank "stale" assistant statements above non-stale ones on held-out
data, with labels that the prompt author did not produce alone?

## Items

`results/e3_cands.json`, built by `e3_build.py` (seed 20260924): 150 real
source edits (`.py`, successful `str_replace`, paths without
test/repro/debug/verify/demo), one per trajectory, none from a trajectory used
in E2. For each edit: the nearest earlier assistant message (within 25
messages) that mentions at least two identifiers from `old_str`. Only
pre-edit statements are used; E2 showed post-edit ones are trivially fresh.

## Labels

A statement is **stale (1)** when it makes a concrete claim about the code in
the edited file (its lines, names, values, structure or behaviour) that was
true before `edit_diff` and is false after it. Otherwise **0**: plans,
proposals, runtime observations, claims about other files, and claims still
true after the edit. **Exclude** when the diff alone cannot decide.

Two independent labellers, blind to each other and to Jev:

- `labels/author.json` — the lab author (in-session Claude, who also wrote the
  E2 prompt).
- `labels/opus.json` — `claude-opus-5` via `e3_judge.py`, given the same
  rubric verbatim.

Agreement is reported as raw agreement and Cohen's kappa.

## Scorers

- Jev: the E2 Noul, byte-identical (`Q` in `e2_run.py`), model pinned to
  `jev-1.13.0`, one call per item, no retries except on 429/529.
- Baseline: removed-token overlap from `e2_run.py`.

## Metrics

Primary: Jev AUC on items where both labellers agree and neither excludes.
Secondary: AUC against each labeller; precision/recall at 0.5; latency p50/p90;
input tokens.

## Deviation (recorded before any Jev call on E3 data)

`e3_judge.py` failed: the only Anthropic credential available in the lab
environment returned `401 invalid x-api-key`, so `labels/opus.json` does not
exist. The primary metric therefore falls back to **author labels only**
(78 stale, 55 not stale, 17 excluded). This is a single-labeller result from
the person who also wrote the Jev prompt; treat it as weaker than planned.
The second labeller remains pending and can be added later without changing
anything else in this protocol. The author read statements truncated to about
600 characters; Jev and the judge receive up to 1,500.

## Success criterion (set in advance)

Jev AUC ≥ 0.85 on the agreed set **and** at least 0.10 above the baseline.
Anything else is reported as a failure to replicate. No prompt changes after
this commit; any later variant is a separate, labelled experiment.
