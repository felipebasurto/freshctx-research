# PCR 0074 — live Pi official-hook confirm (post-0073)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent (research-box live run; docs-only confirm)
- Branch / PR: `cursor/pcr-0074-live-pi-cli-confirm-30cf` (draft PR)
- Commit: (this docs commit)
- Merge-base: `363a03c8a3a8cf76d6d79976e255d8967f931117` (main @ PCR 0073 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `pi-fresh`; `pi-cli`; `offset-limit`; `measurement`
- Decision: **review** (docs/measurement only; no product change)

## Hypothesis or change

PCR 0073 shipped Pi offset/limit Hermes-parity clamp in the adapter (synthetic replay
only). This PCR records a **successful live confirm** on the research box: official Pi
hook `pi -e adapters/pi/extension.ts` at FreshCtx `363a03c`, with real `0x0a` newlines,
ten cells (five boards × WITH/WITHOUT FreshCtx), HTTP 200 on every turn-2 POST, and
`args_matched=true` on all reads.

**Not a paper result. Not SOTA. Not holdout.**

Distinct from closed draft PR 68 (VM blocker: no DeepSeek on that agent). This PCR
documents the completed live run on the research box.

## What we did

- Workdir on research box: `/workspace/freshctx-live-2026-08-25-pi-0074/` (not in git;
  cite paths only).
- Evidence: `REPORT.md`, `cells.json` in that workdir; FreshCtx worktree
  `/workspace/freshctx-live-2026-08-25-pi-0074/freshctx-src` @ `363a03c`.
- Pins: FreshCtx `363a03c8a3a8cf76d6d79976e255d8967f931117`, Pi host
  `c49906ec77788625aacbdc53ebca6fbe65bd20f5`, `@earendil-works/pi-coding-agent` 0.84.2,
  isolated `HOME`.
- Official hook: `pi -e adapters/pi/extension.ts`. One RPC process per cell; turn 2
  never re-read.
- Model on the wire: **deepseek-v4-flash** (same family as PCR 0043). CLI flag was
  `--model deepseek-chat`; do **not** claim `deepseek-chat` as the served model.
- Score = NEW/OLD presence in turn-2 request JSON (language-agnostic gold only). Request
  byte counts below are turn-2 POST `json.dumps(request)` length.
- Did **not** re-run live in this VM. Did **not** edit `src/`, door, holdout traces,
  `bench/repos.lock.json`, Hermes adapter, Pi mapper, or tests. No persist-38. No v0.2.
  No `--relock`.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` |

## Board (live)

Three-content-line file with real `0x0a` newlines, trailing NL, `lineCount=4` (same
fixture family as PCR 0070/0073 synthetic boards). Interior line-2 replace between
observe and turn 2.

| # | Pi args | WITH FreshCtx | WITHOUT FreshCtx |
|---|---|---|---|
| 1 | `{offset:1, limit:2000}` | NEW file-scope `whole-file` `1–4`; request **4032** B (unit **65** B) | OLD; request **3473** B |
| 2 | `{offset:1, limit:4}` | NEW file-scope Rule A; request **4069** B | OLD; request **3495** B |
| 3 | `{offset:1, limit:3}` | **NEITHER** — region empty leftover (`selected=0`, `unresolved=1`); envelope **178** B / request **3636** B | OLD; request **3515** B |
| 4 | `{offset:2, limit:1}` | NEW `stored-line-span` `2–2`; request **4023** B (unit **39** B) | OLD; request **3542** B |
| 5 | path only | NEW file-scope; request **4007** B | OLD; request **3427** B |

All ten cells: HTTP **200**, `args_matched=true`, turn 2 never re-read.

### Findings

1. **Live hook observed `fileLineCount`.** The 0073 adapter fix is alive on the official
   Pi extension path — not replay-only.

2. **Discriminator pair: board 1 NEW + board 3 empty leftover.** Board 1
   (`{offset:1, limit:2000}`) promotes to file-scope NEW (0064 hold). Board 3
   (`{offset:1, limit:3}`) stays in-bounds region and fail-closes to empty leftover
   (0070 guard). That combination **cannot** happen if the hook ignores pagination
   (PCR 0043 hole: everything file-grain fresh) or if it maps offset/limit but never
   sees `fileLineCount` (Rule A and 0070 guard would not fire correctly).

3. **Board 3 is the 0070 leftover, not the 0043 hole.** Under 0043 semantics B-interior
   was file-scope fresh; here `{offset:1, limit:3}` yields neither NEW nor stale
   projection bytes — empty envelope with unresolved region unit.

4. **WITHOUT rows hold OLD** in the persisted tool-result path on every board (native
   control).

5. **Real newlines throughout.** Gold checks first/last lines, span, location, exact
   bytes — language-agnostic only.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| `pi -e adapters/pi/extension.ts` × 10 cells | yes (box) | 0 | official hook; already scored on research box |
| DeepSeek turn-2 POST | yes (box) | 200 | all cells; `deepseek-v4-flash` |

## Metric snapshot

| metric | PCR 0073 ledger | this confirm | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | unchanged | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 210/210 | 210/210 (unchanged) | 0 |
| live Pi offset/limit boards | unmeasured (0073 synthetic only) | 10/10 cells HTTP 200 | measured (box) |

## Comparison

- PCR 0043 (live): Pi ignored offset/limit → file-grain B-interior fresh (0043 hole).
- PCR 0070 (synthetic): in-bounds `{offset:1, limit:3}` empty leftover guard.
- PCR 0073 (synthetic + adapter): Hermes-parity clamp; replay boards locked.
- PCR 0074 (live confirm): official hook reproduces 0073 grain split on the research box.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note. Request JSON bodies not committed.

## Limitations

- n=1 live pass on research box; evidence paths cited, artifacts not in git.
- Full turn-2 request JSON not archived in repo (table + box-local `cells.json` only).
- Model CLI flag (`deepseek-chat`) ≠ wire model (`deepseek-v4-flash`).
- Not holdout; not comparable as SOTA.
- Closed PR 68 is a separate VM-blocker draft — not this PCR.

## Protocol gap?

**No.** Docs/measurement only. Door blob, locks, and benchmark weights untouched.

## Next measurement

Holdout pi-fresh replay at `363a03c` with offset/limit read cells; compare region-grain
vs pre-0073 file-grain on the same traces. Do not regress 0070 guard boards on Hermes or Pi.
