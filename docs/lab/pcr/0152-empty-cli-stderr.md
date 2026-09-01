# PCR 0152 — Hermes CLI empty stderr persist is not empty host tools

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0152-empty-cli-stderr-5fe9` / [155](https://github.com/felipebasurto/freshctx/pull/155) (draft)
- Base SHA: `91b97f807daacfca7d56391ac39d0c9908848da8` (PCR 0151 on main; public count 147)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench dest `/workspace/freshctx-measure-91b97f80-multiturn` arm=`nothing` t1
was not `EmptyStreamError` and not argparse `-q`. t1 assert FAIL
arm=`nothing`: recorded no host tools `[]`. FreshCtx never started.
`print-columns` empty. t2/t3/t4 not produced. `auto-rpc` exit 1.

Exact reject:

```
Error: t1-read recorded no host tools (arm=nothing): []
    at assertT1HostReadTools (auto-rpc-host-read.mjs:116)
    from runHermesArm (multi-turn-trial/auto-rpc.mjs:359)
```

This leftover is not PCR 0151 (absent `t1-read.cli.stderr.log`). Persist
already wrote the file. Host tools were still `[]`.

**Cause (measured on the dest dumps + the recording path, not the leftover
name):**

1. `t1-read.cli.stderr.log` EXISTS, 0 bytes. PCR 0151 `persistLaunchLog` ran
   (`writeFile(logPath, stderr ?? "")` on `child.exit`).
2. `cliStderrLogMissingReason` only `access()`ed the path. A 0-byte file
   returned `null`, so `runCliQuery` treated persist as a valid query log.
3. Dest reached `assertT1HostReadTools`. `hermesCliQueryFailedReason` therefore
   did not throw: not argparse, and the CLI child was not a nonzero failure.
   Reconstructed dest t1 argv is post-0150 (`-q` then `PROMPT_T1`).
4. `runCliQuery` then returned `tools: []`. CLI `events` stay `[]` (`rpc` is
   null). `recordedTools` from `force-host-read.tools.jsonl` were empty. Dest
   `requests/` empty: the dump proxy captured no provider call. `freshctx-ts`
   log ABSENT (arm never started). Spawn argv ABSENT on dest (harness never
   wrote it; reconstructed from `cliQueryArgs` + `PROMPT_T1`).
5. `t1ToolsForAssert({ eventTools: [], recordedTools: [] })` is `[]`. The empty
   assert is true. The hole is empty persist accepted as a query log, not
   "model chose no tools".

Empty CLI stderr on dest is a silent CLI child (exit path that wrote 0 bytes)
plus recording that still hands `[]` to the t1 assert. It is not a swallowed
live tool call: dest `requests/` is empty, so no provider turn existed to
record tools from.

**Fail-closed:** a persisted `t1-read.cli.stderr.log` of size 0 is
`HERMES_CLI_STDERR_LOG_EMPTY`. `runCliQuery` throws that string instead of
returning `tools: []`. Missing file still throws PCR 0151
`HERMES_CLI_STDERR_LOG_MISSING`. Empty persist is a recording miss. It is not
handed to `assertT1HostReadTools` as empty model tools.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest dumps: `t1-read.cli.stderr.log` exists and is 0 bytes; PCR
   0151 persist ran; `requests/` empty; spawn argv absent; not argparse; not
   `EmptyStreamError`.
2. Fail-closed empty persist: `cliStderrLogMissingReason` returns
   `HERMES_CLI_STDERR_LOG_EMPTY` when the file exists and `stat.size === 0`.
3. `runCliQuery` throws that string so dest empty persist is not
   `assertT1HostReadTools` `[]`.
4. Added `test/pcr-0152-empty-cli-stderr.test.mjs` (dest post-0150 argv, dest
   0-byte exists-not-absent, 0151 persist writes 0 bytes on silent exit,
   `runCliQuery` empty throw, empty persist ≠ empty host tools).
5. Wrote this PCR and appended INDEX / METRICS.
6. Bumped public PCR count to 148 so living-docs matches on-disk PCR files.
7. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
8. Did not `--relock`.
9. Same Cloud Agent wrote PCR, INDEX, and METRICS.
10. Did not invent TAP, SWE scores, or live `$`.
11. Did not replace PCR 0142 paper.
12. Did not re-run live hosts on this leftover.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |

Replay of the dest t1 CLI empty-persist path only. Host never exposes a
Tree-sitter toggle. FreshCtx without Tree-sitter is out of scope for this
leftover. Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142 live
tables this leftover does not re-run.

## Turns

| turn | produced on dest `91b97f80` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; `t1-read.cli.stderr.log` exists, 0 bytes; host tools `[]` | empty persist throws; not empty model tools |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0152-empty-cli-stderr.test.mjs` on this HEAD:

```
1..5
# tests 5
# pass 5
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..664
# tests 664
# pass 622
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **664 / 622 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 5 PCR 0152 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0152-empty-cli-stderr.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0152 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0152 tests | n/a | **5 / 5 / 0 / 0** | dest empty CLI stderr persist |
| `npm test` TAP `# tests` | 549 | **664** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **622** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on the dest dump: t1 host tools were `[]` because PCR 0151 persist
wrote a 0-byte `t1-read.cli.stderr.log` and `runCliQuery` accepted that as a
query log, then returned `tools: []`. Dest `requests/` empty: no provider
turn, so this is not a swallowed live tool call. Not PCR 0151 absent-file,
not PCR 0150 argparse, not PCR 0149 matcher.
Dest-copy `.work` fixture matching is unchanged.
PCR 0151 persist-on-exit is unchanged (the 0-byte file is still written).
PCR 0150 `-q` argv placement is unchanged.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited at t1.
Spawn argv was not on dest disk; reconstructed from dest `cliQueryArgs`.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout for
the living suite that needs the real parser.
Official table is not replaced.
PCR 0151 CLI stderr persist-on-exit is unchanged.
PCR 0150 CLI `-q` argv is unchanged.
PCR 0149 dest-copy `.work` matcher is unchanged.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm empty `t1-read.cli.stderr.log`
throws before `assertT1HostReadTools` and t2/t3/t4 resolution is produced.
