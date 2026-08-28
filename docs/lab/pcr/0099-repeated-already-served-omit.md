# PCR 0099 — omit repeated already-served stub after first collapse

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0099-already-served-stub-e823` (draft PR, this branch)
- Commit: (this commit)
- Merge-base: `ce538f6e766cde26d2d38d8f03f85461864b4844` (main @ PCR 0098 squash / PR 93)
- Paper-manifest digest: not verified (local `papers/cache/corvus-2026.pdf` absent on this VM)
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

After an unchanged post-apply turn has already collapsed once to the short current
`[freshctx:already-served units=N] Current tracked content was already served and
disk is unchanged.` marker and that delivery is acknowledged, later unchanged turns
must **not** re-inject the collapsed stub on every request. The first collapse still
fires exactly once; turn-2 first-NEW (PCR 0098) stays quoteable with a full live
envelope; official collapse still holds (no full NEW re-serve when disk is
unchanged).

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user leftover survived file-level inspection:

- PCR 0092–0097 correctly collapse the **first** unchanged later turn from a full
  `<freshctx-unit>` envelope to the short current already-served marker.
- PCR 0094/0095 replay boards then kept emitting that same 99-byte marker on every
  later unchanged turn (`turn3ProjectionBytes === turn2ProjectionBytes`).
- On the live Hermes 10-turn board (user-reported, not re-run here), official
  telemetry showed `proj_bytes` `447` on the quoteable first-NEW turn then `199`
  on turns 3–10 while `already-served=1` every turn — the stub was re-paid each
  request even though collapse had already fired.
- Models quoting `[freshctx:already-served` into assistant text (scans at offsets
  485, 768, 1067, 1359 on the live capture) is a **symptom** of the stub riding
  in request history every turn, not a separate PCR.

Root cause: `shouldCollapseCurrentProjection()` decided **what** to emit but had no
memory that the collapsed marker for the current revision set had already been
delivered. `lastInjectedRevision` tracks revision skip eligibility from full-body
**or** collapsed delivery but does not distinguish “full body served” from
“collapsed marker served.”

Fix: extend the existing delivery-state path (PCR 0087/0094/0097), not a second
skip engine. Record `lastDeliveredCollapsedRevision` when a collapsed marker is
apply-acked; `resolveProjectionText()` omits the tail projection when collapse
would fire again for the same revision set.

## What changed

- `adapters/request-prune.mjs`
  - adds `resolveProjectionText()`, `revisionsRecordFromProjection()`,
    `revisionsRecordsMatch()`, `isCurrentCollapsedProjectionMarker()`;
  - omits tail projection (`""`, 0 bytes) when collapse is eligible **and**
    `lastDeliveredCollapsedRevision` already matches the current selected revisions.
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts`
  - track `lastDeliveredCollapsedRevision` across apply-ack;
  - skip appending an empty tail user message when projection is omitted.
- `adapters/hermes/bridge.mjs`
  - persist `state.lastDeliveredCollapsedRevision` across request-only and
    projection-text apply-ack paths;
  - clear it on full-body delivery; omit tail append when projection is empty.
- `test/pcr-0099-repeated-already-served-omit.test.mjs`
  - Pi/Hermes PCR 0098-class board: turn 2 full NEW (`427` B), turn 3 first
    collapse (`99` B), turn 4+ omitted (`0` B);
  - Hermes request-only ack board (PCR 0097 class): turn 3 omitted after turn 2
    collapse without persisted projection text.
- `test/pcr-0094-hermes-collapsed-ack.test.mjs`, `test/pcr-0095-hermes-conversation-history.test.mjs`
  - turn 3 now expects omission, not a second stub.

No door, lock, benchmark fixture, gold label, or score-weight change.

## Test-first evidence

Before the fix, turn 4 on the PCR 0098-class board still emitted the collapsed
marker:

```text
Expected: turn4.projectionText === ""
Actual:   '[freshctx:already-served units=1] Current tracked content was already served and disk is unchanged.'
turn4.telemetry.projectionBytes: 99
```

## Replay proof

Measured on this branch from the PCR 0098-class Hermes replay board:

```json
{
  "turn2ProjectionBytes": 427,
  "turn2HasFreshctxUnit": true,
  "turn3ProjectionBytes": 99,
  "turn3Collapsed": true,
  "turn4ProjectionBytes": 0,
  "turn4Omitted": true
}
```

User-reported live board (cited only; not re-run):

| metric | value |
|---|---|
| turn 2 `proj_bytes` (quoteable first-NEW) | `447` |
| turns 3–10 `proj_bytes` each (before fix) | `199` |
| turns 3–10 `already-served` each | `1` |
| WITH `request+response` bytes/chars (t2+) | `176812` / `40897` |
| WITHOUT `request+response` bytes/chars (t2+) | `171208` / `39848` |
| per-later-turn WITH−WITHOUT `request_bytes` | `+351 +83 +277 +360 +567 +750 +944 +1039 +1233` |
| model | `deepseek-v4-flash` (never pro) |
| rereads | `0` |
| full NEW re-serve on unchanged disk | no (collapse held) |

Expected live effect after fix: turn 3 keeps the first `already-served=1` collapse;
turns 4–10 drop to `proj_bytes=0` while skip eligibility and quoteability invariants
hold.

## Scope guard

- PCR 0098 turn-2 first-NEW quoteability unchanged (`427` B replay, inline read bytes).
- PCR 0093 disk-change re-project still serves NEW full body (no already-served).
- PCR 0097 request-only apply-ack and continue-leftover fail-close unchanged.
- PCR 0079 single-user stateless boards stay full-body.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0099-repeated-already-served-omit.test.mjs` | yes | 0 | 4 passed, 0 failed |
| focused regression (0093/0094/0095/0098/0099) | yes | 0 | 15 passed, 1 skipped (official loader host absent), 0 failed |
| `npm test` | yes | 1 | 313 total; 288 passed; 2 failed; 23 skipped — failures are PCR 0096/0097 official-loader host-contract tests (`bench/hosts/hermes` absent on this VM) |
| `npm run evaluate` | yes | 1 | blocked by the same 2 host-contract test failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `npm run papers:verify` | no | n/a | local corpus absent (`papers/cache/corvus-2026.pdf`) |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| live Pi / Hermes | skipped | n/a | explicitly out of scope |

## Metric snapshot

| metric | PCR 0098 | PCR 0099 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` (ctxbench benchmark only) | `89.107165` | `89.107165` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | `309` | `313` | `+4` |
| `npm test` passed | `292` | `288` | `−4`* |
| turn-2 probe projection bytes (replay) | `427` | `427` | `0` |
| turn-3 probe projection bytes (replay) | `99` | `99` | `0` |
| turn-4+ probe projection bytes (replay) | `99` | `0` | `−99` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

\*Pass count drops because two host-contract tests fail on this VM (missing
`bench/hosts/hermes` checkout); adapter replay suites are green.

## Scope and limits

- Adapter-only delivery-state extension; no core projector retune.
- Does not run live Hermes/Pi; live numbers are cited from the user board.
- Does not chase the 66-byte WITH−WITHOUT gap as its own product.
- Assistant-text quotes of `[freshctx:already-served` in history should shrink
  once the stub stops re-injecting; that was not re-measured live here.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Extends existing apply-ack delivery state; no second skip engine.

## Next experiment

When live Hermes is back in scope, rerun the 10-turn unchanged-disk board and
confirm turns 4–10 report `proj_bytes=0` while turn 3 keeps
`already-served=1` once and turn 2 stays quoteable at full NEW bytes.
