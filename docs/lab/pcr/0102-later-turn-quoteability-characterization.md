# PCR 0102 — later-turn quoteability characterization (replay measurement)

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0102-quoteability-characterization-92b9` (draft PR)
- Commit: (this commit)
- Merge-base: `ca2e39e4c22358ccec05c43ac4910df952758431` (main @ PCR 0101 squash)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `characterization`; `measurement`
- Decision: **review** (characterization only; no request-behavior change)

## Question tested

Can we pin the post-0099/0100 later-turn quoteability seam with replay
measurement — effective model-visible bytes, copy counts, pairing, compaction
state — without changing adapter or core behavior?

## Invariant under test (proposed, NOT enforced)

**Q1.** Every selected tracked unit has at least one quoteable current
representation in the effective model-visible request (bounded UTF-8 body bytes,
not merely a summary marker).

**Q2.** Prior delivery never authorizes complete omission of current bytes for a
selected unit across all model-visible slots.

These tests **characterize** current behavior. They document where Q1/Q2 fail on
turn 3+ unchanged boards. No production path change.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e |

## What changed

- `test/helpers/native-harness-measure.mjs` — replay measurement helpers:
  effective payload bytes/tokens, current/stale copy counts, per-unit quoteability,
  tool pairing, provider schema checks, compaction state.
- `test/pcr-0102-later-turn-quoteability-characterization.test.mjs` — pins
  0098–0100 seam on Pi/Hermes small board, Hermes narrowed slice, over-cap board.
- `docs/lab/pcr/0102-later-turn-quoteability-characterization.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0102.

No adapter, core, fixture, gold, or score-weight change. Design B not implemented.

## Characterization results (replay, this VM)

### Small board (0098–0099 class, Pi + Hermes replay)

| Turn | `projectionBytes` | Quoteable (Q1 probe) | Pairing | Notes |
|---|---:|---|---|---|
| 1 | ~427 | yes (OLD via tail) | valid | read slot = summary marker |
| 2 first-NEW | >200 | **yes** (read + tail) | valid | 0098 inline seam |
| 3 collapse | **99** | **no** | valid | stub only; read slot = marker |
| 4+ omit | **0** | **no** | valid | empty tail; read slot = marker |

Hermes replay decodes selected units from `projectionText` (adapter returns
`selected` as a count, not unit objects).

### Over-cap board (0100 class, Pi replay)

| Turn | `projectionBytes` | Quoteable all selected | Notes |
|---|---:|---|---|
| 2 collapse | ~100 | no | `[freshctx:already-served units=21]` |
| 3–4 omit | **0** | no | tail omitted after apply-ack |

### Sample Pi turn-1 measurement row (helper output)

| field | value |
|---|---:|
| `effectivePayloadBytes` | 535 |
| `effectivePayloadTokens` (est.) | 134 |
| `projectionBytes` | 427 |
| `currentBodyCopyCount` | 1 |
| `staleBodyCopyCount` | 0 |
| `quoteableAllSelected` | true |
| `pairingValid` | true |

Token estimate uses `ceil(bytes/4)` for replay boards only. Not a provider token count.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | 328 total; **302 pass**; **2 fail**; **24 skip** — PCR 0096/0097 host-contract (`bench/hosts/hermes` plugin layout absent) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node --test test/pcr-0102-*.test.mjs` | yes | 0 | 9 pass, 1 skip (live Hermes defer) |
| live Pi / Hermes | skipped | n/a | replay-first; host checkout partial/absent |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door/lock frozen |

## Metric snapshot

| metric | PCR 0101 @ main | PCR 0102 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` hold | n/a (evaluate blocked) | **no new bench run** |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 318 | **328** | **+10** (0102 tests) |
| `npm test` passed | 293 | **302** | **+9** |
| Request behavior | shipped 0100 | **unchanged** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

Delta vs matched native baseline: **n/a** — no live native compare on this VM;
0096/0097 host-contract boards own live Hermes parity when checkout is present.

## Gate decision

**Proceed** to design review (PCR 0101 §15). Characterization tests now encode
Q1/Q2 gaps on turn 3+ without behavior change.

Not **revise**: pairing and schema checks pass; stale bytes absent on later turns.

Not **stop**: gap is bounded and measured; implementation (Design B or D) stays
gated on explicit approval ([design doc](../design/native-harness-compatibility.md)).

Not **roll back**: no production diff.

## Scope and limits

- Measurement helpers are test-only (`test/helpers/`). No new host contract wired
  into production requests.
- Live native Hermes/Pi compare deferred; replay boards are authoritative here.
- Provider server-side history not measured.
- Design B (generalized inline gate) **not approved** and **not implemented**.

## Next experiment

PR 3 (implementation) stays gated: pick Design B or D, write byte-budget
accounting ADR/PCR, and only then change `adapters/request-prune.mjs`. Target:
repair Q1 on turn 3+ while preserving P1–P8 and deterministic budgeting.
