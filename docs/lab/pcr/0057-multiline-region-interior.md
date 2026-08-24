# PCR 0057 — multi-line region interior edit (measurement)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent
- Branch / PR: `cursor/multiline-region-interior-806f` (draft PR)
- Commit: (this docs commit)
- Merge-base: `afd97d3732589073dfbc14d4d2a8393262c9bf4d` (main; PCR 0055)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `boundary-anchors`; `multi-line`; `measurement`
- Decision: **review** (measurement + regression lock; no product change)

## Hypothesis or change

PCR 0055 added `stored-line-span` fallback only when `startLine === endLine`.
Multi-line region reads (`startLine=2`, `endLine=4`) still rely on the frozen
door (`src/anchors.mjs`). We had not locked what happens when Hermes reads a
three-line window and only the **middle** line is replaced on disk while first
and last boundary anchors still match.

**Hypothesis (confirmed):**

1. Middle-only replace on a multi-line region still **resolves via the door**
   (`boundary-anchors`) and serves current bytes including the new middle line.
2. Replacing **both first and last** boundary lines breaks anchor lookup; refresh
   stays **unresolved** (`anchors-not-found`). No `stored-line-span` fallback
   applies (`startLine !== endLine`).

This PCR is **measurement only**. No production change. No door retune. No
widening of the 0055 single-line fallback to multi-line spans.

Not a paper result. Not SOTA. Not holdout.

## What we did

- Added `test/region-multiline-interior.test.mjs`: language-agnostic board (marker
  tokens, line span, exact bytes). Five-line file; region track `startLine=2`
  `endLine=4`.
- **Cell ML-middle:** disk keeps `GAMMA_OLD_START` / `GAMMA_OLD_END`; line 3
  becomes `GAMMA_NEW_MIDDLE`. Hermes replay + core engine path.
- **Cell ML-boundary (control):** disk replaces first and last region lines with
  `NEW_START` / `NEW_END`; middle unchanged. Expect fail-closed unresolved.
- Did **not** edit `src/anchors.mjs`, `src/registry.mjs`, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, `docs/lab/INDEX.md`, or
  `docs/lab/METRICS.md`.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Board (synthetic)

Five-line file `ws/region_ml.txt` (real `0x0a` newlines):

```text
line1 header
GAMMA_OLD_START keep unique      ← line 2 (region start)
GAMMA_OLD_MIDDLE keep unique     ← line 3 (interior)
GAMMA_OLD_END keep unique        ← line 4 (region end)
line5 footer
```

Observed region content (lines 2–4, 3 lines):

```text
GAMMA_OLD_START keep unique
GAMMA_OLD_MIDDLE keep unique
GAMMA_OLD_END keep unique
```

### Cell ML-middle (interior-only replace)

| field | value |
|---|---|
| Mutation | line 3 only: `GAMMA_OLD_MIDDLE` → `GAMMA_NEW_MIDDLE` |
| Resolution path | `boundary-anchors` (door) |
| `stored-line-span` | not used (`startLine !== endLine`) |
| Current bytes in projection | yes — all three lines at stored span 2–4 |
| Hermes turn-2 payload bytes | 608 |
| Core unit revision | `sha256:67cd8e64ffe59933b50d222fd4a2ad84b6d0ca41102d52bc6cee19d8c2790066` |

Resolved region bytes on disk after mutation:

```text
GAMMA_OLD_START keep unique
GAMMA_NEW_MIDDLE keep unique
GAMMA_OLD_END keep unique
```

### Cell ML-boundary (control: first + last replace)

| field | value |
|---|---|
| Mutation | lines 2 and 4: `NEW_START` / `NEW_END`; middle unchanged |
| Resolution path | `anchors-not-found` → **unresolved** |
| Current bytes in projection | no — empty region unit |
| Hermes turn-2 payload bytes | 213 (envelope only; no region content) |
| Core unit state | `unresolved` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 126 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes ML-middle rerun | no | — | synthetic lock only |

## Metric snapshot

| metric | before (main @ 0055) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 122/122 runnable | 126/126 runnable | +4 assertions (1 file) |
| ML-middle (synthetic) | unmeasured | pass (`boundary-anchors`) | locked |
| ML-boundary control (synthetic) | unmeasured | pass (unresolved) | locked |

## Comparison

- PCR 0047: live Hermes single-line B-interior region miss (honest newlines).
- PCR 0055: single-line interior refresh via `stored-line-span` when door misses.
- PCR 0057: multi-line interior **middle-only** still door-resolves; boundary
  wipe stays fail-closed. Confirms 0055 correctly did **not** extend fallback
  to multi-line reads.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (marker tokens, line span, bytes).
No fail-closed hole that invents bytes when resolution fails.

## Limitations

- Synthetic board only; no live Hermes n=1 confirm on this VM.
- Middle-only success depends on unique first/last boundary lines in the file;
  duplicate-boundary ambiguity paths not exercised here (see holdout labs).
- Door may return a **relocated** span when boundaries match elsewhere; this
  board keeps boundaries at the stored start (location delta 0).
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Measurement + regression lock. Holdout seal, door blob, and locks
untouched.

## Next measurement

On the research box: run the same five-line board through live Hermes with
real `0x0a` newlines; confirm ML-middle carries `GAMMA_NEW_MIDDLE` in turn-2
request with `resolution="boundary-anchors"` and ML-boundary stays absent.
