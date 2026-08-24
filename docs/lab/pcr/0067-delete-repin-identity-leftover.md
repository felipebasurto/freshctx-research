# PCR 0067 — delete-repin identity leftover (measurement)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0067-delete-repin-identity-leftover-a7a2`
- Commit: (this docs commit)
- Merge-base: `49f029ece62744fb5fa1a3c2fb4b45cb76b1539e` (main; PCR 0065)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-repin`; `measurement`
- Decision: **review** (measurement + regression lock; no identity product change)

## Hypothesis or change

PCR 0065 locked three delete observe-then-mutate boards (fail-close hold, path-only
new unit, region 2–2 re-pin to neighbor footer). This PCR measures **two leftover
identity boards** on the same three-content-line fixture family: header delete with
region 1–1 re-observe, and interior delete plus distinct replacement at line 2 with
region 2–2 re-observe. No product change. Door frozen. Does not revive persist-38.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0067-delete-repin-identity-leftover.test.mjs`: two boards on core
  path with observe-then-mutate sequencing; gold is first/last lines, span, location,
  exact bytes (language-agnostic).
- Did **not** edit `src/anchors.mjs` (door), `src/registry.mjs`, adapters,
  holdout traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Board (synthetic)

Three-content-line file `ws/region_b.txt` with trailing newline (`lineCount()=4`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique   ← line 2 (tracked region)
line3 footer
```

Observe: Hermes-equivalent region `offset=2`, `limit=1` → `scope=region`,
`startLine=2`, `endLine=2`, content = `BETA_OLD_INTERIOR keep this line unique`
(**39** bytes), `observedFileLineCount=4`.

### Board A — delete header, then Hermes region 1–1 re-observe

| field | value |
|---|---|
| Mutation | delete line 1 (header) only |
| Post-mutate file | interior + footer (`lineCount()=3`) |
| Post-delete refresh (no re-observe) | old 2–2 unit **migrates** via door `exact` to span **1–1** (content at new line 1) |
| Re-observe | `offset=1`, `limit=1` → region 1–1, content = interior (**39** bytes), `observedFileLineCount=3` |
| Unit identity | **no re-pin** — distinct id (`path` + `region` + `1:1` vs prior `2:2`) |
| After re-observe + refresh | **two** units, both **resolved** `exact` at **1–1** (duplicate current units) |
| `first_line` / `last_line` | interior / interior (both units) |
| Projection envelope | `selected=2`, `unresolved=0` |
| Neighbor footer in projection | **no** (region 1–1 only) |

Door exact migrates span on header delete alone; re-observe at 1–1 adds a second
unit rather than re-pinning the old 2–2 id.

### Board B — delete interior, replace line 2 with distinct bytes, then region 2–2 re-observe

| field | value |
|---|---|
| Mutation | delete line 2; replace new line 2 (former footer slot) with `GAMMA_NEW_NEIGHBOR distinct replacement bytes` (**45** bytes) |
| Post-delete (no replace) | **unresolved** (`anchors-not-found`; 0059 fail-close) |
| Post-replace (no re-observe) | still **unresolved** (`observedFileLineCount=4` vs current `lineCount()=3`) |
| Re-observe | `offset=2`, `limit=1` → region 2–2, content = replacement (**45** bytes), `observedFileLineCount=3` |
| Unit identity | **re-pin** — same id (`path` + `region` + `2:2`) |
| After re-observe + refresh | **resolved** `exact`, span **2–2** |
| `first_line` / `last_line` | replacement / replacement |
| Old footer | **not** served |
| Door exact | **fires** on distinct replacement bytes (not fail-close) |
| Projection envelope | `selected=1`, `unresolved=0` |

Unlike 0065 Board 3 (neighbor footer bytes at 2–2), replacement bytes are not the
old footer; door exact still resolves uniquely.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 153 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes confirm | no | — | synthetic lock only |

## Metric snapshot

| metric | before (main @ 0065) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 151/151 runnable | 153/153 runnable | +2 tests (1 file) |
| Board A header delete + 1–1 re-observe (synthetic) | unmeasured | pass (no re-pin; duplicate exact 1–1) | locked |
| Board B replace + 2–2 re-observe (synthetic) | unmeasured | pass (re-pin; exact on distinct bytes) | locked |

## Comparison

- PCR 0059: delete tracked interior fail-closes; neighbor footer not served.
- PCR 0065: delete triad — fail-close hold, path-only new unit, region 2–2 re-pin
  to neighbor footer via door exact.
- PCR 0067: header-delete migration + duplicate 1–1 units; distinct replacement
  re-pin at 2–2 with door exact (not footer bytes).

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic core path only; no live Hermes confirm on these two boards.
- Board A leaves duplicate resolved units at the same span after 1–1 re-observe
  (identity key is span-addressed; door exact migrates old unit before re-observe).
- Board B requires re-observe to clear 0059 fail-close after line-count shift; door
  exact on replacement is post re-pin only.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

Optional product identity PCR: dedupe policy when door exact migrates span vs
Hermes re-observe at new address; live confirm if adapter path diverges.
