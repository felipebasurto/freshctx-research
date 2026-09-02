# PCR 0164 — `head`/`tail` shell reads derive their span from the observed bytes, identically in Pi and Hermes

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent (review follow-through after the executor stopped at the Hermes step)
- Branch / PR: `cursor/improve-audit-plans-bb61` / [#165](https://github.com/felipebasurto/freshctx/pull/165)
- Commit: fix commit `fix(adapters): size check in observedSpanForShellRead; Hermes tail delegates to it`
- Paper-manifest digest (if research work): unchanged (not research work)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- Result labels used: `synthetic`
- Decision: **accept** (one span rule for both adapters; Hermes fail-closed boards preserved)

## Hypothesis or change

A tracked region's identity is `sha256(path, scope, lines)` and the projection
prints `lines="start-end"`. When Pi and Hermes see the same `tail -n 2 file`
read they must mint the same unit, and that unit must describe the bytes the
model actually saw. Before this change:

- Pi (`adapters/shell-read.mjs`, `normalizeTailRegion`) used
  `startLine = fileLineCount - n + 1` with no check against the observed
  bytes. `lineCount()` counts the empty string after a trailing newline, so on
  `"a\nb\nc\n"` (`fileLineCount = 4`) `tail -n 2` was recorded as lines 3–4
  while the tool printed lines 2–4.
- Hermes (`adapters/hermes/bridge.mjs`, `tailRegionFromObservation`) used
  `startLine = fileLineCount - n` and compared the slice with the observation
  (PCR 0088). Correct for trailing-newline files; fail-closed (no unit) for
  files without one.
- Both shared `lineCountFlag`, which parsed `-n 2` and `-2` but not the
  attached form `-n2` or `--lines=N`; `head -n2 f.txt` silently tracked
  `startLine: 1, endLine: 10`.

After: one exported helper, `observedSpanForShellRead(parsed, fileContent,
observedContent)`, requires the observation to have exactly
`min(requested, bodyLines)` lines, then requires it to equal the file slice at
the expected end, and returns `null` otherwise. Pi's `tryTrackShellRead` and
Hermes' `tailRegionFromObservation` both call it. `-nN`, `--lines N`, and
`--lines=N` parse.

## What we did

1. Red test file `test/shell-read-head-tail.test.mjs` (flag forms, tail with
   and without trailing newline, head clamping, content mismatch, end-to-end
   `tryTrackShellRead`), then the helper and the Pi call-site change. These
   two commits were executed from the first revision of the plan.
2. The executor's Hermes step failed the sealed PCR 0088 board
   `undersized` (`read_file` with `tailLines: 2` whose tool result shows one
   line): the first-revision helper derived the span from the *observed* line
   count and never compared it with the *requested* count, so "the last 1
   line of the file" was accepted as a valid slice (`lines="4-5"`,
   `selected="1"`). The executor stopped and reported instead of adapting.
3. Added the size check `observedLines.length === Math.min(requested,
   fileBody.length)` before the content check, with `requested` taken from
   `tailLines` (`tail`) or `endLine` (`head`, which the parser encodes as
   `{ startLine: 1, endLine: N }`). Added a seventh test that pins the
   undersized, oversized, extra-blank-line, over-request, and `head`
   over-long cases.
4. `tailRegionFromObservation` in the Hermes bridge now delegates to the
   helper; `tailSpanContent` and the bridge-local `splitLines` were removed.
   The `invalidTailObservation` flag and its downstream fail-closed handling
   are unchanged.
5. Flipped the four "Sharp-edge audit" rows in `docs/ARCHITECTURE.md` that
   this audit opened (PCR 0161, 0162, 0163, and this record) from open to
   fixed.

## PCR 0088 boards, before and after

`read_file` with `tailLines: 2` on `line1 head\nline2 middle\nline3 tailA\nline4 tailB\n`:

| board | observed | Hermes before (PCR 0088) | first-revision helper | this PCR |
|---|---|---|---|---|
| undersized | `line4 tailB\n` | fail closed | `lines="4-5"` minted | fail closed |
| middle | `line2 middle\nline3 tailA\nline4 tailB\n` | fail closed | `lines="2-5"` minted | fail closed |
| extra-nl | `line3 tailA\nline4 tailB\n\n` | fail closed | fail closed | fail closed |
| exact | `line3 tailA\nline4 tailB\n` | `lines="3-5"` | `lines="3-5"` | `lines="3-5"` |

Pi reproductions from the audit:

| command | file | observed | before | after |
|---|---|---|---|---|
| `tail -n 2 f.txt` | `a\nb\nc\n` | `b\nc\n` | `lines 3-4` | `lines 2-4` |
| `head -n2 f.txt` | 4 lines | first 2 lines | `lines 1-10` | `lines 1-2` |
| `tail -n 2 f.txt` | `a\nb\nc\n` | `stale\nbytes\n` | tracked | not tracked |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/shell-read-head-tail.test.mjs` | yes | 0 | `# tests 7` `# pass 7` `# fail 0` |
| `node --test test/shell-read-head-tail.test.mjs $(rg -l invalidTailObservation test) test/hermes-*.test.mjs test/pcr-*hermes*.test.mjs test/pcr-0081*.test.mjs test/pcr-0100*.test.mjs test/pcr-0102*.test.mjs` | yes | 0 | `# tests 127` `# pass 127` `# fail 0` (PCR 0085/0088 boards included) |
| `npm run check` | yes | 0 | |
| `npm test` | yes | 0 | see `docs/lab/METRICS.md` row |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; 8589 / 36701 / 5/5 unchanged (the apex pack uses official reads, not shell reads) |
| `npm run ctxbench` | yes | 0 | |
| `npm run demo` | no | n/a | |
| `npm run repos:verify` | no | n/a | |
| `npm run ctxbench:smoke` | no | n/a | |

## Metric snapshot

| metric | before | after | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| Pi `tail -n 2` on a trailing-newline file | off by one line | matches observation | fixed |
| Pi `head -n2` | 10 lines | 2 lines | fixed |
| Pi mismatching `tail` observation | tracked | fail closed | fixed |
| Hermes PCR 0088 boards | fail closed | fail closed | 0 |
| Hermes `tail` on a file without trailing newline | fail closed | tracked with the observed span | changed (intentional) |
| door blob | `f8771c93…` | `f8771c93…` | 0 |

Label: `synthetic`.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

none observed. Strengthens the fail-closed rule: no region unit is ever minted
from flag arithmetic alone; the observed bytes must be the exact slice.

## Limitations

`tail -f`, `tail -c`, and `head -c` are still parsed as line reads with the
default 10 and will now fail closed on the size check rather than mint a wrong
span; explicit byte-mode/follow rejection is a separate small change. The
Hermes official `read_file` `offset`/`limit` path (`normalizeHermesReadScope`,
PCR 0064/0069) is a separate rule set and was not touched.

## Next measurement

Record how often live Pi and Hermes sessions hit the new fail-closed branch
(`observedSpanForShellRead` returning `null`) on real `head`/`tail` output, to
learn whether hosts trim or wrap tool results in ways the helper should
tolerate.
