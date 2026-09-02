# PCR 0165 — Hermes observes reads by executed arguments; `pre_tool_call` `modify` no longer hides the fixture path

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0165-ise-symbol-resolution-b672` / draft against `main`
- Base SHA: `bcc48a3fcf47ef687875a58f5b67479e57f85ecc` (PR 174 merge; PCR 0161–0164; public count 160)
- Commits: red `test(hermes): red test for executed read args after pre_tool_call modify`, then `fix(hermes): observe reads by executed arguments from post_tool_call`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold; no `--relock`)
- Host: Hermes Agent `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` (`bench/hosts.lock.json`), installed from the locked clone into a venv on this Cloud Agent
- Result labels used: `synthetic`; `adapter-only`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker's live run on dest `/workspace/freshctx-measure-bcc48a3f-ise` (merge
`bcc48a3f`, `npm run ise:install` exit 0, WASM and grammars present,
`FRESHCTX_ISOLATED_SEMANTIC_ENGINE` unset) printed `resolution=none` on every
`freshctx-ts` Hermes row, t1 through t4, while the model still answered. The
`nothing` arm prints `none` by construction (`normalizeResolution`) and is not
a bug.

**Cause (measured on the locked Hermes host, no model):** the trial's
force-host-read plugin answers Hermes `pre_tool_call` with a `modify`
directive that redirects the executed `read_file` to the `.work` fixture
(`hostReadToolArgs`, PCR 0143). Hermes executes with the modified arguments and
persists the model's original `tool_calls[].function.arguments`
(`agent_runtime_helpers.invoke_tool`, `chat_completion_helpers.build_assistant_message`).
The recorded tools log is written from the *post-force* event
(`force-host-read-hook.mjs` `forcedArgsFromEvent` after
`hermesPreToolCallDirective` mutated it), so `hostReadArgsMatched=true` and
`tools=1` cannot see the discrepancy. Hermes' `read_file` result
(`ReadResult.to_dict()`) carries `content`, `total_lines`, `file_size`, no path.

The bridge read the persisted path (`<dest>/src/settlement.ts`, absent),
`safeWorkspaceFile` threw, `refresh` marked the unit `source-error`, the
policy omitted it, and the envelope printed
`<freshctx turn="0" selected="0" unresolved="1" budget-omitted="0">` with no
`<freshctx-unit>`. `resolutionFromStringifiedPayload` then prints `none`. The
Isolated Semantic Engine runner was never called; it parses the fixture and
isolates `settleDailyLedger` (lines 40–50) when asked.

The hypotheses in the task were checked and discarded: the adapter does put
`resolution="isolated-semantic-engine"` into the request body when the tracked
path resolves (scripted host run, symbol arguments); the runner is invoked and
succeeds on the fixture; isolate does not fail closed on `settleDailyLedger`.

**Fix (smallest coherent):** Hermes `post_tool_call` is the one hook where the
executed arguments and the `tool_call_id` meet. The plugin records executed
read arguments there (`record_executed_read_args`, module-level store because
`agent_init` deep-copies the registered engine per agent), sends them to the
bridge as `executedReadArgsByCallId` on every `observe` and `select`, clears
them after a successful `observe`. The bridge merges them into the session
state (`state.executedReadArgsByCallId`, additive field) and `discoveredCalls`
prefers the executed arguments over the persisted call. A later host process
(CLI `--continue`, empty in-memory store) resolves from state. Without executed
arguments a missing persisted path stays unresolved; nothing is guessed.

Not done here: no harness change to the force plugin, no `src/` change, no
door or lock change, no dest remesure, no live model.

## What we did

1. Read the Hermes lifecycle at the locked commit: `_apply_context_engine_selection`,
   `_dispatch_pre_tool_call_hooks`, `_emit_post_tool_call_hook`,
   `build_assistant_message`, `read_file_tool`, `get_plugin_context_engine` deep copy.
2. Installed Hermes `999703f` from `bench/hosts/hermes` into `/tmp/hermes-venv`
   and drove `hermes --continue --in <work> chat -q … --provider openai-api --model deepseek-v4-flash`
   through `prepareHermesHome` / `hermesEnvForArm` / `cliQueryArgs` against a
   scripted Responses provider (function_call then text). A `FRESHCTX_NODE`
   wrapper logged every bridge stdin/stdout.
3. Reproduced: persisted path `<dest>/src/settlement.ts` → every select
   `applied true selected 0 unresolved 1`, envelope without a unit, dump scan
   `none` at t1's last request and at t2. Control runs with the fixture path
   (symbol and whole-file arguments) printed `isolated-semantic-engine`.
4. Red tests: `test/pcr-0165-hermes-executed-read-args.test.mjs`
   (`# tests 4` `# pass 2` `# fail 2`) and three cases in
   `test/python/test_hermes_engine.py` (`Ran 6 tests` `FAILED (errors=3)`).
5. Fix in `adapters/hermes/__init__.py`, `adapters/hermes/bridge.mjs`,
   `adapters/hermes/replay.mjs`. First revision stored the args on the engine
   instance; the host run still showed `executedReadArgsByCallId: {}` because
   Hermes deep-copies the engine. Moved the store to module level; the host
   run then closed.
6. Reran the host repro after the fix: t1 last request
   `resolution isolated-semantic-engine hasUnit true`; t2
   `isolated-semantic-engine`, `ST1` present, `SW0` absent; the t2 process
   received `executedReadArgsByCallId: {}` and resolved from state.
