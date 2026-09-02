# PCR 0162 — Hermes bridge fails open when it tracked nothing; Python honours `applied`

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent (executing `plans/004-hermes-bridge-fail-open-when-nothing-tracked.md`)
- Branch / PR: `grok/plan-004-hermes-fail-open` / draft, stacked on `grok/plan-003-no-stale-inline`
- Commit: fix commit `fix(hermes): fail open when no unit was tracked; Python honours applied` on top of plan base `fd523eb`
- Paper-manifest digest (if research work): unchanged (not research work)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- Result labels used: `synthetic`
- Decision: **accept** (host-boundary invariant fix; Hermes path is not on the apex evaluate path)

## Hypothesis or change

When the Hermes bridge sees read tool calls but cannot track any of them
(for example `cat`/`head`/`tail` shell reads whose `cwd` is not the tree the
reads were made in — the PCR 0159 situation), it must return the host's
request unchanged instead of pruning every read pair against an empty
projection; and the Python plugin must treat `applied !== true` as "do not
replace".

## What we did

1. Red test appended to `test/hermes-bridge.test.mjs`: one `bash`
   `cat elsewhere/source.ts` read whose file does not exist under `cwd`,
   followed by a second user turn. Before the fix the bridge returned
   `applied: false` with **three** messages instead of four — the assistant
   tool call and its tool result were dropped and an empty
   `<freshctx turn="0" selected="0" unresolved="0" budget-omitted="0">`
   envelope was appended (`# fail 1`).
2. In `adapters/hermes/bridge.mjs` `selectContext`, immediately after
   `engine.refresh(...)`, added an early return when `unitsByCall.size === 0`:
   clears pending injected revision and pending read disposition (the same two
   helpers the other early returns use), saves state, and returns
   `payload.messages` with `applied: false`, `selected: 0`, `unresolved: 0`,
   empty `projectionText`.
3. In `adapters/hermes/__init__.py` `select_context`, replaced
   `selected = result.get("messages") if result else None` with a guard that
   returns `None` unless `result` is a dict and `result.get("applied") is True`.
   Returning `None` tells Hermes to keep its own request.
4. Added `test/python/__init__.py` and `test/python/test_hermes_engine.py`
   (three `unittest` cases with a stubbed `agent.context_compressor`
   module). Wired `npm run test:py`, added `adapters/hermes/__init__.py` to
   the `check` script's `py_compile` list, and added a "Hermes Python unit
   tests" CI step after "Hermes Python scaffold compiles".
   Deviation from the plan text: `test:py` is
   `python3 -m unittest discover -s test/python -p 'test_*.py'` rather than
   `python3 -m unittest test/python/test_hermes_engine.py`, because the repo's
   `test/` directory has no `__init__.py` and the dotted name `test.python.*`
   resolves to the Python stdlib `test` package (`ModuleNotFoundError:
   No module named 'test.python'`). Discovery rooted at `test/python` imports
   the file directly. Verified red against the pre-fix `__init__.py`
   (`test_applied_false_returns_none` FAILED) and green after.
5. Wrote this record, appended INDEX / METRICS rows, bumped the public PCR
   count to 158 in `README.md` and `docs/ARCHITECTURE.md`.
6. Did not touch `adapters/request-prune.mjs` pruning (PCR 0037/0083 intent
   kept), `observeTurn()`, the state-file format, the `paths.length === 0`
   early return, `install.mjs`, `plugin.yaml`, or `verify-layout.mjs`.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/hermes-bridge.test.mjs` (before fix) | yes | 1 | `# pass 1` `# fail 1` — three messages returned, pair dropped |
| `node --test test/hermes-*.test.mjs test/pcr-*hermes*.test.mjs` (after fix) | yes | 0 | `# tests 101` `# pass 101` `# fail 0` (includes PCR 0105 host wiring and PCR 0159 dest-cwd) |
| `npm run test:py` | yes | 0 | `Ran 3 tests` `OK` |
| `python3 -m py_compile adapters/hermes/__init__.py` | yes | 0 | now part of `npm run check` |
| `npm test` | yes | 0 | `# tests 723` `# pass 723` `# fail 0` `# skipped 0` |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention` 5/5; hard gates pass |
| `npm run ctxbench` | no | n/a | run once at the top of the stack |
| `npm run demo` | no | n/a | not required by plan 004 |
| `npm run repos:verify` | no | n/a | not on this branch |
| `npm run ctxbench:smoke` | no | n/a | not on this branch |

## Metric snapshot

| metric | before (plan base) | after (this PCR) | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| bridge messages returned, untrackable read (synthetic) | 3 (pair dropped + empty envelope) | 4 (deep-equal to input) | fail-open restored |
| Python `select_context` on `applied: false` | pruned list handed to Hermes | `None` (host keeps request) | fail-open restored |
| door blob | `f8771c93…` | `f8771c93…` | 0 |

Label: `synthetic`.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

none observed. Enforces `AGENTS.md` "Adapter failure must return the original
host request unchanged" and the ARCHITECTURE failure-matrix row.

## Limitations

"No reads" and "reads but nothing tracked" are now both `applied: false`;
telemetry consumers (`adapters/hermes/replay.mjs`) already key on `applied`
and need no change. The bridge is still silent on stderr when it fails open
(stderr currently means fatal); a diagnostic line is deferred. The Python test
stubs Hermes' `ContextCompressor`; it does not exercise a real Hermes host.

## Next measurement

Re-run the PCR 0159 dest-cwd live scenario with this bridge and confirm the
host's own request (all read pairs intact) reaches the provider when `cwd` is
wrong, instead of a request with every read pair removed.
