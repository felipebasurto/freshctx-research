# Next-iteration prompt — sealed holdout protocol or region-grain adapters

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0005-corvus-deviation-table.md`,
`docs/decisions/0003-corvus-reproduction-deviations.md`, `bench/README.md`,
`autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal (pick one branch; do not combine in one PR)

**Option A — Sealed holdout protocol:** Preregister and execute the holdout trace
protocol in `docs/EVALUATION.md` §4 / §13 on pinned repos **without** tuning on
holdout labels. Document trace seeds, gold audit sample, and raw results only.

**Option B — Region-grain adapters:** Extend Pi and Hermes replay harnesses to
track smoke region reads at region granularity (not whole-file), re-measure
`exact-current` against region gold, and compare projection-bytes to
`freshctx-region` on the same smoke traces.

PCR 0005 published the CORVUS cited-vs-measured deviation table on smoke v0.1.
Do not repeat that work. Do not claim to beat CORVUS or state-of-the-art.

## Hard restrictions

- No autoresearch campaign. No model SDK. No sampled output. No paid inference.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`
  unless Option B requires adapter-only changes (not core policy).
- Do not retarget `bench/repos.lock.json` commit SHAs without a documented
  benchmark version bump.
- Do not change gold labels, weights, thresholds, or existing test bodies except
  to ADD reporting/runner tests if needed.
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

The chosen option has a PCR with measured raw metrics, explicit limitations, and
no ranking claim against CORVUS or other systems.
