# PCR 0163 — The Isolated Semantic Engine client cannot crash or hang the host

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent (executing `plans/005-ise-client-robustness.md`)
- Branch / PR: `grok/plan-005-ise-client-robustness` / draft, stacked on `grok/plan-004-hermes-fail-open`
- Commit: fix commit `fix(ise): harden isolated-semantic-engine client` on top of plan base `fd523eb`
- Paper-manifest digest (if research work): unchanged (not research work)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- Result labels used: `synthetic`
- Decision: **accept** (failure-path hardening; successful parses byte-identical)

## Hypothesis or change

ADR 0004 promises that a parser fault degrades a unit to `unresolved` rather
than taking the host down. The registry side held; the client side did not:
`ise/treesitter/client.mjs` wrote to `child.stdin` with no `error` listener
(uncaught `EPIPE` in the **parent** when the child exits early), had no
timeout (a wedged parser blocks `engine.refresh()` forever), and no stdout cap.
After this change the client rejects — never throws out of band — on all
three, and the registry maps each rejection to
`resolutionMethod: "isolated-semantic-engine-error"`.

## What we did

1. Reproduced the crash outside the repo with `/tmp/epipe-probe.mjs` (a fake
   `spawnImpl` that runs `node -e "process.exit(0)"` and a 2 MiB input).
   Before:

   ```
   node:events:496
         throw er; // Unhandled 'error' event
         ^

   Error: write EPIPE
   probe_exit=1
   ```

   After:

   ```
   rejected: write EPIPE
   probe_exit=0
   ```

   Probe deleted afterwards.
2. Red tests in `test/treesitter-ise-client.test.mjs` (six fake-spawn cases:
   stdin error, non-zero exit, non-JSON stdout, hung child + timeout, oversized
   stdout, success). Before the fix: tests 1, 4, 5 failed and test 1 leaked the
   uncaught `EPIPE` into the test process (`# pass 2`).
3. Rewrote `createIsolatedSemanticEngineRunner`: new options `timeoutMs`
   (default `DEFAULT_ISOLATED_SEMANTIC_ENGINE_TIMEOUT_MS = 10_000`) and
   `maxOutputBytes` (default
   `DEFAULT_ISOLATED_SEMANTIC_ENGINE_MAX_OUTPUT_BYTES = 16 MiB`), both
   exported; a `settle` guard so the promise resolves or rejects exactly once
   even when `close` fires after `kill`; `child.stdin?.on("error", …)`;
   `SIGKILL` + `isolated-semantic-engine-timeout` on timer expiry; `SIGKILL` +
   `isolated-semantic-engine-output-too-large` when stdout exceeds the cap.
   No caching (`lastBytes` / `cache` identifiers remain absent, as
   `test/treesitter-ise.test.mjs` asserts). Node standard library only.
4. Replaced the ADR 0004 "Known gap" bullet with the implemented bounds.
5. Wrote this record, appended INDEX / METRICS rows, bumped the public PCR
   count to 159 in `README.md` and `docs/ARCHITECTURE.md`.
6. Did not touch `src/registry.mjs`, `ise/treesitter/parse.mjs`,
   `grammars.mjs`, `ise/treesitter/package.json`, or any adapter (defaults make
   the change transparent to callers).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node /tmp/epipe-probe.mjs` (before) | yes | 1 | uncaught `Error: write EPIPE` |
| `node /tmp/epipe-probe.mjs` (after) | yes | 0 | `rejected: write EPIPE` |
| `node --test test/treesitter-ise-client.test.mjs` (before fix) | yes | 1 | `# tests 6` `# pass 2` (1, 4, 5 fail; 6 cancelled by the leaked EPIPE) |
| `node --test test/treesitter-ise-client.test.mjs` (after fix) | yes | 0 | `# tests 6` `# pass 6` `# fail 0` |
| `node --test test/treesitter-ise.test.mjs test/pcr-01*ise*.test.mjs test/pcr-*isolated*.test.mjs` (real child) | yes | 0 | `# tests 50` `# pass 50` `# fail 0` |
| `npm test` | yes | 0 | `# tests 729` `# pass 729` `# fail 0` `# skipped 0` |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention` 5/5; hard gates pass |
| `npm run ctxbench` | no | n/a | run once at the top of the stack |
| `npm run demo` | no | n/a | not required by plan 005 |
| `npm run repos:verify` | no | n/a | not on this branch |
| `npm run ctxbench:smoke` | no | n/a | not on this branch |

## Metric snapshot

| metric | before (plan base) | after (this PCR) | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| host exit on child early-exit with 2 MiB input (probe) | crash, exit 1 | clean rejection, exit 0 | fixed |
| hung child | blocks forever | killed after 10 s, rejects | bounded |
| unbounded stdout | accumulated | killed above 16 MiB, rejects | bounded |
| door blob | `f8771c93…` | `f8771c93…` | 0 |

Label: `synthetic`. A successful parse produces byte-identical output; only
failure handling changed.

## Comparison

No external comparison. Not a public-repo or CORVUS claim.

## Conflicts with constitutions

none observed. Strengthens the ADR 0004 isolation promise and the
fail-closed rule (a faulty parse becomes `unresolved`, never a host crash or a
stale unit).

## Limitations

The 10 s default is a guess for interactive hosts; grammars on a slow machine
could approach it for very large files — the real-child suite passed well
under it here, but no timing distribution was recorded. The Hermes bridge
watchdog (Python `subprocess.run(..., timeout=...)`) remains the second layer
and is unchanged. Callers cannot yet tune `timeoutMs` through
`createAdapterEngine`; that is deliberate for this change.

## Next measurement

Record the wall-clock distribution of real `parse.mjs` runs over the
`repos.lock` corpus to decide whether 10 s is generous or tight, and add one
engine-level test that injects the timeout runner and asserts
`resolutionMethod === "isolated-semantic-engine-error"`.
