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
