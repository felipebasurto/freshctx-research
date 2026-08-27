# PCR 0090 — multi-path dumps beyond cat/nl

- Date (UTC): 2026-08-27
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0090-multi-path-dumps-1ddc` / draft PR #85
- Commit: (this commit)
- Merge-base: `4119145db0c449ed7a0005fa64ae94e59e9b5fb9` (`main`, PCR 0089 squash of PR 84)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

If every named path in a multi-path dump is already tracked, keep the
assistant/tool pair but marker-replace the huge concat body even when the dump
arrives through a Python argv reader, a piped `cat`, or `xargs cat`. If any
named path is untracked, leave the dump untouched. Path matching stays
fail-closed exact: `docs/README.md` is not tracked `README.md`.

Gold is language-agnostic: first/last, span, location, exact bytes. This is an
adapter-only replay change, not a paper result, and not a SOTA claim.

### Frozen values checked in this run

| artifact | value |
|---|---|
| Merge-base | `4119145db0c449ed7a0005fa64ae94e59e9b5fb9` |
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `DEFAULT_BUDGET_CHARS` | `32768` |
| `AUTORESEARCH_SCORE` | `89.107165` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` |

## Test-first evidence

Before the adapter change, the new PCR 0090 boards failed red:

- command: `node --test test/pcr-0090-multi-path-beyond-cat.test.mjs`
- failing boards:
  - `PCR 0090: all-tracked multi-path python argv dump marker-replaces the dump`
  - `PCR 0090: all-tracked piped cat dump marker-replaces the dump`
  - `PCR 0090: all-tracked xargs cat dump marker-replaces the dump`
- representative failure:
  `Expected values to be strictly deep-equal: actual [] vs expected ['call-python-all-tracked']`

Root cause: the multi-path dump matcher only recognized direct safe `cat`/`nl`
commands. Multi-path dump bodies that named only tracked paths still leaked
through when the command text wrapped the dump behind Python argv reads, a pipe,
or `xargs`.

## Change

- `adapters/shell-read.mjs`
  - kept `parseShellFileRead()` narrow for live tracking;
  - extended `shellDumpPathsFromCommand()` for request-copy stale-dump matching
    only;
  - added fail-closed recognition for:
    - direct multi-path `cat` / `nl`;
    - piped multi-path `cat` / `nl` from the first pipe segment;
    - `python` / `python3 -c ... path1 path2 ...` when the script text clearly
      reads file content;
    - `printf ... | xargs cat|nl` when the printed arguments are the named
      paths.
- `test/pcr-0090-multi-path-beyond-cat.test.mjs`
  - added red/green boards for Python argv, pipe, and `xargs` all-tracked dumps;
  - added a mixed tracked/untracked Python dump that must stay untouched.

Did **not** edit `src/anchors.mjs`. Did **not** touch the projector. Did **not**
change `DEFAULT_BUDGET_CHARS`, `AUTORESEARCH_SCORE`, ctxbench payload logic,
`persist-38`, `v0.2`, `--relock`, or any benchmark fixture, gold label, score
weight, threshold, or held-out split.

## Boards

| board | command shape | expected request-copy behavior | observed |
|---|---|---|---|
| all-tracked Python argv dump | `python3 -c "... pathlib.Path(path).read_text() ..." README.md src/viajante/cli.py src/viajante/models.py` | keep pair; replace dump body with `freshctx:stale-dump`; no huge concat body | pass |
| all-tracked piped cat dump | `cat README.md src/viajante/cli.py src/viajante/models.py | base64` | keep pair; replace dump body with `freshctx:stale-dump`; no huge concat body | pass |
| all-tracked xargs cat dump | `printf '%s\n' README.md src/viajante/cli.py src/viajante/models.py | xargs cat` | keep pair; replace dump body with `freshctx:stale-dump`; no huge concat body | pass |
| mixed tracked/untracked Python dump | `python3 -c "... pathlib.Path(path).read_text() ..." README.md src/viajante/cli.py notes/freshctx-todo.md` | leave dump body alone because not every named path is tracked | pass |
| exact-path fail-closed regression | `cat docs/README.md src/viajante/cli.py` with tracked `README.md` and `src/viajante/cli.py` | leave dump body alone because `docs/README.md` is not the tracked `README.md` | pass |

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0090-multi-path-beyond-cat.test.mjs` | yes | 1 before fix | 3 failing boards, 1 passing untouched board |
| `node --test test/pcr-0090-multi-path-beyond-cat.test.mjs test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0084-multi-path-tracked-dumps.test.mjs` | yes | 0 | 14 passed, 0 failed |
| `npm test` | yes | 0 | 291 total; 269 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0089 | PCR 0090 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `287` | `291` | `+4` |
| `npm test` passed | `265` | `269` | `+4` |
| `npm test` skipped | `22` | `22` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |

## Limitations

- The matcher stays intentionally fail-closed. It only replaces multi-path dump
  bodies for command shapes it can read directly from command text.
- `parseShellFileRead()` is still narrow and still refuses pipes; this PCR does
  not widen live shell read tracking.
- If any named path in a multi-path dump is untracked, the dump stays untouched
  by design.
- Exact-path matching still does not suffix-match aliases such as
  `docs/README.md` vs tracked `README.md`.

## Protocol gap?

**No.** The adapter-only hole is closed without moving merge-base, door, lock,
budget cap, score, or payload hash.

## Next measurement

Drive one live Pi inventory-style capture that uses one of the newly recognized
all-tracked multi-path dump shapes and confirm the concat body is gone in the
request copy while mixed tracked/untracked dumps still remain untouched. That
would still be a live-host check, not a paper result.
