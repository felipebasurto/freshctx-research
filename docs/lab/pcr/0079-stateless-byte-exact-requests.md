# PCR 0079: stateless byte-exact provider requests

- Date (UTC): 2026-08-25
- Author / agent: Cursor agent
- Branch / PR: `fix/stateless-byte-exact-requests` (PR pending)
- Commit: `e2741fb` (failing test), `9a529ef` (fix)
- Merge-base: `8875cd79a793871be489c7df442886c4cfe91d80` (main @ PCR 0078)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stateless byte-exact requests; PR pending)

## Hypothesis or change

A provider request is stateless. Each request must carry the selected current
bytes itself, because the provider is not obliged to retain any earlier request.
PCR 0077 broke that. It tracked `lastInjectedRevision` per unit and, when the
next refresh produced the same revision, rendered a marker-only frame
(`unchanged="true"`, `content-bytes="0"`) instead of the body. The revision
digest in that frame is a name for the bytes, not the bytes.

The change removes the cross-turn revision state and renders `unit.content` for
every selected unit on every request.

### Root cause

Three separate defects compounded.

1. `src/projector.mjs` treated a matching prior revision as permission to send
   an empty body, so a selected unit could reach the provider with no content.
2. `src/engine.mjs` mutated a caller-owned `Map` inside `project()`, which made
   projection depend on how many times the adapter had called it before. The
   same registry and the same disk state produced different request bytes.
3. `bench/metrics.mjs` accepted `unchanged="true"` plus a matching `revision`
   attribute as byte-exact recall. That is the defect that hid the first two.
   The measurement agreed with the projection instead of with the gold bytes,
   so the gates in `docs/EVALUATION.md` §8.1 and §8.2 read 1 on a request that
   contained none of the required code.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Before and after (deterministic Pi two-turn repro)

Board: `probe.ts` holding `export const marker = 'PCR_0079_CURRENT';\n` repeated
40 times (1640 bytes), one official whole-file `read` on turn 1, no disk edit
between turns, `budgetChars` well above the file. Metrics come from
`analyzeCapture` over the turn-2 projection with `probe.ts` as the required unit.

| | turn 1 projection bytes | turn 2 projection bytes | turn-2 body copies | turn-2 `unchanged="true"` | `requiredRecall` | `exactCurrentRate` | `staleBytes` |
|---|---|---|---|---|---|---|---|
| before (main @ `8875cd7`) | 2060 | 394 | 0 | yes | 1 | 1 | 0 |
| after (this branch) | 2060 | 2060 | 1 | no | 1 | 1 | 0 |

Both rows were measured on this board through `createPiAdapter` from
`adapters/pi/replay.mjs`, the "before" row against a `git archive 8875cd7`
extraction of main. Byte counts scale with the probe body, so the absolute
numbers are board-specific. The turn-2 marker-only size of 394 is not, because a
marker-only frame carries no body.

Before the fix, both correctness numbers came from the revision attribute. After
the fix, both come from the bytes in the request. The `requiredRecall=1` and
`exactCurrentRate=1` on the "before" row is the false reading, not a pass.

`test/pcr-0079-stateless-request-bodies.test.mjs` also feeds a hand-built
marker-only frame straight into `analyzeCapture`. It now scores
`requiredRecall=0` and `exactCurrentRate=0`, so the shortcut cannot come back
without failing a test.

## What we did

- `src/projector.mjs` renders `unit.content` unconditionally. `renderUnit` lost
  its options argument, `content-bytes` is the UTF-8 length of the rendered
  body, the `unchanged` attribute is gone, and `projectContext` no longer
  returns `injectedRevisions`.
- `src/engine.mjs` dropped the `lastInjectedRevision` parameter and the
  post-projection mutation. `project()` is a pure function of the registry, the
  turn, the task, and the budget again.
- `bench/metrics.mjs` compares `sha256(unit.content)` against
  `sha256(goldBytes)` and nothing else. `extractCodeUnits` stopped carrying
  `revision` and `unchanged` into the metric path.
- `adapters/pi/replay.mjs` and `adapters/pi/extension.ts` no longer hold a
  per-process revision map. The Pi adapter surface lost the
  `lastInjectedRevision` property.
- `adapters/hermes/bridge.mjs` strips `lastInjectedRevision` from any state file
  it loads, so an obsolete key written by PCR 0077 is dropped on the next
  ordinary state write. `selectContext` is read-only again and writes no state
  file at all.
- `test/helpers/adapter-holdout-parity.mjs` compares adapter and core
  `projectionBytes` for equality instead of `<=`, and hashes real unit content
  plus per-turn envelope blocks instead of a digest-or-content fallback.
- `test/pcr-0079-stateless-request-bodies.test.mjs` adds four boards. Deleted
  `test/pcr-0077-skip-unchanged-inject.test.mjs`, whose five boards asserted the
  removed behavior.
- `test/pcr-0078-cat-tracked-read.test.mjs` large-workspace turn-2 board now
  asserts current bodies and equal bytes. Four more suites lost their `<=`
  projection-bytes allowance (`test/pi-adapter.test.mjs`,
  `test/hermes-adapter.test.mjs`, `test/budget-pressure-adapter-prune.test.mjs`,
  `test/holdout-adapter-bakeoff.test.mjs`).

Did **not** edit `src/anchors.mjs`, holdout gold, score weights, thresholds,
held-out splits, or any hash-pinned report.

Not a paper result. Not SOTA. Gold language-agnostic.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| targeted adapter suite | yes | 0 | **48 pass**, 0 skip, 0 fail |
| `npm test` | yes | 0 | **234 pass**, **22 skip**, **0 fail** (256 total; −1 vs 0078) |
| `npm run check` | yes | 0 | syntax check across core, bench, scripts, adapters |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; all four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged; all six hard gates true |
| `npm run papers:verify` | yes | 0 | manifest sha256 `442cd9e2…` |

