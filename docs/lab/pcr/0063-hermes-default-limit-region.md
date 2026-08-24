# PCR 0063 — Hermes default-limit region leftover (measurement)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0063-hermes-default-limit-region-d209` (draft PR)
- Commit: (this docs commit)
- Merge-base: `83e6ec69deadbae2373bceaf13e391553bc7a117` (main; PCR 0061)
- Live-scored on main: `3bcbfb5b89fdb25645d27c6a2eaed2ae1202451e` (2026-08-24)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement`
- Decision: **review** (measurement + regression lock; no product change)

## Hypothesis or change

PCR 0059 mapped finite Hermes `offset`/`limit` to `scope=region` with
`startLine=offset`, `endLine=offset+limit-1`. One leftover remained: when Hermes
issues its **default-sized page** (`limit=2000`) on a small file, the mapped
region span is far past EOF and is **not** file-scope.

**Finding (live-scored 2026-08-24 on main `3bcbfb5b`, synthetic replay locked
here):**

| Hermes args | Mapped scope | Notes |
|---|---|---|
| `{offset:1, limit:2000}` | region `1–2000` | Default page on 3-content-line file with trailing NL (`lineCount=4`); **not** `scope=file` |
| `{offset:2, limit:2000}` | region `2–2001` | Past EOF on same file |
| `{offset:2, limit:1}` | region `2–2` | PCR 0059 hold (single-line control) |
| path only (no offset/limit) | `scope=file` | Unchanged |

After an **interior line-2 replace** on disk:

- **Board A (blown default page `1–2000`):** projection envelope is empty
  (`selected=0`, `unresolved=1`). `BETA_NEW_INTERIOR` is **not** served.
  Header/footer bytes are **not** in the projection. `stored-line-span` does
  not apply (`startLine !== endLine`).
- **Board B (control `2–2`):** `stored-line-span` serves `BETA_NEW_INTERIOR` at
  lines `2–2` (0059 hold).

This PCR is **measurement only**. No adapter clamp. No door retune. A later PCR
may clamp `endLine` to observed file line count or treat a past-EOF default page
as file-scope; that is explicitly out of scope here.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/pcr-0063-hermes-default-limit-region.test.mjs`: mapper locks for
  `1/2000 → 1–2000`, `2/2000 → 2–2001`, `2/1 → 2–2`, path-only → file; Hermes
  replay boards for blown default page (empty projection after interior replace)
  and control `2–2` (`stored-line-span` serves NEW).
- Gold is language-agnostic: line span, location, exact bytes (marker tokens).
- Tool result for board A uses trailing `0x0a` on the full-file payload (matches
  live Hermes on a 3-content-line file with trailing NL).
- Did **not** edit `src/anchors.mjs`, `src/registry.mjs`, `adapters/hermes/bridge.mjs`,
  holdout traces/gold, `bench/repos.lock.json`, or benchmark score weights.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Board (synthetic)

Three-content-line file `ws/region_b.txt` (real `0x0a` newlines, trailing NL,
`lineCount=4`):

```text
line1 header
BETA_OLD_INTERIOR keep this line unique   ← line 2 (interior)
line3 footer

```

Hermes default limit: `2000`.

### Board A — default page interior miss

| step | action |
|---|---|
| T1 observe | `read_file` `{offset:1, limit:2000, path:"ws/region_b.txt"}` → full file with trailing NL |
| T2 select | disk: line 2 → `BETA_NEW_INTERIOR …`; task asks for interior marker |

**Expected:** projection `selected=0`, `unresolved=1`; no unit block; no NEW/OLD/header/footer bytes in provider payload.

### Board B — single-line control (0059 hold)

| step | action |
|---|---|
| T1 observe | `read_file` `{offset:2, limit:1, path:"ws/region_b.txt"}` → line 2 only |
| T2 select | same disk mutation as board A |

**Expected:** `stored-line-span` at lines `2–2`; `BETA_NEW_INTERIOR` in projection; `BETA_OLD_INTERIOR` absent.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **141 pass**, **22 skip**, **0 fail** (163 total) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes default-page confirm | no | — | finding live-scored on main `3bcbfb5b` 2026-08-24 |

## Metric snapshot

| metric | before (0060 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| npm test pass | 135/135 runnable (0061 main) | **141/141 runnable** | +7 tests (0063) |
| npm test skip | 22 | 22 | 0 |
| npm test fail | 0 | 0 | 0 |
| default page `1/2000` → region `1–2000` | unmeasured | locked | new |
| blown `1–2000` interior replace | unmeasured | empty projection | new |
| control `2/1` interior replace | pass (0059) | pass | 0 |

## Comparison

- PCR 0047: live region miss before offset/limit mapping.
- PCR 0055: `stored-line-span` for single-line regions only.
- PCR 0059: Hermes pagination → region; delete fail-close; control `2/1 → 2–2`.
- PCR 0060: post-merge evaluate ledger on main.
- PCR 0063: locks default-limit blown region behavior; defers clamp to a later PCR.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (lines, span, location, exact bytes).
No door retune. No benchmark fixture change.

## Limitations

- Board A depends on trailing-NL tool payload (`lineCount=4`); without trailing NL
  the door may resolve via `boundary-anchors` and serve all three lines including
  NEW — a different (non-live) shape.
- `stored-line-span` intentionally does not cover multi-line spans (`startLine !== endLine`).
- No adapter clamp in this PCR; past-EOF default pages remain mapped as written.
- Live finding cited from main `3bcbfb5b`; synthetic replay locked here.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched. No score retune.

## Next measurement

Later PCR: adapter clamp `endLine` to observed file line count, or treat past-EOF
default page as file-scope. Live Hermes re-confirm on research box optional.