7. Wrote this PCR, appended INDEX / METRICS, bumped the public PCR count to 161
   (files on disk), added the sharp-edge row in `docs/ARCHITECTURE.md`, and
   documented the hook in `adapters/hermes/README.md`.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter | host read |
|---|---|---|---|
| `freshctx-ts` | yes | on (default factory, real runner) | `read_file` executed on `.work/hermes/freshctx-ts/src/settlement.ts`; persisted path `<dest>/src/settlement.ts` |

Host replay with a scripted provider. No model. Not a paper result.
The `nothing` arm is not in this record.

## Turns (scripted host run, before → after)

| turn | mutate | persisted `read_file` path | before | after |
|---|---|---|---|---|
| 1 `t1-read` | none | `<dest>/src/settlement.ts` | last dump `none`, `hasUnit false`, envelope `selected="0" unresolved="1"` | `isolated-semantic-engine`, `hasUnit true` |
| 2 `t2-settle` | ST0→ST1 | (same call) | `none`, `ST1 false` | `isolated-semantic-engine`, `ST1 true`, `SW0 false` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ise:install` | yes | 0 | Cloud Agent checkout; `web-tree-sitter` 0.25.10, `tree-sitter.wasm` 205488 bytes |
| `node ise/treesitter/parse.mjs` on the fixture | yes | 0 | 13 units, `settleDailyLedger` 40–50, `error null` |
| `node --test test/pcr-0165-hermes-executed-read-args.test.mjs` (before fix) | yes | 1 | `# tests 4` `# pass 2` `# fail 2` |
| `npm run test:py` (before fix) | yes | 1 | `Ran 6 tests` `FAILED (errors=3)` |
| `node --test test/pcr-0165-hermes-executed-read-args.test.mjs` (after fix) | yes | 0 | `# tests 4` `# pass 4` `# fail 0` |
| `npm run test:py` (after fix) | yes | 0 | `Ran 6 tests` `OK` |
| scripted Hermes host run, `destroot` variant (after fix) | yes | 0 | t1 and t2 dumps `isolated-semantic-engine` |
| `npm test` | yes | 0 | `# tests 742` `# pass 742` `# fail 0` `# skipped 0`; zero `isolated-semantic-engine-missing` lines |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention` 5/5 |
| `git fetch origin main && npm run ci` | yes | 0 | `check`, `test` 742/742, `test:docs` 11/11, `bench`, `ctxbench`, `evaluate`, `evaluate:check-docs`, `papers:list`, `test:py` 6 OK, `holdout:verify`, `holdout:ci-guard` `valid: true` |
| `npm run ctxbench:hermes-smoke` | no | n/a | not on this record |
| live dest remesure | no | n/a | not this record's job; official table hold |

A first `npm test` in the same shell printed `# fail 12` (`hostReadToolArgs`
rows). The shell had `FRESHCTX_CWD` / `HERMES_TRIAL_WORKSPACE` exported from
the host repro; unsetting them gave 742/742. Not a code failure.

## Metric snapshot

| metric | before | after | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| `npm test` | 738 / 738 / 0 | 742 / 742 / 0 | +4 tests |
| `test:py` | 3 OK | 6 OK | +3 tests |
| scripted host t1/t2 dump `resolution` (persisted dest-root path) | `none` / `none` | `isolated-semantic-engine` / `isolated-semantic-engine` | closed |
| scripted host t2 sibling `SW0` in request | absent (no unit at all) | absent (symbol isolated) | 0 |
| official accepted TAP | 549 / 0 / 0 / 549 | 549 / 0 / 0 / 549 | hold |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `4a953591…` | `4a953591…` | 0 |

Label: `synthetic`. No dollars. No Pass@1. No cheaper-intelligence claim.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

None observed. Keeps "Never inject last-known content when current resolution
fails" (a missing path stays unresolved without executed arguments). Keeps
"Adapters must preserve native assistant-tool/tool-result pairing" (the
persisted call is untouched; only what the bridge tracks changes). Keeps the
core host-neutral: the change is in `adapters/hermes/` only.
`executedReadArgsByCallId` is an additive state and payload field.

## Limitations

- Dest dumps were not mounted on this Cloud Agent. The cause was reproduced on
  the locked host with a scripted provider, not re-measured on dest. The dest
  `t1-read.json` `requests[].hasFreshCtxUnit` field would confirm the envelope
  shape there.
- The recorded tools log still shows post-force arguments, so the harness's
  `hostReadArgsMatched` says nothing about the persisted path. A harness
  record of the pre-force arguments is a separate change.
- `post_tool_call` requires a Hermes with `register_hook` on the plugin
  context and the executed-args payload (`999703f` has both). On an older
  host the store stays empty and behavior equals the pre-fix state.
- The plugin is discovered twice under the installed layout
  (`plugins/context_engine/freshctx` and `plugins/freshctx`); the second
  module's hook writes to a store nobody reads. Pre-existing; harmless.
- In a scripted control run where t2 re-read the whole file, the whole-file
  unit brought `SW0` back into the request next to the symbol unit. Not this
  record's leftover; noted for the next one.

## Next measurement

Rerun `node docs/lab/multi-turn-trial/auto-rpc.mjs --host=hermes` on a dest
checkout of this branch and read `resolution` on `freshctx-ts` t1–t4 together
with `requests[].hasFreshCtxUnit`. Expect `isolated-semantic-engine` where the
model's persisted `read_file` path was the dest root.
