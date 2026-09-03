# PCR 0168 — A Hermes bridge that falls open leaves a log line, and a freshctx t1 row without a projection fails closed

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0168-hermes-bridge-fell-open-2638` / draft against `main`
- Base SHA: `5030c56da0d2e9299e05d1431d7ad2235a330425` (PCR 0167; public count 163)
- Commits: red `test(hermes): red tests for a silent bridge fall-open behind provider dumps with no FreshCtx unit`, then `fix(hermes): log every bridge fall-open and fail the freshctx t1 row closed without a projection`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold; no `--relock`)
- Hosts: Hermes Agent `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` (`bench/hosts.lock.json`), cloned to `/tmp/hosts/hermes`, `uv pip install -e` into `/tmp/hermes-venv`; Hermes Agent `593aa74c6182ce2e5e23bc102daaaae71710c05d` (main on 2026-09-02) in `/tmp/hermes-latest-venv` for the host-drift probe only
- Result labels used: `synthetic`; `harness-only`; `adapter-only`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker's live run on dest `/workspace/freshctx-measure-5030c56d-ise` (PCR
0167 on `main`, WASM 205488 bytes, `ise:install` exit 0,
`FRESHCTX_ISOLATED_SEMANTIC_ENGINE` unset, DeepSeek v4 flash,
`HERMES_TRIAL_PROTOCOL=cli`, `HERMES_BIN=/home/box/.local/bin/hermes`) exited 0
in 125680 ms and printed `resolution=none` on both arms t1–t4. The
`freshctx-ts` `requests/` directory held 96 `unmatched-*.json` records and 8
numbered dumps `001.json`–`008.json`, real Responses payloads (keys
`include,input,instructions,model,…`). None of the 8 contained
`<freshctx-unit` or `isolated-semantic-engine`. PCR 0167's table fix holds
(the row no longer reads 404 records); the leftover is that live provider
dumps carry no FreshCtx unit.

**Conclusion (measured on the locked host, scripted provider, no model): on
that dest every `select_context` fell open, and nothing in the adapter,
the dumps, or the Hermes log could say so.**

The chain is short. Hermes builds `api_messages`, calls
`engine.select_context(api_messages, …)`, and sends what comes back
(`agent/conversation_loop.py`, `_apply_context_engine_selection`). The
adapter's `_call_bridge` returned `None` on five paths: no state file
(`on_session_start` never ran), bridge exit code ≠ 0, bridge timeout, `OSError`
(no `node`), or a non-JSON stdout. `select_context` then returned `None`,
Hermes kept its own request, and the provider dump held the raw `read_file`
output with no `<freshctx turn=` envelope. The bridge's stderr was captured
and discarded. Hermes logs its own fall-open only when the hook *raises*; the
adapter never raises. The PCR 0167 gate (`assertFreshCtxEngineRegistered`)
reads the registration line, which is present in exactly this state. The row
printed `none`, `hostReadArgsMatched` stayed true (the force plugin records
the executed read regardless), and the harness exited 0.

Every alternative that would leave a unit somewhere was ruled out by
construction: any bridge `select` that reaches `trackRead` for the t1 read
writes an envelope (with `<freshctx-unit>` or `selected="0" unresolved="1"`)
into the very next provider dump, so eight dumps with none means no select
applied. The remaining candidates for *why* the dest bridge fell open
(module resolution under the dest's `node`, a 15 s timeout, an early exit)
are indistinguishable from here because the adapter recorded nothing. The
task's three hypotheses (select not rewriting the body, `applied=false`, dumps
captured before mutation) are one observable with no signal between them;
this record adds the signal rather than guessing among them.

Hypotheses checked and discarded on this Cloud Agent:

- Host drift. The dest's `~/.local/bin/hermes` is the official installer's
  launcher, which tracks `main` unless `--commit` pins it, so the dest host
  version is unknown (the multi-turn summary does not record it). The same
  harness command against Hermes `999703f` and against Hermes `593aa74c`
  (`main`, 2938 commits later) both resolve t1–t4 `isolated-semantic-engine`
  with a compliant scripted model. The `select_context` signature and the
  `post_tool_call` `tool_call_id` kwarg are unchanged between the two.
- Tool-call identity. The proxy translates DeepSeek chat completions to
  Responses items with `id: fc_<call.id>` and `call_id: call.id`; Hermes
  `_normalize_codex_response` sets the transcript `tool_calls[].id` to
  `call_id`, the same id `post_tool_call` receives. Executed read arguments
  reach the bridge under the matching key (PCR 0165 / 0166 hold here).
- Bridge latency. One `select` with the recorded t1 payload takes 0.17 s
  against the 15 s `FRESHCTX_BRIDGE_TIMEOUT`.
- Missing `node` on the dest. `hostReadArgsMatched=true` came from the force
  plugin's `force-host-read.tools.jsonl`, which the plugin writes only after
  its Node hook ran; `node` was reachable from the Hermes process.
- Responses translation. `liveResponsesForwardBody` and
  `chatCompletionToResponses` round-trip a tool-terminated request and a text
  reply correctly (probed directly against the scripted upstream).
- Dump timing. The proxy dumps the body Hermes sends; with a working bridge the
  dump carries the projection, so dumps are not captured pre-mutation.

**Fix (smallest coherent):**

1. `adapters/hermes/__init__.py`: logger `freshctx.hermes`. Each `_call_bridge`
   fall-open path logs one WARNING (`FreshCtx bridge <operation> fell open
   (exit N): <stderr head>`, or the timeout / OSError repr, or "no state file,
   on_session_start has not run"), and `select_context` logs one INFO line per
   call (`applied`, `selected`, `unresolved`). Hermes routes plugin loggers to
   `HERMES_HOME/logs/agent.log` (WARNING also to `errors.log`), the files
   `readHermesHomeQueryLog` already reads. The adapter still fails open; it
   now says so.
2. `docs/lab/hermes-trial-ts/hermes-queries.mjs`: `freshctxBridgeLogLines`,
   `freshctxProjectionMissingReason`, `assertFreshCtxProjectionSeen`. For a
   freshctx arm at t1, at least one of the turn's provider dumps must carry
   `hasFreshCtxEnvelope` or `hasFreshCtxUnit`; otherwise the harness throws
   with the bridge lines from the Hermes log (or "no FreshCtx bridge lines in
   HERMES_HOME logs"). `runHermesArm` calls it right after the t1 host-read
   gate. The `nothing` arm and turns after t1 are not gated (later turns may
   legitimately collapse to `[freshctx:already-served …]`).

No `src/`, bridge, bench, door, or lock change. No dest remesure. No live
model.

## What we did

1. Read `adapters/hermes/__init__.py`, `adapters/hermes/bridge.mjs`,
   `adapters/request-prune.mjs`, the multi-turn harness, and the dump proxy.
   Read Hermes `999703f` `_apply_context_engine_selection`,
   `_notify_context_engine_turn_complete`, `_emit_post_tool_call_hook`,
   `_normalize_codex_response`, and `agent_init` engine selection.
2. Built a scripted `chat/completions` upstream (`/tmp/pcr0168/upstream.mjs`,
   outside the repo) that answers the t1 prompt with a `read_file` tool call
   and every later request with `SETTLE=ST0`, and pointed the trial proxy at
   it (`HERMES_TRIAL_UPSTREAM`, `DEEPSEEK_API_KEY`/`OPENAI_API_KEY` set to a
   dummy) so requests take the live translation path, not the dump-only path.
3. Ran `HERMES_BIN=/tmp/hermes-venv/bin/hermes HERMES_TRIAL_PROTOCOL=cli node
   docs/lab/multi-turn-trial/auto-rpc.mjs --host=hermes --arm=freshctx-ts`
   with a `FRESHCTX_NODE` tee that records every bridge stdin/stdout. Result:
   t1 `requestBytes=89813,1310,91120`, t1–t4 `isolated-semantic-engine`; six
   numbered dumps (one is Hermes' 1310-byte session-title request, no tools,
   no history) and 96 unmatched records. Bridge payloads: t1 post-read
   `executedReadArgsByCallId` holds the forced `.work` path with
   `scope=symbol`, `applied: true, selected: 1`.
4. Same command against Hermes `593aa74c` (installer-style `main`): t1–t4
   `isolated-semantic-engine`, t1 `requestBytes=1310,58852,60159`.
5. Forced the dest observable: `FRESHCTX_NODE=/tmp/pcr0168/node-bridge-fails.sh`,
   a wrapper that runs the force-host-read hook normally and makes
   `bridge.mjs` exit 1 with an `ERR_MODULE_NOT_FOUND` line on stderr. On
   `main`: t1–t4 `resolution=none`, 10 numbered dumps, 96 unmatched records,
   `hasFreshCtxUnit false` and `hasFreshCtxEnvelope false` on all 10, engine
   registered, t1 read recorded, **exit 0**, and not one `freshctx` line in
   `HERMES_HOME/logs/agent.log`. This matches the dest report field for
   field, from a bridge that never ran.
6. Red tests: `test/pcr-0168-hermes-projection-seen.test.mjs` (`# tests 1`
   `# pass 0` `# fail 1`: the module lacks the exports) and
   `test/python/test_hermes_bridge_fell_open.py` (6 errors: the module has no
   `logger`).
