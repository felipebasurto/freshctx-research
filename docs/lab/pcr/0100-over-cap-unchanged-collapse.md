# PCR 0100 — over-cap unchanged turns collapse instead of re-dumping bodies

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0100-over-cap-collapse-bc46` (draft PR)
- Commit: (this commit)
- Merge-base: `ee4c8651ade1309493c2d41024ba3a283ea5dbe9` (main @ PCR 0099 squash)
- Paper-manifest digest: not verified (local `papers/cache/corvus-2026.pdf` absent on this VM)
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

Scale is keep-what-was-read, not only a bigger budget (0078 default 32k cap; 0080
first refresh may exceed the cap). After PCR 0099 omits the repeated
already-served stub, an unchanged later turn on a board whose working set includes
budget-omitted units must **not** re-send the full selected bodies every request.
Collapse must fire the same way as the small 66-byte board: first collapse once,
then omit. Turn-2 first-NEW (0098) stays quoteable; official collapse still holds
(no full NEW re-serve on unchanged disk).

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user leftover survived file-level inspection on the 0078/0080/0099 path:

- PCR 0078 large board (20 small modules + 64k file; whole-file read
  budget-omitted; tracked `head` slice served): turn 1 injects **26 593** B; with
  apply-ack, turns 2–4 previously re-sent **26 593** B every unchanged request.
- PCR 0092–0099 collapse/omit path worked on the small region board because
  `projection.omitted.length === 0`. The large board always carries one
  budget-omitted whole-file unit, so `shouldCollapseCurrentProjection()` returned
  false even when all **21 selected** units were skip-eligible
  (`skipEligibleSelections === 21`).
- User-reported live Pi WITHOUT tail on ee4c8651 showed **26 562** chars on a
  later unchanged turn (t4 reread) — consistent with re-dumping the working set
  instead of collapsing. Official small-board tail on the same commit was
  **447/99/0/0** (quoteable first-NEW / first collapse / omit).

Root cause: collapse gate required zero omitted units. Budget-omitted units were
never served in the live projection and should not block collapse of the served
working set.

Fix: drop the `projection.omitted.length !== 0` guard from
`shouldCollapseCurrentProjection()`. Collapse still requires every **selected**
unit to match `lastInjectedRevision` (`selected.length === skipEligibleSelections`).

## What changed

- `adapters/request-prune.mjs`
  - `shouldCollapseCurrentProjection()` no longer rejects collapse when
    budget-omitted units remain in the projection envelope.
- `test/pcr-0100-over-cap-unchanged-collapse.test.mjs`
  - Pi large board: turn 1 **26 593** B → turn 2 collapse **100** B → turns 3–4
    omit **0** B; head-line edit still injects NEW (0080/0098 guard); small-board
    first-NEW quoteability regression; Hermes large-board collapse parity.
- `test/pcr-0078-cat-tracked-read.test.mjs`
  - turn-2 unchanged expectation updated to collapse-after-apply-ack (0100).

No door, lock, benchmark fixture, gold label, or score-weight change.

## Test-first evidence

Before the fix, with apply-ack on the 0078-class large board:

```text
turn1ProjectionBytes: 26593
turn2ProjectionBytes: 26593  (re-dump)
turn3ProjectionBytes: 26593
turn4ProjectionBytes: 26593
turn2Collapsed: false
```

## Replay proof

Measured on this branch from the 0078-class Pi large board (`@ DEFAULT_BUDGET_CHARS`):

```json
{
  "turn1ProjectionBytes": 26593,
  "turn2ProjectionBytes": 100,
  "turn3ProjectionBytes": 0,
  "turn4ProjectionBytes": 0,
  "turn2Collapsed": true,
  "turn3Omitted": true,
  "turn4Omitted": true
}
```

User-reported live board on ee4c8651 (cited only; not re-run):

| metric | WITH | WITHOUT | notes |
|---|---|---|---|
| Hermes request+response bytes/chars (t2+) | 74314 / 17352 | 73911 / 17338 | official tail 447/99/0/0 |
| Pi request+response bytes/chars (t2+) | 18535 / 5370 | 26562 / 7508 | WITHOUT t4 reread; same official tail |
| quoteable_t2 | true | true | both hosts |
| remaining ~100 B | `[freshctx:fc_…]` unit tool marker | same | not a separate PCR |

Expected live effect after fix: large-board later unchanged turns drop from
~26 593 B re-dumps to **100** B first collapse then **0** B omit, while small-board
447/99/0/0 tail and turn-2 first-NEW quoteability hold.

## Scope guard

- PCR 0098 turn-2 first-NEW quoteability unchanged (full `<freshctx-unit>` envelope).
- PCR 0080 over-cap refresh on disk change unchanged (force-select NEW over cap).
- PCR 0099 repeated-stub omit unchanged on small board (99 → 0 B).
- PCR 0079 single-user stateless boards unchanged (no collapse on first inject).
- 66-byte WITH−WITHOUT gap and `[freshctx:fc_…]` unit tool marker not chased.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0100-over-cap-unchanged-collapse.test.mjs` | yes | 0 | 5 passed, 0 failed |
| focused regression (0078/0098/0099/0100) | yes | 0 | 31 passed, 1 skipped, 0 failed |
| `npm test` | yes | 1 | 318 total; 293 passed; 2 failed; 23 skipped — PCR 0096/0097 official-loader host-contract (`bench/hosts/hermes` absent) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `npm run papers:verify` | no | n/a | local corpus absent |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| live Pi / Hermes | skipped | n/a | explicitly out of scope |

## Metric snapshot

| metric | PCR 0099 | PCR 0100 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` (ctxbench) | `89.107165` | `89.107165` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | `313` | `318` | `+5` |
| `npm test` passed | `288` | `293` | `+5`* |
| large-board turn-1 projection bytes (replay) | `26593` | `26593` | `0` |
| large-board turn-2 projection bytes (replay, ack'd) | `26593` | `100` | `−26493` |
| large-board turn-3+ projection bytes (replay, ack'd) | `26593` | `0` | `−26593` |
| small-board turn-2 first-NEW bytes (replay) | `427` | `427` | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

\*Pass count excludes the two pre-existing host-contract failures on this VM.

## Scope and limits

- Adapter-only collapse-gate fix; no core policy/projector retune.
- Does not run live Hermes/Pi; live numbers cited from user board on ee4c8651.
- Does not invent a PCR from the ~100 B `[freshctx:fc_…]` unit tool marker or the
  66-byte WITH−WITHOUT cost delta.
- Over-cap refresh turn-3 empty envelope (`selected=0`, 78 B) when the refreshed
  file falls back under budget omit is unchanged; it already does not re-dump the
  full body.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Extends existing collapse/omit delivery state; no second skip engine.

## Next experiment

When live Pi is back in scope, rerun the large-board unchanged-disk path and
confirm later turns report `proj_bytes` ≈ `100` then `0` while official small-board
tail stays 447/99/0/0 and turn-2 first-NEW remains quoteable.
