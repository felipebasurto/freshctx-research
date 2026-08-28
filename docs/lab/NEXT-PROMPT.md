# Next-iteration prompt — after sealed holdout v0.2

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/ROADMAP.md`,
`docs/lab/pcr/0110-seal-holdout-v0.2.md`,
`docs/lab/pcr/0079-stateless-byte-exact-requests.md`,
`docs/decisions/0004-treesitter-sidecar.md`,
`bench/holdout-protocol.mjs`, `bench/holdout-verify.mjs`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions.

## Goal

PCR 0110 committed a GHA-sealed holdout v0.2 pack. Next work is **not** a
hill-climb on that pack.

1. Keep v0.2 off the tuning path. One scheduled remeasure only. Do not edit
   `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` to chase these
   cells.
2. Optional: replace sidecar regex extractors with a real Tree-sitter pack
   **behind the same stdin/stdout contract**. Do not import a parser into `src/`.
3. Do not forge `sealed` on a laptop. Production attestation stays Actions-only.

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
- Holdout v0.2 is **not a tuning set**.

## Required loop

```bash
npm test
git diff --exit-code
npm run check
npm run evaluate
npm run ctxbench
npm run holdout:verify -- --pack=holdout-v0.1
npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json
npm run holdout:ci-guard -- --base=origin/main
```

Baseline at PCR 0110: v0.2 verify prints `valid: true` and
`classification: "sealed"`. v0.1 stays `unsealed-regression`.
