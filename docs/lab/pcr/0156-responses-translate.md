# PCR 0156 — Live DeepSeek `/responses` untranslated; translate to chat/completions

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0156-responses-translate-2475` / [159](https://github.com/felipebasurto/freshctx/pull/159) (draft)
- Base SHA: `281f9fd854c175ee1ba74155d310e4c6ba5dcebc` (PCR 0155 on main; public count 151)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Reviewer residual after PCR 0155: live DeepSeek `/responses` untranslated.
Cost-ledger `dump-proxy.mjs` is the next pack, not this leftover.

**Hypothesized mechanism (discarded):** dump-proxy now accepts `/v1/responses`
but `forwardChatCompletions` still POSTs the same Responses body to DeepSeek
`chat/completions` (that would 400).

**Measured on `docs/lab/hermes-trial-ts/proxy.mjs` after PCR 0155 (not a dest
remesure, not live):**

1. Dest efeaef64 404 `{error:"not found"}` ×3 / empty `requests/` is the
   PCR 0155 path hole. That path is now served. This leftover is not 0155.
2. `createDumpProxy` live branch used `forwardProviderPost` with
   `relativePath: responses ? "responses" : "chat/completions"` and the
   **same** `bodyText`. There is no `forwardChatCompletions` in this file.
3. Hermes `openai-api` overlay is `codex_responses` and POSTs Responses JSON
   (`input` / `instructions` / flat `tools`). That body is not a
   chat/completions body (`messages` missing).
4. DeepSeek Hermes overlay is `openai_chat`. Official chat docs are POST
   `/chat/completions`. PCR 0155 did not remesure DeepSeek `/v1/responses`.
5. Cost-ledger `dump-proxy.mjs` still has `forwardChatCompletions` and does
   not serve `/v1/responses`. That sibling is not this pack.

**Fail-closed:** translate Responses → chat/completions for upstream, forward
to `chat/completions`, and translate a chat completion back to a Responses
object so Hermes can parse `function_call` items. t1 can reach DeepSeek on
the chat path the rest of the harness already uses. Do not remesure live.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest efeaef64 facts as PCR 0155 path-404 (served). Leftover is
   live untranslated Responses JSON on upstream `responses`.
2. Measured `proxy.mjs`: discarded `forwardChatCompletions` hypothesis for
   this file. Live forwarded the same body to `responses`.
3. Fail-closed translate: `responsesRequestToChatCompletions` /
   `liveResponsesForwardBody` / `chatCompletionToResponses`. Upstream path
   is `chat/completions`. Dump still records the original Hermes body.
4. Dump-only still returns the PCR 0155 Responses dummy.
5. Did not edit `docs/lab/cost-ledger/dump-proxy.mjs`.
6. Added `test/pcr-0156-responses-translate.test.mjs`.
7. Wrote this PCR and appended INDEX / METRICS.
8. Bumped public PCR count to 152 so living-docs matches on-disk PCR files.
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

Replay of dest t1 dump-proxy leftover only. Host never exposes a Tree-sitter
toggle. FreshCtx without Tree-sitter is out of scope for this leftover.
Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142 live tables
this leftover does not re-run.

## Turns

| turn | produced on dest `efeaef64` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; spawn `--provider openai-api`; proxy 404 `{error:not found}` ×3 (PCR 0155 path); 0 tools | translate live `/v1/responses` to DeepSeek `chat/completions`; wrap chat completion as Responses |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0156-responses-translate.test.mjs` on this HEAD:

```
1..7
# tests 7
# pass 7
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..690
# tests 690
# pass 648
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **690 / 648 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 7 PCR 0156 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0156-responses-translate.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; no live remesure |

## Metric snapshot

| metric | official `79958de` | PCR 0156 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0156 tests | n/a | **7 / 7 / 0 / 0** | live `/responses` untranslated |
| `npm test` TAP `# tests` | 549 | **690** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **648** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on `proxy.mjs` after PCR 0155: t1 still cannot reach DeepSeek because
live forwarded Hermes Responses JSON unchanged to upstream `responses`.
The `forwardChatCompletions` same-body-to-chat hypothesis is discarded for
this file. Cost-ledger `forwardChatCompletions` is a sibling leftover.
Not PCR 0155 path serve.
Not PCR 0154 unknown provider.
Not PCR 0153 empty-stderr oneshot.
Not PCR 0152 empty-file.
Not PCR 0151 absent-file.
Not PCR 0150 argparse.
Not PCR 0149 matcher.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Dest `/workspace/freshctx-measure-efeaef64-multiturn` was not mounted on
this Cloud Agent VM. Dest facts reused from PCR 0155: spawn
`--provider openai-api`, proxy `http://127.0.0.1:33457/v1`, HTTP 404
`{"error":"not found"}` three times, `requests/` empty, stdout 2580 bytes,
0 tool calls. Those 404s are the served-path leftover, not this one.
DeepSeek `/v1/responses` support is not remesured here. Fail-closed route
is DeepSeek `chat/completions` after translation.
Upstream Responses `stream: true` is forced to `stream: false` so the proxy
can wrap a JSON chat completion. Streaming Responses SSE is not implemented.
Hermes `openai-api` transport is `codex_responses` from
NousResearch/hermes-agent `providers.py`. `hermes` was not installed on
this VM.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited
at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout
for the living suite that needs the real parser.
Official table is not replaced.
PCR 0155 path serve is unchanged for dump-only.
Cost-ledger `dump-proxy.mjs` is a sibling hole and is not this leftover.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
Cost-ledger `dump-proxy.mjs` still only matches `/chat/completions` and
still has `forwardChatCompletions`. That is the next pack, not this one.
A later live remesure on dest can confirm Hermes `openai-api` POSTs
`/v1/responses`, the dump proxy writes the original body, upstream sees
translated `messages` on `chat/completions`, and t1 records host tools
when DeepSeek answers that path.
