# PCR 0160 — Cost-ledger dump-proxy sibling after dest 71379f00 t1–t4 print

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0160-cost-ledger-dump-proxy-4292` / draft
- Base SHA: `71379f009d22d2487fb3396fb5de4b6cc3ab3bc9` (PR 162 squash; PCR 0159 dest cwd on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Thinker ran live Hermes 4-turn on dest
`/workspace/freshctx-measure-71379f00-multiturn` SHA
`71379f009d22d2487fb3396fb5de4b6cc3ab3bc9` at 2026-09-02. Exit 0 (~152s).
Both arms printed t1–t4. This leftover is **not** a new t1 chase.

**Measured print (real numbers; not invented $ or Pass@1):**

| host | arm | turn | tools | resolution | hostReadArgsMatched | other |
|---|---|---|---:|---|---|---|
| hermes | `nothing` | t1-read | 1 | none | true | `read_file` dest work `src/settlement.ts` `scope=symbol` selector `settleDailyLedger`; `SETTLE=ST0` |
| hermes | `nothing` | t2–t4 | 4 | none | n/a | printed |
| hermes | `freshctx-ts` | t1-read | 1 | none | n/a | printed |
| hermes | `freshctx-ts` | t2–t4 | 4 | none | n/a | printed |

`summary.json` `notAPaperResult` true.
Scan `promptTokens` null.
Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
t4 `resolution=none` is printed. Isolated Semantic Engine WASM / Tree-sitter
is **not** this leftover.

**Named leftover after that print:** cost-ledger dump-proxy sibling
(`docs/lab/hermes-trial-ts/proxy.mjs` dump-proxy vs
`docs/lab/cost-ledger/dump-proxy.mjs` dump path).

**Measured on the two dump files (not a dest remesure, not live):**

1. Dest leftover is not PCR 0159 host-clone cwd. t1 `read_file` hit dest
   work. `hostReadArgsMatched=true`. `SETTLE=ST0`.
2. Dest leftover is not PCR 0158 silent `[]`. Tools printed.
3. Dest leftover is not PCR 0157 SSE. Hermes CLI completed t1–t4.
4. `hermes-trial-ts/proxy.mjs` serves POST `/v1/responses`, translates to
   DeepSeek `chat/completions`, writes request-body scans. Those scans have
   `promptTokens` null (no `"prompt_tokens"` in the Responses request).
5. `cost-ledger/dump-proxy.mjs` still only matched `/chat/completions` and
   404ed `/v1/responses`. `forwardChatCompletions` forwarded the same body.
   That sibling could not ingest these live dumps as provider usage, and
   would 404 if used as the Hermes CLI dump path.

**Fail-closed:** serve `/v1/responses` on the cost-ledger dump-proxy using
the already-measured hermes-trial-ts translate + SSE helpers. Write usage
from the provider **response**, never from a dummy. Ingest the dest 71379f00
four-turn print with `notAPaperResult=true`, `promptTokens` null, `$` `—`,
Pass@1 null. Four-turn ingest is not a long-session paper `$`. Dest dumps
are not mounted on this Cloud Agent VM; that skip names the exact sibling
(`hermes-trial-ts/proxy.mjs` dump-proxy scans vs `cost-ledger/dump-proxy.mjs`
dump path). Do not invent dollars or Pass@1. Do not reopen cwd / SSE /
silent-`[]`.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed dest 71379f00 facts: dest path above; dest SHA
   `71379f009d22d2487fb3396fb5de4b6cc3ab3bc9`; both arms t1–t4; nothing t1
   tools=1 `hostReadArgsMatched=true` `SETTLE=ST0` `read_file` dest work
   `src/settlement.ts` `scope=symbol` selector `settleDailyLedger`; t2–t4
   tools=4 `resolution=none`; freshctx-ts t1 tools=1 `resolution=none`;
   t2–t4 tools=4 `resolution=none`; `notAPaperResult` true; scan
   `promptTokens` null.
2. Read the two dump-proxy files. Discarded reopen cwd / SSE / silent-`[]`
   for this leftover. The hole is the cost-ledger dump path.
3. Fail-closed cost-ledger `/v1/responses`: import hermes-trial-ts
   translate + SSE; keep `forwardChatCompletions` on translated
   `chat/completions`; write provider-response usage; dump-only tokens stay
   null.
4. Fail-closed four-turn ingest: `notAPaperResult`, refuse paper `$` and
   Pass@1; `promptTokens` stay `—`; dest-not-mounted skip names the sibling.
5. Added `test/pcr-0160-cost-ledger-dump-proxy.test.mjs`.
6. Wrote this PCR and appended INDEX / METRICS.
7. Bumped public PCR count to 156 so living-docs matches on-disk PCR files.
8. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
9. Did not `--relock`.
10. Same Cloud Agent wrote PCR, INDEX, and METRICS.
11. Did not invent TAP, SWE scores, or live `$`.
12. Did not replace PCR 0142 paper.
13. Did not re-run live hosts on this leftover.
14. Did not reopen PCR 0157 SSE event names.
15. Did not reopen PCR 0158 silent `[]`.
16. Did not reopen PCR 0159 dest cwd.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |
| `freshctx-ts` | yes | on (Tree-sitter is the Isolated Semantic Engine default) |

Replay of dest 71379f00 print + cost-ledger dump-path leftover only.
Host never exposes a Tree-sitter toggle. FreshCtx without Tree-sitter is
out of scope for this leftover. Model remains `deepseek-v4-flash` only on
the PCR 0139 / 0142 live tables this leftover does not re-run.

## Turns

| turn | produced on dest `71379f00` | leftover |
|---|---|---|
| 1 `t1-read` | `nothing` tools=1 `hostReadArgsMatched=true` `SETTLE=ST0` dest-work `read_file`; `freshctx-ts` tools=1 `resolution=none` | cost-ledger dump-proxy sibling; scan `promptTokens` null |
| 2 `t2-settle` | both arms tools=4 `resolution=none` | same sibling; not ISE WASM |
| 3 `t3-settle` | both arms tools=4 `resolution=none` | same sibling; not ISE WASM |
| 4 `t4-unchanged` | both arms tools=4 `resolution=none` (printed) | same sibling; not ISE WASM / Tree-sitter leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0160-cost-ledger-dump-proxy.test.mjs` on this HEAD:

