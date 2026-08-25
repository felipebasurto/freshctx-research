# PCR 0071 — exact-EOF clamp extra boards (measurement)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0071-exact-eof-extra-boards-14f0` (draft PR)
- Commit: (this docs commit)
- Merge-base: `5e6f4c3b906dbe313628fc26ac57563db962f48a` (main; PCR 0069)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement`
- Decision: **review** (measurement + regression lock; no adapter clamp)

## Hypothesis or change

PCR **0069** shipped Rule A on main: `endLine >= fileLineCount` promotes Hermes
pagination to file-scope (not `startLine === 1 && endLine === fileLineCount`).
This PCR rebases onto 0069 and locks **extra boards** on that shipped rule.

Draft PCR 0071 (pre-rebase) documented candidate Rules A/B while 0069 was parallel.
**0069 shipped Rule A.** Board C (`{offset:2, limit:3}` on lineCount=4) is the
discriminator that would have stayed region under the rejected Rule B.

**Finding (synthetic replay, post-0069):** Boards A–C promote to file-scope at
mapper time and serve `NEW` via whole-file after interior line-2 replace.

This PCR is **measurement only**. No adapter clamp (0069 already shipped). No door
retune. Does **not** revive persist-38 / PR 38.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0071-exact-eof-extra-boards.test.mjs`: mapper + Hermes replay
  locks for Boards A–C on 0069 Rule A (`endLine >= fileLineCount`).
- Rebased onto main @ PCR 0069; flipped Board C from pre-0069 region lock to
  file-scope + whole-file NEW.
- Gold is language-agnostic: first/last lines, span, location, exact bytes.
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, adapters,
  holdout traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Boards (synthetic)

Shared interior marker: `BETA_OLD_INTERIOR` / `BETA_NEW_INTERIOR`.

### Board A — offset=1 limit=N with trailing NL (0066 fixture)

Three-content-line file `ws/region_b.txt` with trailing NL (`lineCount()=4`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique
line3 footer
                              ← line 4 (empty; trailing NL)
```

| field | value |
|---|---|
| Hermes args | `{offset:1, limit:4}` |
| Mapped scope (0069 Rule A) | **file-scope** (`endLine 4 >= fileLineCount 4`) |
| Interior replace | `NEW` via whole-file |

### Board B — offset=1 limit=N without trailing NL

Three-content-line file, no trailing NL (`lineCount()=3`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique
line3 footer
```

| field | value |
|---|---|
| Hermes args | `{offset:1, limit:3}` |
| Mapped scope (0069 Rule A) | **file-scope** (`endLine 3 >= fileLineCount 3`) |
| Interior replace | `NEW` via whole-file |

### Board C — offset=2 limit=3 on 4-line file (Rule A discriminator)

Same trailing-NL fixture as Board A (`lineCount()=4`).

| field | value |
|---|---|
| Hermes args | `{offset:2, limit:3}` → `endLine=4 === fileLineCount` |
| Mapped scope (0069 Rule A) | **file-scope** (startLine=2 still promotes) |
| Rejected Rule B | would stay region `2–4` + empty leftover |
| Interior replace | `NEW` via whole-file |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 180 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes exact-EOF confirm | no | — | synthetic lock only |

## Metric snapshot

| metric | before (main @ 0069) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 174/174 runnable | 180/180 runnable | +6 tests (0071 file) |
| Board A `1/4` trailing NL exact-EOF (synthetic) | pass (0069 overlap) | locked on Rule A | 0 |
| Board B `1/3` no trailing NL exact-EOF (synthetic) | unmeasured | locked file-scope + NEW | new |
| Board C `2/3` startLine=2 exact-EOF (synthetic) | unmeasured | locked file-scope + NEW | new |

## Comparison

- PCR 0064: past-EOF (`endLine > fileLineCount`) → file-scope.
- PCR 0066: core explicit region `1–4` still fail-closes; Hermes path flipped by 0069.
- PCR 0069: shipped Rule A (`endLine >= fileLineCount`); primary exact-EOF board.
- PCR 0071: extra boards (no trailing NL; startLine=2 exact-EOF) locked on 0069 Rule A.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic Hermes replay only; no live box confirm in this VM.
- Board A overlaps 0069 primary board; 0071 adds B/C coverage.
- Explicit core region tracking (without adapter promotion) still fail-closes per 0066.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

Optional live Hermes confirm on Board B (no trailing NL) and Board C (startLine=2
exact-EOF) on research box.
