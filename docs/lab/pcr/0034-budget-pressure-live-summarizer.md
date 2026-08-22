# PCR 0034 — budget-pressure live DeepSeek summarizer (not merged)

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers (Cloud Agent run); lab note filed 2026-08-22 after the fact
- Branch / PR: draft agent `bc-7a146ab7` from `fa6e2011` (not merged)
- Commit: none on main
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `budget-pressure-dev`; `native-host`; `live-model`
- Decision: **review** — live table only. **Do not merge.** INDEX originally skipped this number.

## Hypothesis or change

PCR 0033 used a capture stub for Hermes `compress()`. PCR 0034 reran the
same pack `budget-pressure-dev-v0.1` with live DeepSeek (`deepseek-chat`
at `api.deepseek.com`). No dummy capture.

**Finding:** 6/6 Hermes cells invoked live `compress()`. Scores matched
the stub photo. Compression still did not refresh stale bytes. That is
why 0034 stayed off main.

This is a host-compress photo on traces. It is **not** the later plugin
+ DeepSeek workspace session (PCR 0041).

## What we did

- Same pack `budget-pressure-dev-v0.1` (6 cells).
- Same host pins: Hermes `999703fd` (NousResearch/hermes-agent), Pi `c49906ec`.
- Live auxiliary model for Hermes compress. Stub cells: 0.
- Box table: `/workspace/budget-pressure-live-pcr0034.md` generated
  2026-08-22T17:38:49.837Z.

## Metric snapshot

Hermes-native `compress` on all 6 cells. `freshctx-region` stayed at
stale-bytes 0. `hermes-native` and `pi-native` stayed stale on
delete / interior-edit / neovim-append. Projection-bytes after compress
were ~4k, not current-file bytes.

## Limitations

- Not on main. No squash commit.
- Trace replay with a live summarizer, not an interactive agent.
- Matched the stub: live compress ≠ refresh.

## Next measurement

Superseded by PCR 0035 (`hermes-fresh` on the same board) and PCR 0041
(live plugin + DeepSeek on a mutated workspace).
