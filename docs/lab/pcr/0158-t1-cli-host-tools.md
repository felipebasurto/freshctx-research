# PCR 0158 — CLI t1 sees live Hermes tools, not silent `[]`

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0158-t1-cli-tools-bcdd` / [161](https://github.com/felipebasurto/freshctx/pull/161) (draft)
- Base SHA: `cbad126534f087a05ff1bd3dfc5d8190d6ad1c4c` (PCR 0157 on main; public count 153)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker ran live Hermes 4-turn on dest
`/workspace/freshctx-measure-cbad1265-multiturn` (file overlay of PCR 0157;
git HEAD leftover `0369525a`) at 2026-09-02. Stream hole is gone: title-gen
worked; spawn exit 0; stdout 1793 bytes; Hermes reported 8 tool calls
(`find` settlement.ts, `pwd`, `grep` settleDailyLedger) then
`SETTLE=NOT_FOUND`. dest
`docs/lab/multi-turn-trial/.work/hermes/nothing/src/settlement.ts` exists.
First find printed `Path not found: src`. auto-rpc threw:

`Error: t1-read recorded no host tools (arm=nothing): []`

from `docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs` `assertT1HostReadTools`.

CLI path: `events=[]`. t1 tools come from `readRecordedHostReadTools(dumpDir)`
then `t1ToolsForAssert`. No `force-host-read.tools.jsonl` in the capture.
Dump `002.json` tools (29) include Hermes `read_file` and `search_files`, not
a recorded host-read list.

**Hypothesized mechanism (non-binding; verified and narrowed):** 0157 SSE
lets Hermes talk. The t1 recorder still sees `[]` because the force-host-read
hook/log is not written on the Hermes CLI + openai-api/Responses path.

**Measured on the real recorder and launch spec (not a dest remesure, not
live):**

1. Dest leftover is not PCR 0157 SSE. Title-gen worked. Hermes executed
   tools. `SETTLE=NOT_FOUND`. 404 and Codex terminal-stream holes are gone.
2. `runHermesArm` CLI sets `events=[]` (`rpc` is null). `t1ToolsForAssert`
   preferred `recordedTools` from `force-host-read.tools.jsonl`. That file
   was absent, so `readRecordedHostReadTools` returned `[]`.
3. `runCliQuery` then returned `tools: []` even when stdout named
   `find` / `pwd` / `grep`. auto-rpc ignored stdout tools.
4. Dump `002.json` `tools` (29) is the advertised Responses schema
   (`read_file`, `search_files`, …). It is not executed host-read tools.
   `toolsFromResponsesFunctionCalls` reads `input` `function_call` items
   only.
5. Launch spec still installs the force-host-read plugin and sets
   `HERMES_TRIAL_FORCE_HOST_READ=1` + `HERMES_TRIAL_DUMP_DIR`. jsonl was
   still missing. The live t1 hole is the CLI recorder, not SSE event names.

**Fail-closed:** parse Hermes CLI `[tool] name` stdout lines (non-quiet
`hermes chat -q`; measured on Hermes `[tool]` / `[done]` spinner) and
Responses `input` `function_call` items into `t1ToolsForAssert` after
plugin jsonl and RPC events. Dest-shaped find/pwd/grep fail-closes as
leftover `find`, not silent `[]`. Schema `tools` array is never a host-read
list.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest cbad1265 facts: dest path above; leftover HEAD `0369525a`;
   spawn exit 0; stdout 1793; 8 tool calls find/pwd/grep; `SETTLE=NOT_FOUND`;
   `Path not found: src`; settlement.ts exists on dest work fixture; auto-rpc
   throw above; no `force-host-read.tools.jsonl`; dump 002 tools (29) are
   schema. SSE stream hole is gone.
2. Read the live t1 path: CLI `events=[]` → jsonl miss →
   `runCliQuery` `tools: []` → `t1ToolsForAssert` `[]`. Discarded "use dump
   002 `tools` array as recorded host-read list."
3. Fail-closed CLI recorder: `toolsFromHermesCliStdout` +
   `toolsFromResponsesFunctionCalls` + `t1ToolsForAssert` fallbacks
   (`recordedTools` → `eventTools` → `dumpTools` → `cliTools`).
   `runCliQuery` returns parsed stdout tools. Both auto-rpc hosts pass them.
4. Added `test/pcr-0158-t1-cli-host-tools.test.mjs` (dest facts, missing
   jsonl, dump 002 schema unused, input function_call extracted, dest
   stdout leftover find, `runCliQuery` returns tools).
5. Wrote this PCR and appended INDEX / METRICS.
6. Bumped public PCR count to 154 so living-docs matches on-disk PCR files.
7. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
8. Did not `--relock`.
9. Same Cloud Agent wrote PCR, INDEX, and METRICS.
10. Did not invent TAP, SWE scores, or live `$`.
11. Did not replace PCR 0142 paper.
12. Did not re-run live hosts on this leftover.
13. Did not reopen PCR 0157 SSE event names.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |

Replay of dest t1 CLI recorder leftover only. Host never exposes a
Tree-sitter toggle. FreshCtx without Tree-sitter is out of scope for this
leftover. Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142
live tables this leftover does not re-run.

## Turns

| turn | produced on dest `cbad1265` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; spawn exit 0; stdout 1793; 8 tool calls find/pwd/grep; `SETTLE=NOT_FOUND`; auto-rpc silent `[]` | stdout `[tool]` + dump `function_call` feed t1; leftover find not silent `[]` |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0158-t1-cli-host-tools.test.mjs` on this HEAD:

