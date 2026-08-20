# Next-iteration prompt — expand holdout or Pi/Hermes on holdout

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0007-sealed-holdout-protocol.md`,
`bench/README.md`, `autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

**Follow-up holdout measurement** after PCR 0007 (holdout v0.1 slice executed).
Pick **one**:

1. Expand holdout trace families (rename, cross-file move, budget-pressure, etc.)
   on the same locked go-tools/neovim commits; **or**
2. Pi/Hermes request-capture replay on existing holdout traces (`npm run ctxbench:pi-holdout` / `hermes-holdout`).

Do not claim Level 4, SOTA, or beat CORVUS. Do not retune policy on holdout feedback.

## Context from PCR 0007

- Holdout lock: go-tools `ed9ed918…`, neovim `2dd6e9d6…`; smoke SHAs unchanged.
- 10 traces, five families; label `public-repo-holdout`.
- One recorded gate failure: `go-tools/interior-edit` → `freshctx-region` required recall 0 (fail-closed omission).
- Traces are unsealed; benchmark v0.2 needs new commits/seeds for a fresh holdout.

## Hard restrictions

- No autoresearch campaign. No model SDK. No paid inference.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` on holdout feedback.
- Do not change smoke gold labels, weights, thresholds, or existing test bodies except ADD holdout tests.
- Synthetic score 89.107165 and ctxbench payload sha256 must remain unchanged.

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
npm run ctxbench:holdout
```

File the next PCR, update lab index and metrics, append `decision=review` to
`autoresearch/results.tsv`.

## Done when

Either expanded holdout families or Pi/Hermes holdout replay ran with raw metrics,
documented limitations, and no ranking claim.
