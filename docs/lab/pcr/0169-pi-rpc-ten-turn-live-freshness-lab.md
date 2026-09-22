# PCR 0169 — Pi `--mode rpc` ten-turn live pack: B quotes current bytes on T3/T6/T7; T8/T9 are an unobserved symbol, not a stale read

- Date (UTC): 2026-09-03
- Author / agent: Cursor Cloud Agent (record); operator ran the sessions
- Branch / PR: `cursor/pcr-0169-pi-rpc-live-freshness-lab-2912` / draft against `main`
- Base SHA: `91a5f36a761ecb15c1032eb960ca0a2e571e8448` (PCR 0168; public count 164)
- Commits: docs-only. No `src/`, no `adapters/`, no `official/`, no bench, no fixture change
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold; no `--relock`)
- Hosts: official Pi binary on the operator's machine, `pi --mode rpc`, one long-lived child per arm. Pi version not recorded in the operator's notes (see Limitations). Arm B loaded the research extension `adapters/pi/extension.ts` with `-e`; the public out-of-process JSONL bridge (the `freshctx` product repo) was not involved
- Model: `deepseek/deepseek-v4-flash`, both arms
- Result labels used: `synthetic`; `live-host`; `lab-record`
- Decision: **review** (PR stays draft)

## Hypothesis or change

FreshCtx is a context substrate, not a coding agent. After a host read, later model
calls should see the current workspace bytes, not the stale tool result that
sits in the transcript. When current bytes cannot be resolved, FreshCtx must
not inject last-known content. This record writes down one operator-run,
ten-turn Pi lab that exercised both halves of that sentence on the research Pi
extension, so a later blog post can cite a fail-closed lab record instead of a
paraphrase.

**Conclusion (measured by the operator, one model, one run per arm, scored by
token presence): on the three turns whose gold changed on disk between a read
and the question (T3, T6, T7), arm B quoted the current bytes without a
re-read and arm A quoted the transcript. On the two turns B missed (T8, T9),
the symbol the gold asked about was never in the projection; that is a
coverage miss by the model's read choice, not a freshness miss.**

Not a paper result. Not CtxBench. Not a public performance claim. No dollars,
no Pass@1, no token counts. Nothing in this record changes code, tests, the
official table (549 / 0 / 0 / 549), the door, or the lock.

## What we did

Everything below happened outside git. Nothing from it is committed here: no
lab harness, no session JSONL, no `flip.py`, no fixture copy.

1. Operator built two working directories under
   `<local-checkout>/`: `plain/` (arm A) and `freshctx/`
   (arm B). Both held a copy of the synthetic fixture
   `docs/lab/pi-trial-ts/fixture/` (`src/settlement.ts`; target
   `settleDailyLedger` marker `ST0` at line 40, sibling `settleWeeklyLedger`
   marker `SW0` at line 53, lookalike `computeDailyLedgerTotal` marker `CT0`
   at line 122). Arm B's copy was rsynced fresh after arm A was killed.
2. One Pi child per arm, `pi --mode rpc -a --session <file> --provider
   deepseek --model deepseek-v4-flash`. Arm B added
   `-e <local-checkout>/adapters/pi/extension.ts`. Serial: all
   ten turns on A, kill A, rsync, all ten turns on B.
3. Between turns the operator mutated the fixture on disk with `flip.py`
   (marker flips) and `rm` (delete the file before T10). Tools stayed enabled
   in both arms. Where a prompt said "no tools", that was prompt text only;
   nothing disabled the Pi tool set.
4. `docs/lab/pi-trial-ts/force-host-read.ts` was **not** loaded. That
   extension rewrites every read to the `settleDailyLedger` span; on this pack
   it would have broken T5 and T8, which ask about other symbols. Pi's `read`
   tool has no `scope=symbol` argument; where a prompt said "scope=symbol",
   that was English for the model, not a tool parameter.
5. Gold was token presence. `ST1` anywhere in the reply passed a turn whose
   gold was `ST1`; the exact `SETTLE=ST0` formatting from earlier packs was not
   required. Extra prose was allowed.
6. Cloud Agent wrote this record, the INDEX and METRICS rows, and bumped the
   living PCR count to 165 (files on disk). No other file changed.

## First run: INVALID, do not cite as a result

The operator's first attempt spawned `pi -p` once per turn. Each process
starts with an empty FreshCtx registry, and the extension's `context` hook
returns before doing anything when nothing is tracked:

```313:313:adapters/pi/extension.ts
    if (engine.registry.list().length === 0) return;
```

