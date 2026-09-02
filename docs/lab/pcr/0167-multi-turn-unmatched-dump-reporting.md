# PCR 0167 — The multi-turn measure table read the dump proxy's 404 records; `freshctx-ts` t1–t4 resolved all along

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0167-hermes-engine-registered-0640` / draft against `main`
- Base SHA: `2e524fed1b3c54ac06bc6f01b1bde6bfe23b010c` (PCR 0166; public count 162)
- Commits: red `test(hermes-trial): red test for HERMES_TRIAL_PROTOCOL, engine-registered fail-close, envelope scan`, red `test(multi-turn): red test for unmatched dump records in the turn request list`, then `fix(multi-turn): report the turn's provider dumps, not the proxy's 404 records`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold; no `--relock`)
- Host: Hermes Agent `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` (`bench/hosts.lock.json`), cloned to `/tmp/hosts/hermes` and installed with `uv pip install -e` into `/tmp/hermes-venv` on this Cloud Agent
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker's live run on dest `/workspace/freshctx-measure-2e524fed-ise` (PCR 0166
on `main`, WASM 205488 bytes, `ise:install` exit 0,
`FRESHCTX_ISOLATED_SEMANTIC_ENGINE` unset, DeepSeek v4 flash,
`HERMES_TRIAL_PROTOCOL=cli`) exited 0 in 81048 ms and still printed
`resolution=none` on `freshctx-ts` t1–t4, with `hostReadArgsMatched=true`, the
recorded `read_file` on the `.work` fixture, `hasFreshCtxUnit false` on every
request, and no `executedReadArgsByCallId` in 104 dumps per arm. The dest has no
`hosts/hermes` tree and the host clone has no
`plugins/context_engine/freshctx`, so the PCR 0166 live layout was absent here.

**Cause (measured on the locked host, scripted provider, no model): the
measure table was reading the dump proxy's 404 records.**

Hermes' `openai-api` overlay GETs `/api/v1/models` many times per turn. The
trial proxy answers 404 and persists a metadata record beside the payloads
(`writeUnmatchedDump` → `unmatched-NNN.json`, holding `method`, `url`,
`unmatched: true`, `at`, and no body). `auto-rpc.mjs` listed a turn's dumps by
globbing every `*.json` that was not a `*.scan.json`, so those records entered
`requests[]`. `cellRow` then read `requests.at(-1)`, which is an unmatched
record, so:

- `resolution` was `normalizeResolution(undefined)` → `none`;
- `exactCurrentBytes`, `stalePriorBytes`, `siblingBytesInRequest` were false;
- `requestBytes` mixed ~110-byte records into the turn's byte total.

Measured on this Cloud Agent, same layout as the dest (no
`plugins/context_engine/freshctx` anywhere; the adapter loads through Hermes'
general plugin loader): one `freshctx-ts` run wrote 6 provider dumps and 96
unmatched records in `requests/`, and every cell's request list ended on an
unmatched record. Its per-cell capture shows exactly one request with
`hasFreshCtxUnit true` inside each of t1–t4 while the row printed `none`. The
adapter had resolved from the first run; the table could not say so.

Hypotheses in the task that were checked and discarded. Live Hermes does import
the dest adapter: `HERMES_HOME/logs/agent.log` prints
`Plugin 'freshctx' registered context engine: freshctx` on this layout, from
the general plugin loader, and `prepareHermesHome` symlinks the checkout rather
than copying it (`installHermesPlugin`, `adapters/hermes/install.mjs`). PCR
0165 and PCR 0166 do run here: the bridge payloads carry
`executedReadArgsByCallId: {"call_scripted_read": {"path": "<work>/src/settlement.ts", …}}`
and the projection renders one symbol unit. The absence of
`executedReadArgsByCallId` in the dumps is expected: it is a bridge-stdin
field, never part of a provider payload.

**Fix (smallest coherent):** one predicate owns the dump-name rule
(`isProviderDumpName` in `docs/lab/hermes-trial-ts/proxy.mjs`, beside the two
writers), `listProviderDumps` keeps `NNN.json` only, and
`readDumpFunctionCallTools` drops its duplicate copy of the same regex. Two
fail-closed signals keep `none` from being ambiguous again: `launchHermes`
honors `HERMES_TRIAL_PROTOCOL`, and a `freshctx` arm whose `HERMES_HOME` log
carries no registered-context-engine line throws instead of printing a row. The
scan reports `hasFreshCtxEnvelope` apart from `hasFreshCtxUnit`.

No `src/`, adapter, bridge, bench, door, or lock change. No dest remesure. No
live model.

## What we did

1. Cloned Hermes `999703f`, installed it into `/tmp/hermes-venv`, and read the
   loader path this dest layout actually takes: `agent_init` calls
   `plugins.context_engine.load_context_engine("freshctx")` first, which finds
   nothing because the host repo has no `plugins/context_engine/freshctx`, then
   falls back to `hermes_cli.plugins.get_plugin_context_engine()` and
   `copy.deepcopy`. The engine and the firing `post_tool_call` hook come from
   the same module here, which is why PCR 0166's own symptom is absent.
2. Drove `hermes --in <work> chat -q … --provider openai-api --model deepseek-v4-flash`
   through `prepareHermesHome` / `hermesEnvForArm` / `runCliQuery` against a
   scripted Responses provider, with a `FRESHCTX_NODE` wrapper logging every
   bridge stdin. Result: `agent.log` prints `registered context engine: freshctx`
   plus the second loader's `already registered` warning, the force plugin
   records the `.work` path, the second bridge `select` payload carries the
   executed arguments, and the last provider dump prints
   `resolution="isolated-semantic-engine"` with `hasFreshCtxUnit true`.
3. Reproduced the reported symptom through the real harness. First run hung:
   `detectHermesProtocol` reads `acp` out of 999703f `--help`, `launchHermes`
   spawned `hermes --in <work> acp`, the adapter answered
   `ACP dependencies not installed`, and `auto-rpc` waited on an RPC that never
   came (10 minutes, zero dumps, `HERMES_TRIAL_PROTOCOL=cli` unread).
4. With the protocol honored, the harness finished and printed the dest
   symptom verbatim: `freshctx-ts` t1–t4 `resolution=none`,
   `requestBytes=87904,1310,89267,116,111,…` (27 / 25 / 25 / 25 entries per
   cell). Read the capture: each cell holds exactly one request with
   `hasFreshCtxUnit true`, and 96 of the files in `requests/` are
   `unmatched-NNN.json` GET `/api/v1/models` records.
5. Probed the discarded hypothesis directly. With `HERMES_SAFE_MODE=1` the
   engine never registers (`Context engine 'freshctx' not found — falling back
   to built-in compressor`), no bridge runs at all, and every dump prints
   `resolution=none` with no envelope. The old table could not distinguish that
   state from an unresolved unit.
6. Red tests: `test/pcr-0167-hermes-engine-registered.test.mjs` and
   `test/pcr-0167-provider-dump-names.test.mjs`, each `# fail 1` on `main`
   (`# tests 1` `# pass 0`, the harness has no symbol for the distinction).
