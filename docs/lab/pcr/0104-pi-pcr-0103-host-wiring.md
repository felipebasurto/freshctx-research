# PCR 0104 — Pi host wiring for PCR 0103 quoteability contract

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pi-pcr-0103-9b8d` (draft PR)
- Commit: (this commit)
- Merge-base: `192ba5c58d7a0a874b95480d0275d3217de603e1` (main @ PCR 0103 squash)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `pi-fresh`; `adapter-only`; `invariant`
- Decision: **review** (Pi wiring only; Hermes unchanged)

## Question tested

Does the Pi extension/replay path correctly apply PCR 0103's provider-neutral
read-slot inline on the ephemeral request copy — preserving Pi-native grammar,
tool pairing, compaction boundaries, and fail-open behavior — without changing
persisted session messages or Hermes semantics?

## Invariant enforced

**Q1/Q2 on Pi replay boards:** every selected tracked unit has quoteable current
bytes in the effective model-visible request when the tail collapses or omits;
prior delivery never authorizes complete omission across all slots.

Pi-specific gates:

- Request-only rewrite: persisted tool results stay observation-time; read-slot
  inline applies only in the `context` hook return copy.
- Pi-native `toolCall` / `toolResult` messages preserve role, call ID, position,
  and pairing (`validateProviderSchema`, `validateToolPairing`).
- `onBeforeProviderRequest` apply-ack gates collapse/skip (0087/0093); undelivered
  projections do not promote skip.
- Resolution failure and delete never inject last-known observed bytes (P5).
- Adapter `context` throw or empty registry returns `undefined` (fail-open).

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e |

## What changed

- `adapters/pi/extension.ts` — `syncRegistryToActiveCalls` now drops inactive
  `callToUnit` entries (parity with `replay.mjs`; no Hermes change).
- `adapters/pi/README.md` — document PCR 0103 read-slot inline on collapsed/omitted
  tail (request copy only).
- `test/pcr-0104-pi-host-wiring.test.mjs` — nine Pi-only replay gates (native grammar,
  edit, delete, resolution failure, over-budget, retry, fail-open, later-turn footer
  quote, persisted-vs-request split).
- `docs/lab/pcr/0104-pi-pcr-0103-host-wiring.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0104.

No `request-prune.mjs` mechanism change (0103 already merged). No Hermes adapter,
core, fixture, gold, or score-weight change. `lastInjectedRevision` /
`lastDeliveredCollapsedRevision` not retired (PR 6 deferred).

## Acceptance (replay, this VM)

| scenario | Pi result |
|---|---|
| Unchanged disk + later footer quote (turn 4, empty tail) | `quoteableAllSelected === true`; footer at read slot |
| Edited content (turn-2 first-NEW) | read slot + tail both carry NEW; no stale OLD |
| Deleted file | no OLD/NEW inject; `unresolved="1"` |
| Resolution failure (delete refresh) | no observed replay at read slot |
| Over-budget first read | `freshctx:omitted-read` marker; no body bytes |
| Retry without apply-ack | `skipEligibleSelections === 0`; full envelope |
| Adapter throw | `onContext` → `undefined`; persisted unchanged |
| Pi-native grammar (toolCall/toolResult) | schema + pairing valid; inline on collapse |
| Persisted vs request | persisted OLD at tool result; request NEW at read slot |

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **343** total; **317 pass**; **2 fail**; **24 skip** — PCR 0096/0097 fail (`bench/hosts/hermes` absent; pre-existing on this VM) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node bench/run.mjs` (direct) | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | frozen |

## Metric snapshot

| metric | main @ 192ba5c | PCR 0104 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 334 | **343** | **+9** (0104 tests) |
| `npm test` passed | 308 | **317** | **+9** |
| `npm test` failed | 2 | **2** | `0` (0096/0097 host absent) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

Delta vs matched native Pi baseline: **n/a** on this VM (Pi CLI not installed;
no live official-hook rerun). Replay boards confirm quoteability repair on
collapsed/omitted-tail turns matches PCR 0103 mechanism intent.

## Gate decision

**Proceed** to PR 5 (Hermes host wiring) after human review — Pi replay parity
holds; Hermes intentionally untouched in this PR.

Not **stop**: Pi grammar and pairing preserved; no last-known inject on empty content.

Not **roll back**: adapter-only wiring + tests; score and door/lock hold.

## Scope and limits

- Live Pi CLI (`pi -e ./adapters/pi/extension.ts`) not exercised on this VM;
  replay harness mirrors extension handlers.
- Over-budget units never enter skip-eligible collapse (0100); read slot stays
  on omission marker, not inlined body.
- Host-contract tests 0096/0097 require `bench/hosts/hermes` fetch.
- PR 6 delivery-state retirement not in scope.

## Next experiment

PR 5 only: Hermes live host wiring review — confirm bridge/replay parity with
the same PCR 0103 contract on official-hook boards with checkout present.
