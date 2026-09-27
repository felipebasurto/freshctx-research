# Jev stale-view lab v1

Exploratory lab. It asks whether TypeSafe's Jev (`jev-1.13.0`, a "System One"
typed-decision model) is useful around FreshCtx's freshness boundary. Nothing
here touches the core, adapters, benchmarks, or the maintained product. Jev is
an external, closed, paid service; FreshCtx core stays provider-free.

Data: row group 0 (4,096 trajectories) of
[nebius/SWE-rebench-openhands-trajectories](https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories)
(CC-BY-4.0; Qwen3-Coder-480B on OpenHands 0.54). Fetch it with
`python fetch_data.py` into the ignored `.work/` directory.

All numbers below are **measured** in this lab on 2026-09-24 unless stated.

## E0 — deterministic stale-view metric (`sim.py`)

`sim.py` replays every `str_replace_editor` view/create/edit per file and
classifies each `str_replace` outcome. A `not verbatim` failure is `stale` when
`old_str` appears in an earlier version the agent saw but not in the
reconstructed current file; `whitespace` when it matches after whitespace
normalization; `never_seen` otherwise; `unknown_state` when a shell command
may have mutated the file.

| Measure | Value |
| --- | ---: |
| `str_replace` calls | 20,844 |
| failed `not verbatim` | 371 |
| cause `stale` | 35 (0.17% of calls) |
| cause `never_seen` (rewritten from memory) | 151 |
| cause `whitespace` | 54 |
| cause `unknown_state` | 131 |
| resolved rate, trajectories with a stale failure | 50.0% (n=34) |
| resolved rate, all others | 48.8% (n=4,041) |

Byte-level stale edits are rare and are not associated with resolution here.

## E1 — Jev triage of failed edits (`e1_triage.py`, `e1_v2.py`)

Jev receives `old_str`, the current region and, if any, an earlier region, and
must name the cause. Labels come from E0 (n=240).

| Variant | Accuracy |
| --- | ---: |
| one Choice question | 31.2% (predicts `outdated` for most items) |
| two atomic Nouls, decision in code | 67.5% |
| deterministic rule | exact by construction |

Jev is the wrong tool for exact-string questions. This matches TypeSafe's own
[jaggedness notes](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) on
literal reading and precision.

## E2 — stale assistant statements, pilot (`e2_build.py`, `e2_run.py`)

The open problem FreshCtx leaves untouched: an earlier assistant message that
describes code an edit has since changed. For 30 real source edits we took the
nearest assistant message before the edit (`pre`) and after it (`post`) that
mentions at least two identifiers from the edited code. One author labelled
them; 5 edits were excluded as ambiguous or diff-less, leaving 50 statements,
9 stale. The Noul prompt was written once, before any result, and not tuned.

| Scorer | AUC (all 50) | AUC (pre only, 9 vs 16) |
| --- | ---: | ---: |
| Jev Noul | 0.996 | 0.997 |
| removed-token overlap baseline | 0.721 | 0.726 |

At threshold 0.5 Jev had 9 TP, 3 FP, 0 FN. Latency p50 was 1.75 s from the
author's machine (TypeSafe advertises 70–500 ms). This is a pilot: tiny n,
a single labeller who also wrote the prompt. E3 is the replication.

## E3 — held-out replication

See [`PROTOCOL.md`](PROTOCOL.md). The protocol, candidates and labels were
committed before any Jev call on E3 data (`19ec73c`, `ff6856b`). The planned
second labeller (`claude-opus-5`) failed with an invalid credential, so this is
a **single-labeller** result; see the deviation note in the protocol.

150 held-out pre-edit statements, 133 labelled (78 stale, 55 not), frozen E2
prompt, `jev-1.13.0` (`e3_run.py`, raw output in `results/e3_results.json`).

| Scorer | AUC |
| --- | ---: |
| **Jev Noul** | **0.946** |
| removed-token overlap baseline | 0.534 |

| Threshold | TP | FP | FN | Precision | Recall |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.3 | 75 | 16 | 3 | 0.82 | 0.96 |
| 0.5 | 67 | 5 | 11 | 0.93 | 0.86 |
| 0.7 | 48 | 3 | 30 | 0.94 | 0.62 |

