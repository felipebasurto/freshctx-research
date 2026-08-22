# Live session methods — 2026-08-22

Not a paper result. Methods note for the first live DeepSeek + FreshCtx
plugin session after `4ccb0083` (PCR 0040 empty-envelope base).

## What this is

A scripted multi-turn driver on a disposable workspace. It calls the real
installed FreshCtx Hermes plugin (`FreshCtxContextEngine` observe +
`select_context`) and the real DeepSeek Chat Completions API. It is **not**
a Hermes CLI chat, **not** a Pi session, and **not** a holdout replay.

Hermes here is **Nous Research Hermes Agent**
(`https://github.com/NousResearch/hermes-agent.git`), not a Hermes LLM.
The model is DeepSeek.

PCR 0034 (earlier the same day) also called DeepSeek, but only as Hermes
`compress()` on budget-pressure traces. Do not mix the two.

## Pins

| item | value |
|---|---|
| Date written | 2026-08-22 21:26 Europe/Madrid |
| Cells ran | 2026-08-22 21:22–21:25 Europe/Madrid |
| FreshCtx | `4ccb008385e223c0e67eb95080d5398dc3f8cc5e` |
| Door blob `src/anchors.mjs` | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Hermes Agent | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` from NousResearch/hermes-agent |
| Pi (pinned, unused) | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` |
| Requested model | `deepseek-chat` |
| Response model name | `deepseek-v4-flash` |
| API host | `https://api.deepseek.com/v1` |
| Plugin runtime | bun (system Node was v20.19.2; FreshCtx wants 22+). bun version was not recorded in the original report |
| Capture stub | off |
| Temperature | 0 |
| max_tokens | 220 |

## Protocol

For each cell:

1. Reset the synthetic workspace under `ws/`.
2. Build a persisted conversation: user asks to read; assistant emits a
   `read_file` tool call; tool result is the **old** file bytes.
3. Mutate the file on disk.
4. Run two modes on the same pre-mutation messages:
   - `hermes-fresh`: plugin `on_turn_complete` + `select_context`.
   - `hermes-native`: Hermes `ContextCompressor`.
5. POST the transformed request to DeepSeek.
6. Score the **JSON request**, not the model's opinion.

Cell B used a region-scoped read (`scope=region`, startLine=2, endLine=2,
selector `BETA_OLD_INTERIOR`). Cell B2 repeated the same disk mutation
with a whole-file read.

Drivers stay on the box (they load an API key): 
`/workspace/freshctx-live-2026-08-22/logs/run_live.py` and `extra_b2.py`.

User prompt (verbatim):

> Quote every unique marker token you can see (ALPHA_/BETA_/GAMMA_/DELTA_/EPSILON_ plus NEW if present). Then say whether the files look FRESH or STALE. One short paragraph.

## Scoring

Token-in-request, deterministic.

- `stale-bytes = yes` if an old unique marker is still in `json.dumps(request)`
  after a mutation that should have removed it.
- Cell A (append) keeps the old marker on disk, so stale-bytes is yes only
  if the **new** marker is missing.
- `current present` is yes if every required new marker is in the request.
- Cell C (delete) has no new marker. `current present` is vacuously yes.
  FreshCtx is correct iff `GAMMA_DELETE_MARKER` is absent.
- The model's FRESH/STALE paragraph is **not** the score. On E-large
  hermes-fresh the model named `EPSILON_NEW_MARKER` and still said STALE.

Request artifacts keep ~80-character snippets around each marker plus the
first 500 characters of the model reply. Full request bodies were not saved.

## Cell B confound (do not cite as a region miss)

`reset_ws()` wrote strings such as `"line1\\nBETA_OLD_INTERIOR…\\nline3 footer\\n"`
with **literal two-character backslash-n**, not line breaks. Rechecked on
the leftover file: `region_b.txt` is 69 bytes, `0x0a` count 0, literal
`\\n` count 3. The region tool call asked for lines 2–2 of a one-line
file. B2 (whole-file read) succeeding on the same mutation is consistent
with that confound. A paper must not treat B as a region-grain finding.

## Cells

| cell | mutation | read scope | usable? |
|---|---|---|---|
| A-append | append new marker line | whole file | yes, token-in-request |
| B-interior | replace interior marker | region line 2 | **no** — newline confound |
| B2-file-scope-interior | same replace as B | whole file | yes, token-in-request |
| C-delete | unlink file | whole file | yes, old-token absence |
| D-two-files | rewrite file 1 | two whole files | yes |
| E-large | replace marker in ~8.3k file | whole file | yes |
| E-large-pressure | same as E, native only | whole file | compress flag only |
| G-edit-one-of-two | rewrite one of two | two whole files | yes |

## What a paper may say

- On this scripted driver, after file-scope edits, the hermes-fresh
  request JSON contained the new unique markers and hermes-native still
  contained the old ones. DeepSeek often quoted those tokens. The gold
  is the request JSON, not the quote.
- Transform time was 64–73 ms on these tiny files. DeepSeek HTTP was
  1.5–2.2 s.

## What a paper may not say

- SOTA, breakthrough, or beats CORVUS.
- That this was a Hermes CLI session or a Pi session.
- That n>1 or that the workspace was a real repository.
- That native compress refreshed bytes.
- That region-scoped live edits failed. Cell B is an invalid test.
- That the model's FRESH/STALE word is accuracy.

## Threats to validity

- n=1, synthetic markers, scripted conversation.
- Model id drift: requested `deepseek-chat`, API returned `deepseek-v4-flash`.
- Workspace on disk after the run is final residue, not per-cell snapshots.
- Full prompts were not archived.
- Plugin ran under bun, not Node 22. bun version unpinned in the report.
- Isolated Hermes config; user `~/.hermes` was not used.
- No Pi live cells.
