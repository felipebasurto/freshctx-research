# PCR 0105 — Hermes host wiring for PCR 0103 quoteability contract

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/hermes-pcr-0103-host-wiring-accc` (draft PR)
- Commit: (this commit)
- Merge-base: `8f4b32e23b8c904c96843fdd5f72c846216dd489` (main @ PCR 0104)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `hermes-fresh`; `adapter-only`; `invariant`
- Decision: **review** (Hermes wiring only; Pi unchanged; PR 6 deferred)

## Question tested

Does the Hermes bridge/replay path correctly apply PCR 0103's provider-neutral
read-slot inline on the ephemeral request copy — preserving OpenAI-format
grammar, tool pairing, request-only semantics, and fail-open behavior — without
changing persisted session messages or Pi semantics?

## Invariant enforced

**Q1/Q2 on Hermes replay boards:** every selected tracked unit has quoteable current
bytes in the effective model-visible request when the tail collapses or omits;
prior delivery never authorizes complete omission across all slots.

Hermes-specific gates:

- Request-only rewrite: persisted tool results stay observation-time; read-slot
  inline applies only in the `select_context` return copy.
- OpenAI `assistant.tool_calls` / `tool` messages preserve role, call ID, position,
  and pairing (`validateProviderSchema`, `validateToolPairing`).
- Request-only apply-ack (0097) gates collapse/skip via `on_turn_complete` assistant
  completion; undelivered projections do not promote skip.
- Resolution failure and delete never inject last-known observed bytes (P5).
- Adapter `selectContext` throw returns `undefined` in replay (fail-open); Python
  bridge subprocess failure returns `None` to Hermes.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What changed

- `adapters/hermes/replay.mjs` — fail-open try/catch around `selectContext` in
  `onSelectContext` (parity with Pi `onContext` catch).
- `adapters/hermes/README.md` — document PCR 0103 read-slot inline on
  collapsed/omitted tail (request copy only).
- `test/pcr-0105-hermes-host-wiring.test.mjs` — nine Hermes-only replay gates
  (native grammar, edit, delete, resolution failure, over-budget, retry,
  fail-open, later-turn footer quote, persisted-vs-request split).
- `docs/lab/pcr/0105-hermes-pcr-0103-host-wiring.md` — this PCR.
- `docs/lab/INDEX.md` — append row 0105.

No `request-prune.mjs` mechanism change (0103 already merged). No Pi adapter,
core, fixture, gold, or score-weight change. `lastInjectedRevision` /
`lastDeliveredCollapsedRevision` not retired (PR 6 deferred).

## Acceptance (replay, this VM)

| scenario | Hermes result |
|---|---|
| Unchanged disk + later footer quote (turn 4, empty tail) | `quoteableAllSelected === true`; footer at read slot |
| Edited content (turn-2 first-NEW) | read slot + tail both carry NEW; no stale OLD |
| Deleted file | no OLD/NEW inject; `unresolved="1"` |
| Resolution failure (delete refresh) | no observed replay at read slot |
| Over-budget first read | `freshctx:omitted-read` marker; no body bytes |
| Retry without apply-ack | `skipEligibleSelections === 0`; full envelope |
| Adapter throw | `onSelectContext` → `undefined`; persisted unchanged |
| OpenAI grammar (tool_calls/tool) | schema + pairing valid; inline on collapse |
| Persisted vs request | persisted OLD at tool result; request NEW at read slot |

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **352** total; **326 pass**; **2 fail**; **24 skip** — PCR 0096/0097 fail (`bench/hosts/hermes` absent on this VM; pre-existing) |
| `npm run evaluate` | yes | 1 | blocked by same 2 host-contract failures |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node bench/run.mjs` (direct) | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | frozen |

## Metric snapshot

| metric | main @ 8f4b32e | PCR 0105 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 343 | **352** | **+9** (0105 tests) |
| `npm test` passed | 317 | **326** | **+9** |
| `npm test` failed | 2 | **2** | `0` (0096/0097 host absent) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

Delta vs matched native Hermes baseline: **n/a** on this VM (`bench/hosts/hermes`
absent; no live official-hook rerun). Replay boards confirm quoteability repair on
collapsed/omitted-tail turns matches PCR 0103 mechanism intent.

## Gate decision

**Proceed** to PR 6 (delivery-state retirement) only after human review — Hermes
replay parity holds; Pi intentionally untouched in this PR.

Not **stop**: Hermes grammar and pairing preserved; no last-known inject on empty content.

Not **roll back**: adapter-only wiring + tests; score and door/lock hold.

## Scope and limits

- Live Hermes checkout (`bench/hosts/hermes`) not exercised on this VM; host-contract
  tests 0096/0097 remain skip/fail until fetch.
- Over-budget units never enter skip-eligible collapse (0100); read slot stays
  on omission marker, not inlined body.
- PR 6 delivery-state retirement not in scope.
- Bridge already invoked `replaceTrackedReadToolResults` from PCR 0103; this PR
  adds explicit Hermes host gates and fail-open replay wrapper.

## Next experiment

PR 6 only: retire `lastInjectedRevision` / `lastDeliveredCollapsedRevision` after
human review — not started in this PR.
