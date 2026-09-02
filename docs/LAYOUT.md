# Repository layout

This is a map of the current checkout, not a proposed reorganization.

| Path | Contract |
|---|---|
| `src/` | Provider-independent core; Node.js standard library only |
| `adapters/` | Host codecs, request translation, replay harnesses, and installers |
| `ise/treesitter/` | Out-of-process Tree-sitter implementation and its dependencies |
| `test/` | Deterministic invariant tests run by the root test command |
| `bench/` | Replay runners, oracles, packs, and the whole-file baseline |
| `capture/` | No-model request recorder |
| `autoresearch/` | Evaluation entrypoint, search contract, and result ledger |
| `scripts/` | Command-line entrypoints for papers, repositories, hosts, and the holdout protocol; protocol logic itself lives in `bench/` |
| `examples/` | Runnable demo (`npm run demo`) |
| `docs/` | Architecture, evaluation protocol, decisions, glossary, and evidence records |
| `papers/` | Research manifest and reproducibility lock; fetched PDFs are ignored |

The root test command is exactly:

```text
node --test test/*.test.mjs
```

## Hermes installed shape

`npm run hermes:install -- <plugins-dir>` creates seven symlinks:

```text
<plugins-dir>/context_engine/freshctx  -> adapters/hermes/
<plugins-dir>/freshctx -> adapters/hermes/
<plugins-dir>/context_engine/request-prune.mjs -> adapters/request-prune.mjs
<plugins-dir>/context_engine/engine-factory.mjs -> adapters/engine-factory.mjs
<plugins-dir>/context_engine/shell-read.mjs -> adapters/shell-read.mjs
<plugins-dir>/src -> src/
<plugins-dir>/ise -> ise/
```

Installing only `adapters/hermes/` is incomplete because `bridge.mjs` imports
request pruning, the Isolated Semantic Engine factory, shell-read tracking, and
the core.

## Cleanup boundary

Tracked benchmark packs, fixtures, locks, reports, Public Change Records, and
experiment ledgers are contracts or evidence records, not disposable output.
The layout audit found no tracked generated or duplicated file whose deletion
could be proven safe. Dependency directories and fetched paper PDFs remain
ignored local artifacts.
