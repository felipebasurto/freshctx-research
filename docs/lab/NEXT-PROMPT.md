# Next-iteration prompt — sealed holdout protocol

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0006-region-grain-adapters.md`,
`bench/README.md`, `autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

**Sealed holdout protocol:** Preregister and execute the holdout trace protocol
in `docs/EVALUATION.md` §4 / §13 on pinned repos **without** tuning on holdout
labels. Document trace seeds, gold audit sample, and raw results only.

PCR 0006 closed region-grain Pi/Hermes adapter measurement on smoke v0.1.
Do not repeat adapter or CORVUS deviation work. Do not claim to beat CORVUS or
state-of-the-art.

## Hard restrictions

- No autoresearch campaign. No model SDK. No sampled output. No paid inference.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` on
  holdout feedback.
- Do not retarget `bench/repos.lock.json` commit SHAs without a documented
  benchmark version bump.
- Do not change gold labels, weights, thresholds, or existing test bodies except
  to ADD holdout runner/reporting tests if needed.
- Synthetic score 89.107165 and payload sha256
  `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` must
  remain unchanged unless you intentionally bump the benchmark contract.

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

File the next PCR, update lab index and metrics, append `decision=review` to
`autoresearch/results.tsv`.

## Done when

Holdout protocol is documented and executed with measured raw metrics, explicit
limitations, and no ranking claim against CORVUS or other systems.
