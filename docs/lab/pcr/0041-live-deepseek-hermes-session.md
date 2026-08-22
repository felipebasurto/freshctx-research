# PCR 0041 — live DeepSeek session on Hermes Agent + FreshCtx

- Date (UTC): 2026-08-22
- Author / agent: UltraCtxt Thinker (box session; documented after the run)
- Branch / PR: `docs/pcr-0041-live-deepseek-session`
- Commit: (this docs commit)
- Merge-base: `4ccb008385e223c0e67eb95080d5398dc3f8cc5e` (PCR 0040 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

After PCR 0040, main is a frozen door plus the empty-envelope projector.
This PCR does **not** change code. It records the first live DeepSeek
session that used the installed Hermes FreshCtx plugin and the real API
on a mutated workspace.

Hermes here is [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
`999703fd`, not a Hermes LLM. The model is DeepSeek (`deepseek-chat`
requested; response model `deepseek-v4-flash`). Pi `c49906ec` was pinned
and not used.

**Finding (lab note, not a paper claim):** on file-scope edits in this
driver, the serialized hermes-fresh request contained the new unique
markers and hermes-native still contained the old tool-result bytes.
Cell B (region-scoped interior) is **not** a clean FreshCtx miss: the
driver wrote literal two-character `\\n` into a one-line file and then
asked for `startLine=2`. See [METHODS.md](../live-2026-08-22/METHODS.md).

## What we did

- Installed FreshCtx `4ccb0083` and Hermes Agent `999703fd` on the shared
  box. Symlink: `hosts/hermes/plugins/context_engine/freshctx` →
  `adapters/hermes`. Isolated venv. Isolated `hermes-home/config.yaml`.
- Ran a scripted driver (not a Hermes CLI oneshot). Real plugin class,
  real `api.deepseek.com`. Capture stub off. `FRESHCTX_CAPTURE_OK` never set.
- Seven mutations × two modes, plus one native budget-pressure cell.
- Did **not** edit `src/`, door, holdout traces, `hosts.lock.json`, or
  adapters. Door stays `f8771c93894095348185ef3453a3c2498355b3c6`.

Evidence lives under [docs/lab/live-2026-08-22/](../live-2026-08-22/).

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused tonight) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| live driver `run_live.py` + `extra_b2.py` | yes | 0 | 15 DeepSeek HTTP 200s; see cells.json |
| DeepSeek ping | yes | 200 | 1179 ms, reply `PONG` |

## Metric snapshot

Official score is **token-in-request** on `json.dumps(request)`, not the
model's FRESH/STALE sentence. Full table: [REPORT.md](../live-2026-08-22/REPORT.md),
[cells.json](../live-2026-08-22/cells.json).

File-scope cells where the new marker was in the fresh request and
absent from the native request: A-append, D-two-files, E-large,
G-edit-one-of-two, B2-file-scope-interior.

Cell B: `BETA_NEW_INTERIOR` never entered the request. Do **not** call
this a region-grain product miss. `reset_ws()` wrote Python
`"line1\\nline2\\nline3\\n"` as literal backslash-n (byte check:
`region_b.txt` has 0 `0x0a` bytes and 3 literal `\\n` sequences). The
region call asked for lines 2–2 of a one-line file.

Cell C: FreshCtx dropped `GAMMA_DELETE_MARKER` (empty envelope). Native
still sent the deleted file. `current present` is vacuously yes (no new
token). The model called the empty envelope STALE; that is not the score.

Timing (these tiny files only): hermes-fresh transform 64–73 ms. Native
0.05–0.12 ms. DeepSeek HTTP 1.5–2.2 s.

Native `E-large-pressure` reported `compress=true` in 0.12 ms and still
held the old snippet. Not a live-summary quality measurement.

## Comparison

Holdout bake-off vs CORVUS remains PCR 0038–0040
(`bench/reports/holdout-adapter-bakeoff.md`). This session is a host-live
case study on synthetic marker files, not a CORVUS comparison.

PCR 0034 (same day, earlier) called DeepSeek for Hermes `compress()` on
budget-pressure *traces*. Do not mix that table with this workspace
session.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note. REPORT.md already says
"Not a paper result. Not SOTA."

## Limitations

- n=1, synthetic markers, scripted conversation (not an interactive agent).
- Full request bodies not archived (snippets + 500-char replies).
- Final `ws/` is post-run residue, not per-cell snapshots.
- No Pi live cells. No Hermes CLI oneshot.
- bun instead of Node 22. bun version was not pinned in the original report.
- Cell B region test is confounded (literal `\\n`).
- Model FRESH/STALE prose is not accuracy (E-large fresh named the new
  token and still said STALE).

## Also left off GitHub until this PCR

1. This live session (`/workspace/freshctx-live-2026-08-22/`).
2. PCR 0034 live DeepSeek *compress* table. Reviewed, **not merged**.
   INDEX originally skipped 0034. Lab note added alongside this PCR.
3. Scratch copies of PCR 0032–0039 under `/workspace/pcr00*.md`. Canonical
   copies are already `docs/lab/pcr/0032`–`0040` except 0034.
4. `papers/` is still lock/manifest only. No paper draft.

Still not in git (on purpose):

- Driver scripts that load the DeepSeek key from connector-secrets.
- `.venv` and plugin state blobs.
- Full unredacted request JSON.

## Next measurement

None from this PCR. Coverage and latency wait for an explicit ask.
A region-scoped live cell is only honest after the driver writes real
newlines. That is a driver fix, not leftover-door work.

## Protocol gap?

**No.** Docs and evidence only. Holdout seal and door untouched.
