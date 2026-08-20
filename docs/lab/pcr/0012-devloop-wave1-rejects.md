# PCR 0012 — Document WAVE 1 development lex rejects

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `docs/pcr-0012-devloop-wave1`
- Commit: (this PR)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`

**Status:** development only. **Not sealed.** Not a holdout claim. Not SOTA.

## Hypothesis or change

Record three scripted WAVE 1 patches to `src/anchors.mjs` (`maxTokenUsd: 0`, no model calls) that the development lex harness **rejected**. Implementation SHA remains `e245906`. No cell is claimed improved on a sealed or holdout pack.

## What we did

Harness (outside the git worktree): `/home/box/projects/freshctx/devloop/`. Ledger: `/home/box/projects/freshctx/devloop/ledger.jsonl`. Experiment worktree `/tmp/freshctx-devloop` on `dev/autoresearch-lex-20260821` stayed at baseline `e245906ec068487a291f2fa116d98da141cdaeae`. This PCR does **not** add implementation commits there.

Baseline (development measurement, not a sealed lock):

| Item | Value |
|---|---|
| SHA | `e245906ec068487a291f2fa116d98da141cdaeae` |
| `npm test` | 69/69 |
| `AUTORESEARCH_SCORE` | 89.107165 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` |
| Allowlist | `src/anchors.mjs`, `src/hash.mjs`, `src/registry.mjs` |
| Protected files hashed | 90 |
| WAVE 1 | scripted; `maxTokenUsd: 0` |

Each attempt applied a patch on a **scratch** worktree, ran unit tests + evaluate + development smoke/holdout-v0.1 benches, then discarded the scratch. No accepted candidate. `src/`, `test/`, bench runners, gold, traces, and protocol are unchanged on this PR.

### Hypothesis table (measured on development cells)

Region aggregates below are `freshctx-region` over 20 development cells (smoke v0.1 + unsealed holdout v0.1). They are **not** sealed holdout scores.

| Id | Hypothesis | Tests | Score | recall1 | exact1 | payloadBytesSum | Lex decision | Reasons |
|---|---|---|---|---|---|---|---|---|
| H1 `partial-boundary-unique-remaining` | go-tools interior-edit mutates the first boundary line; recover original `lineCount` from the unique remaining last (or first) anchor. Delete / duplicate-boundary stay fail-closed (not exactly one remaining unique anchor). | 69/69 | 89.107165 | 19/20 | 10/20 | 15258 | **reject** | `tests_failed` |
| H2 `oracle-first-plus-linecount` | neovim append inserts inside the tracked first-to-last span. Oracle gold is first-line + original `lineCount`. If the unique span grew, emit first-anchor + expected `lineCount` instead of first-to-last. | 68/69 (fail 1) | not recorded (`null`) | 19/20 | 11/20 | 15181 | **reject** | `tests_failed` |
| H3 `h1-plus-h2` | Apply H1 then H2. | 68/69 (fail 1) | not recorded (`null`) | 19/20 | 11/20 | 15181 | **reject** | `tests_failed` |

Ledger timestamps (UTC): H1 `2026-08-20T23:01:48.653Z`, H2 `2026-08-20T23:01:57.325Z`, H3 `2026-08-20T23:02:05.924Z`. An earlier aborted pass (`ledger-harness-bug-20260821.jsonl`) rejected all three as `non_allowlist:src/anchors.mjs` before the allowlist check was corrected; those rows are not WAVE 1 results.

### H1 notes

- Cells unchanged vs baseline: recall1 19, exact1 10. **No cell lift.**
- go-tools interior-edit still required-recall 0.
- Harness reason `tests_failed` is likely a dirty-tree false reject: `lexAccept` treats `testsPass` as false when `npm test` leaves a dirty scratch (`workingTreeDirty`), even if tap counts are 69/69 fail 0. Because cells did not move, H1 would not have lex-accepted anyway.

### H2 notes

