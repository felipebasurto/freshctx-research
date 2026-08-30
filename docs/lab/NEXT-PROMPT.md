# Next-iteration prompt — after sealed holdout v0.2

## Milestones (2026-08-28)

| When | What | Evidence |
|---|---|---|
| PCR 0109 | Sealed-lab substrate: attestation consume, sampler, canary, v0.2 **draft**, sidecar + gold. Local classify is `locally-frozen`, never `sealed`. | [0109](pcr/0109-sealed-lab-program.md) |
| PR-W [#104](https://github.com/felipebasurto/freshctx/pull/104) | `holdout-generate.yml`: optional `generator` input, strip `--fixture=synthetic`, verify `--attestation=`, upload pack. `contents: read`. Attest YAML untouched. | merge `d64c48d` |
| Action-F | `repositoryIds: ["flask"]`. Freeze via protocol (no hand-edit of `status`). Traces absent at freeze commit. Local `holdout-write-attestation` exits 1. | freeze `2bf91d8` |
| Attest | Production attestation. `workflowRunId` = run id. Laptop cannot write this file. | [run 33201069400](https://github.com/felipebasurto/freshctx/actions/runs/33201069400) |
| Action-G | Generate with `freeze_run_id=33201069400` and `generator=holdout-v0.2`. Runner verify `sealed` / `valid: true`. | [run 33201275503](https://github.com/felipebasurto/freshctx/actions/runs/33201275503) on `70df2f4` |
| PR-S [#105](https://github.com/felipebasurto/freshctx/pull/105) | Commit GHA pack + `freeze-attestation.json` + [PCR 0110](pcr/0110-seal-holdout-v0.2.md). | tip `0c2bdf3` |

Verify that must keep working:

```bash
npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json
# valid true, classification sealed
```

## Decisions that still bind

1. **Laptop freeze, GHA attest, GHA generate.** Only Actions writes production attestation. `holdout-write-attestation.mjs` stays Actions-only. A github.com URL written on a laptop is a forge; `reportPack` still will not set `sealed` without `GITHUB_ACTIONS`.
2. **Two workflows stay decoupled.** Operator passes `freeze_run_id`. Do not chain attest into generate with `workflow_run`.
3. **Do not edit `bench/repos.lock.json`.** v0.2 binds the existing flask commit `d318b683471101618febed18996405ad26462110`. Adding a `synthetic` lock key would change lock identity.
4. **Sampler traces are in-memory fixtures** (`src/alpha.py`, `src/beta.py`). The flask SHA is the rank/bind identity, not a checked-out flask tree.
5. **This pack is not a tuning set.** Do not hill-climb `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` against these cells. One scheduled remeasure only.
6. **Never hand-edit `status` to `frozen` or `classification` to `sealed`.** Freeze and report go through the protocol.
7. **Do not push a draft split.** Attest refuses `status !== "frozen"`. Push only the freeze commit (or a tip whose HEAD split is frozen).
8. **Generate.yml install order.** Copy attestation into `bench/packs/<id>/provenance/` only **after** generate/run. Generate refuses untracked provenance.
9. **Pack upload is a tarball.** `actions/upload-artifact` rejects `:` in paths. Trace **filenames** use `--` instead of `::`; selectors inside JSON keep `::file`.
10. **v0.1 stays `unsealed-regression`.** ctxbench payload `697e74e3…` stays frozen. `npm run evaluate` no longer prints `AUTORESEARCH_SCORE`. No Level 4 sentence.

Rejected: edit the lock to add `synthetic`; seal on a laptop; `workflow_run` chaining.

---

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/ROADMAP.md`,
`docs/lab/NEXT-PROMPT.md` (milestones and decisions above the first rule),
`docs/lab/pcr/0110-seal-holdout-v0.2.md`,
`docs/lab/pcr/0079-stateless-byte-exact-requests.md`,
`docs/decisions/0004-treesitter-sidecar.md`,
`docs/decisions/holdout-protocol-threat-model.md`,
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
- ctxbench payload
  `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` stays frozen.
  Do not restore `AUTORESEARCH_SCORE` or the weighted synthetic scalar.
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
