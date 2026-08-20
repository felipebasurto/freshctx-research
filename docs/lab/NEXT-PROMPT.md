# Next-iteration prompt — Pi request-capture of the smoke traces

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/COMPETITIVE_LANDSCAPE.md`, `docs/ROADMAP.md`,
`docs/BENCHMARK.md`, `docs/lab/README.md`, `docs/lab/pcr/0002-corvus-lifecycle.md`,
`docs/decisions/0003-corvus-reproduction-deviations.md`, `bench/README.md`,
`autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

Capture the **same** Flask/Express smoke traces through the Pi adapter seam
(request-only `context` event, fake provider, no model). Record whether the
Pi payload satisfies the same freshness/uniqueness gates as the core
`public-repo-smoke` board.

This is measurement / adapter fidelity, not a performance claim and not SOTA.
Do not start a faithful CORVUS-vs-FreshCtx ranking paper in this iteration.

## Hard restrictions

- No autoresearch campaign. No model SDK. No sampled output.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`.
- Do not retarget `bench/repos.lock.json`.
- Do not change gold labels, weights, thresholds, or existing test bodies
  except to add adapter/runner tests.
- `npm test` stays `test/*.test.mjs`. `evaluate.mjs` stays `readdir`.
- Node stdlib only in prototype core. ESM `.mjs`.
- Fail open at the host boundary: adapter failure returns the original request.

## Required loop

After the first compiling change, and again before done:

```bash
npm test
npm run check
npm run evaluate
npm run ctxbench
npm run demo
npm run repos:verify
npm run ctxbench:smoke
```

File PCR 0003 with the full-suite table. Update `docs/lab/INDEX.md` and
`docs/lab/METRICS.md`. Append a `decision=review` row to
`autoresearch/results.tsv`. Commit, push, and update the PR.

## Public writing

Measured / reproduced / cited. Link primary sources. No SOTA. No closed-product
speculation. No unpublished holdout seeds.

## Done when

Pi request-capture either passes the same smoke gates or the PCR states the
exact protocol gap that prevents calling Pi “supported.” Leave
`docs/lab/NEXT-PROMPT.md` pointing at the following measurement (likely Hermes
`select_context()` on the same traces). Do not start that work in the same PR.
