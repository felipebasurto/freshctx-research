# Next-iteration prompt — CORVUS deviation table on smoke traces

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0004-hermes-smoke-capture.md`,
`docs/adr/0003-corvus-reproduction-deviations.md`, `bench/smoke.mjs`,
`bench/README.md`, `autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

Publish a **measured** side-by-side deviation table: documented CORVUS
whole-file reproduction (`corvus-file` baseline) vs `freshctx-region` vs
`freshctx-file` on the existing Flask/Express smoke board. State every known
deviation from [CORVUS](https://arxiv.org/abs/2607.22711) explicitly. This is
measurement and documentation fidelity, not a SOTA claim and not holdout work.

## Hard restrictions

- No autoresearch campaign. No model SDK. No sampled output.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`.
- Do not retarget `bench/repos.lock.json` commit SHAs.
- Do not change gold labels, weights, thresholds, or existing test bodies except
  to ADD reporting/runner tests if needed.
- Node stdlib only in prototype core. Fail open at host boundary.
- Pi and Hermes adapter smoke boards must keep passing as regressions.

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
npm run ctxbench:hermes-smoke
```

File PCR 0005 with the deviation table and raw metric deltas. Update lab index
and metrics. Append `decision=review` to `autoresearch/results.tsv`.

## Done when

PCR 0005 contains a cited-vs-measured CORVUS deviation table on smoke v0.1 with
no implied ranking claim. Do not start sealed holdout execution in the same PR.
