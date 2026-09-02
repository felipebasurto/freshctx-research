# PCR 0159 — Hermes CLI t1 search/read binds dest work, not host clone

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0159-hermes-dest-cwd-dba4` / [162](https://github.com/felipebasurto/freshctx/pull/162) (draft)
- Base SHA: `ee0e254f7168efb5b0558501a52f84fc60a945e9` (PR 161 squash; PCR 0158 on main; public count 154)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker ran live Hermes 4-turn on dest
`/workspace/freshctx-measure-ee0e254f-multiturn` SHA
`ee0e254f7168efb5b0558501a52f84fc60a945e9` at 2026-09-02. PCR 0158 recorder
worked: t1 is not silent `[]`. auto-rpc threw:

`Error: t1-read unexpected tool search_files (arm=nothing)`

from `docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs` `assertT1HostReadTools`.
Tools are Hermes `search_files` + `terminal`. `args.path` is
`/home/box/projects/freshctx/repos/hosts/hermes` (then
`/home/box/projects/freshctx/repos`, `repos/freshctx`). Stdout used
find/grep/ls then
`SETTLE=NOT_FOUND (no existe src/settlement.ts ni el símbolo settleDailyLedger en los árboles disponibles)`.
Session 22 messages, 20 tool calls. Spawn cwd was
`docs/lab/multi-turn-trial/.work/hermes/nothing`, which has
`src/settlement.ts`.

**Measured on the launch spec and Hermes cwd (not a dest remesure, not
live):**

1. Dest leftover is not PCR 0158 silent `[]`. Recorder saw real tools.
2. `runCliQuery` already passes spawn `cwd` as dest work.
   `hermesEnvForArm` already sets `FRESHCTX_CWD` /
   `HERMES_TRIAL_WORKSPACE` to dest work. Those keys reach FreshCtx
   `_workspace_cwd` and force-host-read only. The `nothing` arm does not
   load the FreshCtx engine. Plugin jsonl is still missing on CLI +
   openai-api (PCR 0158). Native `search_files` / `terminal` do not read
   those env keys.
3. Isolated `hermesConfigYaml` had no `terminal.cwd`. `cliQueryArgs` did
   not pass Hermes `--in`. Env did not set `TERMINAL_CWD`. Official
   Hermes CLI pins workspace with `--in DIR` (global, before `chat`).
   Isolated `config.yaml` `terminal.cwd` is the config-side cwd source.
   `TERMINAL_CWD` is the env-side bridge. None of those three reached
   the openai-api overlay on dest.
4. Hermes session workspace key is git repo root or cwd. Dest work is
   not a git root. Host clone
   `/home/box/projects/freshctx/repos/hosts/hermes` is the Thinker Hermes
   checkout. Settlement on dest work is invisible if native tools bind
   that clone.
5. Current leftover `unexpected tool search_files` does not name the
   wrong tree.

**Fail-closed:** bind Hermes native cwd to dest work on the launch spec
(`--in`, isolated `terminal.cwd`, `TERMINAL_CWD`). Host-clone
`search_files` / `terminal` fail-closes as leftover that names the wrong
tree. Dest-work and dest-root trees are not that leftover.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun. Did not reopen PCR 0157 SSE.

## What we did

1. Replayed dest ee0e254f facts: dest path above; dest SHA
   `ee0e254f7168efb5b0558501a52f84fc60a945e9`; throw above;
   `search_files` path `/home/box/projects/freshctx/repos/hosts/hermes`
   then repos / `repos/freshctx`; `SETTLE=NOT_FOUND`; dest work
   `src/settlement.ts` exists; 22 messages / 20 tool calls; spawn cwd
   dest work. PCR 0158 silent `[]` is gone.
2. Read the live launch spec and Hermes cwd: spawn cwd and FreshCtx env
   are dest work; Hermes native `--in` / `terminal.cwd` / `TERMINAL_CWD`
   were unset. Discarded "reopen SSE" for this leftover.
3. Fail-closed dest-work bind: `cliQueryArgs` / `runCliQuery` /
   `hermesLaunchArgs` pass `--in <dest work>`; isolated
   `hermesConfigYaml` writes `terminal.cwd`; `hermesEnvForArm` sets
   `TERMINAL_CWD`.
4. Fail-closed wrong-tree leftover: host-clone search/read names the
   path. Dest-work and dest-root (above `.work`) are allowed trees.
5. Added `test/pcr-0159-hermes-dest-cwd.test.mjs` (dest facts, launch
   bind, host-clone leftover name, dest-work fixture exists, `runCliQuery`
   `--in`).
6. Wrote this PCR and appended INDEX / METRICS.
7. Bumped public PCR count to 155 so living-docs matches on-disk PCR files.
8. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
9. Did not `--relock`.
10. Same Cloud Agent wrote PCR, INDEX, and METRICS.
11. Did not invent TAP, SWE scores, or live `$`.
12. Did not replace PCR 0142 paper.
13. Did not re-run live hosts on this leftover.
14. Did not reopen PCR 0157 SSE event names.
15. Did not reopen PCR 0158 silent `[]`.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |

Replay of dest t1 host-clone cwd leftover only. Host never exposes a
Tree-sitter toggle. FreshCtx without Tree-sitter is out of scope for this
leftover. Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142
live tables this leftover does not re-run.

## Turns

| turn | produced on dest `ee0e254f` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; PCR 0158 recorder saw `search_files` + `terminal`; path host clone; 22 messages / 20 tool calls; `SETTLE=NOT_FOUND`; dest work settlement exists | `--in` / `terminal.cwd` / `TERMINAL_CWD` bind dest work; leftover names wrong tree |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0159-hermes-dest-cwd.test.mjs` on this HEAD:

