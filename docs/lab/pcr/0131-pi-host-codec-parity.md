# PCR 0131 — Pi host-codec contract parity

- Date (UTC): 2026-08-31
- Author / agent: Cursor
- Branch / PR: `cursor/pi-host-codec-a6b1` / [132](https://github.com/felipebasurto/freshctx/pull/132)
- Product commit: `07b5d2237217f5ff5892bdf55f9fbc4dc31a0fe8`
- Merge-base: `5bb73350c616613a58fcb84bec736f512ff2349c` (`feat/freshctx-next`; PR 131 merge)
- Pi host pin: `c49906ec77788625aacbdc53ebca6fbe65bd20f5` (Pi 0.84.2)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `adapter-only`; `host-contract`; `measurement`
- Decision: **review** (PR 132 stays draft)

## Hypothesis or change

Pi is the first host-specific consumer of the generic host-codec contract.
`adapters/pi/codec.mjs` decodes Pi-native read pairs and composes the existing
Pi request-only transformer without changing FreshCtx core, policy, rendering,
or Tree-sitter behavior.

The codec operates on a clone of persisted Pi history. It publishes the pinned
host and adapter capability surface, validates native pair boundaries, and
returns the exact original request object when capture, transformation,
validation, serialization, path safety, or historical reconstruction cannot
complete safely.

## What we did

- Added a Pi-native codec with capability fields `host`, `hostVersion`,
  `adapter`, `adapterVersion`, and `canRewriteRequest`.
- Decoded successful text `read` calls/results from observation-time history,
  reconstructed tracked units and call mappings, then refreshed current source
  bytes through the existing Pi transformer.
- Preserved retained native IDs, order, pairing, image results, and ordinary
  shell pairs. Only complete superseded successful-read pairs may retire.
- Pinned the offset-shift fail-closed rule: moving a `toolResult` past a later
  user-message boundary invalidates the candidate request. Authorized complete
  read-pair retirement does not weaken retained pair boundaries.
- Kept each request transformation ephemeral. A second transform starts from
  the same observation-time history and resolves the then-current workspace.
- Failed open for refused paths, binary/oversized observations, escaping
  symlinks, Pi truncation metadata, and EOF pages that omitted the historical
  file prefix.
- Added deterministic old-path/codec-path parity assertions for selected units,
  current bytes, stale/duplicate absence, canonical provider payload bytes,
  persisted-request identity, failure identity, repeated reads, deletion, and
  reconstructable pagination.
- Kept MCP outside the data plane and invoked no model.

No benchmark fixture, sealed pack, gold label, weight, threshold, split,
historical ledger row, `src/` file, or Tree-sitter implementation changed.
`--relock` was not run. The generic codec interface did not change, so ADR 0005
was not added.

## Benchmarks run

`npm test` footer on product commit
`07b5d2237217f5ff5892bdf55f9fbc4dc31a0fe8`:

```text
# tests 549
# pass 549
# fail 0
# skipped 0
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP footer above; `node --test test/*.test.mjs` |
| `npm run evaluate` | no | n/a | No policy, anchoring, rendering, Tree-sitter, or existing provider-payload change |
| host/model run | no | n/a | Deterministic request capture only |
| `--relock` | no | n/a | Existing Pi host pin retained |

## Metric snapshot

| Metric | Product commit | Result |
|---|---|---|
| TAP | `07b5d223` | 549 tests / 549 pass / 0 fail / 0 skipped |
| Pi focused codec invariants | `07b5d223` | 16 pass / 0 fail / 0 skipped within the full TAP run |
| old-path vs codec-path canonical payload | `07b5d223` | byte-identical on covered parity traces |
| stale observation body in successful parity payload | `07b5d223` | 0 copies |
| duplicate current body in successful parity payload | `07b5d223` | 0 extra copies |
| `toolResult` moved across later user boundary | `07b5d223` | rejected; original request retained |
| forced failure request identity | `07b5d223` | same original object |
| model calls | `07b5d223` | 0 |
| evaluation score / delta | `07b5d223` | n/a; evaluation did not run |

The repository's official accepted TAP remains **418 pass / 0 fail / 17
skipped / 435 total**. The 549-test line is branch evidence for PR 132, not a
replacement official result.

## Architectural boundary

The codec is host translation under `adapters/pi/`. FreshCtx core remains
provider-independent and Node-standard-library-only. Tree-sitter remains
out-of-process and unchanged. The existing Pi extension remains the host
integration path; this codec is the deterministic request-capture path.

## Limitations

- Cat-class shell reads pass through unchanged; their capture remains on the
  existing Pi extension/replay path.
- Results carrying Pi truncation metadata, and EOF pagination that omitted a
  historical prefix, fail open because observation-time full-file identity
  cannot be reconstructed exactly.
- The parity gate uses FreshCtx's deterministic canonical capture payload. It
  does not claim released-host provider-conversion coverage.
- Registry reconstruction is request-local; durable restart state remains
  outside this codec slice.

## Next measurement

Exercise the pinned Pi package's request-conversion boundary with the same
no-model trace while preserving this codec's exact fallback and persisted-byte
invariants. Keep PR 132 draft until review is complete.
