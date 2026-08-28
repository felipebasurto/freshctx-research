# PCR 0106 — retire obsolete collapse delivery state

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/retire-obsolete-collapse-state-3955` (draft PR)
- Commit: (this commit)
- Merge-base: `77f844ead23c9a015a1a0d975c201986a38ae1b5` (main @ PCR 0105)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `adapter-only`; `cleanup`
- Decision: **review** (delivery-state retirement only; no new quoteability mechanism)

## Question tested

After PCR 0103–0105 (bounded current bytes in the original read tool-result slot when
the tail collapses or omits), which collapse delivery artifacts are still necessary?

Evaluated:

1. `[freshctx:already-served]` **current** notice (99 B stub)
2. `lastInjectedRevision` authorizing omission
3. `lastDeliveredCollapsedRevision` authorizing omission
4. Repeated collapsed-marker omission (99 B then 0 B)

## Evidence and retirement decisions

| Artifact | Verdict | Why |
|---|---|---|
| Current `[freshctx:already-served …]` tail stub | **Removed** | PCR 0103 read-slot inline satisfies Q1/Q2 without a tail copy. The 99 B stub no longer authorizes quoteability; it only duplicated collapse signal. |
| `lastDeliveredCollapsedRevision` | **Removed** | Sole consumer was the 99→0 two-phase omit in `resolveProjectionText`. With direct empty-tail collapse, this state has no live path. Legacy field stripped on Hermes load (`normalizeDeliveryState`). |
| 99→0 two-phase tail | **Removed** | First skip-eligible collapse now returns `""` immediately. Turn 3+ unchanged boards go straight to 0 B tail (same end state as old turn 4+). |
| `lastInjectedRevision` | **Kept** | Still drives `countSkipEligibleSelections` → `shouldCollapseCurrentProjection`, turn-2 first-NEW gate (`shouldInlineServedReadAtToolResult`), and apply-ack promotion (0087/0097). Its role in **omitting current bytes** is obsolete (0103); its role in **when to collapse** is not. |
| Historical `[freshctx:already-served … Historical …]` marker | **Kept** | `replaceHistoricalProjectionMessages` still replaces prior full `<freshctx>` envelopes in request copies. Unrelated to current-turn stub retirement. |
| `currentProjectionMarker` / `isCurrentCollapsedProjectionMarker` | **Kept (exported)** | Detection helpers for tests and `projectionCarriesQuoteableUnits`; no longer emitted on live collapse path. |

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Invariant enforced

**Q1/Q2 unchanged.** Collapse still never injects last-known observed bytes (P5).
Skip-eligible collapse still requires apply-acknowledged `lastInjectedRevision` match.
Read-slot inline (0103) remains the quoteability path on empty tail.

**Retired:** tail stub as a second current-state channel. One quoteable current copy
remains at the read slot; prior delivery does not authorize complete omission across
all slots.

## What changed

- `adapters/request-prune.mjs` — `resolveProjectionText` returns `""` on collapse;
  removed `revisionsRecordsMatch`, `revisionRecordEntries`, and
  `lastDeliveredCollapsedRevision` parameter.
- `adapters/pi/extension.ts`, `adapters/pi/replay.mjs` — drop
  `lastDeliveredCollapsedRevision` map and collapsed-marker apply-ack branch.
- `adapters/hermes/bridge.mjs` — drop persisted `lastDeliveredCollapsedRevision`;
  strip legacy field on load when `projectionStateVersion === 1`.
- `test/pcr-0106-retire-obsolete-collapse-state.test.mjs` — retirement gates.
- Prior PCR tests (0093–0105, 0078, 0100, 0102) — expectations updated for
  empty-tail first collapse (no behavior addition).
- Host-contract probes 0096/0097 — `hostCollapsed` now means no `<freshctx ` tail
  (quoteability still at read slot).
- `docs/lab/pcr/0106-retire-obsolete-collapse-state.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0106.

No core, fixture, gold, score-weight, Pi/Hermes grammar, or 0103 read-slot mechanism
change.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **355** total; **329 pass**; **2 fail**; **24 skip** — PCR 0096/0097 fail (`bench/hosts/hermes` absent; pre-existing on this VM) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node bench/run.mjs` (direct) | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | frozen |

## Metric snapshot

| metric | main @ 77f844e | PCR 0106 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 352 | **355** | **+3** (0106 tests) |
| `npm test` passed | 326 | **329** | **+3** |
| `npm test` failed | 2 | **2** | `0` (0096/0097 host absent) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

Small-board tail bytes after fix (unchanged quoteability via read slot):

| Turn | `projectionBytes` (was → now) |
|---|---|
| 1 full | >200 → >200 |
| 2 first-NEW | >200 → >200 |
| 3 collapse | 99 → **0** |
| 4+ omit | 0 → 0 |

Delta vs matched native baseline: **n/a** on this VM (no live Pi/Hermes rerun).

## Gate decision

**Proceed** after human review — obsolete collapse state removed; Q1/Q2 hold via
0103 read slot; score and door/lock unchanged.

Not **revise**: intentional tail-byte reduction on first collapse; apply-ack and
skip gates preserved.

Not **stop**: adapter-only cleanup; fail-open on legacy Hermes state.

Not **roll back**: no core or benchmark fixture movement.

## Scope and limits

- First collapse turn saves an additional 99 B vs pre-0106 (direct empty tail).
- Host-contract tests 0096/0097 require `bench/hosts/hermes` checkout.
- `currentProjectionMarker` remains exported for characterization; not emitted live.
- `lastInjectedRevision` intentionally retained — still on live collapse/skip path.

## Next experiment

Live native boards with Hermes checkout present: confirm empty-tail collapse and
read-slot quoteability on official-hook paths; no further delivery-state layers
planned unless a new measured gap appears.
