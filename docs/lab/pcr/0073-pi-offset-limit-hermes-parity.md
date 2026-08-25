# PCR 0073 — Pi offset/limit Hermes-parity clamp (adapter)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0073-pi-offset-limit-hermes-parity-17e1` (draft PR)
- Commit: (this docs commit)
- Merge-base: `5aa8a9314087fbce60934cd23c3e7d7687fd4a50` (main @ PCR 0072 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `region-refresh`; `offset-limit`
- Decision: **review** (adapter product change + synthetic replay tests)

## Hypothesis or change

Live PCR 0043 showed Pi reads with `offset`/`limit` but the Pi adapter only honored
explicit `scope: "region"`. Everything else fell back to whole-file tracking from disk.
That is why cell B-interior was file-grain fresh (whole-file fallback), not region grain.

Hermes shipped offset/limit → region mapping plus Rule A EOF promotion in PCRs 0064/0069.
Pi must mirror the same adapter behavior without touching core or Hermes.

**Fix (adapter-only):** extend `readScopeFromInput()` in `adapters/pi/replay.mjs` and wire
the same logic in `adapters/pi/extension.ts`:

```text
finite offset >= 1, limit >= 1  →  region startLine=offset, endLine=offset+limit-1
endLine >= fileLineCount        →  scope=file   (Rule A; same as Hermes)
path only                       →  scope=file
explicit scope:"region"         →  region, then same EOF clamp
```

`fileLineCount` comes from the observed workspace file at hook time (disk), matching Hermes.
Region units store `observedFileLineCount` for `stored-line-span` gating.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Updated `adapters/pi/replay.mjs`: `readScopeFromInput`, `normalizePiReadScope`,
  `onToolResult` line-count observe, `buildReadToolCall` offset/limit args.
- Updated `adapters/pi/extension.ts`: import shared scope mapper; same observe path.
- Added `test/pcr-0073-pi-offset-limit-hermes-parity.test.mjs`: mapper guards, WITH
  FreshCtx replay boards, WITHOUT FreshCtx native control, path-only control.
- Gold is language-agnostic: first/last lines, span, location, exact bytes.
- Did **not** edit `src/anchors.mjs`, `bench/repos.lock.json`, Hermes adapter, holdout
  traces/gold, or benchmark score weights.

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
                              ← line 4 (empty; trailing NL)
```

### WITH FreshCtx (pi-fresh replay)

| Pi args | Mapped scope | After interior line-2 replace |
|---|---|---|
| `{offset:1, limit:2000}` | file-scope (0064 hold) | NEW via `whole-file` |
| `{offset:1, limit:4}` | file-scope (0069 Rule A) | NEW via `whole-file` |
| `{offset:1, limit:3}` | region `1–3` (0070 guard) | empty leftover (`selected=0`, `unresolved=1`) |
| `{offset:2, limit:2}` | region `2–3` (0070 guard) | empty leftover |
| `{offset:2, limit:1}` | region `2–2` | NEW via `stored-line-span` (**39** bytes interior) |
| path only | file-scope | NEW via `whole-file` |

### WITHOUT FreshCtx (native control)

Same `{offset:1, limit:4}` board after interior replace: persisted tool result still
contains `BETA_OLD_INTERIOR`; provider payload has OLD, no projection envelope.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | see metric snapshot |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Pi confirm | no | — | synthetic replay only |

## Metric snapshot

| metric | before (0072 ledger) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 196/196 runnable (0072 ledger) | 210/210 runnable | +14 tests (0073 file) |
| Pi `{1,2000}` file-scope NEW (synthetic) | unmeasured (file fallback) | locked | new |
| Pi `{1,4}` file-scope NEW (synthetic) | unmeasured | locked | new |
| Pi `{1,3}` / `{2,2}` region empty (synthetic) | unmeasured | locked | new |
| Pi `{2,1}` stored-line-span NEW (synthetic) | unmeasured | locked | new |
| Pi native OLD persisted (synthetic) | unmeasured | locked | new |

## Comparison

- PCR 0043 (live): Pi offset/limit was file-grain because adapter ignored pagination args.
- PCR 0064/0069/0070 (Hermes): offset/limit mapping + Rule A + in-bounds guard boards.
- PCR 0072: post-0070 evaluate ledger; door/lock/score hold on main.
- PCR 0073: Pi adapter Hermes-parity clamp; same Rule A; synthetic replay only.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (first/last lines, span, location,
exact bytes).

## Limitations

- Synthetic Pi replay only; no live `pi -e adapters/pi/extension.ts` confirm in this VM.
- Boards depend on trailing-NL tool payload (`lineCount=4`).
- In-bounds multi-line regions `{1,3}` and `{2,2}` still fail-close after interior replace
  (same as Hermes 0070 guard).
- Holdout not re-run; expect pi-fresh holdout cells using offset/limit to shift grain on
  next replay — separate measurement.

## Protocol gap?

**No.** Adapter-only product change with regression tests. Door blob and locks untouched.

## Next measurement

Re-run holdout pi-fresh replay after merge; compare region-grain vs prior file-grain on
offset/limit read cells (0043 confound). Do not regress Hermes 0070 guard boards.
