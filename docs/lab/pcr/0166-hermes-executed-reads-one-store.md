# PCR 0166 — Hermes executed-read store is one per process; the context-engine loader's hook no-op no longer strands the unit

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0166-hermes-executed-reads-one-store-7bae` / draft against `main`
- Base SHA: `8504ff90958ad8c154470ac04081c72a74ac4150` (PCR 0165; public count 161)
- Commits: red `test(hermes): red test for post_tool_call store across Hermes' two plugin loaders`, then `fix(hermes): keep one executed-read-args store per process`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold; no `--relock`)
- Host: Hermes Agent `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` (`bench/hosts.lock.json`), cloned to `/tmp/hosts/hermes` and installed with `uv pip install -e` into `/tmp/hermes-venv` on this Cloud Agent
- Result labels used: `synthetic`; `adapter-only`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker's live run on dest `/workspace/freshctx-measure-8504ff90-ise` (PCR
0165 on `main`, WASM 205488 bytes, `FRESHCTX_ISOLATED_SEMANTIC_ENGINE` unset,
DeepSeek v4 flash, `HERMES_TRIAL_PROTOCOL=cli`) still printed
`resolution=none` and `hasFreshCtxUnit false` on every `freshctx-ts` Hermes
cell t1–t4, with `hostReadArgsMatched=true` and the recorded `read_file`
path on the `.work` fixture. The recorded path is post-force (PCR 0165
limitation), so the persisted path was still unknown from the summary.

**Cause (measured on the locked host, no model):** Hermes imports
`adapters/hermes/__init__.py` more than once, and only some copies get a real
hook.

1. `agent_init` first calls `plugins.context_engine.load_context_engine("freshctx")`,
   which scans the *Hermes repo's* `plugins/context_engine/<name>/`. The live
   host clone has `hosts/hermes/plugins/context_engine/freshctx -> adapters/hermes`
   (`docs/lab/live-2026-08-22/commands.txt`, line 3). That loader executes the
   module as `plugins.context_engine.freshctx` and calls `register()` with an
   `_EngineCollector` whose `register_hook` **is a no-op**
   (`plugins/context_engine/__init__.py`). This copy's engine serves every
   `select_context` and `on_turn_complete`. Its store is never written.
2. The general plugin manager then scans `HERMES_HOME/plugins`, finds the
   user plugin `freshctx` (and the category key `context_engine/freshctx`
   under the same enabled name), imports each as its own module, and their
   `register_hook("post_tool_call", …)` calls are real. Their hooks fire on
   every read and write executed arguments into *their* module-level dicts.

The PCR 0165 store was module-level, so the hook filled a dict the serving
engine never read. Every bridge payload carried `executedReadArgsByCallId: {}`,
the bridge fell back to the persisted dest-root path, `safeWorkspaceFile`
threw, the unit went `source-error`, and the envelope had no
`<freshctx-unit>`. This is the pre-0165 symptom under a layout 0165 did not
test: the 0165 Cloud Agent venv had no `plugins/context_engine/freshctx` in
the Hermes repo, so its engine came from the general plugin loader and shared
a module with the hook.

Hypotheses in the task that were checked and discarded: the dumps are the
right ones and include the envelope (scan reads every new `NNN.json`); the
Isolated Semantic Engine does not fail after a successful path (same probe
with engine and hook in one module isolates `settleDailyLedger`); the
executed fixture path is exactly what the force plugin records. The
"plugin loaded from host clone" hypothesis is half right: the bridge runs from
`/tmp/hosts/hermes/plugins/context_engine/freshctx/bridge.mjs` (symlink into
the checkout), so the code is the dest's, but the loader path decides whether
the hook can reach the engine.

**Fix (smallest coherent):** `record_executed_read_args` and `_call_bridge`
share one process-wide store, a `sys.modules` entry
(`freshctx_hermes_executed_read_args`), instead of a module global. Whichever
copy's hook fires, the serving copy reads the same dict, and one successful
`observe` clears it for every copy. No bridge, harness, `src/`, door, or lock
change.

## What we did

