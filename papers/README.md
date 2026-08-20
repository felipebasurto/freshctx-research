# Research corpus

The manifest is executable research infrastructure, not a decorative reading
list. Before an autoresearch run:

```bash
npm run papers:fetch
npm run papers:verify
```

`papers:fetch` downloads entries marked `required` into `papers/cache/`, checks
that each response is a plausible PDF, computes SHA-256, and writes
`papers/papers.lock.json`. Use `papers:fetch:all` for adjacent papers. PDF files
are intentionally ignored by Git; the small lock file is the reproducibility
artifact and should be committed when an experiment corpus is frozen.

Read required papers in this order:

1. CORVUS and The Complexity Trap: strongest direct baselines.
2. CodeStruct and VOCC: structural units and compiled context views.
3. Self-GC: object lifecycle and recovery.
4. Lost in the Middle: layout risk.
5. Prompt Cache and Don't Break the Cache: cache economics.
6. SmoothAgent: transformation latency and lookahead.
7. The context-engineering survey: novelty audit.

For each paper, answer the manifest's `readingQuestions` in experiment notes.
An agent may add a paper only in a separate literature-review change. It must
not rewrite the required set during an optimization run.

The papers remain subject to their authors' copyright and licenses. The fetcher
downloads them for local research use from their primary arXiv records; it does
not redistribute them in this repository.