```
1..5
# tests 5
# pass 5
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..708
# tests 708
# pass 666
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **708 / 666 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 5 PCR 0159 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0159-hermes-dest-cwd.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; no live remesure |

## Metric snapshot

| metric | official `79958de` | PCR 0159 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0159 tests | n/a | **5 / 5 / 0 / 0** | dest host-clone cwd; 0158 recorder not enough |
| `npm test` TAP `# tests` | 549 | **708** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **666** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on dest ee0e254f facts + the live launch spec after PCR 0158:
t1 sees `search_files` + `terminal`; path is the Hermes host clone; dest
work settlement exists; spawn cwd and FreshCtx env were dest work;
Hermes native `--in` / `terminal.cwd` / `TERMINAL_CWD` were unset.
0158 silent `[]` was not enough.
Not PCR 0158 CLI recorder.
Not PCR 0157 stream terminal.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Dest `/workspace/freshctx-measure-ee0e254f-multiturn` was not mounted on
this Cloud Agent VM. Dest facts reused from the Thinker measure: dest SHA
`ee0e254f7168efb5b0558501a52f84fc60a945e9`, throw
`t1-read unexpected tool search_files (arm=nothing)`, `search_files`
path `/home/box/projects/freshctx/repos/hosts/hermes` then repos /
`repos/freshctx`, `SETTLE=NOT_FOUND`, dest work `src/settlement.ts`
exists, 22 messages / 20 tool calls, spawn cwd dest work.
`--in` / `terminal.cwd` / `TERMINAL_CWD` are the launch-spec bind.
Hermes official CLI uses `--in` to pin workspace; isolated
`terminal.cwd` covers the config-side source; `TERMINAL_CWD` is the
env-side bridge. This leftover does not claim a live remesure already
searched dest work.
Force-host-read jsonl is still not written on CLI + openai-api/Responses.
That sibling is not this leftover.
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
A later live remesure on dest can confirm t1 `search_files` / `read_file`
paths are dest work (`.work/hermes/nothing` or dest-root) or fail-close
naming the wrong tree.
Plugin jsonl on CLI + openai-api/Responses is still missing and is not
required for this cwd bind.
Cost-ledger `dump-proxy.mjs` still only matches `/chat/completions`.
That sibling is not this leftover.
