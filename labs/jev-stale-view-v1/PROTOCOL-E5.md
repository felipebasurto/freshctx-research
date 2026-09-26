# E5 protocol — does flagging a stale assistant conclusion change outcomes? (written before any live call)

## Question

When a saved session contains an assistant *conclusion* about code that was
later changed outside the agent, does (a) the stale conclusion hurt a model
that already receives current code through FreshCtx, and (b) does a Jev-driven
"possibly outdated" marker on that conclusion recover the loss?

## Tasks

The five frozen `labs/pi-outcome-v1/tasks/*.json` pairs of `before`/`after`
files and expressions (rate-constant, tax-base, operator-shift,
quote-surcharge, moved-symbol), with two changes, both fixed here in advance:

1. Seed: the scripted provider forces the same two real Pi reads, then replies
   with a concrete conclusion instead of `Ready.`:
   `I read <observed>: <fn>(quantity) returns <stale expr>, so <fn>(3) = <value>. For <unread> I only saw the header line, not <fn2>().`
   `<value>` is computed from the `before` file.
2. Prompt: neutral, without the "workspace may have changed" hint:
   `Compute <expression> from the files in this workspace. You may read any required code. Return only a JSON object with the numeric field answer.`
   Retry prompt unchanged from pi-outcome-v1.

Files change while the session is closed (external edit), as in pi-outcome-v1.

## Arms

- `A_base`: native Pi read, seeded conclusion.
- `B_fc`: FreshCtx bridge, seeded conclusion.
- `C_fc_jev`: FreshCtx bridge, seeded conclusion; on every post-resume request the
  loopback proxy (after FreshCtx has rewritten the request) asks Jev, in one
  fan-out call per session (cached), whether each assistant message is stale
  given the observed file's diff (E2 Noul, `jev-1.13.0`). Messages with
  p ≥ 0.5 get this text appended in the outgoing copy only:
  `[FreshCtx note: <observed> changed after this message was written; claims about it may be outdated.]`
- `D_fc_noclaim`: FreshCtx bridge, seed reply `Ready.` (control).

## Model and limits

`deepseek-v4-flash`, temperature 0, thinking disabled, 512 output tokens,
≤ 8 post-resume requests per arm, ≤ 64,000 bytes per request, 2 submissions.
3 repetitions per task and arm; arm order rotated per repetition. Checker:
`pi-outcome-v1/checker.mjs` unchanged. Spend cap $2 at peak prices
($0.44/M input, $1.32/M output); the runner aborts above it.

## Reported

Per arm: first-submission pass, pass within two, requests to pass, reads,
whether the first submission equals the stale-derived answer; Jev p for the
seeded conclusion; whether the marker was applied; tokens and spend.

Comparisons of interest: B vs D (harm), C vs B (recovery), A vs B (FreshCtx).
With 15 runs per arm this is a small, directional result, not a significance
claim.
