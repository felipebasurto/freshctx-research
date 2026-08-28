# PCR 0101 — native harness compatibility and later-turn quoteability evidence

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0101-native-quoteability-evidence-1e9d` (draft PR)
- Commit: (this commit)
- Merge-base: `d2fb1dfacad03c36fd3638fefdc570d31107d5bd` (main @ PCR 0100)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `design-evidence`; `replay`; `native-host`
- Decision: **review** (design/evidence only; do not merge behavior)

## Question tested

Does the post-0099/0100 adapter path — marker-masked read bodies, collapsed
`[freshctx:already-served]` tail, then zero-byte tail via
`lastDeliveredCollapsedRevision` — leave selected tracked units without a
quoteable current representation in the effective model-visible request?

## Investigation conclusion

**Partially confirmed.** The hypothesis survives on replay; it is not disproved.

- PCR 0098 repairs quoteability only on the **turn-2 first-NEW** seam (inline at
  read slot + full tail).
- PCR 0099/0100 correctly collapse then omit the tail on unchanged later turns.
- On turn 3+, read slots remain `stableReadMarker`
  (`src/transcript.mjs:1-3`) while the tail is stub or empty
  (`resolveProjectionText` at `adapters/request-prune.mjs:241-256`).
- **No model-visible slot carries bounded current unit bytes** on turn 4+
  unchanged (0099 test: `turn4.projectionBytes === 0`, no already-served in
  payload text).

The candidate “bounded refresh in tool-result slot” design is **not approved**;
four competing designs are evaluated in
[design/native-harness-compatibility.md](../design/native-harness-compatibility.md).

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No request-behavior change. No live Pi/Hermes run. No benchmark fixture edits.

## What changed (docs only)

- `docs/lab/design/native-harness-compatibility.md` — full evidence pack:
  native Hermes/Pi flows, FreshCtx flows, zero-byte characterization,
  persisted-vs-visible analysis, competing designs, invariants, boundaries,
  gate criteria.
- `docs/lab/pcr/0101-native-quoteability-zero-byte-evidence.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0101.

## Evidence collected

### Code trace (symbols)

| Symbol | File:lines | Finding |
|---|---|---|
| `stableReadMarker` | `src/transcript.mjs:1-3` | Default read slot = summary, not bytes |
| `replaceTrackedReadToolResults` | `request-prune.mjs:150-180` | Only inlines on 0098 gate |
| `shouldInlineServedReadAtToolResult` | `request-prune.mjs:117-134` | `userCount===2`, `skipEligible===0` |
| `resolveProjectionText` | `request-prune.mjs:241-260` | Omits tail when collapsed revision matches |
| `shouldCollapseCurrentProjection` | `request-prune.mjs:565-577` | All selected skip-eligible → collapse |
| `lastDeliveredCollapsedRevision` | `pi/replay.mjs:241-244`, `bridge.mjs:205-208` | Apply-ack enables omit |

### Replay boards (existing tests, not re-authored)

| Board | Source | Turn 2 | Turn 3 | Turn 4+ |
|---|---|---|---|---|
| Small region NEW | `pcr-0098` / `0099` | quoteable inline + ~427 B tail | 99 B stub | **0 B** tail |
| Over-cap 21-unit | `pcr-0100` | ~100 B collapse | **0 B** omit | **0 B** omit |
| Turn-2 NEW guard | `pcr-0100` | >1 000 B on disk change | n/a | n/a |

### Native baselines (without FreshCtx)

| Host | Runner | Behavior |
|---|---|---|
| Pi | `bench/pi-native-trace-runner.mjs:34-119` | Zero context handlers; full tool bytes in payload |
| Hermes | `bench/hermes-native-trace-runner.mjs` + PCR 0032 | ContextCompressor; often native-no-op on holdout |

Native payloads retain observation-time bytes (stale on mutations); quoteable but
not fresh. Documented in [PCR 0032](0032-native-host-context-bakeoff.md).

### Live evidence cited (research box; not re-run)

From main `d2fb1df` user board and [METRICS.md](../METRICS.md):

