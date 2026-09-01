# PCR 0150 — Hermes CLI `-q` argv fail-closed (empty t1 tools)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0150-cli-query-argv-5ebd` (draft)
- Base SHA: `88dcf52f1c8a57c8a3800fdc808c58bd98c2ef17` (PCR 0149 on main; public count 145)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench one-shot dest `/workspace/freshctx-measure-88dcf52f-multiturn` was not
`EmptyStreamError`. t1 assert FAIL arm=`nothing`: recorded no host tools `[]`.
FreshCtx never started. `print-columns` empty. t2/t3/t4 not produced.
`auto-rpc` exit 1. Window 00:32:28–00:32:59 CEST.

Exact reject:

```
Error: t1-read recorded no host tools (arm=nothing): []
    at assertT1HostReadTools (auto-rpc-host-read.mjs:116)
    from runHermesArm (multi-turn-trial/auto-rpc.mjs:359)
```

Dest `hermes.stderr.log` printed twice on the t1 spawn:

```
hermes chat: error: argument -q/--query: expected one argument
```

This leftover is not PCR 0149 (dest-copy `.work` matcher). Dest tools were `[]`.
There was no host `read_file` to rematch.

**Cause (measured on the real auto-rpc argv, dest dump):** two CLI `-q` sites
emit argparse-invalid argv, so Hermes never starts and the plugin records
nothing.

1. Persistent CLI launch: `hermesLaunchArgs("cli")` returned `["chat", "-q"]`
   with no query argument. That is the `hermes.stderr.log` spawn.
2. t1 `runCliQuery`: `cliQueryArgs` returned
   `["chat", "-q", "--provider", "openai", "--model", deepseek-v4-flash, PROMPT_T1]`.
   `-q` consumed no query; the next token is a flag.

`t1ToolsForAssert({ eventTools: [], recordedTools: [] })` is `[]`. The empty
assert is true. The hole is argv, not "model chose no tools" and not harness
recording of a live tool call.

**Fail-closed:** `-q` / `--query` must be followed by a non-empty, non-flag
query. `cliQueryArgs` places `PROMPT_T1` immediately after `-q`.
`hermesLaunchArgs("cli")` no longer emits orphan `-q`. Empty or flag-shaped
messages throw the dest argparse string. `runCliQuery` throws that string
instead of returning `tools: []` so argparse death is not recorded as empty
model tools.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest `hermes.stderr.log` against the real `cliQueryArgs` /
   `hermesLaunchArgs` argv. Both dest argv strings fail
   `cliQueryArgvInvalidReason` with the dest argparse line.
2. Fail-closed query placement: `-q` then the message, then provider/model.
3. Fail-closed CLI launch: `["chat"]` without orphan `-q`.
4. `runCliQuery` throws `hermesCliQueryFailedReason` on the dest argparse
   death instead of handing `[]` to `assertT1HostReadTools`.
5. Added `test/pcr-0150-cli-query-argv.test.mjs` (dest launch argv, dest t1
   query argv, fixed placement, empty/flag fail-close).
6. Wrote this PCR and appended INDEX / METRICS.
7. Bumped public PCR count to 146 so living-docs matches on-disk PCR files.
8. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
9. Did not `--relock`.
10. Same Cloud Agent wrote PCR, INDEX, and METRICS.
11. Did not invent TAP, SWE scores, or live `$`.
12. Did not replace PCR 0142 paper.
13. Did not re-run live hosts on this leftover.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |

Replay of the dest t1 CLI argv only. Host never exposes a Tree-sitter toggle.
FreshCtx without Tree-sitter is out of scope for this leftover.
Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142 live tables this
leftover does not re-run.

## Turns

| turn | produced on dest `88dcf52f` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | Hermes argparse on `-q`; host tools `[]` | `-q` gets the query; argparse death throws |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0150-cli-query-argv.test.mjs` on this HEAD:

```
1..6
# tests 6
# pass 6
# fail 0
# skipped 0
```

`npm test` this-run TAP is filled after the first revision. Official table is
not replaced. Do not invent a suite TAP here.

All 6 PCR 0150 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0150-cli-query-argv.test.mjs` | yes | 0 | TAP above |
| `npm test` | pending this revision | n/a | official table stays 549; do not invent |
| `npm run evaluate` | pending this revision | n/a | official table not replaced |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0150 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0150 tests | n/a | **6 / 6 / 0 / 0** | dest `-q` argv fail-closed |
| `npm test` TAP `# tests` | 549 | this-run pending | official table stays 549 |
| evaluate | n/a on official table | pending this revision | official table not replaced |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| live `$` invented here | n/a | **none** | no live remesure |
| Pass@1 invented here | n/a | **none** | not a SWE dump |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Measured on the dest dump: t1 host tools were `[]` because Hermes argparse
rejected `-q` with no query argument. That is not a model-empty-tools event
and not the PCR 0149 matcher hole.
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
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout for
the living suite that needs the real parser.
Official table is not replaced.
PCR 0149 dest-copy `.work` matcher is unchanged.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm t1 no longer exits 1 from orphan `-q`
and t2/t3/t4 resolution is produced.
