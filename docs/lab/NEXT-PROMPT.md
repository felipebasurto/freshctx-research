# Next-iteration prompt — remote attestation host, live-run verify, §5.1 sampler

Copy everything below the line into the next coding agent. The text is public.

---

You are working on FreshCtx, a local-first **context transformer**, not a coding
agent. Read completely: `THESIS.md`, `SOUL.md`, `AGENTS.md`,
`docs/EVALUATION.md`, `docs/ROADMAP.md`,
`docs/lab/pcr/0010-holdout-protocol-enforcement.md`,
`docs/lab/pcr/0011-test-hygiene-sealed-hash-gate.md`,
`docs/lab/pcr/0079-stateless-byte-exact-requests.md`,
`bench/holdout-protocol.mjs`, `bench/holdout-verify.mjs`, `bench/README.md`.

Treat `SOUL.md` and `docs/EVALUATION.md` as constitutions. Record conflicts in
`docs/lab/pcr/`. Do not silently pick a side.

## Goal

Complete P1 infrastructure **before** any v0.2 holdout measurement:

1. **Remote-attest host + live-run verification** — wire production attestation
   consumption and end-to-end verify on a protocol fixture (not v0.2 seeds).
2. **EVALUATION §5.1 trace sampler** — deterministic pre-freeze sampling only;
   no holdout-v0.2 manifest or traces yet.
3. **Disposable canary pack** — exercise freeze→generate→run→report→verify with
   sampler output on a throwaway pack id (not holdout-v0.2).

Do **not** start holdout v0.2 measurement in this iteration.

## Locked invariant: stateless byte-exact requests

PCR 0079 removed cross-turn injected-revision state from the core and both
adapters. That behavior is now load-bearing and must not come back in any form,
including as a cache, an opt-in flag, or an adapter-local map.

- Every selected `freshctx-unit` carries the current `unit.content`, on every
  request, whether or not disk changed since the last request.
- `content-bytes` is the UTF-8 length of the rendered body. It is 0 only for a
  genuinely empty current unit.
- There is no `unchanged` attribute, no `lastInjectedRevision`, and no
  `injectedRevisions`.
- `projectContext` and `renderUnit` stay pure. `project()` must not mutate
  caller-owned state.
- `bench/metrics.mjs` compares content digests only. A revision attribute is
  never evidence of recall.
- Hermes `selectContext` stays read-only. State writes happen in
  `observeTurn` alone.
- Pi and Hermes `projectionBytes` must equal live core `freshctx-region`, not
  merely stay under it.

If a byte or prefix-cache idea needs any of the above relaxed, it is the wrong
idea. Work through selection, ordering, or unit grain instead.

## Context from PCR 0010 + 0011 + 0079

- Freeze/generate/run/report invariant is code-enforced with negative tests.
- holdout v0.1 predates the protocol; remains `unsealed-regression-development-pack`.
- Legacy `npm run ctxbench:holdout` runs v0.1 only; v0.2+ requires protocol commands.
- Sealed classification requires remote freeze attestation + committed
  `bench/packs/<packId>/reports/results.jsonl` with matching `state.resultSetHash`.
- Unit tests must not rewrite tracked reports (`bench/report-artifacts.mjs`);
  `npm test` followed by `git diff --exit-code` must stay clean.
- PCR 0077 and PCR 0078 both said `review` and both landed on `main` anyway. A
  `review` decision is not enforced by anything in the repository. If you add
  that enforcement, it is its own PCR and its own change.

## Hard restrictions

- No autoresearch campaign. No model SDK. No paid inference.
- Do not tune `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs` on holdout feedback.
- Do not change smoke gold labels, weights, thresholds, or existing test bodies.
- Do not weaken any adapter/core parity assertion from equality back to `<=`.
- Synthetic score 89.107165 and ctxbench payload sha256
  `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` must remain
  unchanged.
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

Baseline at PCR 0079: `npm test` gives 235 pass, 22 skip, 0 fail out of 257.

File the next PCR, update lab index and metrics, append `decision=review` to
`autoresearch/results.tsv`.

## Done when

Remote attestation host path is documented and exercised on a protocol fixture;
§5.1 sampler is implemented and tested without creating v0.2 artifacts; the
stateless byte-exact invariant above still holds; hygiene and sealed-hash gates
remain green; limitations documented; no Level 4 / SOTA claim.

## After P1 (later iteration)

First **new-seed** holdout (v0.2+) using full protocol including remote freeze
attestation and §5.1 sampler output — separate PCR from canary work above.