7. Fix in `docs/lab/`; both tests green (`# tests 7` `# pass 7` `# fail 0`).
8. Reran the same harness command: t1–t4 `isolated-semantic-engine`,
   `requestBytes=87917,1310,89280` then a single payload per later turn.
9. Wrote this PCR, appended INDEX and METRICS rows, bumped the public PCR count
   to 163 (files on disk), and added the sharp-edge row in
   `docs/ARCHITECTURE.md`.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter | host read |
|---|---|---|---|
| `freshctx-ts` | yes | on (default factory, real runner) | `read_file` executed on `<work>/src/settlement.ts`, `scope=symbol`, `selector=settleDailyLedger` |

Host run with a scripted provider. No model. Not a paper result. The `nothing`
and `freshctx-no-ts` arms were not run on this record; `normalizeResolution`
prints `none` for `nothing` by design.

## Turns (same harness command, before → after)

| turn | mutate | requests in row (before → after) | resolution (before → after) |
|---|---|---|---|
| 1 `t1-read` | none | 27 → 3 | `none` → `isolated-semantic-engine` |
| 2 `t2-settle` | ST0→ST1 | 25 → 1 | `none` → `isolated-semantic-engine` |
| 3 `t3-settle` | ST1→ST2 | 25 → 1 | `none` → `isolated-semantic-engine` |
| 4 `t4-unchanged` | none | 25 → 1 | `none` → `isolated-semantic-engine` |

