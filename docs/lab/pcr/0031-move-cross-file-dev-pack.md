# PCR 0031 — move-cross-file development pack

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (move-cross-file-dev-pack)
- Branch / PR: `cursor/move-cross-file-dev-5a76`
- Base SHA: `247c3577a51bedf870000260fb7271d728b5e993` (main after PCR 0030)
- Freeze commit: `9bb9590be71cc872fc7d0284f3f23bea032efb63`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `move-cross-file-dev`

**Status:** development only. **Not sealed.** Not a public benchmark. Not a holdout claim. Not a hash-refresh or board-retune win. No v0.2. `decision=review`. Frozen door. Measurement only.

## Hypothesis or change

After a tracked locked unit is cut from file A and the same bytes appear in file B, does production recover stale bytes on A, follow the unit to B, or stay silent? EVALUATION.md §5.2 names family `move-cross-file`. This pack measures region move on locked go-tools bytes without editing the door.

## Path / identity probe (before freeze)

`stableUnitId` in `src/hash.mjs` binds identity to `(path, scope, selector)`. `FreshRegistry.refresh` in `src/registry.mjs` re-reads only `unit.path`; `resolveRegion` searches anchors within that file only. There is no cross-file byte follow in the current resolver layer.

Shared `goldBytesForRead` in `bench/oracle.mjs` is also path-bound: it reads the tracked path and applies line/anchor relocation within that file. When the eight-line block moves out of `parse.go`, the line-range oracle at stored lines 29–36 returns struct-close and following comment bytes, not absence and not the relocated block in `parse_test.go`. Lab-local absence gold (empty `requiredUnits` on second capture) pins path-aware gold for door and codex; shared oracle unchanged.

## What we did

1. Probed locked go-tools `ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49` before freeze. Did not `--relock`.
2. Registered pack `move-cross-file-dev-v0.1` via freeze → commit → generate → run → report.
3. Wrote three traces under `bench/traces/lab/move-cross-file-dev-v0.1/`. Source A: `benchmark/parse/parse.go`. Destination B: `benchmark/parse/parse_test.go` (locked fixture bytes; no new repo files).
4. Did not edit `src/anchors.mjs`, `src/structural-consensus.mjs`, `src/policy.mjs`, or `src/projector.mjs`.
5. Did not rewrite holdout v0.1, PCR 0025/0026 parse-broken artifacts, or the 20-cell board.

## Language-generic invariant

Locked go-tools `parse.go` / `parse_test.go` are fixture bytes only. No Go parser, treesitter, identifier/keyword tables, or language-specific selectors were added. Door, oracle, and lab gold stay byte/line generic: first/last meaningful lines, span, location, path, exact bytes.

## Three cells

| cell | trace | mutate | gold |
|---|---|---|---|
| door | `go-tools/move-cross-file/benchmark-fields` | cut fields from `parse.go`; insert before `TestParseLine` in `parse_test.go` | absence at tracked `parse.go` path (lab-pinned; empty required set) |
| decoy | `go-tools/move-cross-file/benchmark-fields-duplicate-decoy` | same cross-file move, plus full copy replanted in `parse.go` struct body | eight-line block at stored `parse.go` path (SHA `4e8c2b5c…`) |
| Codex | `go-tools/move-cross-file/benchmark-fields-leftover-decoy` | cut from A; plant Name+Ord only before `TestParseLine` in B | absence at tracked `parse.go` path (lab-pinned) |

Gold pinning note: shared line-number oracle would mis-declare gold on door/codex after the struct body shrinks (stored lines span `}` and following comment, not absence). Absence gold when the unit is gone from the tracked path and must not be served as current.

## Measured cells

`freshctx-region` on `move-cross-file-dev-v0.1` after freeze commit `9bb9590`.

| cell | recall | exact | stale | dup | method | proj bytes | cross-file in live | lookalike in live | payload sha256 |
|---|---:|---:|---:|---:|---|---:|---|---|---|
| door | 1 | 0 | 0 | 0 | `unresolved` | 164 | no | no | `7cffff1f…` |
| decoy | 1 | 1 | 0 | 0 | `exact` | 840 | yes | no | `ac8dbe6b…` |
| Codex | 1 | 0 | 0 | 0 | `unresolved` | 164 | no | no | `7cffff1f…` |

Door stayed silent (`unresolved`, 164-byte empty projection). Production did not follow bytes into `parse_test.go` and did not inject stale pre-move content from A. Stale 0.

Decoy recovered via `exact` on the full copy left at the stored `parse.go` path, not the relocated copy in B. Stale 0.

Codex stayed silent. First+last leftover in B did not satisfy the path-bound unit on A. Stale 0.

## Explicit non-goals

- No retune of the door on main.
- No change to the PCR 0013 20-cell board.
- No rewrite of holdout v0.1, PCR 0025/0026 parse-broken artifacts (`resultSetHash` `458c30af`, decoy payload `128b1d6f`), or `bench/traces/holdout/`.
- No `repos:fetch --relock`. Lock sha256 stays `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`.
- No seal, no v0.2 tag.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **111/111** |
| `npm run check` | yes | 0 |  |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression; `resultSetHash` null; `traceSetHash` `17c44d8c…` |
| `npm run holdout:verify -- --manifest=bench/splits/move-cross-file-dev-v0.1.json` | yes | 0 | locally-frozen |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | lab traces allowlisted |
| `npm run papers:verify` | yes | 0 | manifest digest `442cd9e2…` unchanged |

## Metric snapshot

Synthetic score unchanged at 89.107165. Holdout v0.1 `traceSetHash` still `17c44d8c64517faaf4baa659d6f527b47b0a6b0dc27fce5ff58e8c8ae1f509e7`. Lab pack `traceSetHash` `a272d7a6e270000c33b18bb62fbe2f14a4594a4a55254e1f8c4cc69d64f6ae99`. Lab pack `resultSetHash` `dad27e007a5d52b133c4f2ea4f78e23bdc77fae35d713a693ede1b490e63d4b4`. Hashes from `bench/packs/move-cross-file-dev-v0.1/state.json`, not `tracesWritten`.

## Comparison

New family measurement. Path-bound identity means cross-file relocation without a duplicate at A behaves like deletion from A's perspective (silent/unresolved). Decoy with a full copy at A behaves like move-in-file recovery at the stored path.

## Conflicts with constitutions

none observed.

## Limitations

- Three enumerated cells. Not §5.1 sampled.
- Door/codex require lab-local absence gold; shared oracle cannot declare absence when stored line numbers drift after struct shrink.
- `locally-frozen` only. No remote attestation.
- No claim that cross-file follow is impossible with a door change; only that the frozen door does not follow today.

## Next measurement

If the product should follow a unique byte-identical block into another file while updating provider path identity, that requires a door/identity change and a separate pack. Do not retune the frozen door to force a number on this pack.
