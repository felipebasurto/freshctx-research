# PCR 0107 — fix inverted requestOnlyCollapsed probe on official Hermes boards 0096/0097

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/fix-0096-0097-probe-inversion-fddc` (draft PR)
- Commit: (this commit)
- Merge-base: `34a798aceac8cca3be7a0a60f0ea1ca40363cfed` (main @ PCR 0106)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `host-contract`; `test-fix`
- Decision: **review** (probe correction only; no product change)

## Question tested

After PCR 0106 empty-tail collapse landed, official host-contract boards 0096 and
0097 failed with `requestOnlyCollapsed actual true !== expected false`. Was that
a new collapse-state regression, or a stale probe definition left over from the
0106 assertion refresh?

## Evidence

PCR 0106 updated `hostCollapsed` to mean `"<freshctx " not in host_text` (empty
tail on the two-user host path). The request-only probe kept the opposite
polarity:

```python
"requestOnlyCollapsed": "<freshctx " in request_only_text  # true when envelope present
```

The Node assertion still expected `requestOnlyCollapsed === false`. On a
one-user request-only call (PCR 0095 gate), the envelope is still present, so the
probe returned `true` and the test failed. Collapse behavior on the host path
was already correct (`hostCollapsed === true`, quoteable bytes at the read slot).

| path | user count source | collapse? | `<freshctx ` in text? | correct probe value |
|---|---|---|---|---|
| request-only `select_context(request_messages)` | 1 | no | yes | `requestOnlyCollapsed === false` |
| host `_apply_context_engine_selection(..., conversation_messages)` | 2 | yes (0106 empty tail) | no | `hostCollapsed === true` |

No adapter or bridge code changed. Score, door, and lock unchanged.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Invariant enforced

**Probe parity with hostCollapsed.** Both flags mean "collapsed" when true: no
live `<freshctx` envelope in the assembled message text. Request-only boards must
stay full-body under the PCR 0095 single-user gate; host boards must collapse on
unchanged later turns with conversation history (0106 empty tail, 0103 read-slot
quoteability).

## What changed

- `test/pcr-0096-hermes-official-loader.test.mjs` — invert request-only probe to
  `"<freshctx " not in request_only_text`; assertion stays `false`.
- `test/pcr-0097-hermes-continue-request-only.test.mjs` — same probe fix on the
  official-loader board (replay boards unchanged).

No product, door, lock, fixture, or collapse-state code change.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **355** total; **337 pass**; **0 fail**; **18 skip** |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | yes | 0 | hard gates all true |
| `node bench/run.mjs` (direct) | yes | 0 | score `89.107165` |
| door/lock `git hash-object` | yes | 0 | frozen |

Focused host-contract rerun:

```text
node --test test/pcr-0096-hermes-official-loader.test.mjs test/pcr-0097-hermes-continue-request-only.test.mjs
→ 4 pass, 0 fail
```

## Metric snapshot

| metric | main @ 34a798a (0106) | PCR 0107 (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 355 | 355 | `0` |
| `npm test` passed | 329 (336/2/17 on CI with host) | **337** | **+8** (host present; probe fixed) |
| `npm test` failed | 2 (0096/0097 inverted probe) | **0** | **−2** |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

Pre-fix failure on boards with `bench/hosts/hermes` present:

```text
requestOnlyCollapsed actual true !== expected false
```

Post-fix official-loader JSON (0097 board, representative):

```json
{
  "requestOnlyCollapsed": false,
  "hostCollapsed": true,
  "turn2HostProjectionBytes": 0,
  "turn2RequestOnlyProjectionBytes": 746
}
```

## Gate decision

**Proceed** — test-only correction; collapse product from 0106 unchanged; evaluate
green.

Not **revise**: no behavior change warranted.

Not **stop**: host-contract boards now match documented 0095/0097 semantics.

Not **roll back**: 0106 empty-tail collapse stays.

## Scope and limits

- Only the Python probe polarity in 0096/0097 official-loader boards changed.
- Replay subtests in 0097 were already correct (they assert on `projectionText`
  directly).
- Requires `bench/hosts/hermes` checkout for official-loader subtests (fetched
  at lock `999703f` on this VM).

## Next experiment

None required for this probe fix. Optional: rename probe fields to
`requestOnlyHasEnvelope` in a later hygiene pass if the collapse naming continues
to confuse reviewers.
