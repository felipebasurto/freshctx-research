# PCR 0155 — Dump proxy 404ed Hermes `openai-api` POST `/v1/responses`

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0155-hermes-responses-14e5` / [158](https://github.com/felipebasurto/freshctx/pull/158) (draft)
- Base SHA: `efeaef64ed4fa15fb51f82032b92f07f3b24778d` (PCR 0154 on main; public count 150)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker ran Hermes on dest
`/workspace/freshctx-measure-efeaef64-multiturn` after PCR 0154. Exact fail
still `t1-read recorded no host tools` with 0 tool calls.

Dest facts (do not invent; dest tree was not mounted on this VM):

- spawn `--provider openai-api --model deepseek-v4-flash`
- proxy `http://127.0.0.1:33457/v1`
- HTTP 404 `{"error":"not found"}` three times
- `requests/` empty
- stdout 2580 bytes (title gen + API 404)

This leftover is not PCR 0154 (provider id `openai-api` already landed).
Host tools `[]` because the dump proxy 404ed. Dest dumps were empty, so
the unmatched path is owned from dest 404 shape + `proxy.mjs` + Hermes
Agent `openai-api` overlay.

**Cause (measured on `docs/lab/hermes-trial-ts/proxy.mjs` + Hermes Agent
registry, not a dest-home guess):**

1. Dest `requests/` empty. `createDumpProxy` only dumped/forwarded POST
   whose URL matched `/\/chat\/completions$/`. Everything else returned
   404 `{error:"not found"}` without writing a dump.
2. Empty dumps mean Hermes never hit `/v1/chat/completions`. Title
   generation 404 then chat 404 is the same catch-all.
3. Hermes Agent `openai-api` overlay is `transport="codex_responses"`
   (`OPENAI_BASE_URL` honored). That wire POSTs `/v1/responses` when the
   proxy base is `http://127.0.0.1:33457/v1`.
4. `runCliQuery` returned `tools: []`. Dest reached
   `assertT1HostReadTools`. PCR 0154 unknown-provider path did not throw.

**Fail-closed:** persist unmatched method+url on 404
(`unmatched-NNN.json`). Serve and forward POST `/v1/responses` (and
`/responses`) the same way as chat completions so t1 can reach DeepSeek.
Do not add another recording-only throw.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest efeaef64 facts: spawn `--provider openai-api`, proxy
   `http://127.0.0.1:33457/v1`, HTTP 404 `{"error":"not found"}` three
   times, `requests/` empty, stdout 2580 bytes, 0 tool calls.
2. Measured `proxy.mjs`: chat-completions-only matcher; catch-all 404
   `{error:"not found"}` wrote nothing. Dest empty dumps follow.
3. Measured Hermes Agent overlay: `openai-api` → `codex_responses` →
   POST `/v1/responses`.
4. Fail-closed persist: unmatched method+url on 404
   (`unmatched-NNN.json`). Not a recording-only throw.
5. Serve/forward POST `/v1/responses` and `/responses`. Dump-only returns
   a Responses dummy. Live forwards to upstream `responses`.
6. Added `test/pcr-0155-dump-proxy-responses.test.mjs` (dest spawn,
   dest 404 path, no new throw, unmatched persist, `/v1/responses`
   dump, chat-completions hold).
7. Wrote this PCR and appended INDEX / METRICS.
8. Bumped public PCR count to 151 so living-docs matches on-disk PCR files.
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

Replay of dest t1 dump-proxy 404 only. Host never exposes a Tree-sitter
toggle. FreshCtx without Tree-sitter is out of scope for this leftover.
Model remains `deepseek-v4-flash` only on the PCR 0139 / 0142 live tables
this leftover does not re-run.

## Turns

| turn | produced on dest `efeaef64` one-shot | leftover |
|---|---|---|
| 1 `t1-read` | CLI protocol; spawn `--provider openai-api`; proxy 404 `{error:not found}` ×3; `requests/` empty; stdout 2580 (title gen + API 404); 0 tools | serve/forward POST `/v1/responses`; persist unmatched method+url |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0155-dump-proxy-responses.test.mjs` on this HEAD:

```
1..6
# tests 6
# pass 6
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..683
# tests 683
# pass 641
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **683 / 641 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 6 PCR 0155 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0155-dump-proxy-responses.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0155 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0155 tests | n/a | **6 / 6 / 0 / 0** | dest dump-proxy `/v1/responses` 404 |
| `npm test` TAP `# tests` | 549 | **683** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **641** | this checkout Isolated Semantic Engine WASM missing |
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
Measured on dest 404 shape + `proxy.mjs` + Hermes Agent overlay: t1 host
tools `[]` because `openai-api` POSTs `/v1/responses` and the dump proxy
only served `/chat/completions`. Dest `requests/` stayed empty. Title gen
and chat 404s are the same catch-all.
Not PCR 0154 unknown provider (`openai-api` already landed).
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
this Cloud Agent VM. Dest facts used: spawn `--provider openai-api`,
proxy `http://127.0.0.1:33457/v1`, HTTP 404 `{"error":"not found"}`
three times, `requests/` empty, stdout 2580 bytes, 0 tool calls. The
2580-byte stdout file was not copied here; unique dest lines were not
invented beyond the stated title-gen + API 404 shape.
Hermes `openai-api` transport is `codex_responses` from
NousResearch/hermes-agent `providers.py`. `hermes` was not installed on
this VM.
DeepSeek `/v1/responses` support is not remesured here. Dump-only returns
a Responses dummy. Live forwards the same path Hermes POSTed.
t2/t3/t4 were not produced on the dest one-shot because `auto-rpc` exited
at t1.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout
for the living suite that needs the real parser.
Official table is not replaced.
PCR 0154 `openai-api` argv/config is unchanged.
Cost-ledger `dump-proxy.mjs` is a sibling hole and is not this leftover.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm Hermes `openai-api` POSTs
`/v1/responses`, the dump proxy writes scans, and t1 records host tools
when DeepSeek answers that path.
