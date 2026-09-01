# PCR 0151 — Hermes CLI stderr persist on `child.exit` (empty t1 tools)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0151-cli-stderr-record-eaf6` / [154](https://github.com/felipebasurto/freshctx/pull/154) (draft)
- Base SHA: `1caaab4dff3290effa7ce46c671b2ac3238c7183` (PCR 0150 on main; public count 146)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench dest `/workspace/freshctx-measure-1caaab4d-multiturn` arm=`nothing` t1
was not `EmptyStreamError` and not argparse `-q`. t1 assert FAIL
arm=`nothing`: recorded no host tools `[]`. FreshCtx never started.
`print-columns` empty. t2/t3/t4 not produced. `auto-rpc` exit 1. Ended
00:50:30 Europe/Rome.

Exact reject:

```
Error: t1-read recorded no host tools (arm=nothing): []
    at assertT1HostReadTools (auto-rpc-host-read.mjs:116)
    from runHermesArm (multi-turn-trial/auto-rpc.mjs:359)
```

This leftover is not PCR 0150 (`-q` missing query) and not PCR 0149
(dest-copy `.work` matcher). Host tools were still `[]`.

**Cause (measured on the dest dumps, not the leftover name):**

1. `hermes.stderr.log` ABSENT. `detectHermesProtocol` returns `cli`, so that
   logPath is not the t1 query log. The t1 spawn is a separate `runCliQuery`.
2. `t1-read.cli.stderr.log` ABSENT. `runCliQuery` awaits `child.exit` and
   never `stop()`. `launch-child.mjs` only `writeFile(logPath, stderr)`
   inside `stop()`.
3. Only Hermes-home logs on dest: `hermes-home/logs/errors.log` SQLite
   WAL-reset warning; `agent.log` ends at plugin discovery (56 found, 50
   enabled) then the same SQLite warning. No `EmptyStreamError`. No `-q`
   argparse.
4. Spawn argv not on disk. Reconstructed from dest `cliQueryArgs` +
   `PROMPT_T1` (post-0150): `hermes chat -q $'Lee el símbolo
   settleDailyLedger...' --provider openai --model deepseek-v4-flash`
   cwd=`.work/hermes/nothing`. No `--yolo`, no `--in`. Protocol forced CLI.
   Requests dump dir empty.

`t1ToolsForAssert({ eventTools: [], recordedTools: [] })` is `[]`. The empty
assert is true. The hole is missing CLI stderr recording, not "model chose
no tools".

**Fail-closed:** `launchChild` persists `logPath` when the child closes, not
only in `stop()`. `runCliQuery` requires `logPath` and throws
`HERMES_CLI_STDERR_LOG_MISSING` if the file is absent after `child.exit`.
Missing `t1-read.cli.stderr.log` is a recording miss. It is not handed to
`assertT1HostReadTools` as empty model tools.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest dumps: `hermes.stderr.log` absent because protocol is
   `cli`; `t1-read.cli.stderr.log` absent because `writeFile` lived only in
   `stop()`.
2. Fail-closed persist: `persistLaunchLog` on `close` and on `stop()`.
3. Fail-closed `runCliQuery`: missing `logPath` or missing file throws
   `t1-read.cli.stderr.log missing: CLI child exited without persisting
   logPath`.
4. Added `test/pcr-0151-cli-stderr-record.test.mjs` (dest protocol, dest
   post-0150 argv, exit-await persist, `runCliQuery` persist, missing
   `logPath` fail-close, recording miss ≠ empty host tools).
5. Wrote this PCR and appended INDEX / METRICS.
6. Bumped public PCR count to 147 so living-docs matches on-disk PCR files.
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

Replay of the dest t1 CLI recording path only. Host never exposes a
Tree-sitter toggle. FreshCtx without Tree-sitter is out of scope for this
leftover. Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142 live
tables this leftover does not re-run.

## Turns

| turn | produced on dest `1caaab4d` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; `t1-read.cli.stderr.log` absent; host tools `[]` | persist stderr on `child.exit`; missing log throws |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0151-cli-stderr-record.test.mjs` on this HEAD:

```
1..6
# tests 6
# pass 6
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..659
# tests 659
# pass 617
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **659 / 617 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 6 PCR 0151 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0151-cli-stderr-record.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0151 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0151 tests | n/a | **6 / 6 / 0 / 0** | dest CLI stderr persist on exit |
| `npm test` TAP `# tests` | 549 | **659** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **617** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on the dest dump: t1 host tools were `[]` because CLI stderr was
never persisted (`runCliQuery` awaited `child.exit`; `writeFile` lived only
in `stop()`). That is not a model-empty-tools event, not PCR 0150 argparse,
and not the PCR 0149 matcher hole.
Dest-copy `.work` fixture matching is unchanged.
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
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout for
the living suite that needs the real parser.
Official table is not replaced.
PCR 0150 CLI `-q` argv is unchanged.
PCR 0149 dest-copy `.work` matcher is unchanged.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm `t1-read.cli.stderr.log` exists
after `child.exit` and t2/t3/t4 resolution is produced.
