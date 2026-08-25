# Pi trial plan (with vs without FreshCtx)

Not a paper result. Not CtxBench. Not SOTA. Label: `live-host` / `replay` depending on the driver.

## Question

After Pi reads files and the workspace changes, does the next provider request
keep the old bytes or the current ones? How many UTF-8 bytes (and a local
piece-token count) sit in each read, with FreshCtx on versus off?

## Two drivers

1. **Replay (this machine, default).** `adapters/pi/replay.mjs` calls the same
   `tool_result` / `context` handlers as `adapters/pi/extension.ts`. No `pi`
   binary. This is what `run.mjs` executes here because `pi` is not installed.
2. **Official CLI (later).** `pi -e ./adapters/pi/extension.ts` against the
   capture provider. Same cells. Same scoring. Use when the CLI is on PATH.

Do not mix the two in one table without saying which driver produced the row.

## Workspace

- Default: a disposable fixture (`src/auth.ts` + `README.md`) under `$TMPDIR`.
- Your repo: `node docs/lab/pi-trial/run.mjs --repo <git-url>`.
  Shallow clone, then the same cells. Optional `--paths a,b` to pin files.

## Cells (same workspace, two modes)

Turn 1 (shared, persisted):

1. User asks to inspect the listed files.
2. Assistant emits one `read` tool call per file (whole file).
3. Tool results store the bytes that were on disk at read time.

Then the runner stamps one tracked file with `FRESHCTX_TRIAL_OLD` (if missing),
reads, and replaces that mark with `FRESHCTX_TRIAL_NEW`. Turn 2 does **not**
re-read. Safe on a clone of your repo. The clone is deleted when the run ends.

| Mode | What the runner does |
|---|---|
| `without` | Send the persisted messages as the provider payload. No adapter. |
| `with` | Run the Pi `context` hook, then send that request copy. |

## Score (request JSON, not the model)

- `current` if turn-2 message text contains `FRESHCTX_TRIAL_NEW`.
- `stale` if it still contains `FRESHCTX_TRIAL_OLD`.
- FreshCtx is correct on this cell when `current` is true and `stale` is false.

The capture provider returns `FRESHCTX_CAPTURE_OK`. It spends **zero** model
tokens. Provider `usage` is not the metric.

## Metrics (deterministic, local)

Primary unit is UTF-8 bytes of the serialized OpenAI-shaped request
(`JSON.stringify(payload)`).

Per read:

- `without`: bytes of that tool-result body.
- `with`: bytes of the stable marker for that call, plus the matching
  `<freshctx-unit>` body if the unit was selected.

`pieceTokens` counts identifiers, numbers, and single non-space characters.
It is a local splitter, not cl100k, not a vendor bill. Do not publish it as
"tokens saved."

`chars4Proxy` is `ceil(utf8Bytes / 4)`, labeled proxy only.

## Out of scope

- Hermes
- Tree-sitter / symbols
- Holdout gold, `holdout.md`, policy retune
- Session resume after process restart
- Real DeepSeek / OpenAI bills (plug a live provider later if you want
  `usage.prompt_tokens`; keep it in a separate column)

## Command

```bash
node docs/lab/pi-trial/run.mjs
node docs/lab/pi-trial/run.mjs --repo https://github.com/<you>/<repo>.git
node docs/lab/pi-trial/run.mjs --repo <url> --paths README.md,src/foo.ts
```

Writes `docs/lab/pi-trial/last-run.json`.

## Live CLI battery (you drive Pi)

Same question, real `pi` process, real model of your choice. Prompts and
mutate/status commands: `docs/lab/pi-trial/BATTERY.md`. Fixture lives in
`docs/lab/pi-trial/fixture/`. Working copies are `docs/lab/pi-trial/.work/`
(gitignored). Two arms, two resets, same cell order.

Live reports (not paper results):

- [REPORT.md](REPORT.md) — first viajante battery with `FRESHCTX_BUDGET_CHARS=200000`.
- [REPORT-2.1.md](REPORT-2.1.md) — same battery at the 32,768 default cap (CLI stayed CL0).
- [REPORT-2.2.md](REPORT-2.2.md) — after PCR 0080/0081: CLI/README/todo current; later-turn bytes still large.
