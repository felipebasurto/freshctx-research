# PCR 0098 — turn-2 first-NEW projection stays quoteable at the tracked read

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0098-quoteable-first-new-5021` (draft PR, this branch)
- Commit: (this commit)
- Merge-base: `447b07ce8e26a77933f4090d15edb1f6805c7e36` (main @ PCR 0097 squash)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

On the Pi/Hermes live later-turn seam where disk changed after turn 1 already
applied a prior revision, turn 2 is the first request that serves NEW bytes.
That turn must keep interior file bytes quoteable in the provider payload: the
tracked read tool result must carry the current selected unit body, not only the
`Current content is supplied in the live projection` summary marker, while the
tail keeps the full live `<freshctx-unit>` envelope (PCR 0079 full-body boards
unchanged).

Later unchanged turns must still collapse to the short current already-served
marker (`99` bytes on the probe board). Smoke second-capture traces with two user
tasks and no assistant reply must not inline.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user hypothesis survived file-level inspection:

- Turn-2 first-NEW already emitted a full live projection (`~427–642` bytes on
  replay boards; user live cited `547` NEW).
- The provider payload still left the tracked read at a summary marker while the
  bytes lived only inside the XML envelope.
- Models asked to quote an interior line answered from the read tool result and
  reported they could not see line-2 raw bytes even though the projection was NEW.

Collapse from PCR 0093/0097 was not the hole: with Pi request-only persisted
history (no projection frame in session), turn 3+ still collapse to `99` bytes
when `lastInjectedRevision` matches.

The fix stays adapter-only. No second engine. No projector retune.

## What changed

- `adapters/request-prune.mjs`
  - adds `shouldInlineServedReadAtToolResult()` gated to:
    - exactly two user turns;
    - an assistant reply between first and last user turn;
    - non-empty `lastInjectedRevision` (turn 1 apply-ack);
    - full live projection (`<freshctx-unit>` present, `skipEligible=0`);
  - adds `servedReadToolResultContent()` / `replaceTrackedReadToolResults()` to
    swap stale served-read markers for current unit bytes on that seam only.
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts`, `adapters/hermes/bridge.mjs`
  - wire the shared helper at the existing read-marker replacement site.

No door, lock, benchmark fixture, gold label, or score-weight change.

## Test-first evidence

Before the fix, the turn-2 board left only the summary marker at the read tool
result even though the live projection carried NEW bytes:

```text
toolContent: [freshctx:fc_… path=ws/sample.txt] Current content is supplied in the live projection.
line2InTool: false
line2InProj: true
```

After the fix on the same board:

```text
toolContent prefix: line1 header\nline2 NEW interior
line2InTool: true
line2InProj: true
turn3 projectionBytes: 99 (collapsed)
```

## Replay boards

### Board 1 — Pi turn-2 first-NEW interior line quoteable

Measured:

```json
{
  "turn2ToolHasLine2New": true,
  "turn2ToolHasSummaryMarker": false,
  "turn2ProjectionBytes": 427,
  "turn2ProjectionHasFreshctxUnit": true,
  "turn3ProjectionBytes": 99,
  "turn3Collapsed": true
}
```

### Board 2 — Hermes parity on the same seam

Measured:

```json
{
  "turn2ToolHasLine2New": true,
  "turn2ProjectionBytes": 427,
  "turn3ProjectionBytes": 99
}
```

### Board 3 — gate excludes smoke second capture (two user tasks, no assistant)

Measured: `shouldInlineServedReadAtToolResult === false`.

### Board 4 — PCR 0097 continue-leftover retry still single NEW copy

Undelivered retry keeps `split(NEW_BODY).length - 1 === 1` because
`lastInjectedRevision` is empty until apply-ack.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0098-quoteable-first-new-projection.test.mjs` | yes | 0 | 5 passed, 0 failed |
| focused regression (0079/0087/0092/0093/0098) | yes | 0 | 14 passed, 0 failed |
| `npm test` | yes | 1 | 306 total; 282 passed; 22 skipped; **2 failed** (PCR 0096/0097 official-loader boards: missing `bench/hosts/hermes/plugins/__init__.py` in this VM) |
| `npm run evaluate` | yes | 1 | hard gate blocked by the two host-loader failures above |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `npm run papers:verify` | yes | 1 | missing local `papers/cache/corvus-2026.pdf` on this VM |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| live Pi / Hermes | skipped | n/a | explicitly out of scope |

## Metric snapshot

| metric | PCR 0097 | PCR 0098 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | not re-run (evaluate blocked) | n/a |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `301` | `306` | `+5` |
| `npm test` passed | `284` | `282` | `-2` (host-loader env) |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |
| turn-2 probe projection bytes | n/a | `427` | measured replay |
| turn-3 probe projection bytes | `99` | `99` | held |

## Scope and limits

This PCR fixes adapter-side quoteability on the turn-2 first-NEW seam only. It
does **not**:

- run live Pi/Hermes;
- change collapse logic for turn 3+;
- reopen skip-unchanged, `--continue` leftover-pending, or reread PCR work;
- claim live cost savings.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only read-result shaping on an existing live projection seam.

## Next experiment

When live Pi is back in scope, rerun the unchanged-disk board and confirm turn 2
quotes interior line-2 raw bytes from the tracked read while later turns stay
`already-served=1` at `99` bytes.