The targeted suite is:

```bash
node --test test/pi-adapter.test.mjs test/hermes-adapter.test.mjs \
  test/adapter-request-prune.test.mjs test/budget-pressure-adapter-prune.test.mjs \
  test/holdout-adapter-bakeoff.test.mjs test/pcr-0078-cat-tracked-read.test.mjs \
  test/pcr-0079-stateless-request-bodies.test.mjs
```

The test count falls by one because five PCR 0077 boards were deleted and four
PCR 0079 boards were added.

## Metric snapshot

| metric | PCR 0078 ledger | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| paper-manifest digest | `442cd9e2…` | `442cd9e2…` | 0 |
| npm test pass | 235/235 runnable | 234/234 runnable | −1 test |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |

The core score and payload hash are unchanged because the core ctxbench path
never passed `lastInjectedRevision`. PCR 0077 was opt-in at the adapter, which
is exactly why the synthetic score could not see it.

## Byte tradeoff

This repair makes repeated requests larger. That is the intended direction.

| board | turn-2 bytes before | turn-2 bytes after |
|---|---|---|
| Pi two-turn probe (40 lines, 1640-byte body) | 394 | 2060 |
| PCR 0078 large workspace (20 modules + 64k file) | 5036 | equal to turn 1 (PCR 0078 recorded turn 1 at 26 593) |

PCR 0077 read those smaller numbers as a prefix-cache win. This PCR makes no
prefix-cache claim in either direction. Provider cache tokens were not measured
here, and `docs/ARCHITECTURE.md` already treats them as an external measurement
rather than something inferred from byte counts. Fewer bytes that omit the code
the model needs are not a saving.

## Replay proof (synthetic)

| test | claim locked |
|---|---|
| Pi stateless bodies | one current body copy in the request and in the projection on turn 1 and turn 2; no `unchanged="true"` |
| Hermes stateless bodies | same on two consecutive `select_context` calls against one state file |
| Hermes state cleanup | a state file containing `lastInjectedRevision` loses the key on the next ordinary write |
| metric honesty | a marker-only frame scores `requiredRecall=0` and `exactCurrentRate=0` |
| adapter/core parity | Pi and Hermes `projectionBytes` equal live core `freshctx-region`, no longer merely `<=` |

## Merged with review: process anomaly

PCR 0077 and PCR 0078 both carry `Decision: review (do not merge)`. PCR 0078 is
on `main` as `8875cd7`, and PCR 0077 is on `main` as `fc0924e` underneath it.
A `review` decision did not stop either from landing, so the defect reached the
default branch with its own record saying it should not have.

Two facts make the window worse. The metric shortcut landed in the same commit
as the behavior it excused, so no gate disagreed with the change. And the
adapter-only opt-in kept `AUTORESEARCH_SCORE` and the ctxbench payload hash
frozen, so the ledger rows for 0077 and 0078 look clean.

Nothing in the repository currently enforces `review`. This PCR records the
anomaly and does not fix it. A branch-protection or CI check that refuses a
merge while the newest PCR says `review` is the smallest structural fix, and it
belongs in its own change.

## Conflicts with constitutions

**Yes, retroactively against PCR 0077.**

- `SOUL.md` invariant 2 says a tracked unit appears "at most once in full in a
  request projection". A marker-only frame satisfies the literal upper bound by
  appearing zero times in full. The invariant is meant to forbid duplicate
  copies, not to permit zero copies of a selected unit. This PCR reads the pair
  of invariants as requiring exactly one current copy per selected unit, and the
  code now enforces that.
- `docs/EVALUATION.md` §8.1 and §8.2 define precision and recall over
  `bytes(p)`, the projected bytes. PCR 0077's change to `bench/metrics.mjs`
  scored a revision attribute as if it were those bytes.
- `SOUL.md` invariant 7 forbids benchmark edits during a run. The 0077 metric
  change was a change to the measurement surface, made in the same commit as the
  implementation it measured. It was labeled a semantic-parity change rather
  than a benchmark edit.

The stateless rule is now written down in `README.md`,
`docs/ARCHITECTURE.md`, and both adapter readmes. Selected current bytes must be
present in each provider request. A digest or a prior request is not content.

## Limitations

- A file larger than the selection budget can still be omitted. The default
  adapter budget is 32 768 chars, so a 39 kB file does not fit and stays
  budget-omitted with explicit omission metadata. That is a budget and selection
  limitation, not a freshness defect, and this PCR does not address it.
- PCR 0078 shell tracking is unchanged. Cat-class reads are still tracked
  through the same path, with the same conservative parser.
- Repeated requests are larger than they were on `main` @ 0078. Anyone reading
  the 0077 or 0078 byte tables for a cost estimate should use this PCR instead.
- No provider cache measurement exists on either side of the change, so the
  effect on prefix reuse is unknown rather than neutral.
- Pi restart still clears the in-process registry and `callToUnit` map. Removing
  `lastInjectedRevision` did not change that.
- Holdout v0.1 remains an unsealed regression pack. Adapter parity now asserts
  byte equality with live core on it, which is a stronger regression check on
  unsealed data, not a sealed result.

## Protocol gap?

**No.** Core plus adapters plus one metric-honesty fix. The door, the locks, the
ctxbench payload hash, the synthetic score, the holdout gold, and every
hash-pinned report are untouched.

## Next measurement

Instrument one live Pi two-turn session against a provider that reports cached
input tokens, and record the cached-token count with and without FreshCtx at
equal projection bytes. That is the only way to settle whether PCR 0077's
premise had anything in it, and it requires a real provider counter rather than
a byte count.