`exactCurrentBytes` on t2–t4 goes false → true. `stalePriorBytes true` on
t2–t4 is the scripted provider's own prior `SETTLE=ST0` reply in history, not
FreshCtx bytes (PCR 0166 limitation, unchanged). `stdoutMatchesCurrent` stays
false because the scripted provider always answers `ST0`; no model ran.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ise:install` | yes | 0 | `added 8 packages`; `web-tree-sitter` WASM present |
| `node --test test/pcr-0167-*.test.mjs` (before fix) | yes | 1 | each file `# tests 1` `# pass 0` `# fail 1` |
| `node --test test/pcr-0167-*.test.mjs` (after fix) | yes | 0 | `# tests 7` `# pass 7` `# fail 0` `# skipped 0` |
| scripted Hermes host run through `auto-rpc.mjs --host=hermes --arm=freshctx-ts` (before fix) | yes | 0 | t1–t4 `resolution=none`; 96 unmatched records in the request lists |
| same command (after fix) | yes | 0 | t1–t4 `isolated-semantic-engine`; request lists are provider dumps only |
| `HERMES_SAFE_MODE=1` probe | yes | 0 | `Context engine 'freshctx' not found`; no bridge; no envelope |
| `npm test` | yes | 0 | `# tests 751` `# pass 751` `# fail 0` `# skipped 0` |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention` 5/5 |
| `git fetch origin main && npm run ci` | yes | 0 | `check`, `test` 751/751, `test:docs`, `bench`, `ctxbench`, `evaluate`, `evaluate:check-docs`, `papers:list`, `test:py` 7 OK, `holdout:verify`, `holdout:ci-guard` |
| live dest remesure | no | n/a | not this record's job; official table hold |

## Metric snapshot

| metric | before | after | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| `npm test` | 744 / 744 / 0 | 751 / 751 / 0 | +7 tests |
| `test:py` | 7 OK | 7 OK | 0 |
| scripted host `freshctx-ts` t1–t4 row `resolution` | `none` | `isolated-semantic-engine` | closed |
| scripted host t1 row request count | 27 | 3 | −24 unmatched records |
| scripted host t2–t4 `exactCurrentBytes` | false | true | closed |
| official accepted TAP | 549 / 0 / 0 / 549 | 549 / 0 / 0 / 549 | hold |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `4a953591…` | `4a953591…` | 0 |

Label: `synthetic`; `harness-only`. No dollars. No Pass@1. No
cheaper-intelligence claim.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

None observed. The change is confined to `docs/lab/` measure-pack reporting;
core, adapters, bench fixtures, gold labels, weights, thresholds, and the
held-out split are untouched. Selection order and render order stay separate
concepts. Nothing injects last-known content: a turn with no provider dump now
has an empty request list rather than a borrowed record.

## Limitations

- The dest capture was not mounted on this Cloud Agent. The layout was
  reproduced from the reported facts (no `hosts/hermes` tree, no
  `plugins/context_engine/freshctx`) and the symptom matched digit for digit
  on the same harness command, including the request-count magnitude (102
  entries across four cells here against the reported 104 dumps per arm).
  A dest rerun on this branch is the confirmation.
- The provider was scripted. `stdoutMatchesCurrent` and any marker-following
  claim need a model run.
- `stalePriorBytes` still reads the assistant's own prior reply text; the scan's
  substring check does not separate reply text from tool bytes.
- `assertFreshCtxEngineRegistered` reads `HERMES_HOME/logs/agent.log` and
  `errors.log`. A host that stops printing
  `registered context engine: freshctx` would fail the arm closed even when the
  engine served, which is the intended direction but pins a log string.
- The `nothing` and `freshctx-no-ts` arms were not run here.

## Next measurement

Rerun `node docs/lab/multi-turn-trial/auto-rpc.mjs --host=hermes` on a dest
checkout of this branch with `HERMES_TRIAL_PROTOCOL=cli`, and read `freshctx-ts`
t1–t4 `resolution`, `requestBytes`, and `requests[].hasFreshCtxEnvelope`. Print
`ls requests/ | grep -c unmatched` next to the summary.