| metric | value | source |
|---|---|---|
| `npm test` TAP | 301 / 1 / 16 / 318 | METRICS PCR 0100 row |
| `AUTORESEARCH_SCORE` | `89.107165` hold | METRICS synthetic table |
| PCR 0100 focused tests | 5/5 pass | PCR 0100 |
| Hermes over-cap t1 `proj_bytes` | ~40 496 | user board / PCR 0100 cite |
| Hermes over-cap later tail | 99 → 0 | user board / PCR 0100 cite |
| Hermes over-cap WITH req+resp B/tok (t2+) | 74 419 / 17 305 | user board / PCR 0100 cite |
| Hermes over-cap WITHOUT req+resp B/tok (t2+) | 133 737 / 49 343 | user board / PCR 0100 cite |
| Hermes over-cap `quoteable_t2` | **false** | user board (large working set) |
| Small-board tail (official) | 447 / 99 / 0 / 0 | PCR 0098–0100 |
| Small-board `quoteable_t2` | true (both hosts) | PCR 0100 |

Live 0098–0100 tables remain on research box; not folded into METRICS live
section yet.

## Invariant affected

**Proposed (not yet enforced):** Q1 — every selected tracked unit has one
quoteable current representation in the effective model-visible request; prior
delivery never authorizes complete omission (see design doc §11).

**Currently enforced elsewhere:** P1–P8 preservation list in design doc; core
stateless projection ([PCR 0079](0079-stateless-byte-exact-requests.md));
adapter fail-open ([ARCHITECTURE.md](../../ARCHITECTURE.md) failure matrix).

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run papers:fetch` | yes | 0 | corpus was absent; fetched |
| `npm run papers:verify` | yes | 0 | digest matches |
| `npm test` | yes | 1 | 318 total; 293 pass; **2 fail**; 23 skip — PCR 0096/0097 host-contract (`bench/hosts/hermes` absent) |
| `npm run evaluate` | yes | 1 | blocked by same 2 failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door/lock frozen |
| live Pi / Hermes | skipped | n/a | docs-only PCR |

## Metric snapshot

| metric | PCR 0100 @ main | PCR 0101 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | n/a (evaluate blocked) | **no new bench** |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 318 | 318 | `0` |
| `npm test` passed | 293 | 293 | `0` |
| Request behavior | shipped 0100 | **unchanged** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

Honest delta against matched native baseline: **n/a** — no new measurement run;
native comparison drawn from existing PCR 0032 holdout table and design-doc
analysis.

## Gate decision

**Proceed to PR 2 (characterization tests only)** after review.

Rationale: replay proves a quoteability gap on turn 4+ unchanged; 0098 shows
adapter-only inline is feasible on one seam; core and door/lock need not move to
**characterize** Q1/Q2. Implementation (Design B or D) waits on reviewed tests
and explicit byte-budget accounting.

Not **stop**: freshness and byte savings from collapse/omit remain valuable;
trade is bounded and measurable.

Not **roll back**: no behavior shipped in this PR.

## Scope and limits

- Documentation and evidence only; zero adapter/core diff.
- Does not approve Design B; records it as leading candidate with alternatives.
- Does not chase 66-byte WITH−WITHOUT gap or unit-tool-marker PCR.
- Does not update METRICS synthetic row (no product metric movement).

## Conflicts with constitutions

**Tension noted, not resolved:** [NEXT-PROMPT.md](../NEXT-PROMPT.md) P0 text
 forbids `lastInjectedRevision` returning; adapter delivery state **exists** on
main post-0087–0100 for collapse/omit. Quoteability work stays **adapter-only**
and does not restore core cross-turn render skip (0077). Documented in design doc
§9; requires explicit ADR if P0 text is updated.

## Protocol gap?

**No.** Design/evidence PCR; no benchmark or fixture change.

## Next experiment

PR 2: add characterization tests for Q1/Q2 on turn 3, 4+, Hermes conversation
slice, and over-cap board — **no behavior change** until tests reviewed.
