# PCR 0081 — drop piped dumps of paths already tracked

- Date (UTC): 2026-08-25
- Author / agent: Cursor Grok 4.6
- Branch / PR: (this working tree)
- Commit: (this commit)
- Merge-base: `9741d00` (main @ PCR 0079 stateless byte-exact)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`; `live-host`
- Decision: **review** (stale shell dump drop; do not merge)

## Hypothesis or change

Pi trial 2.1 later turns stayed large (~160–179 kB with FreshCtx) mostly because
turn-1 `bash` dumps (`cat /abs/path/cli.py` and `base64 < src/viajante/cli.py |
base64 -d`) sat in the conversation. `rejectUnsafeShell` still rejects pipes, so
those dumps were never tracked as official reads. After 0080 injects current
CLI bytes, a leftover CL0 dump would still be the stale copy.

**Primary fix:** do not teach the cat parser to run pipes. If a `bash`/`shell`
command mentions exactly one workspace path already in the registry, and that
call is not served by the live projection, replace the tool-result body with a
stable marker (keep the pair so the model does not retry the dump). Official
captured reads keep the same class of marker. Then the live projection is the
only copy of the file bytes. Unserved official reads still drop. A command that
names two tracked paths is not rewritten by this rule. Pi-native
`toolCall`/`toolResult` messages are walked, not only OpenAI `tool_calls`.

Fail-open unchanged. Door/lock/score unchanged.

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What we did

- `adapters/shell-read.mjs` — `trackedPathsMentionedInCommand` (longest path
  first; overlapping substrings do not double-count).
- `adapters/request-prune.mjs` — `staleShellDumpPathByCallId`; marker-replace
  those tool results; unserved prune only drops `observedCallIds` (tracked
  reads), not last-resort shell. Walk OpenAI `tool_calls` / `role: "tool"` and
  Pi-native `content[].type="toolCall"` / `role: "toolResult"`.
- `adapters/pi/extension.ts`, `adapters/pi/replay.mjs`,
  `adapters/hermes/bridge.mjs` — pass registry paths and observed call ids.
- `test/pcr-0081-stale-shell-dump.test.mjs` — pipes still parse to null; one
  tracked path is marked (`cat`, piped `base64`, `python3 -c open(...)`);
  two-path `wc` is not; Pi-native python dump is marker-replaced; official read
  + abs cat + piped dump holding CL0, disk flip to CL1, provider payload has
  CL1 and not CL0; five-file `cat` of the live viajante paths is left in place.

Did **not** expand `parseShellFileRead` to execute pipelines. Did **not** change
holdout gold, score weights, or the trial harness.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **243 pass**, **22 skip**, **0 fail** (265 total) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | 10 traces; stale 0; recall 1; `failures: []`. Tracked `pi-smoke.md` restored after the CLI write so report-hygiene stays clean. |
| `npm run ctxbench:hermes-smoke` | yes | 0 | 10 traces; stale 0; recall 1; `failures: []`. Tracked `hermes-smoke.md` restored after the CLI write so report-hygiene stays clean. |
| `npm run ctxbench:holdout-adapter-bakeoff` | yes | 0 | `pi-fresh` and `hermes-fresh` 0/10 stale; native 5/10 stale (PCR 0075 families) |
| Live Pi 2.2 battery | yes | 0 | both arms; [REPORT-2.2](../pi-trial/REPORT-2.2.md) |

## Metric snapshot

| metric | PCR 0078 / trial 2.1 | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| live default budget (chars) | 32 768 | 32 768 | 0 (not raised) |
| trial 2.1 cell 2 with-arm | 163,726; CL1 count 0 | 266,986; CL1=2; CL0=0 | freshness pass; bytes up |
| trial 2.1 cell 5 with-arm | 171,172 | 222,450; CL0=0 | not 20% below; see live breakdown |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |

## Replay board

Official `read` of a 39 kB `cli.py`, `cat /abs/path/cli.py`, and
`base64 < src/viajante/cli.py | base64 -d` still holding CL0. Disk flip to CL1.
The provider payload contains CL1 and not CL0; the piped dump body is replaced
with a `freshctx:stale-dump` marker.

Two-path `wc -l README.md src/viajante/cli.py` is not in `staleShellDumpCallIds`.
Five-file `cat README.md src/viajante/cli.py … notes/freshctx-todo.md` is left
in place (live 2.2 leftover).

## Live host (n=1, not a paper result)

`docs/lab/pi-trial/auto-rpc.mjs`, DeepSeek `deepseek-v4-pro`, no
`FRESHCTX_BUDGET_CHARS` override. Without-arm from the same driver; with-arm
rerun after Pi-native marker-replace.

| cell | without reply | with reply | with request bytes | 2.1 with bytes |
|---|---|---|---|---|
| 2-cli | `CLI=CL0` | `CLI=CL1` | 266,986; CL0 count 0 | 163,726; CL1 count 0 |
| 3-readme | `README=RD0` | `README=RD1` | 253,612 | ~179,000 (trial 2.1 prose; no exact dump) |
| 4-todo | `TODO=TD0` | `TODO=gone` | 221,613 | ~167,000 (trial 2.1 prose; no exact dump) |
| 5-inventory | `README=RD0` `CLI=CL0` `TODO=TD0` | `README=RD1` `CLI=CL1` `TODO=gone` | 222,450; CL0 count 0 | 171,172 |

Cell 5 with-arm is not 20% below 171,172. Capture `021.json` breakdown: tool
results ~113 kB of which ~102 kB is a five-file `cat` / `python` dump naming
more than one tracked path (left undropped by this PCR); ~87 kB is assistant
`reasoning_content`; single-path dumps of registry paths are markers; no CL0
file body.

## Limitations

- A shell command that names two or more paths is left untracked and undropped
  by this rule. That five-file concat dump dominated later-turn bytes in this
  live n=1.
- Unserved official reads still drop. Stale single-path dumps keep the pair and
  replace the body so the model does not retry the dump.
- Pi-native `toolCall` / `toolResult` must be walked; OpenAI-only prune left
  live dumps in place and a first Pi-native *drop* attempt looped (~55
  identical 13 kB requests) until marker-replace.
- Live later-turn bytes also include over-cap CLI inject (0080) and thinking.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only drop rule. Door, locks, evaluate score untouched.

## Next measurement

Freshness for this battery is closed. Size below the 160 kB floor needs a
follow-up that either bounds multi-path dumps or trims thinking, without
raising the default cap. That is not a new PCR until someone files it.
