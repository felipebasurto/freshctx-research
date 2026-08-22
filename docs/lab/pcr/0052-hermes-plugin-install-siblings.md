# PCR 0052 — Hermes plugin install ships siblings by default

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (packaging fix)
- Branch / PR: `cursor/pcr-0052-hermes-packaging-652e` → https://github.com/felipebasurto/freshctx/pull/45 (draft)
- Commit: `21de0d1`
- Merge-base: `8050ca3f20a8463c8fed88458b3fd83ab9201b28` (main; PCR 0051 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `adapter-only`; `packaging`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0050/0051 traced live Hermes CLI hooks and found **hermes-only extract**
installs fail at bridge import (`Cannot find module '../request-prune.mjs'`).
Layout-complete installs (siblings present) unblock bridge rc=0; live
`select_context` returns a list; observe populates state.

The documented install still told users to symlink only `adapters/hermes` — the
broken layout. This PCR adds a **layout-complete install path** and a guard
that fails on hermes-only trees.

**Change:**

| artifact | purpose |
|---|---|
| `adapters/hermes/install.mjs` | Symlink `freshctx/`, `request-prune.mjs`, and `src/` into Hermes `plugins/` |
| `adapters/hermes/verify-layout.mjs` | Fail when siblings missing; probe bridge import |
| `test/hermes-plugin-layout.test.mjs` | Negative hermes-only + positive install regression |
| `adapters/hermes/README.md` | Replace broken single-dir symlink with install script |

Install layout (relative to Hermes `plugins/`):

```
plugins/
  context_engine/
    freshctx/          -> $REPO/adapters/hermes
    request-prune.mjs  -> $REPO/adapters/request-prune.mjs
  src/                 -> $REPO/src
```

From `plugins/context_engine/freshctx/bridge.mjs`, imports resolve as before:
`../request-prune.mjs` and `../../src/index.mjs`. No import-path change in
`bridge.mjs`. No registry publish (v0.3 gate).

## What we did

- Added install + verify scripts and layout regression tests under `adapters/hermes/`.
- Updated Hermes adapter README install section.
- Did **not** edit `src/anchors.mjs`, door, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, `bridge.mjs` logic, or
  persist behavior. Door stays `f8771c93894095348185ef3453a3c2498355b3c6`.
  `repos.lock` blob stays `79e29d09a9ec12b1128617f683f50a35a3c8809e`.
  `AUTORESEARCH_SCORE` stays 89.107165. `resultSetHash` stays null.
- Did **not** merge persist lifecycle from closed PR 38. PCR 0045 / 0046 remain
  on that closed PR only — not filed here.

## Pins (unchanged)

| artifact | SHA |
|---|---|
| FreshCtx product | `8050ca3f` (merge-base) |
| Hermes Agent host | `999703fd` |
| Door | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `repos.lock` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `AUTORESEARCH_SCORE` | 89.107165 |
| `resultSetHash` | null |

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | +2 layout tests (hermes-only fail, install pass) |
| `npm run evaluate` | yes | 0 | score unchanged |
| `npm run hermes:verify-layout` | yes | 0 | on staged temp tree via test |
| live `hermes chat -q` | no | — | box follow-up after packaging lands |

## Metric snapshot

| check | result |
|---|---|
| hermes-only layout guard | **pass** (test fails import) |
| install script siblings | **pass** (bridge probe rc=0) |
| door / lock / score | unchanged |
| persist from PR 38 | not merged |

## Comparison

- PCR 0050: hermes-only extract; import fail; live None.
- PCR 0051: manual sibling copy; select list; observe ran; packaging still broken in docs.
- PCR 0052 (this note): install script ships siblings; verify guard; no live re-run yet.

## Conflicts with constitutions

none observed. Adapter packaging only; core untouched.

## Limitations

- Symlink install assumes a FreshCtx source checkout remains reachable.
- Hermes user-plugin registry publish remains v0.3.
- Live `-q` + `read_file` confirm not run in this PCR (box follow-up).
- PR 38 closed (discard); persist adapter not mergeable.

## Protocol gap?

**No.** Packaging + tests; door, holdout seal, and locks untouched.

## Next measurement

One live Hermes `hermes chat -q` + one `read_file` using the new install script
(not manual sibling copy). Score select **None vs list** from files. Do **not**
merge any persist adapter. Do **not** re-run the A-append gold matrix.
