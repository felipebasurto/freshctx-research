# PCR 0013 — wave2 go-tools structural consensus rebase reeval

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (wave2-go-tools-rebase-reeval)
- Branch / PR: `wave2-go-tools-rebase-reeval`
- Rebase base SHA: `b042c0a36987e58c8f1d2da271af71b59c1a226a` (main: neovim prefix-stable crop + adapter-contract)
- Candidate source: `80f457e55d428f1dd3090cc9473eeca1221f33ee` (wave2-go-tools-safe-relocation)
- Resulting HEAD: `f3cdb4740e1093326a2de221dcd4804a40935391`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `public-repo-holdout`; `replay`

**Status:** development only. **Not sealed.** Not a holdout claim. Not SOTA. No v0.2.

## Hypothesis or change

Rebase commit `80f457e` (unique interior line structural consensus) onto current main `b042c0a`, keeping **both**:

1. neovim prefix-stable span crop (PR 2 / `94e9e59`), and
2. production wiring of `resolveRegion` fallback to `src/structural-consensus.mjs` (single implementation; no forked algorithm).

Allowlisted files: `src/anchors.mjs`, `src/structural-consensus.mjs`.

## Implementation summary

| Commit | Description |
|---|---|
| `ba7770a` | Rebased `80f457e` structural consensus onto `b042c0a` (clean rebase) |
| `f3cdb47` | Wire production `resolveRegion` to import `resolveRegionByStructuralConsensus`; remove duplicate inline helper |

Historical v0.1 reports, golds, scoring, protocol, sampler, registry, and `autoresearch/results.tsv` are **byte-identical** to pre-branch main.

## FINAL REPORT — accept/reject verdict

**Verdict: ACCEPT** (all development-board gates pass; DRAFT PR opened; not merged).

| Gate | Result |
|---|---|
| `npm test` | **76/76** pass |
| `npm run evaluate` | exit 0; `AUTORESEARCH_SCORE=89.107165` (unchanged) |
| smoke + holdout jsonl (programmatic read) | 20/20 `freshctx-region` cells measured; 0 hard gate failures |
| required-recall | **20/20** |
| exact-current (eligible) | **12/20** (was 11/20 on `b042c0a`; +1 go-tools interior-edit) |
| staleBytesSum | **0** |
| duplicateSum | **0** |
| delete / duplicate-boundary | fail-closed (exact 0, required-recall 1) |
| Pi holdout payloadSha256 parity | **10/10** traces match live core |
| Hermes holdout payloadSha256 parity | **10/10** traces match live core |
| Pi/Hermes failure-set parity | **empty === empty** |
| protected-file SHA-256 vs `b042c0a` | **pass** (only allowlisted files differ) |
| neovim prefix-stable crop | preserved (`neovim/append` exact=1, 1029 bytes — same as main) |
| authorize / interior-growth unit test | pass (`boundary anchors recover a region whose interior changed`) |
| historical tracked reports | unchanged (jsonl runs discarded; `holdout.md` git-clean) |

## Per-cell table — candidate HEAD (`f3cdb47`)

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

Only one cell moves; all previously exact cells on main remain exact.

| repo | family | Δ recall | Δ exact | Δ proj bytes | note |
|---|---|---:|---:|---:|---|
| go-tools | interior-edit | +1 (0→1) | +1 (0→1) | **+398** (164→562) | structural consensus after boundary failure |
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

Compared **160** tracked files at `b042c0a` vs candidate HEAD.

| path | allowlisted | base SHA-256 | HEAD SHA-256 |
|---|---|---|---|
| `src/anchors.mjs` | yes | `4119269c4c6c3e55cc9e88300fec6e0a46c3bb8b711324ffb18438e1175ee2fc` | `8fa9a50c268b28b9866ceccd1da7cd12939b5b372e8f224396befacfafad6c94` |
| `src/structural-consensus.mjs` | yes | `a198db1294999231ddb5b963e7bc910e63609948af63f08f8fbe8090e0d47515` | `15e05695fafe8c107975652e54c8cd3df71982281a924d2dfb1e55f3188249f9` |

Unexpected diffs: **0**. Historical PCRs/reports/results.tsv: **unchanged**.

## Pi / Hermes holdout — full final provider payloadSha256

Live-core parity enforced by `test/helpers/adapter-holdout-parity.mjs` (76/76 tests). Per-trace hashes (Pi === Hermes === core):

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
**Mutation:** first boundary line edited (`if !IsAbsPath…` → adds `// holdout interior edit`).

### Boundary phase (fail → fallback)

- `first` anchor `if !IsAbsPath(ctxt, file) {` no longer exact-matches current first line.
- First-to-last boundary pairing does not yield a unique cropped span.
- Fallback: `resolveRegionByStructuralConsensus`.

### Candidate interior lines (unique in current file)

| prior line | normalized (truncated) | unique | current line | inferred start | in bounds |
|---:|---|---|---:|---:|---|
| 2 | `file = JoinPath(ctxt, dir, file)` | yes | 33 | 32 | yes |
| 4 | `rd, err := OpenFile(ctxt, file)` | yes | 35 | 32 | yes |
| 6 | `return nil, err` | yes | 37 | 32 | yes |

Prior line 1 (mutated boundary) excluded (not unique exact match). Empty/duplicate lines excluded.

### Consensus scoring

- Votes for inferred start **32**: support **3** (≥ `minSupportingLines=2`).
- No second candidate with equal support and locationDelta.
- Duplicate-region check: no identical 7-line slice elsewhere.
- **Selected identity:** start 32, end 38, method `structural-anchors`, support 3.
- **Why unique:** three independent interior survivors agree on one start; mutated first line alone insufficient.

### Byte accounting (go-tools interior-edit)

| metric | b042c0a | candidate | Δ |
|---|---|---:|---:|
| required-recall | 0 | 1 | +1 |
| exact-current | 0 | 1 | +1 |
| projection bytes | 164 | 562 | **+398** |

Recall lift is **not** accepted without this log (per development board contract).

## Remaining failures

None on the 20-cell development board at candidate HEAD. Historical v0.1 committed `bench/reports/holdout.md` still documents go-tools interior-edit recall 0 — intentionally not rewritten.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 76/76 |
| `npm run evaluate` | yes | 0 | score unchanged |
| `npm run ctxbench:smoke` | yes | 0 | jsonl read; reports restored |
| `npm run ctxbench:holdout` | yes | 0 | jsonl read; reports restored |
| `npm run ctxbench:pi-holdout` | via tests | 0 | payload parity |
| `npm run ctxbench:hermes-holdout` | via tests | 0 | payload parity |
| protected-hash snapshot | yes | pass | 160 files |

## Explicit non-goals

- No merge (DRAFT PR only).
- No v0.2 seeds/traces/manifests.
- No gold/scoring/protocol/sampler edits.
- No rewrite of historical PCR 0007/0008/0012 metrics or committed v0.1 report tables.

## Recommended next experiment

Run the same structural-consensus wiring against any new interior-edit holdout traces in a future **new-seed** pack (v0.2+ protocol) with preregistered attestation — separate from this unsealed development accept.
