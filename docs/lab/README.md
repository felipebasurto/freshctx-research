# Public research log

This directory is the public notebook for FreshCtx iterations. Later technical
narrative should be written from these notes, not from memory.

Every note here is part of the public repository. Write as if a reviewer, a
competitor, and a future coauthor will quote the file.

## What a PCR is

A **Public Change Record** (PCR) is one dated note for one mergeable iteration.
It records what changed, which benchmarks were run, raw metric values and
labels, comparisons to cited papers or public systems, and what remains
unproven.

PCRs are evidence logs. They are not announcements, not performance claims, and
not a substitute for `docs/EVALUATION.md`.

## Commands that every iteration must run

```bash
npm test
npm run check
npm run evaluate
npm run ctxbench
npm run demo
```

If the branch includes the smoke control board:

```bash
npm run repos:verify
npm run ctxbench:smoke
```

Record every command’s exit status. If a command is absent on the branch, say
so. Do not skip a present command because the change “should not affect it.”

## Labels

Use only the labels in `docs/EVALUATION.md` and `docs/BENCHMARK.md`:
`synthetic`, `replay`, `public-repo`, `public-repo-smoke`.

Never label a result `SOTA`, `production performance`, or “agents program
better.” Tokenizer heuristics and single-shot CI timings are not publishable
latency claims.

## Public writing rules

Do: cite primary sources; mark numbers **measured**, **reproduced**, or
**cited**; state limitations and negative results; quote the paper when claiming
a match or a deviation.

Do not: invent competitor internals; treat a CORVUS-shaped injector as a
reviewed reproduction of [CORVUS](https://arxiv.org/abs/2607.22711); write
strategy, insults, credentials, or unpublished holdout seeds; describe unbuilt
work as implemented; hide a metric that moved the wrong way.

If `SOUL.md` or `docs/EVALUATION.md` conflicts with another file, record the
conflict in the PCR. Do not silently pick a side.

## Layout

| Path | Role |
|---|---|
| [INDEX.md](INDEX.md) | Chronological index |
| [TEMPLATE.md](TEMPLATE.md) | Required PCR sections |
| [METRICS.md](METRICS.md) | Running benchmark ledger |
| [NEXT-PROMPT.md](NEXT-PROMPT.md) | Current next-iteration prompt |
| [pcr/](pcr/) | Numbered Public Change Records |
