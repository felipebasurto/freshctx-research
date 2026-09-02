# PCR 0157 — Hermes Codex Responses `stream: true` needs SSE terminal events

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0157-responses-stream-5818` / pending draft
- Base SHA: `371457c74bbfd2b90717c8ac083b8ea6370924f4` (PCR 0156 on main; public count 152)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker ran live Hermes 4-turn on dest
`/workspace/freshctx-measure-371457c7-multiturn` SHA
`371457c74bbfd2b90717c8ac083b8ea6370924f4` at 2026-09-02 ~08:05 UTC.
Spawn `hermes chat -q … --provider openai-api --model deepseek-v4-flash`
exit 0, stdout 2687 bytes, stderr 0, 0 tool calls. auto-rpc threw:

`Error: t1-read recorded no host tools (arm=nothing): []`

from `docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs` `assertT1HostReadTools`.

The real host error in
`docs/lab/multi-turn-trial/.work/capture/hermes/nothing/t1-read.cli.stdout.log`:

`Codex Responses stream did not emit a terminal response`

(title-gen once, then chat attempts 1/3, 2/3, 3/3; endpoint
`http://127.0.0.1:36637/v1`; Provider openai-api; Model deepseek-v4-flash).

PCR 0156 already accepts POST `/v1/responses`, translates to DeepSeek
`chat/completions` with `stream: false`, and replies
`content-type: application/json` wrapping `chatCompletionToResponses`
(`object: "response"`, `status: "completed"`). Dump files 001.json–004.json
are Responses bodies with `"stream": true`. Unmatched dumps are GET
`/api/v1/models`, `/api/tags`, `/v1/props`, `/props`, `/version`,
`/v1/models/deepseek-v4-flash` and POST `/api/show` — not this hole. 404 is
gone.

**Measured on Hermes / OpenAI SDK source (not a dest remesure, not live):**

1. Dest leftover is not PCR 0156 path/translate. `/v1/responses` is served
   and translated. JSON wrap is not enough.
2. Hermes `openai-api` overlay is `transport="codex_responses"`. That wire
   POSTs `/v1/responses` with `"stream": true`.
3. NousResearch/hermes-agent `agent/codex_runtime.py`
   `_consume_codex_event_stream` iterates `client.responses.create(stream=True)`
   SSE events. Terminal types are exactly `response.completed`,
   `response.incomplete`, `response.failed`. Content is assembled from
   `response.output_item.done` items. It never reads
   `response.completed.response.output` for tools.
4. If no terminal event and no output items, it raises
   `RuntimeError("Codex Responses stream did not emit a terminal response")`.
   That is the dest stdout phrase.
5. OpenAI Python SDK `_streaming.py` decodes `text/event-stream` frames
   (`event:` / `data:`). A single JSON `object:"response"` body has no
   `type` field and is not an SSE event. The consumer sees zero events.
6. Official Responses SSE uses `event: response.output_item.done` then
   `event: response.completed`. Chat-completions `data: [DONE]` is not this
   wire.

**Fail-closed:** when the incoming Responses body has `stream: true`, reply
`text/event-stream` with `response.output_item.done` (one per output item)
plus `response.completed` (terminal). Keep translating upstream to DeepSeek
`chat/completions` with `stream: false`. Non-stream JSON wrap stays for
`stream: false` / omitted. Dump-only dummy also streams when asked.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest 371457c7 facts: spawn `--provider openai-api`, proxy
   `http://127.0.0.1:36637/v1`, stdout 2687, stderr 0, exit 0, 0 tools,
   auto-rpc throw above, stdout phrase above. 404 is gone. Dumps 001–004
   have `"stream": true`.
2. Read Hermes `codex_runtime.py` `_TERMINAL_EVENT_TYPES` and
   `_consume_codex_event_stream`. Discarded "any completed JSON is enough."
   PCR 0156 JSON wrap is not a terminal stream event.
3. Read OpenAI Python SDK `_streaming.py` SSE decoder and official
   Responses event names. Content-Type is `text/event-stream`.
