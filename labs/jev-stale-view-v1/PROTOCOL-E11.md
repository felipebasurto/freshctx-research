# E11 protocol — the per-file withdrawal rule on real files with the model's own conclusion (written before any E11 model call)

Separate, labelled follow-up to E10 (PROTOCOL-E10.md). Earlier experiments are not modified.

## Question

E9/E10 showed, in one constructed cell (scripted conclusion, emptied read,
small excerpts), that a tail notice withdrawing earlier notes about a changed
file fixes answers given from a stale conclusion, and that a model-free rule
(one notice per changed file) does as well as Jev. Before any product change:
does the rule help on real files, when the model wrote its own conclusion and
nothing in the transcript is scripted, with and without the FreshCtx bridge?

## Items (`e11_meta.py`, `e11_build.py` → `results/e11_items.json`)

The 19 E7 edits, on the **full real file** at the instance's SWE-rebench
`base_commit` (raw GitHub). The agent's real `str_replace` applies exactly once
to every file (checked). Files are 73–7,636 lines. The workspace holds only
that file, at its repository path. Question: the E7 question with the E8b
neutral rewrite; gold for the after file. The author checked the risky
questions against the full files (e7-04 `import re`, e7-20 `open_async`,
e7-18 `read()`, e7-06 `STORED`/`VIRTUAL`, and others): other matches in the
full files are unrelated, so the answer still flips with the edit.

## Procedure (`e11_run.mjs`)

1. **Investigate (live, shared by all arms).** Pi 0.85 with the FreshCtx Pi
   bridge loaded (so FreshCtx observes the reads), prompt:
   `Investigate this question about <path>: <question> Read the relevant code and explain what you find, citing the lines. Do not return JSON yet.`
   The model reads and writes its own conclusion. ≤8 requests, 1,024 output
   tokens. The session closes.
2. **External edit.** The real `str_replace` is applied to the file. The
   workspace (session file and `.freshctx/`) is snapshotted.
3. **Resume, per arm**, from the restored snapshot, with the neutral prompt
   `Answer this question about <path>: <question> Return only a JSON object with the boolean field answer.`
   ≤8 requests, 512 output tokens, 2 submissions, E7 retry prompt.

No warm-up request: the investigation was sent to DeepSeek for real, so its
prefix is cached as in a real session.

## Arms

- `A_native`: resume without the bridge (Pi native `read`; the old read stays).
- `A_rule`: as A, plus the tail notice.
- `F_fc`: resume with the FreshCtx bridge (product export `c15f5ad`, default
  granularity; the old read is refreshed or marked by FreshCtx).
- `F_rule`: as F, plus the tail notice.

Tail notice (E9/E10 wording), appended to the question turn in the outgoing
copy on every request:
`\n\n[FreshCtx: your earlier note about <path> is withdrawn because the file changed after it was written. Do not rely on it.]`
The changed-file list is supplied by the harness (the one edited file), which
is what FreshCtx's resolver would report.

`deepseek-v4-flash`, temperature 0, thinking off. 19 items × 2 reps; arm
order rotated by item index + repetition. Request cap 400,000 bytes. Spend
cap $6 at list price in `results/e11/.spent.json`.

## Preregistered analysis (first-submission accuracy, exact Fisher, orientative)

1. **Rule with FreshCtx** (the product question): F_rule > F_fc, one-sided.
2. **Rule without FreshCtx**: A_rule > A_native, one-sided.
3. **FreshCtx alone**: F_fc > A_native, one-sided.
4. Descriptive: answers given without reading and their failures; stale-derived
   answers; requests, reads, prompt tokens, cache-hit share and cost with the
   cache discount per arm; how often the investigation's conclusion states
   the pre-edit answer (author label, done after the run, blind to arm).

Decision, fixed now: the rule is proposed for the product only if test 1
gives p < 0.05, or F_fc is below 34/38 and F_rule ≥ F_fc + 4, **and** F_rule's
cost per correct first answer is not more than 25% above F_fc's. Otherwise it
stays in the lab, reported as is.

## Pilot and dry run

- Dry run on a small and the largest file (done before this protocol was
  final): pipeline works; the bridge marks the e11-08 read `ambiguous`
  (product behavior: ambiguous region mappings require a new read).
- Live pilot on 2 items, rep 0, excluded from the analysis: checks cost per
  item and that the investigation reads and concludes. If the pilot shows the
  full run would exceed the cap, the run stops for a decision.

## Pilot outcome and the one change it caused (recorded before the main run)

- e11-08 (137 lines): the investigation read the whole file and concluded
  "No, the code does not honour `HY_HISTORY`". After the edit, **all four
  arms answered `false` without reading** on the first submission, including
  both rule arms with the notice present; all read and passed on the retry.
  Spend $0.014.
- e11-00 (627 lines): the investigation hit the 8-request cap (9 ranged reads;
  the bridge reads 200 lines by default) and never concluded. Spend $0.011.
- Change: the investigation cap is raised from 8 to **16 requests**. Nothing
  else changes. Pilot files are kept in `results/e11/pilot/` and excluded.
- Estimated full-run spend from the pilot: about $1–2 at list price, under
  the $6 cap.

## Limits known in advance

- Single-file workspaces; the rest of the repository is absent.
- The investigation prompt asks exactly the question later asked, which makes
  the conclusion directly relevant; real conclusions are often less targeted.
- One model, 2 reps, author-written questions, 19 edits.
- The phase-1 investigation varies between reps (live model); arms within a
  rep share it.
- With a live investigation, some conclusions may not state an answer; those
  items cannot show harm from the conclusion.