So on arm B, T2 through T10 ran as plain Pi with the stale T1 read sitting in
the session file. Three more defects stacked on top: the model was
`deepseek-v4-pro`, scoring was exact-string, and some processes ran with
`--no-tools`. The scoreboard from that run (A 2/10, B 0/10) measures the
harness, not FreshCtx. It appears here only so nobody cites it.

This is the known Pi print-mode gap. `pi -p` per turn cannot carry the
registry between processes, and this record does not change `adapters/pi` to
make it do so.

## Second run: cite this only

| arm | pid | session id | cwd | argv |
|---|---|---|---|---|
| A (plain) | 82034 | `01a06895-9dbc-7b4c-bc69-aa6879e08475` | `<local-checkout>/plain` | `pi --mode rpc -a --session .../sessions/plain.jsonl --provider deepseek --model deepseek-v4-flash` |
| B (extension) | 82378 | `01a06898-9fe0-7ae0-bce7-fc881f7907f4` | `<local-checkout>/freshctx` | `pi --mode rpc -a -e <local-checkout>/adapters/pi/extension.ts --session .../sessions/freshctx.jsonl --provider deepseek --model deepseek-v4-flash` |

A's first spawn (pid 81615) died on the Python pipe-buffer handshake before
any turn and was not scored; the scored A child is 82034. stderr was empty on
both scored children. Every rpc prompt returned `success: true`.

Overall: **A 6/10, B 8/10.** On the claim turns (T3, T6, T7, T9, T10, the
turns where disk differed from the transcript or the file was gone):
**A 1/5, B 4/5.**

| turn | gold (token present) | A (plain) | B (extension) |
|---|---|---|---|
| T1 | `ST0` | PASS | PASS |
| T2 | `ST0` | PASS | PASS |
| T3 | `ST1` | FAIL, said `ST0` (stale) | PASS, `ST1` |
| T4 | `SW0` | PASS | PASS |
| T5 | `SW0` | PASS | PASS |
| T6 | `ST1`, `SW1` | FAIL, `ST0`/`SW0` | PASS, `ST1`/`SW1` |
| T7 | `ST0`, `SW1` | FAIL, `ST0`/`SW0` | PASS, `ST0`/`SW1` |
| T8 | `CT0` | PASS, `TOTAL=CT0` | FAIL, "no such symbol" |
| T9 | `ST0`, `SW1`, `CT1` | FAIL, `ST0`/`SW0`/`CT0` | FAIL, `ST0`/`SW1` correct, `CT1` missing |
| T10 | `UNAVAILABLE` | PASS | PASS |

## How to read this (the blog-post trap)

**T3, T6, T7 are the contrast.** On each, the operator flipped a marker on
disk after the model had already read the file. B answered with the current
bytes and did not call `read` again; the projection carried the refreshed
unit. A answered from the tool result in its transcript. This is the one
sentence FreshCtx exists for, and these three turns are the evidence for it.

**T8 and T9 are not a freshness miss on daily or weekly.** On T8, B called
`read` with `offset=1, limit=10`, which is the file header. FreshCtx tracked
that region plus the daily and weekly units it had already observed.
`computeDailyLedgerTotal` at line 122 was never read, so it was never in the
registry and never in the projection. The model treated "not in the
projection" as "the symbol does not exist" and stopped. Arm A grepped, read
the right span, and saw `CT0`. Then the operator flipped `CT0` to `CT1` on
disk (OP4). B had no unit for that symbol, so on T9 it had nothing current to
say about `CT1` and, correctly, did not invent one; its `ST0`/`SW1` were
right. The T9 gold assumed T8 had observed the total. It had not, on B. Read
T8/T9 as "the model's read choice left a symbol outside FreshCtx's view", not
as "FreshCtx served stale bytes".

**T10 is real fail-closed on B, but it is weak evidence for the A/B
contrast.** The file was removed before T10. FreshCtx could not resolve
current bytes for the removed file and did not inject the last-known content,
so B printed `UNAVAILABLE`. A also printed `UNAVAILABLE`, because the T10 prompt
told the model to print that string if current bytes were unknown, and A
followed the instruction. Same string, different reasons, and from the
scoreboard alone you cannot tell them apart. Do not sell T10 as the headline.
T3/T6/T7 are.

## What this record does not claim or document as implemented

- No official out-of-process Pi bridge under `official/`. Arm B is the research in-process extension
  `adapters/pi/extension.ts`, not the public out-of-process JSONL bridge.
