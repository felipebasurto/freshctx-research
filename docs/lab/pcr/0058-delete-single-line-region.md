# PCR 0058 — delete of a single-line region after PCR 0055

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0058-delete-single-line-region-ac4b` (draft PR)
- Commit: (this docs commit)
- Merge-base: `afd97d3732589073dfbc14d4d2a8393262c9bf4d` (main; PCR 0055)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-single-line`
- Decision: **review** (measurement + regression lock; no product fix)

## Hypothesis or change

PCR 0055 added `stored-line-span`: when the door misses on a single-line region
read (`startLine === endLine`), refresh re-slices the current file at the stored
line address. PCR 0058 measures what happens when that line is **deleted** —
either shifted away (neighbor bytes occupy the address) or past EOF (file
shrinks below `startLine`).

Hypotheses probed (partially discarded):

| hypothesis | outcome |
|---|---|
| past-EOF (`startLine > lineCount`) → null / unresolved | **confirmed** when the file has no trailing empty line |
| delete line 2 → old footer served at line 2 via line-address | **confirmed** — neighbor-line bytes, not fail-close |
| delete last line → line 2 unchanged | **confirmed** — door `exact` on surviving bytes |

No door retune. No new product path. `src/anchors.mjs` untouched.

## What we did

- Added `test/delete-single-line-region.test.mjs`: language-agnostic boards (lines,
  span, exact bytes; no Go parser or language selectors).
- Core + Hermes replay for board A (delete tracked line) and board B-past-EOF.
- Core-only for board B-delete-last (door path, no `stored-line-span`).
- Did **not** edit `src/registry.mjs`, `src/anchors.mjs`, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, `docs/lab/INDEX.md`, or
  `docs/lab/METRICS.md`.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Boards

Initial fixture (all boards): 3-line file, region read at line 2 only.

```text
line1 header
BETA_OLD_INTERIOR keep this line unique
line3 footer
```

Tracked unit: `scope=region`, `startLine=2`, `endLine=2`, observed bytes =
`BETA_OLD_INTERIOR keep this line unique`.

### Board A — delete tracked line (interior)

Mutate: remove line 2 (real `\n` deletion). File becomes:

```text
line1 header
line3 footer
```

| layer | state | method | projection bytes | served bytes |
|---|---|---|---|---|
| core | resolved | `stored-line-span` | 402 | `line3 footer` |
| Hermes replay | resolved | `stored-line-span` | 402 | `line3 footer` |

**Protocol gap: yes.** `stored-line-span` treats the stored line address as
authoritative and serves the former footer as if it were the tracked region.
FreshCtx does not fail-close on interior deletion when a later line shifts into
the address. Historical tool-result stub still references
`BETA_OLD_INTERIOR`; projection carries `line3 footer` instead.

### Board B-delete-last — delete footer only

Mutate: remove line 3. File becomes:

```text
line1 header
BETA_OLD_INTERIOR keep this line unique
```

| layer | state | method | projection bytes | served bytes |
|---|---|---|---|---|
| core | resolved | `exact` | 418 | `BETA_OLD_INTERIOR keep this line unique` |

Line 2 address unchanged; door finds exact bytes. No `stored-line-span` fallback
needed. Not a hole for this geometry.

### Board B-past-eof — shrink below stored line

Mutate: delete down to one line **without** trailing newline:

```text
line1 header
```

`splitLines` length = 1; `endLine=2 > lines.length` → `resolveStoredLineSpan`
returns null; refresh stays unresolved.

| layer | state | method | projection bytes | served bytes |
|---|---|---|---|---|
| core | unresolved | `anchors-not-found` | 78 | none (unresolved="1") |
| Hermes replay | unresolved | — | 78 | none (unresolved="1") |

**Fail-closed confirmed** for true past-EOF.

### Edge note (not a separate board)

If the shrunk file is `line1 header\n` (trailing newline only), `splitLines`
yields two lines and line 2 is the empty string. `stored-line-span` resolves to
`""` (389 projection bytes). That is a second line-address hole distinct from
neighbor substitution; not locked by the primary regression boards.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | +1 test file (0058 boards) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes delete boards | no | — | synthetic replay only |

## Metric snapshot

| metric | before (0055 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test runnable | 122/122 | 127/127 | +5 tests |
| Board A neighbor serve | unmeasured | locked (`stored-line-span` → footer) | measured |
| Board B-past-eof | unmeasured | locked (unresolved) | measured |

## Comparison

- PCR 0055: single-line **replace** at same address → current bytes via
  `stored-line-span`.
- PCR 0058: single-line **delete** at address → neighbor bytes served (board A);
  true past-EOF fail-closes (board B-past-eof).

## Conflicts with constitutions

Board A violates the spirit of “never inject last-known content when current
resolution fails” only indirectly: resolution **succeeds** via line-address
re-slice, inventing neighbor bytes rather than replaying stale interior or
emptying. Documented as a protocol gap, not fixed here.

## Limitations

- Synthetic only; no live Hermes box rerun.
- Board B-delete-last uses door `exact`; does not exercise `stored-line-span`.
- Trailing-newline empty-line edge documented but not regression-locked.
- Not holdout / not public performance claim.

## Protocol gap?

**Yes for board A** (neighbor-line substitution at stored line address after
interior delete). **No for board B-past-eof** (fail-closed unresolved).

## Next measurement

Decide whether interior delete at a stored line address should fail-close
(unresolved) instead of serving shifted neighbor bytes, without retuning the
door — likely a `resolveStoredLineSpan` guard comparing served bytes to last
observed revision or anchor presence.