1. Read the Hermes lifecycle at the locked commit: `agent_init` engine
   selection (`load_context_engine` first, `get_plugin_context_engine` as
   fallback, `copy.deepcopy`), `plugins/context_engine/__init__.py`
   `_load_engine_from_dir` and `_EngineCollector` (no-op `register_hook`),
   `hermes_cli/plugins.py` `_scan_directory_level` (flat and category keys),
   `_directory_module_name`, `_load_plugin`, and `register_hook`.
2. Probe outside the repo (`/tmp/pcr0166/probe_two_loaders.py`): loaded the
   plugin twice under the two loader module names against the real bridge and
   Tree-sitter. Engine from the context-engine copy, hook from the plugin copy:
   `hasFreshCtxUnit false`, no `isolated-semantic-engine`. Control with engine
   and hook from one copy: `true` / `true`.
3. Installed Hermes `999703f` into `/tmp/hermes-venv`, symlinked
   `/tmp/hosts/hermes/plugins/context_engine/freshctx -> /workspace/adapters/hermes`
   (the live host layout), prepared `HERMES_HOME` with the trial's
   `prepareHermesHome` / `hermesEnvForArm` / `runCliQuery`, and drove
   `hermes --in <work> chat -q … --provider openai-api --model deepseek-v4-flash`
   against a scripted Responses SSE provider (function_call `read_file` with
   the persisted dest-root path, then `SETTLE=ST0`). A `FRESHCTX_NODE` wrapper
   logged every bridge stdin.
4. Reproduced before the fix: `agent.log` shows `Plugin 'freshctx' registered
   context engine` for `context_engine/freshctx` and the `already registered`
   warning for `freshctx`; the force plugin recorded the `.work` path; the
   persisted `function_call` arguments are `<dest>/src/settlement.ts`; all
   three bridge payloads `executedReadArgsByCallId: {}`; t1 last dump
   `resolution none`, `hasFreshCtxUnit false`.
5. Red tests: `test/pcr-0166-hermes-executed-reads-one-store.test.mjs`
   (`# tests 2` `# pass 1` `# fail 1`, `false !== true` on `hasFreshCtxUnit`)
   and `OneStorePerProcess` in `test/python/test_hermes_engine.py`
   (`Ran 7 tests` `FAILED (failures=1)`, `{} != {'call_1': …}`).
6. Fix in `adapters/hermes/__init__.py`; both tests green; the probe prints
   `hasFreshCtxUnit true`, `isolatedSemanticEngine true`.
7. Reran the host run after the fix: t1 payloads 2 and 3 carry
   `executedReadArgsByCallId: {"call_scripted_read": {"path": "<work>/src/settlement.ts", "scope": "symbol", "selector": "settleDailyLedger"}}`;
   t1 last dump `isolated-semantic-engine`, `hasFreshCtxUnit true`. A t2
   `--continue` process after flipping ST0→ST1 sent `{}` (new process) and
   resolved from state: `isolated-semantic-engine`, `exactCurrentBytes true`,
   `siblingBytesInRequest false`. `stalePriorBytes true` on t2 is the model's
   own prior reply `SETTLE=ST0` in history, not FreshCtx bytes.
8. Updated `adapters/hermes/README.md`, wrote this PCR, appended INDEX and
   METRICS rows, bumped the public PCR count to 162 (files on disk), and added
   the sharp-edge row in `docs/ARCHITECTURE.md`.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter | host read |
|---|---|---|---|
| `freshctx-ts` | yes | on (default factory, real runner) | `read_file` executed on `<work>/src/settlement.ts`; persisted path `<dest>/src/settlement.ts` |

Host run with a scripted provider. No model. Not a paper result. The
`nothing` arm is not in this record (`normalizeResolution` prints `none` for it
by design).

## Turns (scripted host run, before → after)

