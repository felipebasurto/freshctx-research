# Next-iteration prompt — GHA seal of holdout v0.2

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/ROADMAP.md`,
`docs/lab/pcr/0109-sealed-lab-program.md`,
`docs/lab/pcr/0079-stateless-byte-exact-requests.md`,
`docs/decisions/0004-treesitter-sidecar.md`,
`bench/holdout-protocol.mjs`, `bench/holdout-verify.mjs`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions.

## Goal

PCR 0109 landed the sealed-lab substrate in-repo. Next work is **not** another
sampler or another interior-edit hill-climb.

1. Produce a **production** GHA freeze-attest run and consume it with
   `holdout:verify --attestation=<artifact>`. Local classify stays
   `locally-frozen` until that happens. Do not forge `sealed`.
2. Keep v0.2 off the tuning path. One scheduled remeasure only.
3. Optional: replace sidecar regex extractors with a real Tree-sitter pack
   **behind the same stdin/stdout contract**. Do not import a parser into `src/`.

## Locked invariant: stateless byte-exact requests

PCR 0079 still holds. Selected units carry current bytes. No `unchanged`
attribute. The sidecar must not cache prior request bodies.

## Hard restrictions

- No Level 4 / SOTA sentence.
- Do not change smoke gold, weights, thresholds, or `bench/traces/holdout/**`.
- Do not rewrite `bench/reports/holdout.md`.
- Synthetic score `89.107165` and ctxbench payload
  `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` stay frozen.
- Neovim C/Lua remain out of the first sidecar.

## Required loop

```bash
npm test
git diff --exit-code
npm run check
npm run evaluate
npm run ctxbench
npm run holdout:verify -- --pack=holdout-v0.1
npm run holdout:ci-guard -- --base=origin/main
```

Baseline at PCR 0109: `npm test` gives 364 pass, 2 fail (0096/0097, missing
`bench/hosts/hermes`), 24 skip, 390 total.
