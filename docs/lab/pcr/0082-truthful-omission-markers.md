# PCR 0082: truthful omission markers

- Date (UTC): 2026-08-25
- Base: `e00c3249e52738b3548cdb97c81fe0189642a4e3`
- Branch: `pcr/0082-truthful-omitted-dump-marker`
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Labels: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review**

This is a protocol-honesty correction, not a paper result or a
state-of-the-art claim.

## Invariant

A historical marker must not claim that current bytes are in the request.
Selected or omitted status belongs to the live projection:

- every selected unit carries its complete current body;
- every absent tracked unit has a metadata-only omission record naming stable
  ID, path, and `budget` or `unresolved` reason;
- omission records never carry last-known source bytes;
- historical read and single-path shell-dump markers stay stable across
  revisions and use neutral wording.

## Failure on the base

The cold board tracks a 39 kB `src/viajante/cli.py` containing `CL0` at the
32,768-character default cap, then performs an unparsed single-path Python dump.
The file is correctly budget-omitted, but PCR 0081's marker says:

```text
Current content is supplied in the live projection.
```

The projection contains no `freshctx-unit` for that path and reports only the
aggregate `budget-omitted="1"` count. A non-expert can check the contradiction:
the presence claim is visible, while the named current body is absent.

The PCR 0082 red run had five failures: core, Pi, and Hermes lacked
path-specific omission records; the stable marker and refreshed dump marker
still made the presence claim; unresolved output named no path.

## Change

- `src/projector.mjs` renders
  `<freshctx-omitted id="…" path="…" reason="…"/>` for every omitted unit.
  Records sort by stable unit ID independently from selected render order.
- `src/transcript.mjs` replaces the presence claim with:
  `Read body removed. Check the live projection.`
- `adapters/request-prune.mjs` uses the equivalent neutral wording for
  single-path shell dumps.
- Pi and Hermes need no projection-dependent adapter state. Both already append
  the same core projection, so adapter/core parity remains structural.

The omission tag is an additive `freshctx/1` rendering field. Existing code-unit
decoding still reads only `freshctx-unit` frames by declared UTF-8
`content-bytes`.

## Deterministic boards

1. **Cold over-cap.** Disk contains CL0. The request contains neither CL0 nor
   CL1, keeps a neutral marker for the unparsed single-path dump, and names
   `src/viajante/cli.py` as `reason="budget"`.
2. **Same-turn refresh.** Disk flips to CL1. The request carries one complete
   CL1 body over cap, no CL0, and the dump marker remains neutral.
3. **Unresolved.** The projection names the unit with
   `reason="unresolved"` and contains no last-known body.

The focused PCR file passes six tests. The related PCR 0079–0082, policy, and
adapter-prune set passes 29 tests. An initial full-suite run exposed one old
assertion that treated an unresolved unit ID as forbidden metadata; it was
updated to forbid only a `freshctx-unit` body while requiring the new omission
record.

## Measured snapshot

| metric | PCR 0081 / `e00c3249` | PCR 0082 | delta |
|---|---:|---:|---:|
| `npm test` pass / skip / fail | 243 / 22 / 0 | 251 / 22 / 0 | +8 pass |
| `AUTORESEARCH_SCORE` | 89.107165 | 89.179361 | +0.072196 |
| ctxbench payload bytes | not recorded in PCR 0081 | 1,004 | n/a |
| ctxbench projection bytes | 494 | 494 | 0 |
| ctxbench payload SHA-256 | `697e74e3…` | `331a1791…` | expected marker-byte change |
| exact-current / recall / stale / copies | 1 / 1 / 0 / 1 | 1 / 1 / 0 / 1 | 0 |

The score increase is incidental to replacing the 51-byte false sentence with
the 45-byte neutral sentence on selected-marker boards. It is not an
autoresearch claim. Omission-heavy requests grow by one metadata record per
absent unit; that cost is the correctness change.

## Focused live Pi board

Label: `live-host`, `n=1`, DeepSeek V4 Pro, default cap, not a paper result.

The run did not produce `CLI=unknown`. It entered a read loop and was terminated
after 202 provider requests over 346 seconds. Request 1 was the initial
8,812-byte prompt. Requests 2–202 each:

- named `src/viajante/cli.py` in a `reason="budget"` omission record;
- contained neither CL0 nor CL1;
- contained no false “Current content is supplied” claim;
- contained no retained assistant/read/tool-result pair.

The deterministic disk→request condition is closed. The model-reply
corroboration is not: because the unserved official read pair is removed, each
next request looks like no read was attempted and Pi asks again. This is a
separate host-loop hole, not evidence that omitted bytes were stale or present.
The opt-in `cold-omit` harness now has a 30-second timeout so a repeat cannot
run unchecked.

## Frozen decisions

- `DEFAULT_BUDGET_CHARS` remains 32,768.
- A cold oversized first read remains omitted.
- A same-turn changed unit still bypasses the cap with full current bytes.
- Multi-path last-resort dumps remain unchanged.
- No persistence, `lastInjectedRevision`, `unchanged`, or empty selected body.
- `src/anchors.mjs` stays at blob `f8771c93…`.
- `bench/repos.lock.json` stays at blob `79e29d09…`.
- No fixture, gold label, score weight, threshold, or split changes.

## Limitations

Omission records expose availability, not source bytes or a recovery transport.
The focused Pi run shows that a model may retry an omitted official read
indefinitely when its call/result pair is pruned. Model output is exploratory
evidence only; deterministic request capture remains the correctness gate.
