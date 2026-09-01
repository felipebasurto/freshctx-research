# PCR 0154 — Hermes CLI rejected `--provider openai`; dump-proxy name is `openai-api`

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0154-hermes-provider-b9db` / [157](https://github.com/felipebasurto/freshctx/pull/157) (draft)
- Base SHA: `51fab7172d0137d8ba886737adf334f1487d4451` (PCR 0153 on main; public count 149)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker ran `node auto-rpc.mjs --host=hermes` on dest
`/workspace/freshctx-measure-51fab717-multiturn` after Bench python launcher
was Auto-review blocked. Exact fail still
`t1-read recorded no host tools (arm=nothing): []` in 1586ms.

PCR 0153 empty-stderr path did **NOT** throw: stdout 308 bytes, stderr 0.
Spawn.json: args `chat -q ... --provider openai --model deepseek-v4-flash`,
code 0, stdoutBytes 308, stderrBytes 0, hermesHomeBytes 3559.

`t1-read.cli.stdout.log` (do not invent):

```
Query: Lee el símbolo settleDailyLedger...
Unknown provider 'openai'. Check 'hermes model' for available providers, or run 'hermes doctor' to diagnose config issues.
Goodbye!
```

This leftover is not PCR 0153 (empty-stderr oneshot). Host tools `[]`
because Hermes rejected provider `openai` and printed Goodbye on stdout
with exit 0. Dest dumps were not mounted on this Cloud Agent VM. Dest
facts used are the spawn numbers and the quoted stdout unique lines
above.

**Cause (measured on dest spawn/stdout + Hermes Agent CLI registry, not a
dest-home guess):**

1. Dest `t1-read.cli.stderr.log` is 0 bytes. PCR 0153
   `cliQueryChannelReason` returned null because stdout had 308 bytes.
2. `hermesCliQueryFailedReason` only inspected stderr and nonzero code.
   Dest code was 0. Dest reject lived on **stdout**.
3. `runCliQuery` returned `tools: []`. Dest reached
   `assertT1HostReadTools`.
4. Hermes Agent `PROVIDER_REGISTRY` has no id `openai`. Built-in names
   include `openai-api` (OpenAI API; `OPENAI_BASE_URL`) and
   `openai-codex` (OAuth). Official providers.md: `OPENAI_BASE_URL` is
   honored **only** for `openai-api`. The harness dump proxy is wired as
   `OPENAI_BASE_URL`. The real CLI name for that path is `openai-api`.
5. Isolated `HERMES_HOME` `config.yaml` also wrote `provider: openai`.

**Fail-closed:** do not pass `--provider openai` if Hermes rejects it.
`cliQueryArgs` and `hermesConfigYaml` use `openai-api`.
`cliQueryProviderInvalidReason` throws the dest `Unknown provider 'openai'`
string when argv still contains `--provider openai`.
`hermesCliQueryFailedReason` reads stdout and stderr so dest exit 0 +
Goodbye is not handed to `assertT1HostReadTools` as empty model tools.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest 51fab717 facts: spawn `--provider openai`, code 0,
   stdout 308 / stderr 0 / hermes-home 3559; stdout unique lines
   `Unknown provider 'openai'` + `hermes model` / `hermes doctor` +
   `Goodbye!`; PCR 0153 empty-stderr path did not throw.
2. Measured Hermes Agent CLI registry: no `openai`; dump-proxy
   `OPENAI_BASE_URL` is `openai-api`.
3. Fail-closed argv/config: `HERMES_CLI_PROVIDER=openai-api`. Do not pass
   rejected `openai`.
4. Fail-closed classify: dest stdout Unknown provider + exit 0 throws
   `HERMES_CLI_UNKNOWN_PROVIDER` instead of `tools: []`.
5. Froze dest `--provider openai` argv in PCR 0151–0153 tests so those
   dest leftovers stay dest-accurate.
6. Added `test/pcr-0154-hermes-unknown-provider.test.mjs` (dest spawn,
   dest stdout unique lines, 0153 empty-stderr did not throw, exit 0
   reject, `openai-api`, config yaml, `runCliQuery` throw).
7. Wrote this PCR and appended INDEX / METRICS.
8. Bumped public PCR count to 150 so living-docs matches on-disk PCR files.
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

Replay of dest t1 CLI provider reject only. Host never exposes a
Tree-sitter toggle. FreshCtx without Tree-sitter is out of scope for this
leftover. Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142
live tables this leftover does not re-run.

## Turns

| turn | produced on dest `51fab717` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; stdout 308 Unknown provider openai + Goodbye; code 0; 0153 empty-stderr path did not throw | `--provider openai` rejected; fail-close to `openai-api` |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0154-hermes-unknown-provider.test.mjs` on this HEAD:

```
1..6
# tests 6
# pass 6
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..677
# tests 677
# pass 635
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **677 / 635 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 6 PCR 0154 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0154-hermes-unknown-provider.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0154 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0154 tests | n/a | **6 / 6 / 0 / 0** | dest CLI Unknown provider openai |
| `npm test` TAP `# tests` | 549 | **677** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **635** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on dest spawn/stdout + Hermes Agent CLI registry: t1 host tools
`[]` because `--provider openai` is unknown. Dest printed the reject on
stdout and exited 0 with Goodbye. PCR 0153 treated oneshot stdout as a
query log. The leftover is the rejected provider name, not empty-stderr
persist.
Not PCR 0153 empty-stderr oneshot (already classified).
Not PCR 0152 empty-file.
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
Dest `/workspace/freshctx-measure-51fab717-multiturn` was not mounted on
this Cloud Agent VM. Dest facts used: exact empty-tools throw, spawn
`--provider openai` / code 0 / stdoutBytes 308 / stderrBytes 0 /
hermesHomeBytes 3559, and the quoted stdout unique lines. The full
308-byte stdout file was not copied here; unique dest lines were not
invented.
Hermes CLI provider ids are from NousResearch/hermes-agent
`PROVIDER_REGISTRY` and providers.md (`openai-api` honors
`OPENAI_BASE_URL`). `hermes` was not installed on this VM.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited
at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout
for the living suite that needs the real parser.
Official table is not replaced.
PCR 0153 empty-stderr-plus-stdout classify is unchanged.
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
A later live remesure on dest can confirm `cliQueryArgs` passes
`--provider openai-api` and t1 records host tools when the dump proxy
answers.
