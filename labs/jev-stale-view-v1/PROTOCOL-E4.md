# E4 protocol — whole-context sweep and fan-out (written before any E4 Jev call)

## Questions

1. With a realistic base rate (every earlier assistant message, not only the
   nearest one that mentions edited identifiers), what precision does Jev have
   at the E3 thresholds?
2. Does fan-out (one request per edit, one Noul per statement, the statement
   inside structured `instructions`) give the same scores as one request per
   statement, and what does it do to latency?

## Items (`e4_build.py`, seed 4)

25 edits from rg0 trajectories not used in E2 or E3, same edit filter as E3.
For each edit: every assistant message before it with at least 80 characters
of content, up to the 30 nearest. Statements truncated to 1,500 characters.

## Scorers

- `single`: the frozen E2/E3 request, one call per statement.
- `fanout`: one call per edit. `state = {file, edit_diff}`. Each question is
  the E2 Noul with `instructions = {"statement": <text>, "question": <E2 text>}`
  and the E2 criteria unchanged.

## Labels

After both runs, the author labels, blind to scores and shuffled: every
statement flagged (p ≥ 0.5) by either scorer, plus a uniform random sample of
40 unflagged statements. Same rubric as E3.

## Reported

Flag rate per scorer; precision of flags at 0.5 and 0.7; estimated miss rate
from the unflagged sample; Pearson/Spearman agreement and max |Δp| between
`single` and `fanout`; latency per edit (fan-out) vs summed and parallel
latency (single); tokens.

No success threshold: this is a measurement of deployment conditions.
