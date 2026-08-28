# PCR 0103 — provider-neutral transformation contract (Design B/D mechanism)

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/provider-neutral-transformation-contract-89da` (draft PR)
- Commit: (this commit)
- Merge-base: `dc82c4f5798f29c36ed94e719696d5ed6b889d8d` (main @ PCR 0102)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `adapter-only`; `invariant`
- Decision: **review** (mechanism only; host wiring PRs 4–6 deferred)

## Question tested

When the live tail collapses to the 99 B already-served stub or omits entirely
(0099/0100), can the ephemeral provider request still carry bounded current unit
bytes in the **original read tool-result slot** so every selected tracked unit
remains quoteable — without rewriting persisted host transcript?

## Invariant enforced (Q1/Q2 mechanism)

**Q1.** Every selected tracked unit has at least one quoteable current
representation in the effective model-visible request.

**Q2.** Prior delivery never authorizes complete omission of current bytes for a
selected unit across all model-visible slots.

Implementation: Design **B/D hybrid** in `adapters/request-prune.mjs`:

- **Design D:** when `projectionCarriesQuoteableUnits(projectionText)` is false
  (empty tail, collapsed stub), inline bounded `unit.content` at the tracked read
  tool-result slot in the request copy.
- **Design B (0098 preserved):** turn-2 first-NEW seam still inlines at the read
  slot when the tail carries a full envelope and disk bytes differ from observed.
- When the tail carries quoteable unit bodies (turn 1, turn 2 full envelope),
  read slots keep `stableReadMarker` to avoid triple copies.
- **P5:** empty `unit.content` → marker only; never inject last-known observed bytes.
- Collapse/omit tail logic (`resolveProjectionText`, `lastDeliveredCollapsedRevision`)
  unchanged — not retired (PR 6).

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e |

## What changed

- `adapters/request-prune.mjs` — `projectionCarriesQuoteableUnits`,
  `shouldInlineSelectedReadAtToolResult`, per-unit inline in
  `replaceTrackedReadToolResults`; PCR 0098 gate retained as `turn2FirstNewGate`.
- `test/pcr-0103-provider-neutral-transformation-contract.test.mjs` — unit gates,
  pairing, acceptance (turn-4 footer line never quoted by prior assistant).
- `test/pcr-0102-later-turn-quoteability-characterization.test.mjs` — quoteability
  rows updated for post-0103 behavior; Hermes measurement uses tracked-unit fallback
  when tail is stub/empty.
- PCR 0093–0097 replay expectations — collapsed/omitted tail still omits bodies
  from **projection**, but read slot carries current bytes (quoteability repair).
- `test/pcr-0096-hermes-official-loader.test.mjs`,
  `test/pcr-0097-hermes-continue-request-only.test.mjs` — official host-contract
  probes expect `hostNewCopies === 1`, `hostNewCopiesInProjection === 0`,
  `hostOldCopies === 0` after collapse (quoteability invariant; tail still stub-only).
- `docs/lab/pcr/0103-provider-neutral-transformation-contract.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0103.

No core, fixture, gold, score-weight, or host-specific wiring change. Pi extension /
Hermes bridge already call `replaceTrackedReadToolResults` — mechanism applies on
replay without PR 4–5 host work.

## Acceptance (replay, this VM)

Turn-4 Pi board: user asks for `line3 footer` — never appeared in prior assistant
replies. Effective payload contains current footer bytes at the read slot with empty
tail (`projectionBytes === 0`), `quoteableAllSelected === true`, `staleBodyCopyCount === 0`.

Small board after fix:

| Turn | `projectionBytes` | Quoteable | Read slot |
|---|---:|---|---|
| 1 | ~427 | yes (tail) | marker |
| 2 first-NEW | >200 | yes (read + tail) | inlined NEW |
| 3 collapse | **99** | **yes (read)** | inlined NEW |
| 4+ omit | **0** | **yes (read)** | inlined NEW |

Tail collapse/omit bytes unchanged from 0102 characterization; quoteability repaired
via read-slot inline.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **334** total; **308 pass**; **2 fail**; **24 skip** — PCR 0096/0097 fail at host staging (`bench/hosts/hermes` absent on this VM; assertions updated for quoteability) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node bench/run.mjs` (direct) | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | frozen |

## Metric snapshot

| metric | main @ dc82c4f | PCR 0103 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 328 | **334** | **+6** (0103 tests) |
| `npm test` passed | 311 | **308** | **−3** vs main pass count* |
| `npm test` failed | 0 | **2** | +2 (0096/0097 host absent; pre-existing on this VM) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

\*Main hold 311/0/17/328 counts host-ready environment; this VM reports 308 pass with
0096/0097 failing for missing `bench/hosts/hermes` checkout.

Delta vs matched native baseline: **n/a** on this VM (no live Pi/Hermes native rerun).
Effective adapter payloads on later unchanged turns now include current read-slot bytes
where native harness retains observation-time tool output — quoteability improved;
serialized tail bytes still smaller than native full-history retention.

## Gate decision

**Proceed** to PR 4 (Pi host wiring review) after human review.

Not **revise**: ctxbench hard gates and core score hold; pairing valid on replay boards.

Not **stop**: provider grammar and tool pairing preserved; no last-known inject on empty content.

Not **roll back**: mechanism is adapter-only and fail-closed.

## Scope and limits

- Read-slot inline adds current bytes on collapsed/omitted-tail turns — effective
  payload grows vs pre-0103 on those turns; tail savings (99→0 B) partially offset.
- Over-cap 21-unit boards inline all selected read slots when tail omits — byte cost
  bounded by selection policy, not measured against live native on this VM.
- `lastInjectedRevision` / `lastDeliveredCollapsedRevision` delivery state not retired.
- Host-contract tests 0096/0097 require `bench/hosts/hermes` fetch; assertions
  now expect one host-visible current copy at the read slot when tail collapses.
- No model-specific core behavior; no new prototype-core dependencies.

## Next experiment

PR 4 only: Pi live host wiring review — confirm extension/replay parity, persisted-vs-request
split, and official-hook boards with checkout present.