- No change to `adapters/pi` for `pi -p` process restarts. Print mode per turn
  still cannot carry the registry; the first run above is what that looks
  like.
- Synthetic fixture on a live host only. Not a public repo, not a real task.
- Tree-sitter is always on in the product story. This is a Pi
  research-extension lab, not a no-Tree-sitter arm, and it says nothing about
  the Isolated Semantic Engine on or off.
- The ten-turn pack is the operator's example, not a product rule. Nothing
  here turns it into a fixture, a gate, or a benchmark.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ise:install` | yes | 0 | Tree-sitter grammars for the Isolated Semantic Engine |
| `npm test` | yes | 0 | `# tests 756` `# pass 756` `# fail 0` `# skipped 0` (docs-only branch; same as PCR 0168) |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention.recall` 1 |
| `npm run test:docs` | yes | 0 | living-docs count 165 matches files on disk; INDEX and METRICS name 0169 |
| `git fetch origin main && npm run ci` | yes | 0 | `check`, `test` 756 / 756, `test:docs` 11 / 11, `bench`, `ctxbench`, `evaluate` PASS, `evaluate:check-docs`, `papers:list`, `test:py` `Ran 13 tests` OK, `holdout:verify`, `holdout:ci-guard` against `origin/main` |
| `npm run ctxbench:pi-smoke` | no | n/a | no adapter change |
| live Pi rerun on this Cloud Agent | no | n/a | operator machine only; sessions not mounted here |

```
1..756
# tests 756
# suites 0
# pass 756
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## Metric snapshot

| metric | before | after | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| `npm test` | 756 / 756 / 0 | 756 / 756 / 0 | 0 |
| official accepted TAP | 549 / 0 / 0 / 549 | 549 / 0 / 0 / 549 | hold |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `4a953591…` | `4a953591…` | 0 |
| living PCR count | 164 | 165 | +1 (this record) |
| operator lab, overall | n/a | A 6/10, B 8/10 | recorded, not a metric |
| operator lab, claim turns T3/T6/T7/T9/T10 | n/a | A 1/5, B 4/5 | recorded, not a metric |

Label: `synthetic`; `live-host`; `lab-record`. No dollars. No Pass@1. No
token counts. No cheaper-intelligence claim.

## Comparison

No external comparison. Not a public-repo or CORVUS claim. Arm A is plain Pi
on the same model and prompts, not a competing context system.

## Conflicts with constitutions

None observed. "Never inject last-known content when current resolution
fails" held on T10 B. The extension did not mask a result it could not
refresh. Selection order and render order stay separate concepts. `src/`,
bench fixtures, gold labels, weights, thresholds, and the held-out split are
untouched. The scoreboard is not used as a core acceptance metric anywhere in
the repo.

## Limitations

- One operator, one machine, one model, one run per arm, ten turns. No
  repeats, no seeds, no confidence interval. Treat every number as n=1.
- The Pi version and the exact commit of `adapters/pi/extension.ts` the
  operator loaded were not recorded. The adapter rule to record host version
  and capability surface in every benchmark is not met by this record; that
  is one reason it is a lab record and not a benchmark.
- Session files (`sessions/plain.jsonl`, `sessions/freshctx.jsonl`),
  `flip.py`, and the request bodies live on the operator's machine and are not
  in this repo. A reader cannot re-derive the table from committed artifacts.
- Scoring was token presence, judged by the operator. The rule is lenient. A
  reply that mentioned both `ST0` and `ST1` would pass a `ST1` gold. A stricter
  rule would require the current token and reject the stale one.
- Arms ran serially with a fresh fixture copy for B. Provider-side drift
  between the A run and the B run is not controlled.
- The T9 gold embeds a T8 assumption (that the model observed
  `computeDailyLedgerTotal`). On B it did not, so T9 B is under-determined by
  the pack, not by the extension. The pack design, not FreshCtx, owns that
  fail.
- T10 passes on both arms for different reasons and cannot separate them.

## Next measurement

Rerun the same ten turns with T8 rewritten to require a `read` of
`src/settlement.ts` lines 120 through 126 (so `computeDailyLedgerTotal` enters
the registry on both arms), record `pi --version` and `git -C
<local-checkout> rev-parse HEAD` in the notes, and score T9
`CT1` only when T8 observed `CT0`. That makes T9 a real freshness turn on the
lookalike instead of a coverage turn, and it gives the blog post a fourth
current-bytes contrast next to T3/T6/T7.