```
1..7
# tests 7
# pass 7
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..715
# tests 715
# pass 673
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **715 / 673 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 7 PCR 0160 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0160-cost-ledger-dump-proxy.test.mjs` | yes | 0 | TAP above |
| `npm test` | pending first official suite | n/a | this-run Cloud Agent TAP above is the expected living count; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | pending first official suite | n/a | hard gate follows this-run TAP |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | dest print reused; dest not mounted; no live remesure |

## Metric snapshot

| metric | official `79958de` | PCR 0160 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0160 tests | n/a | **7 / 7 / 0 / 0** | dest 71379f00 print + dump-proxy sibling |
| `npm test` TAP `# tests` | 549 | **715** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **673** | this checkout Isolated Semantic Engine WASM missing |
| `npm test` TAP `# fail` | 0 | **42** | `isolated-semantic-engine-missing` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | hard gate follows this-run TAP | official table not replaced |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| dest 71379f00 `$` invented here | n/a | **none** | scan `promptTokens` null; four-turn ingest `$` is `—` |
| Pass@1 invented here | n/a | **none** | not a SWE dump |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Measured on dest 71379f00 print + the two dump-proxy files after PCR 0159:
t1–t4 printed; nothing t1 dest-work `read_file` `hostReadArgsMatched=true`
`SETTLE=ST0`; later turns `resolution=none`; scan `promptTokens` null;
`notAPaperResult` true; cost-ledger dump-proxy was the `/chat/completions`
sibling. That sibling now serves `/v1/responses` and ingests the four-turn
print without paper `$` or Pass@1.
Dest dumps were not mounted; skip names
`docs/lab/hermes-trial-ts/proxy.mjs` dump-proxy scans vs
`docs/lab/cost-ledger/dump-proxy.mjs` dump path.
Not PCR 0159 dest cwd.
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
Dest `/workspace/freshctx-measure-71379f00-multiturn` was not mounted on
this Cloud Agent VM. Dest facts reused from the Thinker measure: dest SHA
`71379f009d22d2487fb3396fb5de4b6cc3ab3bc9`, exit 0 (~152s), both arms
t1–t4, table above, `notAPaperResult` true, scan `promptTokens` null.
Honest skip of those dump files names the exact sibling.
Four-turn ingest is not an eight-turn long-session cost table.
`$` stays `—` when `promptTokens` is null. A 4-byte estimate is not paper `$`.
t4 `resolution=none` is printed and is not this leftover.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout
for the living suite that needs the real parser.
Official table is not replaced.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later agent with dest 71379f00 mounted can ingest the real
`summary.json` / `*.scan.json` through the four-turn path and still print
`$` as `—` until provider-response usage exists.
Do not treat t4 `resolution=none` as Isolated Semantic Engine WASM unless
Felipe asks.
Do not reopen dest cwd, SSE, or silent `[]`.