The pre-registered criterion (AUC ≥ 0.85 and ≥ 0.10 above baseline) is met.
Errors cluster at the rubric's grey zone: most false negatives are behaviour
claims confirmed by a reproduction script (the prompt tells Jev runtime
observations are "false"; the author counted them), and several false
positives are proposals that imply the current code ("the fix should remove
the `min()`"). The 17 excluded items all score 0.40–0.81, i.e. Jev is also
uncertain where the author was.

Latency: a trivial one-question request had p50 1.11 s from the author's
machine; E3 items had p50 1.03 s and p90 1.15 s. The floor is network and
service overhead, not state size. Input: 115,611 tokens (about $0.005).

Open limits: one labeller who also wrote the prompt; one agent model
(Qwen3-Coder) and one scaffold; statements are the nearest pre-edit message
that mentions edited identifiers, not every message in the context; Jev is a
closed service whose alias can move (`jev-1.13.0` is pinned here).

## E4 — every earlier message, and fan-out (`PROTOCOL-E4.md`)

25 held-out edits, every earlier assistant message (≥80 chars, nearest 30):
338 statements. Blind author labels on everything flagged plus a random
sample of the rest. Estimated prevalence: **18.1%** of earlier assistant
messages carry a claim the edit invalidated.

| Scorer | Threshold | Precision | Recall (est.) |
| --- | ---: | ---: | ---: |
| one call per statement | 0.5 | 0.87 | 0.74 |
| one call per statement | 0.7 | 1.00 | 0.46 |
| fan-out (one call per edit) | 0.5 | 0.90 | 0.72 |

Fan-out agrees with single calls (Pearson 0.985) with 2.6× fewer input tokens
and one ~1.3 s call per edit. False positives are mostly claims about the test
file, another file, or git history.

## E5–E8c — does acting on the flag change task outcomes?

Harness: Pi 0.85 with a scripted provider that seeds a read and an assistant
conclusion, then the file changes and `deepseek-v4-flash` (temperature 0)
answers a question checked by code. Protocols `PROTOCOL-E5.md` …
`PROTOCOL-E8c.md`, runners `e5_run.mjs` … `e8c_run.mjs`, reports in
`results/e*_report.json`. First-submission accuracy:

| Exp. | Setup | No intervention | Jev note next to claim | Claim withdrawn (Jev) | Never had the claim |
| --- | --- | ---: | ---: | ---: | ---: |
| E5+E6 | 5 synthetic tasks, FreshCtx bridge | 23/30 | 13/15 | 14/15 | 30/30 |
| E7 | 19 real conclusions, current code in context | 38/38 | 38/38 | 38/38 | 38/38 |
| E8 | same, code absent, prompt says "current code" | 38/38 | 38/38 | 38/38 | 38/38 |
| E8b | neutral prompt × read cleared | 19/38 | — | 37/38 | 26/38 |
| E8c | same cell, replication | 17/38 | 21/38 | 38/38 | 28/38 |

- Every wrong answer across E5–E8c was given **without reading** the file:
  the stale conclusion stood in for a read.
- A note next to the claim barely helps. Withdrawing the claim with a pointer
  that says the file changed turns the gap into a read.
- The effect only appears when nothing else prompts a read. With the current
  code visible (E7), or a prompt that says "current" (E8, three of the four
  E8b cells), all arms hit the ceiling.
- E8c separates the pointer: withdrawing silently (31/38) recovers the
  no-claim level; saying the file changed adds on top (38/38).

Limits: one model, 2 reps, small excerpts, author-written questions, one
cell selected in E8b.

## E9 — withdraw at the tail, keep the cache (`PROTOCOL-E9.md`)

Rewriting the stale claim in place (E8c's E) changes a prefix the provider has
already cached, so everything after it is billed again at the uncached price.
E9 leaves the history byte-identical and appends the withdrawal to the new
user turn instead. Same E8c cell; a warm-up request puts the pre-edit history
in DeepSeek's cache first. 114 runs, $0.207 at list price, $0.079 with the
cache discount (measured).

| Arm | First-submission | Cached share, 1st request | Cost per correct first answer |
| --- | ---: | ---: | ---: |
| claim intact | 19/38 | 81.7% | $0.00076 |
| withdrawn in place | 38/38 | 73.6% | $0.00034 |
| **withdrawn at the tail** | **38/38** | **82.3%** | **$0.00032** |

Tail > intact: one-sided Fisher p = 9e-8. On the 25 real E4 edits the earliest
Jev-flagged message sits a median 16k tokens (61% of context) back, so an
in-place rewrite would re-bill about $0.007 per edit at DeepSeek prices
(estimated, `e9_cache_cost.py`). The tail notice costs ~40 tokens.

Not yet shown: that Jev is needed. The notice names only the file, and FreshCtx
already knows which files changed. E10 should compare against that
deterministic rule, with control items whose claim is still true.

## E10 — does the tail withdrawal need Jev? (`PROTOCOL-E10.md`)

The E9 notice only names the file, and FreshCtx already knows which files
changed. E10 compares Jev against a model-free rule (the notice for every
changed file) on the 19 stale items plus 19 controls: same claim and question,
but the edit is an unrelated comment, so the claim stays true. 228 runs,
$0.406 at list price, $0.150 with the cache discount (measured).

| Items | Arm | First-submission | Reads | Cost per correct first answer |
| --- | --- | ---: | ---: | ---: |
| stale | no notice | 22/38 | 40 | $0.00065 |
| stale | notice if Jev p ≥ 0.5 | 38/38 | 41 | $0.00033 |
| stale | notice always (rule) | 38/38 | 40 | $0.00032 |
| control | no notice | 35/38 | 27 | $0.00028 |
| control | notice if Jev p ≥ 0.5 | 35/38 | 20 | $0.00024 |
| control | notice always (rule) | 36/38 | 52 | $0.00039 |

- Stale items: the rule matches Jev (38 vs 38).
- Controls: the rule does not cost accuracy (Jev > rule, p = 0.82), but it makes
  the model re-read every time: 1.65× the cost per correct answer. Jev flagged
  0 of 38 control runs. By the preregistered rule, Jev's selectivity has a
  measured value here, **on cost only**.
- In dollars that is $0.00015 per control run on these 7–67 line excerpts,
  about the price of a fan-out Jev call per edit ($0.00014, E4). The saving
  grows with file size; Jev's ~1 s latency and external dependency do not.

Not a product change yet: all of E8b–E10 comes from one cell chosen because it
produced the failure. The next check is the per-changed-file notice on real
resumed tasks with the FreshCtx bridge.

## E11 — the rule on real files, with the model's own conclusion (`PROTOCOL-E11.md`)

The 19 E7 edits on the full real files (73–7,636 lines, fetched at the
SWE-rebench `base_commit`). Nothing is scripted: the model investigates the
question with the FreshCtx bridge observing, writes its own conclusion, the
real edit lands while the session is closed, and the session resumes with a
neutral question. 38 investigations and 152 arm-runs cost $1.13 at list price
($0.50 with the cache discount).

9 of 38 investigations did not finish within 16 requests (e11-00, -05, -06,
-09 in both reps and e11-24 in rep 1), so 29 runs per arm are analysed, not 38.

| Arm | First-submission | Within two | Reads | Cost per correct first answer |
| --- | ---: | ---: | ---: | ---: |
| plain Pi | 2/29 | 16/29 | 64 | $0.0440 |
| plain Pi + notice (rule) | 5/29 | 19/29 | 31 | $0.0090 |
| FreshCtx bridge | 17/29 | 29/29 | 12 | $0.0022 |
| FreshCtx bridge + notice | 18/29 | 29/29 | 12 | $0.0019 |

Preregistered tests (exact Fisher, one-sided): rule with FreshCtx p = 0.50,
rule without FreshCtx p = 0.21, **FreshCtx vs plain Pi p = 2.3 × 10⁻⁵**.
By the fixed decision **the rule stays in the lab**.

- **On real transcripts the notice is ignored.** With a scripted conclusion
  (E9/E10) it always triggered a read. Here, with the model's own conclusion,
  26 of 29 plain-Pi + notice first answers came without reading. 25 of 29
  conclusions state the pre-edit answer (author label, blind to arm,
  `labels/e11_author.json`). The two exceptions: e11-01 already states the
  post-edit answer, and e11-15 is mixed.
- **What helps is FreshCtx putting current code in the transcript.** Across
  both bridge arms, 30/30 runs with current code in the first request passed,
  against 5/28 without it. The split is by file size. Every file of 190 lines
  or fewer (e11-03, -04, -08, -18, -21, -22) was read whole in one call, and
  the bridge replaced that read with an `ambiguous` marker instead of current
  code. All 12 of those runs failed in both bridge arms, answering from the
  conclusion without reading. Every file over 200 lines (read in ranged
  pages) was refreshed, and all of those passed. e11-01 passed despite the
  marker because its conclusion already gave the post-edit answer.
- The 4 plain-Pi errors are the request cap on the retry, after a failed
  first answer, so they don't affect first-submission accuracy.

Product implication: the most useful fix is not a notice. It is making
whole-file reads relocate instead of falling back to `ambiguous`. Relocating
the whole file also shows the known truncation bug (the region comes back
`updated` but keeps the old byte length). The `ambiguous` path in the bridge
is a separate issue and is not fixed here.

Limits: single-file workspaces, investigation prompt identical to the later
question, one model, 2 reps. Ambiguous-vs-refreshed coincides exactly with
file size here, so this run can't separate the two.

## E11b — the six small files with the whole-file fix (`PROTOCOL-E11b.md`)

The product fix (`official` branch `fix/whole-file-ambiguous`, `6e8fac8`)
pins region anchors shorter than 128 bytes to the file edge. Offline it turns
all 19 E11 whole-file relocations from `ambiguous` into `updated` at the full
new length. E11b reruns E11 live, unchanged except for that one file, on the
six items where every bridge run had failed (e11-03, -04, -08, -18, -21,
-22), 2 reps. The investigations are new. $0.135 at list price ($0.060 with
the cache discount).

| Arm | E11 first-submission (same items) | E11b first-submission | E11b reads |
| --- | ---: | ---: | ---: |
| plain Pi | 0/12 | 0/12 | 12 |
| plain Pi + notice (rule) | 0/12 | 2/12 | 12 |
| FreshCtx bridge | 0/12 | **12/12** | 0 |
| FreshCtx bridge + notice | 1/12 | **12/12** | 0 |

- No first bridge request carries the `ambiguous` marker any more. The
  harness flags current code in 10/12. The other two are e11-04, where the
  projection does hold the edited file at its full new length (3,997 bytes),
  but the flag's string matching misses it.
- The bridge now answers correctly without re-reading: the refreshed file is
  already in the transcript.
- Plain Pi still answers every first submission from its stale conclusion, so
  these items still produce the failure. Only the product changed.
- Small n (12 runs per arm, six items), one model. Together with E11's files
  over 200 lines, the bridge refreshed every whole-file and paged read in this
  set.

## E11c — whole repositories, a topic that doesn't ask the question, and a diff notice (`PROTOCOL-E11c.md`)

All 19 E11 items. Each workspace is the whole repository at `base_commit`, and
the investigation gets a topic that names the area but not the later question.
Three arms: plain Pi, plain Pi with a harness-style change notice carrying the
unified diff, and the FreshCtx bridge from `official` `5dc05d1`. The pilot
raised the investigation output cap from 1,024 to 4,096 tokens (recorded in
the protocol before the main run). 38 investigations and 114 arm-runs cost
$0.76 at list price ($0.38 with the cache discount). Every response was served
as `deepseek-flash`.

4 of 38 investigations hit the 24-request cap (e11-05 and e11-06, both reps),
so each arm has 34 runs.

| Arm | First-submission | Within two | Reads | Cost per correct first answer |
| --- | ---: | ---: | ---: | ---: |
| plain Pi | 4/34 | 18/34 | 45 | $0.0179 |
| plain Pi + diff notice | **34/34** | 34/34 | 0 | $0.0010 |
| FreshCtx bridge | 31/34 | 32/34 | 2 | $0.0018 |

Preregistered tests (exact Fisher, one-sided): FreshCtx vs plain Pi
p = 1.0 × 10⁻¹¹, **FreshCtx vs diff notice p = 1.0**, diff notice vs plain Pi
p = 2.6 × 10⁻¹⁵. By the fixed decision, **a diff notice is enough here**.

- **The E11 result replicates in whole repositories with an unrelated topic.**
  Plain Pi answers 30 of 34 first submissions from its stale conclusion,
  without reading.
- **A notice with the diff is as good as FreshCtx, and cheaper.** Unlike E11's
  notice, which only said the file had changed, this one carries the change,
  and the model used it every time without reading. For a single edit in one
  file that the harness can see, verified refresh adds nothing over the diff.
- **FreshCtx's three failures come from one bridge bug.** None of the three
  first requests carried the edited code, old or new. In e11-24 (both reps)
  the model read the file whole, then read `offset: 200` to see the last four
  lines. That second read narrowed the tracked unit from the whole file to the
  last symbol (`scan_quoted_literal`), and the edit sat in the function above
  it. In e11-10 rep 0, overlapping ranged reads left a region that doesn't
  cover the edit, and the first request carries an `ambiguous` marker (the
  protocol expected none). Fix: a later partial read of a file already
  observed whole should not narrow the whole-file unit.
- Pending: blind author labelling of whether each conclusion states the
  pre-edit answer.

Limits: one edit per item, which is the case a diff notice handles best.
Several edits, long diffs, or edits to files the harness didn't make (for
example git checkout or a formatter) are where a notice and verified refresh
could come apart. That isn't measured here. Also: one model, 2 reps,
author-written topics, and Pi's only tool is `read`.

## Running

```sh
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python fetch_data.py
.venv/bin/python sim.py .work/rg0.parquet .work/events.json
export TYPESAFE_API_KEY=...        # never commit it
.venv/bin/python e1_triage.py .work/events.json results/e1_results.json
.venv/bin/python e1_v2.py
.venv/bin/python e2_run.py
.venv/bin/python e3_build.py      # already frozen in results/
.venv/bin/python e3_run.py
```

`results/` holds the raw outputs, including dataset-derived code excerpts.
