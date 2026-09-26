# E8b protocol — which cue made the model always read? (written before any E8b model call)

Separate, labelled follow-up to E8 (PROTOCOL-E8.md). E8 is not modified.

## Question

E8 hit a ceiling again (152/152) and, unlike E5/E6, the model read the file
before its first answer in 152/152 runs. Two cues present in E7/E8 and absent
in E5/E6 are candidates:

- **Prompt cue**: the wrapper says "the current code in <file>" and "You may
  read any required code", and 17/19 questions say "current"/"currently".
- **Placeholder cue**: the seeded read is replaced by
  `[tool result cleared to save context]`, which tells the model content is
  missing.

E8b crosses them (2 × 2) to find a setup where a stale conclusion can
substitute a read, and then asks the E8 questions there:

1. Without-read first answers in B per cell (primary descriptive outcome:
   which cue, if any, produces reading-free answers).
2. Harm: D > B on first-submission accuracy, per cell.
3. Recovery: E > B, per cell.

## Factors

- `prompt=current`: E7/E8 prompt and question, unchanged:
  `Answer this question about the current code in <file>: <question> You may read any required code. Return only a JSON object with the boolean field answer.`
- `prompt=neutral`:
  `Answer this question about <file>: <neutral question> Return only a JSON object with the boolean field answer.`
  The neutral question is the item question after these fixed, mechanical
  rewrites (in this order), and nothing else:
  `^In the current code, is ` → `Is `; `the current code` → `the code`;
  `the current <word>` → `the <word>`; ` currently` → ``; ` still` → ``.
  (The 19 resulting questions were printed and checked before writing this
  protocol; the rewrite is recorded in each run.)
- `read=cleared`: E8 mechanism, unchanged (seed tool result content replaced
  by the placeholder in the outgoing copy).
- `read=removed`: in the outgoing copy, the seeded assistant tool-call message
  (the one whose `tool_calls` contain `seed_0`; it has no text) and the tool
  message answering `seed_0` are both deleted. Pairing stays valid (both
  halves go). The history then reads: user "Read <file>, then summarise what
  you found." → assistant claim / `Ready.` / pointer → user question. The saved
  session is not touched. The runner errors if it does not find exactly one of
  each.

`prompt=current, read=cleared` is the E8 setup, re-run the same day as a
within-experiment control.

The retry prompt is unchanged in all cells (it mentions "current workspace";
it only affects second submissions, which are secondary).

## Arms (per cell)

Bridge not loaded (Pi native `read`), as E8.

- `B_claim`: claim present, intact.
- `D_noclaim`: seed reply `Ready.`.
- `E_jev_withdraw`: B + Jev (frozen E2 Noul, `jev-1.13.0`, same state as E8);
  p ≥ 0.5 replaces the message with the E6 pointer (verbatim).

C (marker) is dropped: in E8 it behaved like B and the budget goes to cells.

## Fixed parameters

As E8: `deepseek-v4-flash`, temperature 0, thinking disabled, 512 output
tokens, ≤ 8 post-resume requests, ≤ 64,000 bytes, 2 submissions, same checker,
same items (`results/e7_items.json`, sha256 recorded). 2 repetitions per item;
arm order rotated by item index + repetition. 4 cells × 19 items × 2 reps ×
3 arms = 456 runs.

Spend cap: $2 for E8b, counted in `results/e8b/.spent.json` at peak price.

## Dry run (before any DeepSeek call)

All four cells on one item, then all 19 items for the two new read/prompt
combinations that matter most (`neutral × removed`, `current × removed`).
Check on the first post-resume request: prompt text per cell; seed tool
result cleared or seed pair absent; no file lines outside the claim; claim
present in B, absent in D, replaced in E where Jev ≥ 0.5.

## Reported

Per cell × arm: first-submission accuracy; accuracy within two; stale-derived
first answers; first answers without any read (and how many of those fail);
unparseable first answers; requests, reads, prompt tokens; Jev p;
withdrawal applied. Exact one-sided Fisher tests on first submissions, per
cell: D > B, E > B (38 runs per arm; orientative; no correction). Descriptive
comparison of B without-read counts across cells. Per-item table.

No prompt, threshold, rewrite rule or item change after seeing results.

## Limits known in advance

- Same excerpts and author-written questions as E7/E8; one model.
- The neutral rewrite removes temporal words but not the question's focus on
  the changed code.
- `read=removed` leaves the seed user message ("Read <file>, then summarise…")
  followed by a summary without any visible read; this is the real shape of
  a history after aggressive tool-call pruning, but it is not a natural
  trajectory.
