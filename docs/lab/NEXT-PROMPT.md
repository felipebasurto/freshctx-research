# Next-iteration prompt — first new-seed holdout with freeze protocol

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0009-holdout-freeze-protocol.md`,
`bench/holdout-protocol.mjs`, `bench/README.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

Execute the **first new-seed holdout** (v0.2+) using the enforced pipeline:

```bash
npm run holdout:freeze -- --manifest=bench/splits/holdout-v0.2.json --pack=holdout-v0.2 --repos=go-tools,neovim --seed=<new-seed>
# commit and push manifest

npm run repos:fetch:holdout
npm run holdout:generate -- --manifest=bench/splits/holdout-v0.2.json
npm run holdout:run -- --manifest=bench/splits/holdout-v0.2.json
npm run holdout:report -- --manifest=bench/splits/holdout-v0.2.json
```

Do **not** expand or re-seal holdout v0.1. v0.1 remains
`unsealed-regression-development-pack` for regression only.

## Context from PCR 0009

- Freeze/generate/run/report invariant is code-enforced with negative tests.
- holdout v0.1 predates the protocol; do not retroactively preregister it.
- Legacy `npm run ctxbench:holdout` still runs v0.1 without freeze provenance.

## Hard restrictions

- No autoresearch campaign. No model SDK. No paid inference.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` on holdout feedback.
- Do not change smoke gold labels, weights, thresholds, or existing test bodies.
- Synthetic score 89.107165 and ctxbench payload sha256 must remain unchanged.
- New holdout MUST use **new seeds** and new manifest path (`holdout-v0.2` or later).

## Required loop

```bash
npm test
npm run check
npm run evaluate
npm run ctxbench
npm run demo
npm run ctxbench:holdout   # legacy v0.1 regression (may exit 1 on known miss)
```

File the next PCR, update lab index and metrics, append `decision=review` to
`autoresearch/results.tsv`.

## Done when

New-seed holdout manifest is frozen and committed before traces; full pipeline
produces a report embedding freeze SHA, manifest hash, implementation SHA, and
lock SHAs; limitations documented; no Level 4 / SOTA claim.
