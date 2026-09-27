# E11c protocol — E11 in whole repositories, with an investigation that does not ask the question, a diff notice, and the fixed product (written before any E11c model call)

Labelled follow-up to E11 (PROTOCOL-E11.md) and E11b. Earlier results are not
modified.

## Question

E11 found FreshCtx 17/29 against plain Pi 2/29 on first submission, and every
bridge failure came from the whole-file `ambiguous` bug. E11b showed the fix
turns those six items into 12/12. E11c asks three things at once, on all 19
items:

1. Does the result hold with the fixed product (`official` `5dc05d1`: short
   anchors pinned to the file edge, and Pi reads without `limit` that return
   the whole file observed as the file)?
2. Does it hold when the workspace is the whole repository and the
   investigation does **not** ask the question later asked? This was E11's
   most serious limit.
3. Does a harness-style change notice with the diff do as well? This is what
   some agents already do (Claude Code announces external edits). If a notice
   with the diff is as good, FreshCtx's verified refresh adds nothing here.

## Items (`e11c_build.py` → `results/e11c_items.json`)

The 19 E11 items. The workspace is the repository at the item's
`base_commit` (GitHub codeload tarball). `e11c_build.py` checks that the file
there equals E11's pre-edit file byte for byte. Each item has an
**investigation topic**, written by the author before any E11c call, that
names the area without asking the question (e.g. e11-08: "Explain how
readline history and completion are set up in this file."). The later
question and gold are E11's.

## Procedure (`e11c_run.mjs`, a copy of `e11_run.mjs` with only these changes)

1. Investigation (live, shared by all arms), bridge loaded:
   `Investigate <path>: <topic> Read the relevant code and explain what you find, citing the lines. Do not return JSON yet.`
   ≤ **24** requests (E11: 16; E11 lost 9 of 38 investigations at 16). Must
   read the target file and stop normally; otherwise the run is excluded, as
   in E11.
2. External edit: the real `str_replace`, while the session is closed.
   Snapshot of the whole workspace.
3. Resume per arm with E11's neutral prompt and caps (≤ 8 requests, 512
   tokens, 2 submissions, E7 retry prompt).

## Arms (rotated by item index + rep)

- `A_native`: Pi without the bridge.
- `A_notice`: as A, plus a notice appended to the question turn in the
  outgoing copy:
  `[Note: <path> was changed outside this session after your earlier work. The change:` + fenced unified diff with 3 lines of context `]`.
- `F_fc`: Pi with the FreshCtx bridge from the `5dc05d1` export, default
  settings.

`deepseek-v4-flash` as in E11 (the API now serves it as `deepseek-flash`; the
served model name is recorded per response), temperature 0, thinking off.
19 items × 2 reps × 3 arms. Request cap 400,000 bytes. Spend cap $4 in
`results/e11c/.spent.json`.

The current-code evidence flag now falls back to the shortest changed line
when no changed line has 12 characters (E11 missed e11-04 `import re`). E11's
flag is not recomputed.

## Preregistered analysis (first-submission accuracy, exact Fisher, one-sided)

1. F_fc > A_native (replication of E11 test 3).
2. **F_fc > A_notice** (the new question).
3. A_notice > A_native.

Decision, fixed now:
- "Verified refresh beats a diff notice here" only if test 2 gives p < 0.05.
- "A diff notice is enough here" if test 2 gives p ≥ 0.05 **and** A_notice is
  within 2 first-submission passes of F_fc.
- Otherwise inconclusive.

Descriptive: `ambiguous` markers in F_fc first requests (expected 0); current
and stale code in the first request; answers without reading; reads, requests,
cost per correct first answer with the cache discount; investigations lost;
how often the conclusion states the pre-edit answer (author label after the
run, blind to arm; conclusions are shared by the arms of a run); served model
names.

## Pilot

Dry run (scripted model) on a small and the largest item first. Then one live
item (e11-08, rep 0) as a pilot, excluded from the analysis and rerun in the
main run. Any change it causes is recorded here before the main run.

### Pilot outcome (recorded before the main run)

Live pilot e11-08 rep 0 (`results/e11c/live-e11-08-rep0-*.json`, excluded):
the investigation read the file, then stopped on `length` at E11's 1,024-token
output cap (the broader topic draws a longer explanation), so the run was
excluded before any arm ran. Served model: `deepseek-flash`. Change: the
investigation output cap is raised to **4,096** tokens. Measurement caps are
unchanged. The pilot is rerun once with the change, still excluded.

## Limits known in advance

- Pi's only tool is `read`: the model can open other files in the repository
  but cannot list or search it.
- The topics were written by the author, who knows the questions; they are
  less targeted than E11's prompt, not neutral.
- One model, 2 reps, 19 edits, author-written questions.
