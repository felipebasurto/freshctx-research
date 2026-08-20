# Next-iteration prompt — expand holdout trace families

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0008-pi-hermes-holdout-replay.md`,
`bench/README.md`, `autoresearch/CONTRACT.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

**Expand holdout trace families** on the existing locked go-tools/neovim commits
(add rename, cross-file move, budget-pressure, or other §5.2 families from
`docs/EVALUATION.md`). Do **not** retune policy on holdout feedback. Do **not**
claim Level 4, SOTA, or beat CORVUS.

## Context from PCR 0008

- Holdout lock: go-tools `ed9ed918…`, neovim `2dd6e9d6…`; smoke SHAs unchanged.
- Pi/Hermes holdout replay matches core `freshctx-region` cell-for-cell on v0.1.
- Recorded gate failure (shared): `go-tools/interior-edit` → required recall 0
  (fail-closed omission); stale 0; projection-bytes 164.
- Commands: `npm run ctxbench:pi-holdout`, `ctxbench:hermes-holdout`,
  `ctxbench:adapters-holdout`, `ctxbench:holdout`.
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
npm run ctxbench:adapters-holdout
```

File the next PCR, update lab index and metrics, append `decision=review` to
`autoresearch/results.tsv`.

## Done when

New holdout families are authored, executed once with raw metrics, limitations
documented, and no ranking claim.