- Fail 1 is almost certainly `test/anchors.test.mjs` — `"boundary anchors recover a region whose interior changed"`. H2 truncates a grown first–last span to the original `lineCount`, dropping legitimate interior growth.
- exact1 10→11 (neovim append is the likely cell). recall1 still 19. payloadBytesSum 15258→15181.
- **Do not claim neovim is fixed.** Development leftover remains exact-current 0 / required-recall 1 / 1075 bytes on neovim append.

### H3 notes

- Same measured outcome as H2: 68/69 fail 1, exact1 11, recall1 19, payloadBytesSum 15181. Rejected `tests_failed`.

### Known remaining development misses (unchanged)

These are development observations on existing unsealed packs. They are **not** sealed holdout claims.

| Cell | required-recall | exact-current | projection bytes | Note |
|---|---|---|---|---|
| go-tools interior-edit (`freshctx-region`) | 0 | 0 | 164 | The edit **is** the first boundary line. |
| neovim append (`freshctx-region`) | 1 | 0 | 1075 | Insert lands inside the tracked span vs oracle first + `lineCount`. |

## Explicit non-goals (this PCR)

- No implementation merge. Allowlist files on `main` / `e245906` are byte-identical.
- No holdout v0.2 seeds, traces, manifests, or reports.
- No rewrite of `bench/reports/latest.md` or `bench/reports/holdout.md` cell numbers.
- No policy / projector / engine / gold / weight / threshold edits.
- No SOTA, Level 4, or “agents program better” claim.

## Benchmarks run

This PR is lab documentation only. Numbers below are the WAVE 1 development-lex ledger plus the e245906 baseline. Commands were **not** re-executed against a new implementation SHA.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | WAVE 1 scratch | 0 on H1; 1 on H2/H3 | H1 69/69; H2/H3 68/69 fail 1. Baseline e245906 is 69/69. |
| `npm run check` | not on this docs PR | — | implementation unchanged |
| `npm run evaluate` | WAVE 1 H1 scratch | 0 | `AUTORESEARCH_SCORE=89.107165`. H2/H3 score `null` in ledger. |
| `npm run ctxbench` | baseline e245906 | 0 | payload sha256 unchanged |
| `npm run demo` | not on this docs PR | — | implementation unchanged |
| `npm run repos:verify` | not on this docs PR | — | implementation unchanged |
| `npm run ctxbench:smoke` | WAVE 1 scratch | 0 | development cells; reports restored after each run |
| `npm run ctxbench:holdout` | WAVE 1 scratch | 1 (expected) | unsealed holdout v0.1; go-tools interior-edit required-recall 0 |

## Metric snapshot

**Measured** `synthetic` at unchanged implementation `e245906`: tests **69/69**, `AUTORESEARCH_SCORE=89.107165`, ctxbench payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`. WAVE 1 rejected; no implementation merge.

Append-only ledger row: [METRICS.md](../METRICS.md).

Do **not** read WAVE 1 exact1 11 as a merged or sealed improvement.

## Comparison

No paper reproduction and no ranking. CORVUS is not a baseline in this PCR. WAVE 1 did not produce an accepted FreshCtx change. Do not treat development-lex rejects as evidence of beating any public system.

## Conflicts with constitutions

None observed. Development scores stay labeled `synthetic`. They are not relabeled holdout, sealed, production, or SOTA.

## Limitations

- `tests_failed` on H1 is harness-level (`testsPass` requires a clean tree after `npm test`) and may be a false reject; it is still a reject, and cells did not lift.
- H2/H3 exact1 11 is an unmerged scratch observation. Neovim append is **not** claimed fixed.
- holdout v0.1 remains `unsealed-regression-development-pack` (PCR 0009). These cells are not a sealed result set.
- Ledger lives outside the repository; this PCR is the in-repo evidence log.

## Next measurement

A later development-lex wave may retry first-boundary interior edits and in-span appends without truncating legitimate interior growth, and should treat dirty-tree-after-`npm test` as distinct from a real tap failure. No holdout v0.2 in that follow-up unless a separate sealed protocol PCR says so.
