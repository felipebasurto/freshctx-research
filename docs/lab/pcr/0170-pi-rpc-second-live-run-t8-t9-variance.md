# PCR 0170 — Pi `--mode rpc` second counting live run: B 5/5 on claim turns; T8/T9 B passed on a different read, the header-slice defect is not closed

- Date (UTC): 2026-09-03
- Author / agent: Cursor Cloud Agent (record); operator ran the sessions
- Branch / PR: `cursor/pcr-0170-pi-rpc-second-live-run-d3d5` / [#180](https://github.com/felipebasurto/freshctx-research/pull/180), draft against `main`
- Base SHA: `5e223489cb7f501266ee4ad2bc782408f98d1998` (PCR 0169; public count 165)
- Commits: docs-only. No `src/`, no `adapters/`, no `official/`, no bench, no fixture change
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`, `sha256sum papers/manifest.json`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold; no `--relock`)
- Hosts: official Pi binary on the operator's machine, `pi --mode rpc`, one long-lived child per arm. Pi version not recorded (see Limitations). Arm B loaded the research extension from this repo, `-e /Users/felipe/Proyectos/freshctx-research/adapters/pi/extension.ts`. `/Users/felipe/Proyectos/freshctx` now holds only `official/`; the official out-of-process serve was not wired into either arm
- Model: `deepseek/deepseek-v4-flash`, both arms
- Result labels used: `synthetic`; `live-host`; `lab-record`
- Decision: **review** (PR stays draft)

## Hypothesis or change

This is the second counting live-host run of the ten-turn Pi pack that
[PCR 0169](0169-pi-rpc-ten-turn-live-freshness-lab.md) recorded first. Same
protocol, same prompts' gold, same model, fresh fixture, fresh sessions. The
question the second run answers is narrow: does the T3/T6/T7 contrast hold on
a second pair of processes, and do the T8/T9 misses from 0169 recur.

**Conclusion (measured by the operator, one model, one run per arm, scored by
token presence): the daily/weekly contrast held. A stayed on the transcript's
`ST0`/`SW0` on T3, T6, and T7; B quoted the bytes on disk. T8/T9 B passed this
time. B passed because the model chose different tools (`grep -n` then a
whole-file `read`), not because anything in `adapters/pi` changed. The
header-slice defect that produced the 0169 T8 fail did not fire; it is not
shown fixed.**

Claim turns T3/T6/T7/T9/T10: **B 5/5, A 1/5.** Overall: **A 6/10, B 10/10.**

Not a paper result. Not CtxBench. Not a public performance claim. No dollars,
no Pass@1, no token counts. Nothing in this record changes code, tests, the
official table (549 / 0 / 0 / 549), the door, or the lock.

## What we did

Everything below happened outside git. Nothing from it is committed here: no
lab harness, no session JSONL, no `flip.py`, no fixture copy.

1. Operator restored `src/settlement.ts` in both lab workspaces from the
   `ST0`/`SW0`/`CT0` fixture (`docs/lab/pi-trial-ts/fixture/`). Before T1:
   `settleDailyLedger` marker `ST0`, `settleWeeklyLedger` marker `SW0`,
   `computeDailyLedgerTotal` at line 122 with `MARKER_TOTAL = "CT0"`.
2. New session files for both arms (ids beginning `01a068c6-9d28…` for A and
   `01a068c6-9d3c…` for B; the operator's notes give the prefixes only).
3. One Pi child per arm, alive for all ten turns. Neither arm used `pi -p`.

   | arm | pid | argv (as recorded) |
   |---|---|---|
   | A (plain) | 90048 | `pi --mode rpc -a` (no `-e`, no `-p`) |
   | B (extension) | 90049 | `pi --mode rpc -a -e /Users/felipe/Proyectos/freshctx-research/adapters/pi/extension.ts` (no `-p`) |

   Both pids were unchanged across all ten turns. Model
   `deepseek-v4-flash` on both.
4. Between turns the operator mutated the fixture on disk with the same
   marker flips as PCR 0169 (`OP4` is `CT0` to `CT1` before T9) and removed
   the file before T10. Tools stayed enabled in both arms; "no tools" in a
   prompt was prompt text.
5. Gold was token presence, same rule as PCR 0169. `ST1` anywhere in the
   reply passed a `ST1` gold.
6. Cloud Agent checked `adapters/pi` for a diff between the PCR 0169 base and
   `main` (none; see below), wrote this record, the INDEX and METRICS rows,
   and bumped the living PCR count to 166 (files on disk). No other file
   changed.

## Adapter diff check: none

`git diff 5e22348~1 5e22348 -- adapters/pi` and
`git diff 91a5f36 5e22348 -- adapters/pi` are both empty. The last commit that
touched `adapters/pi/` is `79958de3f11e852f9e101d63524ca6a1a248b4dc` (landing
`feat/freshctx-next`, PR #133), which is an ancestor of the PCR 0169 base. So
the extension source on `main` is byte-identical between the two counting
runs. The operator did not record the commit of their local
`freshctx-research` checkout, so this record cannot rule out an uncommitted
local edit; it can say no adapter change was shipped to `main` between the two
runs. On that basis T8/T9 B is treated as model tool variance, not as a fix.

## Scoreboard

| turn | gold (token present) | A (plain) | B (extension) |
|---|---|---|---|
| T1 | `ST0` | PASS | PASS |
| T2 | `ST0` | PASS | PASS |
| T3 | `ST1` | FAIL, `ST0` (stale) | PASS, `ST1` |
| T4 | `SW0` | PASS | PASS |
| T5 | `SW0` | PASS | PASS |
| T6 | `ST1`, `SW1` | FAIL, `ST0`/`SW0` | PASS, `ST1`/`SW1` |
| T7 | `ST0`, `SW1` | FAIL, `ST0`/`SW0` | PASS, `ST0`/`SW1` |
| T8 | `CT0` | PASS, `CT0` | PASS, `TOTAL=CT0` |
| T9 | `ST0`, `SW1`, `CT1` | FAIL, `ST0`/`SW0`/`CT0` | PASS, `ST0`/`SW1`/`CT1` |
| T10 | `UNAVAILABLE` | PASS | PASS |

Overall: **A 6/10, B 10/10.** Claim turns (T3, T6, T7, T9, T10): **A 1/5,
B 5/5.** A's one claim-turn pass is T10, as in PCR 0169, and it is a
prompt-following pass, not a freshness pass. A's T9 answer `CT0` is the T8
tool result replayed from the transcript after `OP4` flipped the file to
`CT1`; it is a stale-memory fail on A, not evidence about B.

Across the two counting runs (PCR 0169 and this one): claim turns A 2/10,
B 9/10; overall A 12/20, B 18/20. Two runs, one model, n=2 per arm.

## How to read this (the blog-post trap)

**T3, T6, T7 are the contrast, again.** On each, the operator flipped a marker
on disk after the model had already read the file. B answered with the current
bytes; A answered from the tool result in its transcript. Same shape as PCR
0169. This is the sentence FreshCtx exists for, and it now has two runs
behind it.

**T8 B passed on the tool choice, not on a fix.** In PCR 0169, B's T8 read
was `read offset=1 limit=10`, which the adapter tracked as a region unit
(lines 1 through 12). `computeDailyLedgerTotal` at line 122 was never
observed, and the model read "not in the projection" as "no such symbol". In
this run, B's T8 went `bash grep -n computeDailyLedgerTotal` (hit at line
122) and then a `read` of the whole file, 4911 bytes. The served bytes carried
`computeDailyLedgerTotal` and `MARKER_TOTAL`. Marker counts in that tool
result: `CT0` 2, `CT1` 0, `ST0` 1, `SW1` 1, which is the on-disk state the
T7 gold describes (`ST0`, `SW1`) plus the untouched total. B replied
`TOTAL=CT0` with no absence claim.

**T9 B passed because T8 put the symbol in the registry.** After `OP4`
flipped `CT0` to `CT1`, B (no tool call on T9) replied `TOTAL=CT1`,
`SETTLE=ST0`, `WEEKLY=SW1`. That is the whole-file unit refreshed from disk
and projected. B did not treat unobserved as missing this time because
nothing relevant was unobserved.

**Do not write that the header-slice bug is closed.** The 0169 T8 fail had a
specific shape: a header slice tracked as a region, and the model treating the
slice as an inventory of the file. Nothing in `adapters/pi` changed between
the two runs. The model's read choice changed, so the shape never came up.
Whether the adapter's rendering of a region unit invites that misreading, or
whether it is a model habit the adapter cannot fix, is not settled by this
run. Any post that says "T8 is fixed" is describing variance as a fix. If a
future change makes the projection state that a region unit is a slice of a
larger file, that change gets its own PCR with a red-green test against the
`offset=1 limit=10` case.

**T10 is fail-closed on B and prompt-following on A.** The file was removed
before T10. B's reasoning trace named three unresolved units and no live
projection and printed `UNAVAILABLE`. A printed `UNAVAILABLE` because the prompt
told it to when current bytes were unknown. Same string, different reasons,
same caveat as PCR 0169. Do not sell T10 as the headline.

## What this record does not claim or document as implemented

- No official out-of-process Pi bridge under `official/`. Arm B is the
  research in-process extension `adapters/pi/extension.ts` from this repo, not
  the public product's out-of-process serve, which is not wired into Pi here.
- No change to `adapters/pi`. No fix for the `pi -p` per-process registry gap
  (PCR 0169 first run). No fix for the header-slice misreading.
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
| `npm test` | yes | 0 | `# tests 756` `# pass 756` `# fail 0` `# skipped 0` (docs-only branch; same as PCR 0169) |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention.recall` 1 |
| `npm run test:docs` | yes | 0 | living-docs count 166 matches files on disk; INDEX and METRICS name 0170 |
| `git fetch origin main && npm run ci` | yes | 0 | `check`, `test` 756 / 756, `test:docs` 11 / 11, `bench`, `ctxbench`, `evaluate` PASS, `evaluate:check-docs`, `papers:list`, `test:py` `Ran 13 tests` OK, `holdout:verify`, `holdout:ci-guard` against `origin/main` (`5e223489`) |
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
| living PCR count | 165 | 166 | +1 (this record) |
| operator lab, overall (this run) | PCR 0169: A 6/10, B 8/10 | A 6/10, B 10/10 | recorded, not a metric |
| operator lab, claim turns T3/T6/T7/T9/T10 (this run) | PCR 0169: A 1/5, B 4/5 | A 1/5, B 5/5 | recorded, not a metric |

Label: `synthetic`; `live-host`; `lab-record`. No dollars. No Pass@1. No
token counts. No cheaper-intelligence claim.

## Comparison

No external comparison. Not a public-repo or CORVUS claim. Arm A is plain Pi
on the same model and prompts, not a competing context system.

## Conflicts with constitutions

None observed. "Never inject last-known content when current resolution
fails" held on T10 B. Selection order and render order stay separate
concepts. `src/`, `adapters/`, bench fixtures, gold labels, weights,
thresholds, and the held-out split are untouched. The scoreboard is not used
as a core acceptance metric anywhere in the repo.

## Limitations

- One operator, one machine, one model, one run per arm, ten turns. With PCR
  0169 that is n=2 per arm. No seeds, no confidence interval.
- The Pi version and the commit of the operator's `freshctx-research`
  checkout were not recorded. The adapter rule to record host version and
  capability surface in every benchmark is still not met; this is a lab
  record, not a benchmark. The "no adapter diff" finding is about `main`, not
  about the operator's working tree.
- Session files, `flip.py`, and request bodies live on the operator's machine
  and are not in this repo. A reader cannot re-derive the table from committed
  artifacts. Session ids are recorded as prefixes only.
- Whether the T8 prompt text changed between the two runs is not recorded.
  PCR 0169's "Next measurement" proposed rewriting T8 to force a read of
  lines 120 through 126. This run's B read the whole file after a `grep`, so
  either way T8 became a coverage pass, and T9 became a real freshness turn on
  the lookalike.
- Scoring was token presence, judged by the operator. A reply with both `ST0`
  and `ST1` would pass a `ST1` gold.
- Arms ran with separate processes and separate workspaces on one machine.
  Provider-side drift between the A and B calls is not controlled.
- T8/T9 B passing on a whole-file read leaves the header-slice case untested
  in this run. The 0169 fail is the only observation of it.

## Next measurement

Force the header-slice case instead of waiting for the model to pick it. Rerun
T8 on B with the prompt requiring `read offset=1 limit=10` first and then
asking for `computeDailyLedgerTotal`, and record whether the model says "no
such symbol" against a projection that holds only a region unit. If it does,
the follow-up is an adapter change with a red-green test that renders a region
unit as a slice of a larger file, not this record. Also record `pi --version`
and `git -C /Users/felipe/Proyectos/freshctx-research rev-parse HEAD` in the
notes so the next record can cite them.
