# PCR 0083 official omitted-read loop

- Date (UTC): 2026-08-27
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/pcr-0083-omitted-read-loop-4844` / draft PR 80
- Base: `a71d24f1155f37d897113d71859a33278e2ba96e` (PCR 0082 squash of PR 76)
- Merge-base: `a71d24f1155f37d897113d71859a33278e2ba96e`
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

When a tracked official `read` is omitted at the default 32,768-char adapter
budget, keep the assistant/tool pair and replace the tool-result body with a
truthful marker that names the path and says the current content was omitted for
budget. Do not inject omitted bytes. Do not claim the live projection supplied
the file when it did not.

PCR 0080 still governs the same-turn refresh case: if the tracked file flips on
disk before the next request, the adapter must still force-select the full
current bytes even over the cap. PCR 0082 single-path dump behavior stays as-is.

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / locks / budget (unchanged)

| artifact | value |
|---|---|
| Merge-base | `a71d24f1155f37d897113d71859a33278e2ba96e` |
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `DEFAULT_BUDGET_CHARS` | `32768` |

## Test-first evidence

On the clean `a71d24f1155f37d897113d71859a33278e2ba96e` base, the new replay
board failed red in `test/pcr-0083-official-omitted-read-loop.test.mjs` at the
assistant/tool-pair assertion: the omitted official `read` pair was deleted, so
the adapter-visible request had no truthful marker and live Pi could keep
retrying the same read. The same-turn CL1 refresh board already passed on that
red run.

After the adapter-only change, targeted replay and parity coverage passed, then
`npm test`, `npm run evaluate`, and `npm run ctxbench` all held the frozen
score, payload, door, and lock.

## What changed

- `adapters/request-prune.mjs` — derive call-level projection dispositions so a
  budget-omitted official `read` can stay in the request with a truthful
  `freshctx:omitted-read` marker, even when another unit on the same path is
  selected.
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts`,
  `adapters/hermes/bridge.mjs` — pass the per-call disposition map into adapter
  request assembly.
- `test/pcr-0083-official-omitted-read-loop.test.mjs` — add the two official
  read replay boards.
- `test/adapter-request-prune.test.mjs` — add a same-path whole-file-vs-region
  guard so the omitted whole-file marker remains truthful under shared adapter
  prune logic.

No door edit. No lock edit. No budget raise. No gold, weight, or threshold
change.

## Boards

| board | setup | expected | observed |
|---|---|---|---|
| 1. cold over-cap official read | Track `src/viajante/cli.py` (~39 kB) by official `read`; no disk flip before request | request has no `CL0` or `CL1`; official `read` pair is kept; marker names `src/viajante/cli.py`; marker says omitted for budget and does not claim presence | **pass** |
| 2. same-turn CL1 refresh | Same board, then overwrite `src/viajante/cli.py` to `CL1` before the next request; keep the single-path dump in the conversation as a regression guard | one live `CL1` body, no `CL0`, official `read` pair kept, dump path behavior from PCR 0082 stays truthful | **pass** |

## Verification

| command | exit | notes |
|---|---|---|
| `node --test test/pcr-0078-cat-tracked-read.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs test/pcr-0083-official-omitted-read-loop.test.mjs test/adapter-request-prune.test.mjs` | 0 | 26 passed, 0 failed |
| `node --test test/adapter-request-prune.test.mjs test/pi-adapter.test.mjs test/hermes-adapter.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs test/pcr-0083-official-omitted-read-loop.test.mjs` | 0 | 28 passed, 0 failed |
| `npm test` | 0 | 249 passed, 22 skipped, 0 failed, 271 total |
| `npm run evaluate` | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`, deterministic hash agreement `1` |

## Metric snapshot

| metric | before | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |

## Scope and limits

This PCR is adapter-only. It does not change the core projector, transcript
format, score function, evaluator weights, or benchmark fixtures.

The retained official-read rule stays narrow:

- budget-omitted official `read` pairs are kept with a truthful marker;
- same-turn disk refresh still promotes the full current bytes over the cap
  (PCR 0080);
- single-path shell dumps keep PCR 0082 behavior;
- deleted or otherwise unresolved official reads still follow the earlier
  adapter path rather than extending this PCR beyond the budget-omitted loop.

## Recommended next experiment

Cross the omitted official-read board with a one-path piped dump on both replay
adapters, still without raising `DEFAULT_BUDGET_CHARS` or editing benchmark
data.
