# Next-iteration prompt — Hermes `select_context()` on the smoke traces

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0003-pi-smoke-capture.md`,
`adapters/hermes/README.md`, `adapters/pi/replay.mjs`, `bench/pi-smoke.mjs`,
`bench/README.md`, `autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

Capture the **same** Flask/Express smoke traces through the Hermes adapter seam
(`on_turn_complete` + `select_context()`, fake provider / bridge, no model).
Record whether the Hermes payload satisfies the same freshness/uniqueness gates
as the core `public-repo-smoke` board and how it compares to the Pi replay in
PCR 0003.

This is measurement / adapter fidelity, not a performance claim and not SOTA.

## Hard restrictions

- No autoresearch campaign. No model SDK. No sampled output.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`.
- Do not retarget `bench/repos.lock.json`.
- Do not change gold labels, weights, thresholds, or existing test bodies except
  to ADD adapter/runner tests.
- Node stdlib only in prototype core. Fail open at the host boundary.

## Required loop

```bash
npm test
npm run check
npm run evaluate
npm run ctxbench
npm run demo
npm run repos:verify
npm run ctxbench:smoke
npm run ctxbench:pi-smoke
```

File PCR 0004 with full-suite table and Pi/Hermes/core deltas. Update lab index
and metrics. Append `decision=review` to `autoresearch/results.tsv`.

## Done when

Hermes request-capture either passes the same smoke gates or PCR 0004 states the
exact protocol gap. Do not start CORVUS ranking or holdout work in the same PR.
