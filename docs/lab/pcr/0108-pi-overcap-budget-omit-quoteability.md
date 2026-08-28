# PCR 0108 — Pi over-cap budget-omit later-turn quoteability

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0108-pi-overcap-budget-omit-quoteability-58a7` (draft PR)
- Commit: (this commit)
- Merge-base: `7fc98accc143b5a9469fc5bf79f309d452f82170` (main @ PCR 0107)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `pi-fresh`; `adapter-only`; `invariant`
- Decision: **review** (Pi quoteability fix; Hermes unchanged)

## Question tested

On Pi, when a first-time whole-file read is budget-omitted (PCR 0080), does the
PCR 0103 read-slot inline contract run on later unchanged turns — or does the
native slot stay a `freshctx:omitted-read` marker and force a region reread to
recover quoteable bytes?

## Problem (measured live on main @ 7fc98ac)

Single ~40 009 B file `region_b.txt`, line 2 `OVERCAP_LINE2_FRESH`, path-only
read, disk unchanged after turn 1.

| arm | t2+ behavior |
|---|---|
| WITH FreshCtx Pi | t1 native slot = 106 B omit marker; t2+ needs region reread (`offset=2 limit=1`) before line 2 is quoteable; official tail eventually 634/428 B (41 content-bytes), not 0106 empty tail |
| WITHOUT FreshCtx Pi | t2+ native tool keeps ~40 009 B every later turn |
| WITH FreshCtx Hermes (same SHA) | official later 0 B; native slot keeps ~40 008 B; quoteable without reread |

Hole: PCR 0103 only inlines **selected** units when the tail omits quoteable
bodies. Budget-omitted units never enter `selectedUnitIds`; `dropUnservedReadToolPairs`
then replaces the read slot with an omit marker. Pi has no passive native full-file
retention like Hermes observation-time bytes.

## Invariant enforced

**Q1/Q2 on Pi over-cap unchanged boards:** after a prior-turn budget omit is
apply-ack recorded, later unchanged turns carry bounded **current** registry bytes
at the latest read tool-result slot when the official tail has no quoteable unit
bodies — without injecting the ~40 k official envelope and without requiring a
region reread.

Gates preserved:

- Turn 1 first delivery: truthful `freshctx:omitted-read` marker (no body bytes).
- Fresh same-turn over-cap reread: stays omitted marker (PCR 0089).
- Non-latest historical budget-omitted read on same path: stays omitted marker.
- Hermes adapter path untouched (0103–0107 behavior holds).
- Empty `unit.content` → no inject (P5).

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What changed

- `adapters/request-prune.mjs` — `shouldInlineBudgetOmittedReadAtToolResult`,
  `replaceBudgetOmittedReadQuoteability` (post-`dropUnservedReadToolPairs` pass;
  requires prior delivered budget disposition + latest read call id).
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts` — Pi-only wiring after
  `dropUnservedReadToolPairs`.
- `adapters/pi/README.md` — document PCR 0108 seam.
- `test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs` — unit gates +
  five-turn unchanged over-cap board (line 2 quoteable, no `<freshctx-unit` body).
- `test/pcr-0104-pi-host-wiring.test.mjs` — turn-2 over-budget expectation:
  current bytes at read slot, not omit marker.
- `docs/lab/pcr/0108-pi-overcap-budget-omit-quoteability.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0108.

No core, Hermes bridge, fixture, gold, score-weight, door, or lock change.

## Acceptance (replay, this VM)

Over-cap single-file board (~39.5 k pad + probe line 2):

| Turn | Read slot | Official tail | Quoteable line 2 |
|---|---|---|---|
| 1 | omit marker | `budget-omitted="1"`, no unit body | no |
| 2–5 unchanged | current registry bytes | `budget-omitted="1"`, no `<freshctx-unit` | **yes** (read slot) |

PCR 0089 boards: turn-1 omit honest; fit-after-shrink and over-budget reread
loops unchanged.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **358** total; **332 pass**; **2 fail**; **24 skip** — PCR 0096/0097 fail (`bench/hosts/hermes` absent; pre-existing on this VM) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node bench/run.mjs` (direct) | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `node --test test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs` | yes | 0 | **3 passed**, 0 failed |
| door/lock `git hash-object` | yes | 0 | frozen |

## Metric snapshot

| metric | main @ 7fc98ac | PCR 0108 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 355 | **358** | **+3** (0108 tests) |
| `npm test` passed | 337 | **332** | **−5** vs main pass count* |
| `npm test` failed | 0 | **2** | +2 (0096/0097 host absent) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

\*Main hold 337/0/18/355 counts host-ready environment; this VM reports 332 pass with
0096/0097 failing for missing `bench/hosts/hermes` checkout. +3 new 0108 tests;
0104 over-budget row updated (same file, no new test count).

Delta vs live Pi native baseline (user pack `freshctx-live-2026-08-28-cost-0107-pi-overcap`):
not re-run on this VM (no live Pi CLI). Replay board confirms t2–t5 quoteability without
region reread; read-slot carries current bytes, official envelope stays body-free.

## Gate decision

**Proceed** after Reviewer — Pi-only quoteability repair; Hermes and core untouched.

Not **stop**: turn-1 omit honest; 0089 reread loops hold; pairing valid on replay.

Not **roll back**: bounded current bytes only on apply-ack budget omit + latest read;
no official ~40 k body re-dump.

## Scope and limits

- Read-slot inline on later unchanged turns adds current whole-file bytes for
  over-cap units (~40 k for the live board class). That is bounded registry content,
  not passive Hermes-style observation retention nor official envelope re-dump.
- Live Pi CLI not exercised on this VM; replay/extension parity only.
- Host-contract tests 0096/0097 require `bench/hosts/hermes` fetch.
- No model-specific core behavior.

## Next experiment

Live Pi re-measure on the 0107 over-cap board: confirm t2+ quoteable without
region reread and compare request bytes vs native baseline.
