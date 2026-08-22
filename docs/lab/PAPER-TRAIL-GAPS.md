# Paper-trail gaps

Written 2026-08-22 so a later methods section does not have to rediscover
what was never archived. Checklist, not a claim of missing science.

## Now in git (PCR 0041)

- Live DeepSeek + Hermes Agent plugin session (REPORT, METHODS, cells,
  request snippets, ping, leftover ws/).
- PCR 0034 live-compress table, marked not-merged.
- Cell B documented as a **confounded** region test (literal `\\n`, one-line
  file, `startLine=2`), not as a product miss.

## Still missing for a methods appendix

1. Full request and response JSON per cell (we kept snippets + 500-char replies).
2. Per-cell before/after workspace snapshots (final `ws/` only).
3. A driver that writes real newlines, committed without a secret path.
4. A Hermes CLI oneshot (interactive agent).
5. Pi live cells on the same mutations (`earendil-works/pi` `c49906ec`).
6. n>1 / a second model / a real repository.
7. A paper draft under `papers/` (lock and manifest only today).
8. Stage-level timing beyond transform vs HTTP (`docs/EVALUATION.md` omitted layers).
9. Pinned bun / Python / OS / environment hash.
10. Persisted token `usage` (the driver read it and dropped it).

## Do not claim from current evidence

- SOTA or "beats CORVUS" on live sessions.
- That region-scoped live interior edits failed or worked (cell B invalid).
- That Hermes native compress refreshes file bytes.
- That we ran the Nous Hermes *model*. We ran Hermes *Agent* with DeepSeek.
- That the model's FRESH/STALE sentence is the metric.
