# Paper-trail gaps

Written 2026-08-22, updated 2026-08-23 so a later methods section does not
have to rediscover what was never archived. Checklist, not a claim of
missing science.

## Now in git

- PCR 0041: live DeepSeek + Hermes Agent plugin session (REPORT, METHODS,
  cells, request snippets). Cell B in that pack is a **confounded** region
  test (literal `\\n`, one-line file, `startLine=2`).
- PCR 0034 live-compress table, marked not-merged.
- PCR 0042: Hermes zero-arg `FreshCtxContextEngine` env defaults (adapter).
- PCR 0043: live Pi official-hook CLI (`pi-cli`) on the same mutations,
  real `0x0a` newlines. Distinct from box-local `pi-adapter-replay`.
- PCR 0044: live Hermes ctor re-run (post-ctor-fix / pre-lifecycle-fix).
  Ctor yes; gold no; `freshctx-state` empty.

## Still missing for a methods appendix

1. Full request and response JSON per cell (we kept snippets + 500-char replies).
2. Per-cell before/after workspace snapshots (final `ws/` only).
3. A driver that writes real newlines, **committed** without a secret path.
   A box rerun exists at `/workspace/freshctx-live-2026-08-22-b` (real `0x0a`,
   3-line `region_b.txt`) but has no `REPORT.md` and is not in git.
4. A Hermes CLI oneshot that **delivers gold** on turn 2. PCR 0044 ran the
   CLI after the ctor fix; persist (reserved 0045) is unit-only so far.
5. n>1 / a second model / a real repository.
6. A paper draft under `papers/` (lock and manifest only today).
7. Stage-level timing beyond transform vs HTTP (`docs/EVALUATION.md` omitted layers).
8. Pinned bun / Python / OS / environment hash.
9. Persisted token `usage` (the driver read it and dropped it).

Pi live cells on the same mutations are no longer missing (PCR 0043).

## Box-only, not yet a PCR

Hermes driver-newline rerun (`-b`): B-interior hermes-fresh still stale
(`BETA_OLD_INTERIOR` in request, `BETA_NEW_INTERIOR` absent). B2 file-scope
hermes-fresh current. So after real newlines, cell B is a **real region
miss**, not only a driver confound. Do not cite 0041 cell B as the last word.

## Do not claim from current evidence

- SOTA or "beats CORVUS" on live sessions.
- That region-scoped live interior edits worked (the honest `-b` cell is a miss).
- That Hermes native compress refreshes file bytes.
- That we ran the Nous Hermes *model*. We ran Hermes *Agent* with DeepSeek.
- That the model's FRESH/STALE sentence is the metric.
- That PCR 0044 or persist unit tests closed the live gold gap.