7. Fix as above. Green: `# tests 5` `# pass 5` `# fail 0`; `test:py` 13 OK.
8. Reran step 5 on the branch: the harness now exits 1 at t1 with
   `Error: no FreshCtx projection in any of 3 t1 provider dumps; Hermes sent
   its own request:` followed by the three `freshctx.hermes: FreshCtx bridge
   select|observe fell open (exit 1): Error [ERR_MODULE_NOT_FOUND]: …` lines
   from `agent.log`.
9. Reran the healthy command on all three Hermes arms: `nothing` t1–t4 `none`
   (not gated), `freshctx-no-ts` t1–t4 `none` with t1 dump `003.json`
   `hasFreshCtxEnvelope true` (`applied=True selected=0 unresolved=1` in
   `agent.log`; passes the gate), `freshctx-ts` t1–t4
   `isolated-semantic-engine` with `applied=True selected=1 unresolved=0`.
10. Wrote this PCR, appended INDEX and METRICS rows, bumped the public PCR
    count to 164 (files on disk), and added the sharp-edge row in
    `docs/ARCHITECTURE.md`.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter | t1 gate |
|---|---|---|---|
| `nothing` | no | n/a | not gated; `none` by design |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | envelope present, `selected=0 unresolved=1`; passes |
| `freshctx-ts` | yes | on (default factory, real runner) | envelope with unit `isolated-semantic-engine`; passes |
| `freshctx-ts`, bridge forced to exit 1 | yes | on | no envelope in 3 t1 dumps; **throws** with the bridge lines |