4. Fail-closed stream: `responsesToStreamEvents` / `encodeResponsesSse` /
   Hermes-shaped `consumeCodexResponsesStream`. Live and dump-only emit SSE
   when `stream: true`. Non-stream JSON path unchanged.
5. Added `test/pcr-0157-responses-stream.test.mjs` (dest facts, 0156 JSON
   wrap throws dest phrase, SSE consumer accepts function_call items,
   live stream, non-stream JSON hold, dump-only SSE dummy).
6. Wrote this PCR and appended INDEX / METRICS.
7. Bumped public PCR count to 153 so living-docs matches on-disk PCR files.
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

Replay of dest t1 dump-proxy leftover only. Host never exposes a Tree-sitter
toggle. FreshCtx without Tree-sitter is out of scope for this leftover.
Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142 live tables
this leftover does not re-run.

## Turns

| turn | produced on dest `371457c7` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; spawn `--provider openai-api`; stdout phrase `Codex Responses stream did not emit a terminal response`; 0 tools | SSE `response.output_item.done` + `response.completed` when `stream: true` |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0157-responses-stream.test.mjs` on this HEAD:

```
1..7
# tests 7
# pass 7
# fail 0
# skipped 0
```

This-run Cloud Agent TAP is pending the full `npm test` / `npm run evaluate`
pass on this branch and will be filled with the printed totals. Official
table is not replaced.

All 7 PCR 0157 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0157-responses-stream.test.mjs` | yes | 0 | TAP above |
| `npm test` | pending | | this-run Cloud Agent TAP after first push |
| `npm run evaluate` | pending | | after first push |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; no live remesure |

## Metric snapshot

| metric | official `79958de` | PCR 0157 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0157 tests | n/a | **7 / 7 / 0 / 0** | dest stream hole; 0156 JSON wrap not enough |
| `npm test` TAP | 549 | pending full suite | official table stays 549 |
| evaluate | n/a on official table | pending | official table not replaced |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| live `$` invented here | n/a | **none** | no live remesure |
| Pass@1 invented here | n/a | **none** | not a SWE dump |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Measured on Hermes `codex_runtime.py` + OpenAI SDK `_streaming.py` after
PCR 0156: t1 still cannot parse a completed Responses object because
`openai-api` asks for a stream and a JSON wrap is zero SSE events.
0156 JSON wrap was not enough.
Not PCR 0156 translate.
Not PCR 0155 path serve.
Not PCR 0154 unknown provider.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Dest `/workspace/freshctx-measure-371457c7-multiturn` was not mounted on
this Cloud Agent VM. Dest facts reused from the Thinker measure: dest SHA
`371457c74bbfd2b90717c8ac083b8ea6370924f4`, spawn `--provider openai-api`,
proxy `http://127.0.0.1:36637/v1`, stdout 2687, stderr 0, exit 0, 0 tools,
auto-rpc `t1-read recorded no host tools (arm=nothing): []`, stdout phrase
`Codex Responses stream did not emit a terminal response`, dumps 001–004
`"stream": true`.
Hermes event names were read from published `codex_runtime.py` on
NousResearch/hermes-agent. `hermes` was not installed on this VM.
The fixture consumer matches that terminal set and `output_item.done` rule.
It is not a live Hermes process.
Upstream stays DeepSeek `chat/completions` with `stream: false`; only the
Hermes-facing reply is SSE.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited
at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout
for the living suite that needs the real parser.
Official table is not replaced.
PCR 0156 JSON wrap stays for non-stream requests.
Cost-ledger `dump-proxy.mjs` is a sibling hole and is not this leftover.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm Hermes `openai-api` POSTs
`/v1/responses` with `stream: true`, the dump proxy writes SSE
`response.output_item.done` + `response.completed`, and t1 records host
tools when DeepSeek answers the translated chat path.
Cost-ledger `dump-proxy.mjs` still only matches `/chat/completions`.
That sibling is not this leftover.
