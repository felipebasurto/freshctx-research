# PCR 0153 — Hermes CLI 0-byte stderr is piped non-TTY oneshot, not a silent child

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0153-cli-zero-byte-why-2a84` / [156](https://github.com/felipebasurto/freshctx/pull/156) (draft)
- Base SHA: `f3f56e8e4d1c0da0d3bf6502b7d0baceb4f36980` (PCR 0152 on main; public count 148)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench dest `/workspace/freshctx-measure-f3f56e8e-multiturn` arm=`nothing` t1
threw PCR 0152 empty persist. File exists, size 0, path
`.work/capture/hermes/nothing/t1-read.cli.stderr.log`. Not
`EmptyStreamError`. Not argparse `-q`. t2/t3/t4 not produced.

Exact throw:

```
t1-read.cli.stderr.log empty: CLI child persisted 0 bytes (not a query log)
```

kind `HERMES_CLI_STDERR_LOG_EMPTY` (not empty-tools `[]`).

This leftover is not PCR 0152 (0-byte persist already fail-closes). Persist
wrote the file. The leftover is WHY the child persisted 0 bytes.

**Cause (measured on dest throw + harness stdio + Hermes Agent parser, not a
dest-home guess):**

1. Dest `t1-read.cli.stderr.log` EXISTS, 0 bytes. PCR 0152 throw fired.
   `persistLaunchLog` writes the stderr **pipe** only
   (`writeFile(logPath, stderr ?? "")`).
2. `launchChild` stdio is `["pipe","pipe","pipe"]`. Hermes fd 0/1/2 are
   pipes, not a TTY. Spawn argv is not on dest disk.
3. Hermes Agent `chat -q` help (NousResearch/hermes-agent parser): on a real
   TTY the prompt seeds an interactive session; combined with `--oneshot` or
   `-Q`, **or on a non-TTY, it answers and exits**. Quiet/oneshot is implied
   on piped stdio. Final reply is stdout. Session lines go to
   `HERMES_HOME/logs` (`hermes logs` / `hermes logs errors`). fd 2 may be 0
   bytes on a successful query.
4. CLI protocol also spawned an unused persistent `hermes chat` sibling
   (`hermesLaunchArgs("cli")` → `["chat"]`) on the same `HERMES_HOME` before
   `runCliQuery`. `rpc` is null; that sibling is not the t1 query. Two
   processes share the home. Query child stderr is the only persisted
   channel. stdout and hermes-home were never written next to
   `t1-read.cli.stderr.log`.
5. `runCliQuery` then threw `HERMES_CLI_STDERR_LOG_EMPTY` because the persist
   file size was 0, without classifying stdout. Dest never reached
   `assertT1HostReadTools`. t2/t3/t4 were not produced.

Empty dest stderr is the piped non-TTY oneshot contract plus stderr-only
persist. It is not EmptyStreamError, not `-q` argparse, and not empty model
tools.

**Fail-closed:** empty stderr persist is not fatal when the oneshot stdout
channel has bytes. `cliQueryChannelReason` returns null when stdout or
stderr has bytes; all-empty stdio still throws PCR 0152
`HERMES_CLI_STDERR_LOG_EMPTY`. `runCliQuery` persists stdout, spawn argv,
and hermes-home log snapshot beside the stderr file. CLI protocol does not
spawn the unused persistent `hermes chat` sibling on `HERMES_HOME`.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest throw path: 0-byte
   `.work/capture/hermes/nothing/t1-read.cli.stderr.log`; PCR 0152 kind;
   not argparse; not `EmptyStreamError`.
2. Measured harness stdio (`CHILD_STDIO` pipes) against Hermes Agent `-q`
   non-TTY oneshot/quiet contract. Query log is stdout / hermes-home, not
   fd 2.
3. Fail-closed channel classify: empty stderr + oneshot stdout is a query
   log. All-empty stdio still throws `HERMES_CLI_STDERR_LOG_EMPTY`.
4. Persist companions: `t1-read.cli.stdout.log`,
   `t1-read.cli.spawn.json`, `t1-read.cli.hermes-home.log`.
5. CLI protocol no longer spawns a persistent `hermes chat` sibling on the
   query `HERMES_HOME`.
6. Added `test/pcr-0153-cli-zero-byte-why.test.mjs` (dest post-0150 argv,
   dest 0-byte exists, pipe non-TTY contract, stdout query log, persist
   companions, no sibling spawn, all-empty still 0152).
7. Wrote this PCR and appended INDEX / METRICS.
8. Bumped public PCR count to 149 so living-docs matches on-disk PCR files.
9. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
10. Did not `--relock`.
11. Same Cloud Agent wrote PCR, INDEX, and METRICS.
12. Did not invent TAP, SWE scores, or live `$`.
13. Did not replace PCR 0142 paper.
14. Did not re-run live hosts on this leftover.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |

Replay of the dest t1 CLI stdio / hermes-home / spawn split only. Host never
exposes a Tree-sitter toggle. FreshCtx without Tree-sitter is out of scope
for this leftover. Model remains `deepseek-v4-flash` only on the PCR 0139 /
0142 live tables this leftover does not re-run.

## Turns

| turn | produced on dest `f3f56e8e` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; `t1-read.cli.stderr.log` exists, 0 bytes; PCR 0152 throw | empty stderr is piped non-TTY oneshot; stdout/home/spawn persisted; no sibling |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0153-cli-zero-byte-why.test.mjs` on this HEAD:

```
1..7
# tests 7
# pass 7
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..671
# tests 671
# pass 629
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **671 / 629 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 7 PCR 0153 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0153-cli-zero-byte-why.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0153 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0153 tests | n/a | **7 / 7 / 0 / 0** | dest CLI 0-byte stderr why |
| `npm test` TAP `# tests` | 549 | **671** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **629** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on dest throw + harness pipes + Hermes Agent `-q` parser: t1
`HERMES_CLI_STDERR_LOG_EMPTY` fired because persist recorded the empty
stderr pipe. Piped stdio is a non-TTY; Hermes `-q` oneshot-exits and writes
the reply to stdout / hermes-home, not fd 2. Unused persistent `hermes chat`
sibling on the same `HERMES_HOME` is no longer spawned. PCR 0152 empty
persist throw remains for all-empty stdio.
Not PCR 0152 empty-file (already fail-closes).
Not PCR 0151 absent-file.
Not PCR 0150 argparse.
Not PCR 0149 matcher.
Dest-copy `.work` fixture matching is unchanged.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Dest `/workspace/freshctx-measure-f3f56e8e-multiturn` was not mounted on this
Cloud Agent VM. Dest facts used: exact 0152 throw, file exists size 0 at
`.work/capture/hermes/nothing/t1-read.cli.stderr.log`, not EmptyStreamError,
not `-q`, t2/t3/t4 not produced. stdout and hermes-home were not on dest
disk because the harness never persisted them (that is the leftover).
Hermes `-q` non-TTY contract is from the host parser, not a dest-home
listing.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout for
the living suite that needs the real parser.
Official table is not replaced.
PCR 0152 empty-persist throw is unchanged for all-empty stdio.
PCR 0151 CLI stderr persist-on-exit is unchanged.
PCR 0150 CLI `-q` argv is unchanged.
PCR 0149 dest-copy `.work` matcher is unchanged.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm `t1-read.cli.stdout.log` /
`t1-read.cli.spawn.json` exist after t1 and t2/t3/t4 resolution is produced
when oneshot stdout is the query log.
