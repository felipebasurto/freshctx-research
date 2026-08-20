# Next-iteration prompt — remote attestation host, live-run verify, §5.1 sampler

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/lab/pcr/0010-holdout-protocol-enforcement.md`,
`docs/lab/pcr/0011-test-hygiene-sealed-hash-gate.md`,
`bench/holdout-protocol.mjs`, `bench/holdout-verify.mjs`, `bench/README.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

Complete Phase 0 infrastructure **before** any v0.2 holdout measurement:

1. **Remote-attest host + live-run verification** — wire production attestation
   consumption and end-to-end verify on a protocol fixture (not v0.2 seeds).
2. **EVALUATION §5.1 trace sampler** — deterministic pre-freeze sampling only;
   no holdout-v0.2 manifest or traces yet.
3. **Disposable canary pack** — exercise freeze→generate→run→report→verify with
   sampler output on a throwaway pack id (not holdout-v0.2).

Do **not** start holdout v0.2 measurement in this iteration.

## Context from PCR 0010 + 0011

- Freeze/generate/run/report invariant is code-enforced with negative tests.
- holdout v0.1 predates the protocol; remains `unsealed-regression-development-pack`.
- Legacy `npm run ctxbench:holdout` runs v0.1 only; v0.2+ requires protocol commands.
- Sealed classification requires remote freeze attestation + committed
  `bench/packs/<packId>/reports/results.jsonl` with matching `state.resultSetHash`.
- Unit tests must not rewrite tracked reports (`bench/report-artifacts.mjs`);
  `npm test` followed by `git diff --exit-code` must stay clean.

## Hard restrictions

- No autoresearch campaign. No model SDK. No paid inference.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` on holdout feedback.
- Do not change smoke gold labels, weights, thresholds, or existing test bodies.
- Synthetic score 89.107165 and ctxbench payload sha256 must remain unchanged.
- Do not generate holdout-v0.2 seeds, traces, manifests, or reports.

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

File the next PCR, update lab index and metrics, append `decision=review` to
`autoresearch/results.tsv`.

## Done when

Remote attestation host path is documented and exercised on a protocol fixture;
§5.1 sampler is implemented and tested without creating v0.2 artifacts; hygiene
and sealed-hash gates remain green; limitations documented; no Level 4 / SOTA claim.

## After Phase 0 (later iteration)

First **new-seed** holdout (v0.2+) using full protocol including remote freeze
attestation and §5.1 sampler output — separate PCR from canary work above.