Host runs with a scripted provider. No model. Not a paper result.

## Turns (healthy `freshctx-ts`, before → after, same command)

| turn | mutate | requests in row | resolution | `agent.log` select line |
|---|---|---|---|---|
| 1 `t1-read` | none | 3 → 3 | `isolated-semantic-engine` → same | `applied=False selected=0` then `applied=True selected=1 unresolved=0` |
| 2 `t2-settle` | ST0→ST1 | 1 → 1 | same | `applied=True selected=1 unresolved=0` |
| 3 `t3-settle` | ST1→ST2 | 1 → 1 | same | same |
| 4 `t4-unchanged` | none | 1 → 1 | same | same |

The fix changes no healthy row. It changes the failing case from four `none`
rows and exit 0 to one named error and exit 1.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ise:install` | yes | 0 | `web-tree-sitter/tree-sitter.wasm` 205488 bytes |
| `node --test test/pcr-0168-hermes-projection-seen.test.mjs` (before fix) | yes | 1 | `# tests 1` `# pass 0` `# fail 1` (missing exports) |
| `npm run test:py` (before fix) | yes | 1 | 6 errors `module 'freshctx_hermes' has no attribute 'logger'` |
| `node --test test/pcr-0168-hermes-projection-seen.test.mjs` (after fix) | yes | 0 | `# tests 5` `# pass 5` `# fail 0` |
| `npm run test:py` (after fix) | yes | 0 | `Ran 13 tests` OK |
| scripted Hermes `999703f`, `--arm=freshctx-ts`, working bridge | yes | 0 | t1–t4 `isolated-semantic-engine` (before and after) |
| scripted Hermes `593aa74c` (`main`), `--arm=freshctx-ts` | yes | 0 | t1–t4 `isolated-semantic-engine` |
| scripted Hermes `999703f`, bridge forced to exit 1 (before fix) | yes | 0 | t1–t4 `none`, 10 dumps, no envelope, no log line |
| same (after fix) | yes | 1 | throws at t1 with the three `FreshCtx bridge … fell open (exit 1)` lines |
| scripted Hermes `999703f`, all three arms (after fix) | yes | 0 | `nothing` `none`; `freshctx-no-ts` `none` with envelope; `freshctx-ts` `isolated-semantic-engine` |
| `npm test` | yes | 0 | `# tests 756` `# pass 756` `# fail 0` `# skipped 0` |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention.recall` 1 |
| `git fetch origin main && npm run ci` | yes | 0 | see METRICS row |
| live dest remesure | no | n/a | not this record's job; official table hold |

## Metric snapshot

| metric | before | after | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| `npm test` | 751 / 751 / 0 | 756 / 756 / 0 | +5 tests |
| `test:py` | 7 OK | 13 OK | +6 tests |
| forced-fall-open harness exit | 0 | 1 | closed |
| forced-fall-open `agent.log` `FreshCtx bridge` lines | 0 | 3 per t1 | named |
| healthy `freshctx-ts` t1–t4 `resolution` | `isolated-semantic-engine` | same | 0 |
| official accepted TAP | 549 / 0 / 0 / 549 | 549 / 0 / 0 / 549 | hold |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `4a953591…` | `4a953591…` | 0 |

Label: `synthetic`; `harness-only`; `adapter-only`. No dollars. No Pass@1.
No cheaper-intelligence claim.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

None observed. "Adapter fail-open" (KEEP) still holds: a failed bridge returns
Hermes' own request unchanged; the change adds a log line, not a fallback.
Nothing injects last-known content. Selection order and render order stay
separate concepts. `src/`, bench fixtures, gold labels, weights, thresholds,
and the held-out split are untouched.

## Limitations

- The dest capture was not mounted here. The dest observable (numbered dumps
  without a unit, engine registered, read recorded, exit 0) was reproduced by
  forcing the bridge to exit 1. Why the dest's bridge fell open is still
  unknown; the next dest run on this branch will print it in the t1 error or,
  if the bridge works there, resolve.
- The dest's Hermes version is unknown and the multi-turn summary does not
  record it. Both `999703f` and `main` `593aa74c` pass here, so drift is not
  the shown cause, but the harness cannot yet prove which host a dest row
  came from.
- The provider was scripted. With this Hermes and this upstream, a request
  ending on a tool result drew an empty assistant reply and four Hermes
  "empty response" retries (10 t1 dumps in the forced run); a live model does
  not show this and the count is not compared to the dest's 8.
- The gate reads `hasFreshCtxEnvelope`/`hasFreshCtxUnit` at t1 only. A bridge
  that works at t1 and falls open at t2–t4 prints `none` rows as before; the
  `agent.log` lines now say why.
- `FreshCtx bridge` log lines are matched by substring in the joined
  `agent.log` + `errors.log`; a Hermes that stops routing plugin loggers to
  those files would report "no FreshCtx bridge lines" while still throwing.

## Next measurement

Rerun `HERMES_BIN=/home/box/.local/bin/hermes HERMES_TRIAL_PROTOCOL=cli node
docs/lab/multi-turn-trial/auto-rpc.mjs --host=hermes` on a dest checkout of
this branch. Either the run resolves, or it stops at `freshctx-no-ts`/`freshctx-ts`
t1 with the `FreshCtx bridge … fell open` line naming the exit code and
stderr. Paste that line and `hermes --version` next to the summary.