```
1..6
# tests 6
# pass 6
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..703
# tests 703
# pass 661
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **703 / 661 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 6 PCR 0158 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0158-t1-cli-host-tools.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; no live remesure |

## Metric snapshot

| metric | official `79958de` | PCR 0158 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0158 tests | n/a | **6 / 6 / 0 / 0** | dest CLI recorder hole; 0157 SSE not enough |
| `npm test` TAP `# tests` | 549 | **703** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **661** | this checkout Isolated Semantic Engine WASM missing |
| `npm test` TAP `# fail` | 0 | **42** | `isolated-semantic-engine-missing` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | hard gate failed on this-run TAP | official table not replaced |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| live `$` invented here | n/a | **none** | no live remesure |
| Pass@1 invented here | n/a | **none** | not a SWE dump |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Measured on dest cbad1265 facts + the live t1 recorder after PCR 0157:
Hermes talked and used find/pwd/grep; t1 still saw `[]` because CLI events
are empty, jsonl is missing, and `runCliQuery` hardcoded `tools: []`.
Dump 002 `tools` (29) is schema, not executed tools.
0157 SSE was not enough.
Not PCR 0157 stream terminal.
Not PCR 0156 translate.
Not PCR 0155 path serve.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Dest `/workspace/freshctx-measure-cbad1265-multiturn` was not mounted on
this Cloud Agent VM. Dest facts reused from the Thinker measure: dest SHA
`cbad126534f087a05ff1bd3dfc5d8190d6ad1c4c` (file overlay of PCR 0157),
leftover HEAD `0369525a`, spawn exit 0, stdout 1793, 8 tool calls
find/pwd/grep, `SETTLE=NOT_FOUND`, `Path not found: src`, settlement.ts
exists on dest work fixture, auto-rpc `t1-read recorded no host tools
(arm=nothing): []`, no `force-host-read.tools.jsonl`, dump 002 tools (29)
include `read_file` and `search_files`.
Stdout `[tool]` parser is measured on Hermes CLI spinner lines. The dest
stdout file was not mounted; the fixture uses the named dest tools only
and does not invent the other 5 of 8 identities.
`force-host-read.tools.jsonl` is still not written on this CLI +
openai-api/Responses path. The live t1 path no longer depends on that
file being present.
cwd vs dest-root (`Path not found: src` while dest work
`src/settlement.ts` exists) is a second hole and is not this leftover.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited
at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout
for the living suite that needs the real parser.
Official table is not replaced.
Cost-ledger `dump-proxy.mjs` is a sibling hole and is not this leftover.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm t1 fail-closes leftover `find`
(or records a forced `read_file` if the plugin hook fires) instead of
silent `[]`.
cwd vs dest-root (`Path not found: src`) is the next product leftover if
t1 now sees the real tools.
Plugin jsonl on CLI + openai-api/Responses is still missing and is not
required for this recorder.
Cost-ledger `dump-proxy.mjs` still only matches `/chat/completions`.
That sibling is not this leftover.
