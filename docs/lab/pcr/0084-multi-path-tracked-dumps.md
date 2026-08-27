# PCR 0084 — multi-path tracked dumps

- Date (UTC): 2026-08-27
- Author / agent: Cursor GPT-5.4
- Branch / PR: `cursor/pcr-0084-multi-path-tracked-dumps-c774` / draft
- Commit: (this commit)
- Merge-base: `a71d24f1` (PCR 0082 squash of PR 76)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

If a last-resort shell dump names several paths and **every** named path is
already tracked, keep the assistant/tool pair but replace the stale dump body
with a marker. If the command names **any** untracked path, leave the dump
alone. Single-path PCR 0081/0082 behavior stays unchanged.

Door, lock, `DEFAULT_BUDGET_CHARS`, `AUTORESEARCH_SCORE`, and the ctxbench
payload digest do not move. This is adapter-only and not a paper result or a
SOTA claim. Gold stays language-agnostic.

### Door / lock (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Test-first evidence

Before the adapter change, the new red board
`test/pcr-0084-multi-path-tracked-dumps.test.mjs` failed:

- command: `node --test test/pcr-0084-multi-path-tracked-dumps.test.mjs`
- failing board: `PCR 0084: all-tracked multi-path cat keeps the pair and marker-replaces the dump`
- failure: `Expected values to be strictly deep-equal: actual [] vs expected ['call-all-tracked']`

Root cause: `staleShellDumpPathByCallId()` only rewrote shell dumps when
`trackedPathsMentionedInCommand()` returned exactly one tracked hit, so safe
multi-path `cat` dumps fell through even when every named path was already in
the registry.

## Change

- `adapters/shell-read.mjs`
  - added `shellDumpPathsFromCommand()` for safe multi-path `cat`/`nl` path
    extraction without widening tracked-read capture.
- `adapters/request-prune.mjs`
  - resolve multi-path dump arguments back to tracked registry paths;
  - marker-replace only when every named path resolves to an already-tracked
    path;
  - preserve the existing single-path path for piped / python / one-path shell
    dumps;
  - keep mixed tracked/untracked multi-path commands untouched;
  - render one compact multi-path marker with per-path projection status.
- `test/pcr-0084-multi-path-tracked-dumps.test.mjs`
  - added the all-tracked marker board and the one-untracked guard board.
- `test/pcr-0081-stale-shell-dump.test.mjs`
  - updated the old five-file leftover board so the leftover case is now the
    mixed tracked/untracked command, not the all-tracked case closed here.
- `docs/ARCHITECTURE.md`, `adapters/pi/README.md`, `adapters/hermes/README.md`
  - updated the current adapter contract text.

Did **not** edit `src/anchors.mjs`. Did **not** change benchmark fixtures, gold
labels, weights, thresholds, payload logic, `persist-38`, `lastInjectedRevision`,
or PCR 0077 restore behavior.

## Replay table

| board | command shape | expected request-copy behavior | observed |
|---|---|---|---|
| all-tracked multi-path dump | `cat README.md src/viajante/cli.py src/viajante/models.py src/viajante/flights.py` | keep pair; replace dump body with `freshctx:stale-dump`; no huge stale concat body | pass |
| one-untracked-path dump | `cat README.md src/viajante/cli.py src/viajante/models.py notes/freshctx-todo.md` | leave dump body alone because not every named path is tracked | pass |

The tests use Python fixture text only as bytes. The gold condition is
language-agnostic.

## Verification

- `node --test test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0084-multi-path-tracked-dumps.test.mjs`: 9 passed, 0 failed.
- `node --test test/pcr-0080-refresh-over-budget.test.mjs test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs test/pcr-0084-multi-path-tracked-dumps.test.mjs`: 14 passed, 0 failed.
- `npm test`: 248 passed, 22 skipped, 0 failed, 270 total.
- `npm run evaluate`: `AUTORESEARCH_SCORE=89.107165`.
- `npm run ctxbench`: payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1`.
- merge-base vs `a71d24f1155f37d897113d71859a33278e2ba96e`: exact match.

## Metric hold

This PCR does not touch the projector, policy, score weights, benchmark lock, or
ctxbench payload construction. Observed delta:

| metric | before | after | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | same | 0 |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | same | 0 |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | same | 0 |

## Limitations

- Multi-path marker replacement is intentionally narrow: safe `cat`/`nl` only.
  It does not expand tracked-read capture or widen shell execution semantics.
- If a multi-path command names any untracked path, the full dump stays in the
  request copy by design.
- This closes the all-tracked concat leftover without changing single-path 0081
  or 0082 semantics.

## Protocol gap?

**No.** Adapter-only hole closed without moving door, lock, score, payload, or
budget cap.

## Next measurement

Re-run the live Pi 2.2 inventory-style battery on top of this branch to confirm
the five-file all-tracked concat body is gone while mixed tracked/untracked
dumps remain untouched. That is still a live-host check, not a paper result.