| turn | mutate | bridge `executedReadArgsByCallId` | before | after |
|---|---|---|---|---|
| 1 `t1-read` | none | `{}` → executed `.work` path | `none`, `hasFreshCtxUnit false` | `isolated-semantic-engine`, `hasFreshCtxUnit true` |
| 2 `t2-settle` (`--continue`) | ST0→ST1 | `{}` (new process; resolves from state) | not run | `isolated-semantic-engine`, `ST1` present, `SW0` absent |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ise:install` | yes | 0 | `added 8 packages`; `web-tree-sitter` WASM present |
| `node --test test/pcr-0166-hermes-executed-reads-one-store.test.mjs` (before fix) | yes | 1 | `# tests 2` `# pass 1` `# fail 1` |
| `npm run test:py` (before fix) | yes | 1 | `Ran 7 tests` `FAILED (failures=1)` |
| `node --test test/pcr-0166-hermes-executed-reads-one-store.test.mjs` (after fix) | yes | 0 | `# tests 2` `# pass 2` `# fail 0` |
| `npm run test:py` (after fix) | yes | 0 | `Ran 7 tests` `OK` |
| scripted Hermes host run, host-clone `context_engine/freshctx` symlink (before fix) | yes | 0 | 3 bridge payloads `{}`; t1 last dump `none` |
| scripted Hermes host run, same layout (after fix) | yes | 0 | t1 `isolated-semantic-engine`; t2 `--continue` `isolated-semantic-engine`, `ST1` present |
| `npm test` | yes | 0 | `# tests 744` `# pass 744` `# fail 0` `# skipped 0` |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention` 5/5 |
| `git fetch origin main && npm run ci` | yes | 0 | `check`, `test` 744/744, `test:docs`, `bench`, `ctxbench`, `evaluate`, `evaluate:check-docs`, `papers:list`, `test:py` 7 OK, `holdout:verify`, `holdout:ci-guard` |
| `npm run ctxbench:hermes-smoke` | no | n/a | not on this record |
| live dest remesure | no | n/a | not this record's job; official table hold |

## Metric snapshot

| metric | before | after | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| `npm test` | 742 / 742 / 0 | 744 / 744 / 0 | +2 tests |
| `test:py` | 6 OK | 7 OK | +1 test |
| scripted host t1 dump `resolution` (host-clone context-engine layout) | `none` | `isolated-semantic-engine` | closed |
| scripted host t1 bridge `executedReadArgsByCallId` | `{}` | executed `.work` path | closed |
| official accepted TAP | 549 / 0 / 0 / 549 | 549 / 0 / 0 / 549 | hold |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `4a953591…` | `4a953591…` | 0 |

Label: `synthetic`. No dollars. No Pass@1. No cheaper-intelligence claim.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

None observed. Keeps "Never inject last-known content when current resolution
fails" (a missing path still stays unresolved when no copy's hook fired).
Keeps "Adapters must preserve native assistant-tool/tool-result pairing" (the
persisted call is untouched). Core stays host-neutral: the change is one
Python function in `adapters/hermes/`. No payload or state field changed.

## Limitations

- Dest dumps were not mounted on this Cloud Agent. The host-clone layout was
  reconstructed from `docs/lab/live-2026-08-22/commands.txt`; the Thinker's
  `agent.log` (`registered context engine` lines) and a `t1-read.json`
  `requests[].hasFreshCtxUnit` on a dest checkout of this branch are the
  confirmation.
- If the live host clone's `plugins/context_engine/freshctx` symlink points at
  a FreshCtx checkout older than PCR 0165, that engine has no
  `executedReadArgsByCallId` at all and nothing in the dest overlay can help.
  The symlink target is worth printing in the next remesure.
- The `sys.modules` store is process-wide. Two Hermes agents in one process
  share it; keys are `tool_call_id`, which Hermes issues per call, and the
  bridge persists them per session state file.
- The general plugin loader still imports the plugin twice
  (`freshctx` and `context_engine/freshctx`) and warns `already registered`.
  Harmless with a shared store; the install layout could drop one link in a
  separate change.
- `stalePriorBytes` on t2 reads the model's own prior `SETTLE=ST0` reply. The
  scan's marker substring check does not distinguish reply text from tool
  bytes.

## Next measurement

Rerun `node docs/lab/multi-turn-trial/auto-rpc.mjs --host=hermes` on a dest
checkout of this branch with the same host clone, and read `freshctx-ts`
t1–t4 `resolution` and `requests[].hasFreshCtxUnit`. Print
`readlink -f hosts/hermes/plugins/context_engine/freshctx` next to the
summary.
