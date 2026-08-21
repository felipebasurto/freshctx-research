# PCR 0013 — wave2 go-tools structural consensus rebase reeval

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (wave2-go-tools-rebase-reeval)
- Branch / PR: `wave2-go-tools-rebase-reeval` ([PR #5](https://github.com/felipebasurto/freshctx/pull/5))
- Rebase base SHA: `b042c0a36987e58c8f1d2da271af71b59c1a226a` (main: neovim prefix-stable crop + adapter-contract)
- Candidate source: `80f457e55d428f1dd3090cc9473eeca1221f33ee` (wave2-go-tools-safe-relocation)
- Resulting HEAD: (this PR; see commit column below)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `public-repo-holdout`; `replay`

**Status:** development only. **Not sealed.** Not a holdout claim. Not SOTA. No v0.2.

## Hypothesis or change

Rebase commit `80f457e` (unique interior line structural consensus) onto current main `b042c0a`, keeping **both**:

1. neovim prefix-stable span crop (PR 2 / `94e9e59`), and
2. production wiring of `resolveRegion` fallback to `src/structural-consensus.mjs` (single implementation; no forked algorithm).

Production rule (post–Codex review): structural consensus accepts **only** when the winning inferred `startLine` equals the original observed `anchors.startLine` exactly. Offset-shifted unanimous votes fail closed. No independent current-boundary proof in this slice.

Allowlisted implementation files: `src/anchors.mjs`, `src/structural-consensus.mjs`.

## Implementation summary

| Commit | Description |
|---|---|
| `ba7770a` | Rebased `80f457e` structural consensus onto `b042c0a` (clean rebase) |
| `f3cdb47` | Wire production `resolveRegion` to import `resolveRegionByStructuralConsensus` |
| (this PR) | Codex fail-closed fix: reject structural consensus when `best.start + 1 !== anchors.startLine`; adversarial production + helper tests |

Historical v0.1 reports, golds, scoring, protocol, sampler, registry, and `autoresearch/results.tsv` are **byte-identical** to pre-branch main.

## Codex review finding and fix

**Finding (valid, fail-closed):** before the fix, `resolveRegionByStructuralConsensus` treated `locationDelta` as a tie-breaker only. When the first boundary line was renamed and a line inserted before surviving interior lines, every survivor voted for a shifted inferred start. The helper returned a fixed `lineCount` slice from that shifted start — projecting body-through-closer and omitting the current header — marked `resolved`.

**Fix:** after ambiguity, minimum-support, and duplicate checks pass, reject unless `best.start + 1 === anchors.startLine`. Method: `offset-shift-without-boundaries`. No independent boundary-pair or interior-blob escape hatch in this PR.

**Adversarial regression (production path):** `test/structural-consensus-relocation.test.mjs` — four-line function, header renamed, one line inserted after header, body lines vote shifted start; both helper and production `resolveRegion` return `unresolved` with no projected content.

## FINAL REPORT — accept/reject verdict

**Verdict: ACCEPT** (all gates pass after Codex fix; DRAFT PR #5 updated; **not merged**).

| Gate | Result |
|---|---|
| `npm test` | **78/78** pass |
| `npm run evaluate` | exit 0; `AUTORESEARCH_SCORE=89.107165` (unchanged) |
| smoke + holdout (programmatic) | 20/20 `freshctx-region` cells; 0 hard gate failures |
| required-recall | **20/20** |
| exact-current | **12/20** (was 11/20 on `b042c0a`; +1 go-tools interior-edit) |
| staleBytesSum | **0** |
| duplicateSum | **0** |
| delete / duplicate-boundary | fail-closed (exact 0, required-recall 1) |
| Pi holdout payloadSha256 parity | **10/10** traces match live core |
| Hermes holdout payloadSha256 parity | **10/10** traces match live core |
| Pi/Hermes failure-set parity | **empty === empty** |
| protected-file SHA-256 vs `b042c0a` | **pass** (only allowlisted impl + test + PCR docs differ) |
| neovim prefix-stable crop | preserved (`neovim/append` exact=1, 1029 bytes) |
| go-tools interior-edit | **recovered** (recall 1, exact 1, start 32, locationDelta 0) |
| Codex-shaped regression | **fail-closed** (production unresolved) |
| historical tracked reports | unchanged |

## Per-cell table — candidate HEAD (post–Codex fix)

`freshctx-region` over smoke v0.1 (10 cells) + holdout v0.1 (10 cells) = 20 cells.

| repo | family | recall | exact | stale | dup | proj bytes |
|---|---|---:|---:|---:|---:|---:|
| express | append | 1 | 1 | 0 | 0 | 948 |
| express | delete | 1 | 0 | 0 | 0 | 164 |
| express | duplicate-boundary | 1 | 0 | 0 | 0 | 644 |
| express | interior-edit | 1 | 1 | 0 | 0 | 961 |
| express | move-in-file | 1 | 1 | 0 | 0 | 455 |
| flask | append | 1 | 1 | 0 | 0 | 1426 |
| flask | delete | 1 | 0 | 0 | 0 | 164 |
| flask | duplicate-boundary | 1 | 0 | 0 | 0 | 676 |
| flask | interior-edit | 1 | 1 | 0 | 0 | 1458 |
| flask | move-in-file | 1 | 1 | 0 | 0 | 502 |
| go-tools | append | 1 | 1 | 0 | 0 | 604 |
| go-tools | delete | 1 | 0 | 0 | 0 | 164 |
| go-tools | duplicate-boundary | 1 | 0 | 0 | 0 | 809 |
| go-tools | interior-edit | 1 | 1 | 0 | 0 | 562 |
| go-tools | move-in-file | 1 | 1 | 0 | 0 | 538 |
| neovim | append | 1 | 1 | 0 | 0 | 1029 |
| neovim | delete | 1 | 0 | 0 | 0 | 164 |
| neovim | duplicate-boundary | 1 | 0 | 0 | 0 | 561 |
| neovim | interior-edit | 1 | 1 | 0 | 0 | 872 |
| neovim | move-in-file | 1 | 1 | 0 | 0 | 698 |

**Aggregates:** required-recall **20/20**, exact **12/20**, projection-bytes sum **13399**, stale sum **0**, duplicate sum **0**.

## Delta vs current main (`b042c0a`)

| repo | family | Δ recall | Δ exact | Δ proj bytes | note |
|---|---|---:|---:|---:|---|
| go-tools | interior-edit | +1 (0→1) | +1 (0→1) | **+398** (164→562) | in-place first-line edit; consensus start 32 |
| *all others* | * | 0 | 0 | 0 | incl. neovim append exact=1 preserved |

Main aggregate before: required-recall **19/20**, exact **11/20**.

## Delta vs legacy (`e245906`) — continuity

| repo | family | Δ recall | Δ exact | Δ proj bytes | note |
|---|---|---:|---:|---:|---|
| go-tools | interior-edit | +1 | +1 | +398 | this branch |
| neovim | append | 0 | +1 | −46 | from main neovim crop (not this branch alone) |
| *all others vs e245906* | * | 0 | 0 | 0 | — |

Legacy aggregate: required-recall **19/20**, exact **10/20**.

## Protected-file SHA-256 verification

Compared tracked files at `b042c0a` vs candidate HEAD. Only these paths differ:

| path | category | note |
|---|---|---|
| `src/anchors.mjs` | allowlisted impl | wires structural fallback |
| `src/structural-consensus.mjs` | allowlisted impl | exact-startLine gate |
| `test/structural-consensus-relocation.test.mjs` | test | Codex + production regressions |
| `docs/lab/pcr/0013-wave2-go-tools-rebase-reeval.md` | PCR | this document |
| `docs/lab/INDEX.md` | lab index | PCR 0013 row |
| `docs/lab/METRICS.md` | lab metrics | append row |

Historical v0.1 reports / `results.tsv`: **byte-identical**.

## Pi / Hermes holdout — full final provider payloadSha256

Live-core parity enforced by `test/helpers/adapter-holdout-parity.mjs` (78/78 tests). Per-trace hashes (Pi === Hermes === core):

| trace | payloadSha256 |
|---|---|
| go-tools/append/parse-file-sig | `6511ce70604728ab8d1a1292a51979efc5743b5499bd4e13054b42a9f5b08fa8` |
| go-tools/delete/holdout-temp | `9ce06598a6c45d2e9b48dc71b8e843595396c75b69b83de1ef6a4a172e761ca1` |
| go-tools/duplicate-boundary/containing-package-sig | `5565a6b411f74b4ebb7b75bf94a328d7feb008a2a5294d6cd1de4dccb80d155d` |
| go-tools/interior-edit/parse-file-body | `45a8efdf6df4d684894b3b3fed18fa1918cc86f35eb396cf88e0a45d47af7c9e` |
| go-tools/move-in-file/has-subdir-header | `8d3342e452287ac281ae7d6c5c7067337dacd1d3ae8017f38a9ac44f57d9d811` |
| neovim/append/compute-hash-header | `9936ac49534860aefecf9fe00b18097ff80219244a61ceed09dc68f6137cf15d` |
| neovim/delete/holdout-temp | `e59c7b01c66b71526e54706f85236e7fe536319553a3db434222ffb1e529c396` |
| neovim/duplicate-boundary/secure-read-sig | `9e00f75b1a97056fdefa283d24aad0eea9f4734304e419cbaccbf3b002ccbd36` |
| neovim/interior-edit/read-trust-fn | `2ea4800d97d7e08894f2e9525ab6eb0d05efe3853632580e92bf8b394b145122` |
| neovim/move-in-file/write-trust-fn | `e5f6c0df7dda17c42d8536521fc7f18552e4854c166dd553fd1497917b383c3e` |

Failure sets: core **[]**, Pi **[]**, Hermes **[]** (empty === empty).

## go-tools interior-edit relocation decision log

**Trace:** `go-tools/interior-edit/parse-file-body`  
**Region:** `ParseFile.body` lines 32–38 (7 lines)  
**Mutation:** first boundary line edited in place (`if !IsAbsPath…` → adds `// holdout interior edit`).

### Boundary phase (fail → fallback)

- `first` anchor no longer exact-matches current first line.
- First-to-last boundary pairing does not yield a unique cropped span.
- Fallback: `resolveRegionByStructuralConsensus`.

### Candidate interior lines (unique in current file)

| prior line | normalized (truncated) | unique | inferred start |
|---:|---|---|---:|
| 2 | `file = JoinPath(ctxt, dir, file)` | yes | 32 |
| 4 | `rd, err := OpenFile(ctxt, file)` | yes | 32 |
| 6 | `return nil, err` | yes | 32 |

### Consensus scoring

- Votes for inferred start **32**: support **3** (≥ `minSupportingLines=2`).
- `best.start + 1 === anchors.startLine` (**32 === 32**) → accept.
- Duplicate-region check: pass.
- **Selected identity:** start 32, end 38, method `structural-anchors`, support 3.

### Byte accounting (go-tools interior-edit)

| metric | b042c0a | candidate | Δ |
|---|---|---:|---:|
| required-recall | 0 | 1 | +1 |
| exact-current | 0 | 1 | +1 |
| projection bytes | 164 | 562 | **+398** |

## Known limitation (post–Codex fix)

Regions that relocate by a pure line offset (prefix insertion, suffix noise with unchanged first/last text at a new line number) remain **unresolved** under structural consensus until a future slice adds independent current-boundary proof. This is intentional fail-closed behavior; the Codex adversarial case is covered.

## Remaining failures

None on the 20-cell development board at candidate HEAD. Historical v0.1 committed `bench/reports/holdout.md` still documents go-tools interior-edit recall 0 — intentionally not rewritten.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 78/78 |
| `npm run evaluate` | yes | 0 | score unchanged |
| smoke + holdout board | yes | 0 | programmatic; reports not committed |
| Pi/Hermes holdout | via tests | 0 | 10/10 payload parity |
| protected-hash snapshot | yes | pass | historical reports unchanged |

## Explicit non-goals

- No merge (DRAFT PR only).
- No v0.2 seeds/traces/manifests.
- No gold/scoring/protocol/sampler/registry/adapter edits.
- No rewrite of historical PCR 0007/0008/0012 metrics or committed v0.1 report tables.

## Recommended next experiment

Independent current-boundary proof for offset-shifted structural candidates in a separate reviewable slice (not bundled with this exact-startLine gate).
