# PCR 0109 — Sealed lab program (attestation, sampler, canary, v0.2 draft, interior-edit lock, CORVUS review, Isolated Semantic Engine)

- Date (UTC): 2026-08-28
- Author / agent: Cursor Grok 4.6
- Branch / PR: working tree on `main` @ `59c9302` (uncommitted program)
- Commit: (this change set)
- Merge-base: `59c93022085838532bb2107686895d00406e913c` (main @ PCR 0108)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `protocol-fixture`; `unsealed-regression`; `measurement`
- Decision: **review**

## Hypothesis or change

Build the sealed-lab substrate (remote attestation consume, §5.1 sampler,
disposable canary, holdout v0.2 protocol path, interior-edit characterization,
CORVUS review, Tree-sitter Isolated Semantic Engine + independent gold) without claiming Level 4
and without treating v0.2 as a tuning set.

## What we did

**PR-A.** Verify recomputes `bindingSha256`, emits
`ATTESTATION_BINDING_MISMATCH`, `ATTESTATION_MANIFEST_MISMATCH`, and
`ATTESTATION_NOT_PRODUCTION`, and accepts `--attestation=<path>`.

**PR-B.** `bench/unit-sampler.mjs` / `bench/sample-units.mjs` rank with raw
`sha256(commit + selector + scenario)`, enumerate whole files, and record
reject reasons. No `resolveRegion` import.

**PR-C.** `scripts/canary-pack.mjs` freeze→generate→run→report→verify on a
throwaway id, then deletes. Refuses `holdout-v0.2`. Tampered binding fails
`ATTESTATION_BINDING_MISMATCH`.

**PR-D.** Sampler-backed `holdout-v0.2` protocol path. Local classification is
**locally-frozen**, not `sealed`. `bench/splits/holdout-v0.2.json` is a draft.
This pack is **not a tuning set**. Sealed still requires a numeric GHA run.

**PR-E.** Characterized `ParseFile.body`. Frozen `bench/reports/holdout.md` is
a historical recall-0 artifact (PCR 0013 era). Live `freshctx-region` on the
v0.1 door is recall 1 / exact-current 1. File-grain and `corvus-file` stay 1.
v0.2 cells are not a tuning signal.

**PR-F.** No resolver edit. Live miss was already closed. Lock-in test in
`test/structural-consensus-relocation.test.mjs` (`boundary-anchors`). Door
`src/anchors.mjs` blob unchanged: `f8771c93894095348185ef3453a3c2498355b3c6`.

**PR-G.** ADR 0003 reviewed as a documented Algorithm 1 lifecycle reproduction.
Same traces and `budgetChars`; \(C_t\) not truncated; no `desync_file`; score
weights untouched. PDF sha256
`204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf`.

**PR-H.** ADR 0004 accepts an Isolated Semantic Engine. `src/` stays stdlib. Gold is a second
program. No LSP. Stateless. Hermes `adapters/hermes/bridge.mjs` is the spawn
precedent.

**PR-I.** `ise/treesitter/` JSON stdin/stdout. Injected runner on
`FreshCtxEngine`. Missing or broken Isolated Semantic Engine fail-closes. No `tree-sitter`
import in `src/`.

**PR-J.** `bench/gold-extract.mjs` reads generator offsets. Sabotaged Isolated Semantic Engine
units do not change gold. Neovim C/Lua remain out of scope.

No Level 4 sentence. README stays prototype.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **390** total; **364** pass; **2** fail; **24** skip — PCR 0096/0097 require `bench/hosts/hermes` (pre-existing) |
| `npm run check` | yes | 0 | includes `ise/treesitter/*.mjs` |
| `node bench/run.mjs` | yes | 0 | `score` 89.10716495057945 (`AUTORESEARCH_SCORE=89.107165`) |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | valid |
| `npm run evaluate` | no | — | host-contract path still blocked without Hermes checkout; score taken from `bench/run.mjs` |

## Metric snapshot

| metric | main @ 59c9302 | PCR 0109 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 358 | **390** | **+32** |
| `npm test` passed | 332 | **364** | **+32** |
| `npm test` failed | 2 | **2** | `0` (0096/0097 host absent) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| holdout v0.1 classify | `unsealed-regression` | `unsealed-regression` | `0` |
| holdout v0.2 classify | absent | locally-frozen in protocol tests; draft on disk | n/a |
| live go-tools interior-edit region recall | 1 | 1 | `0` |

## Comparison

CORVUS remains a documented lifecycle reproduction (ADR 0003 reviewed). No
“we beat CORVUS” claim. No Level 4 claim.

## Conflicts with constitutions

none observed. v0.2 is not sealed on this laptop; the PCR says so.

## Limitations

- `sealed` still needs a production GHA freeze-attest run. A draft split is
  not a sealed board.
- Sampler is whole-file; symbol units are Isolated Semantic Engine-proposed, not gold.
- Isolated Semantic Engine extractors are contract-compatible regex grammars, not a native
  Tree-sitter addon.
- Neovim C/Lua stay out of scope.
- 0096/0097 still need `bench/hosts/hermes`.

## Next measurement

Run freeze-attest on GitHub Actions and consume the artifact with
`holdout:verify --attestation=` before any public v0.2 number.
