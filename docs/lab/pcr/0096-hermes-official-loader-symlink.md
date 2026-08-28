# PCR 0096 — Hermes official loader path executes the symlinked bridge and later turns collapse on host history

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0096-hermes-live-load-1147` (draft PR, this branch)
- Commit: (this commit)
- Merge-base: `6c096c2a79a6b0792ed7f6a23a02fb7c439e488d` (PCR 0095)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `adapter-only`; `host-contract`
- Decision: **review** (stay draft; do not merge)

## Invariant

On the locked Hermes host at `999703fd43ab6d75c4a5c7bc8b610dd73ecece76`,
the official context-engine loader and request hook must be able to:

1. load `FreshCtxContextEngine` from the installed plugin tree;
2. execute the Node bridge even when Hermes reaches it through the symlinked
   `plugins/context_engine/freshctx/bridge.mjs` path created by
   `adapters/hermes/install.mjs`;
3. pass full `conversation_messages` into the later-turn collapse decision; and
4. collapse an unchanged later turn from the full 746-byte body to the 99-byte
   `[freshctx:already-served units=1]` marker when prior host history proves the
   projection was already applied.

The single-user fail-closed boards still own their territory:

- PCR 0079 still requires one full current body in every stateless request.
- PCR 0087 still refuses to mint skip authority from a discarded turn.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user's `conversation_messages` guess did **not** survive file-level
inspection of the exact host path named in scope.

What the files show:

- There is **no** `HERMES_LOAD_FRESHCTX` symbol in this repository.
- There is **no** `HERMES_LOAD_FRESHCTX` symbol in the locked Hermes host
  checkout at `bench/hosts/hermes`.
- The official load path on host `999703fd` is:
  - config `context.engine: freshctx`;
  - host loader `bench/hosts/hermes/plugins/context_engine/__init__.py` ->
    `load_context_engine("freshctx")`;
  - zero-arg engine construction of `FreshCtxContextEngine()`;
  - host request hook
    `bench/hosts/hermes/agent/conversation_loop.py:_apply_context_engine_selection(...)`;
  - host passes both `conversation_messages` and `incoming_message` into
    `engine.select_context(...)`.

So the 0095 replay fix was **already correct** about host history. The leftover
was somewhere else.

The actual leftover was the symlinked bridge entry path used by the official
install flow:

- `adapters/hermes/install.mjs` installs `plugins/context_engine/freshctx/` as a
  symlink to `adapters/hermes/`.
- `adapters/hermes/__init__.py` launches `bridge.mjs` through that symlink path.
- `adapters/hermes/bridge.mjs` only entered its CLI body when
  `fileURLToPath(import.meta.url) === process.argv[1]`.
- On this branch's official-loader test, Node resolved `import.meta.url` to the
  real source path while `process.argv[1]` stayed the symlink path.
- The comparison failed, the process exited `0`, and stdout stayed empty.
- Hermes then failed open to the untouched request. That made turn 1 keep the
  old tool payload and made the later-turn history gate irrelevant on the
  official installed path.

So PCR 0096 stays on the named leftover and reaches a different conclusion than
the user's hypothesis:

- `conversation_messages` were already wired on the locked host;
- the official installed bridge was not actually running its CLI body through
  the symlinked path.

## What changed

- `adapters/hermes/bridge.mjs`
  - treats the bridge as CLI-invoked when the real paths of
    `import.meta.url` and `process.argv[1]` match, not only when their raw
    strings match;
  - keeps the raw-string fallback when `realpathSync()` cannot resolve.
- `adapters/hermes/verify-layout.mjs`
  - tightens the probe from "exit 0" to "valid JSON with a `messages` list";
  - catches the exact silent-no-op class that let the symlinked bridge slip
    through before.
- `test/pcr-0096-hermes-official-loader.test.mjs`
  - stages the plugin through `install.mjs`;
  - loads it through the locked Hermes host loader;
  - runs the real host `_apply_context_engine_selection()` seam;
  - proves that request-only selection stays full-body while the official
    host path with `conversation_messages` collapses the later unchanged turn.

No Pi path changed. No door retune. No repo-lock retune. No new replay-only
board was invented.

## Test-first evidence

Before the fix, the new official-loader board failed red on the exact installed
path:

```text
AssertionError: turn 1 did not serve NEW body
```

The failure was real. A direct staged-bridge probe on the same symlinked path
returned exit `0` with empty stdout, which meant the process launched but never
entered the body guarded by the raw-path equality check.

That is why the host fell open.

## Host-contract proof

Measured on this branch from the locked host loader plus the real host request
hook:

```json
{
  "turn1ProjectionBytes": 746,
  "turn2RequestOnlyProjectionBytes": 746,
  "turn2HostProjectionBytes": 99,
  "turn2RequestOnlyNewCopies": 1,
  "turn2HostNewCopies": 0,
  "turn2HostAlreadyServedMarkers": 1,
  "turn2RequestOnlyAlreadyServedMarkers": 0
}
```

Interpretation:

- without full host history, the narrowed request-only path still carries the
  full 746-byte body on turn 2;
- on the official host seam, with loader + host call site + full
  `conversation_messages`, the unchanged later turn collapses to the 99-byte
  `already-served` marker;
- no full `PCR_0096_NEW_ON_DISK` body is re-sent on the host path's later turn.

That satisfies the requested stop condition without a live-host rerun.

## Scope guard

Focused regression run:

- `test/hermes-plugin-layout.test.mjs`
- `test/pcr-0079-stateless-request-bodies.test.mjs`
- `test/pcr-0087-skip-after-discard.test.mjs`
- `test/pcr-0093-live-reproject-failclose.test.mjs`
- `test/pcr-0094-hermes-collapsed-ack.test.mjs`
- `test/pcr-0095-hermes-conversation-history.test.mjs`
- `test/pcr-0096-hermes-official-loader.test.mjs`

Result:

- 12 tests passed
- 0 failed

So the one-user fail-closed boards still stay full-body where they should, and
the earlier Hermes later-turn boards remain green.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0096-hermes-official-loader.test.mjs` | yes | 1 then 0 | red before fix on official loader seam; green after realpath fix |
| `node --test test/pcr-0079-stateless-request-bodies.test.mjs test/pcr-0087-skip-after-discard.test.mjs test/pcr-0093-live-reproject-failclose.test.mjs test/pcr-0094-hermes-collapsed-ack.test.mjs test/pcr-0095-hermes-conversation-history.test.mjs test/pcr-0096-hermes-official-loader.test.mjs test/hermes-plugin-layout.test.mjs` | yes | 0 | 12 passed, 0 failed |
| `python3 -m py_compile adapters/hermes/__init__.py` | yes | 0 | Hermes plugin syntax ok |
| `npm run papers:fetch && npm run papers:verify` | yes | 0 | required corpus fetched and verified; manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |
| `npm test` | yes | 0 | 298 total; 281 passed; 17 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| search for `HERMES_LOAD_FRESHCTX` in FreshCtx + locked Hermes host | yes | 0 matches | user-named env var is not the official loader mechanism in the inspected files |
| live Pi / Hermes | skipped | n/a | explicitly out of scope for PCR 0096 |

## Metric snapshot

| metric | PCR 0095 | PCR 0096 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `297` | `298` | `+1` |
| `npm test` passed | `275` | `281` | `+6` |
| `npm test` skipped | `22` | `17` | `-5` |
| paper-manifest digest | `442cd9e2…` | `442cd9e2…` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |
| official host seam projection bytes | `n/a` | `746 -> 99` | new board |
| request-only seam projection bytes | `n/a` | `746 -> 746` | new comparison |

## Scope and limits

This branch fixes the official Hermes installed-path seam and proves it with the
locked host contract. It does **not**:

- run a live Hermes CLI session;
- change Pi behavior;
- change FreshCtx core policy, scoring, or projection format;
- change benchmark fixtures, gold labels, weights, thresholds, or held-out
  splits;
- claim provider cost savings beyond the local request-byte measurements above.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** This is a host-path compatibility repair inside the already-supported
Hermes plugin install and request flow.

## Next experiment

When live Hermes comes back into scope, re-run only the original unchanged-disk
later-turn cost board on the official installed path and confirm that the WITH
arm now follows the host-contract proof here: first later turn 746 bytes, next
unchanged later turn 99 bytes, no full-body resend.
