# Pi paired outcome pilot v1

This lab unblocks real-model outcome measurement through the product's Pi Chat
Completions bridge. It is a single synthetic development task, not a benchmark
of general coding ability. Frozen bench reports are untouched.

`task.json` and the first `checker.mjs` were committed at `985b061` before the
first harness run. That frozen v1 task stays byte-identical. Gold remains 74.

The fence-tolerant checker and five isolation tasks under `tasks/` are a later
freeze, committed before any new paid call. N=1 pair per task; fixed
baseline-first order; model `deepseek-v4-flash`, temperature 0, thinking
disabled, 512 output tokens. The live primary is `rate-constant-v1`. The
provider documentation on 2026-09-05 maps the model alias to
DeepSeek-V4-Flash-0731. The alias is not an immutable model snapshot; raw SSE
responses record the model string actually returned. Pi is pinned to 0.85.0.

The controlled seed performs actual Pi reads with a scripted HTTP provider.
It reads one complete function and only the header of another file. The agent
session closes, both files change, and the observed function moves down within
its file. A new AgentSession reopens the persisted session. Both arms may read
any file to compute the current answer. Only post-resume calls use the real
model. This does not measure model choices during the seed or a Pi OS-process
restart. The baseline uses Pi's native reader; the treatment uses the complete
FreshCtx bridge, including its reader description and formatting.

The checker executes the current two files in a separate VM; exact numeric
JSON equality is required. A correct numeric object wrapped in markdown or
code fences counts. Wrong golds still fail even when fenced. It supplies only
pass/fail feedback. We count first submission success, success within two
submissions, HTTP requests and read calls to pass. A failed run has null
requests-to-pass, not zero. Protocol and transport errors remain recorded and
invalidate a model-outcome interpretation.
The harness independently checks that the first measured request has current
observed code with FreshCtx, stale observed code without it, and no unread
body in either arm. Saved history must retain the old read.

Run from the research checkout, with an installed private product checkout:

```sh
FRESHCTX_PRODUCT=/absolute/path/to/freshctx node labs/pi-outcome-v1/run.mjs
FRESHCTX_PRODUCT=/absolute/path/to/freshctx node labs/pi-outcome-v1/run.mjs --task=labs/pi-outcome-v1/task.json
node --test labs/pi-outcome-v1/checker.test.mjs labs/pi-outcome-v1/live.test.mjs labs/pi-outcome-v1/live-rate-constant.test.mjs
```

The default is a loopback-only scripted regression, with **zero LLM samples**.
Its deliberately stale consumer needs a rejected submission and a second read
in the baseline. Its 4-vs-2 requests are fixture expectations, not evidence of
agent improvement. The script asserts these expectations. Results have unique
filenames and include complete request payloads, hashes, pins, and failures.
Only synthetic fixture content is sent upstream; credentials are never logged.

After explicit approval of up to $5 API spend:

```sh
FRESHCTX_PRODUCT=/absolute/path/to/freshctx FRESHCTX_APPROVED_USD=5 \
  node labs/pi-outcome-v1/run.mjs --live
```

Do not rerun `--live` to replace a finished pair. The first real-model artifact
is `live-1788612329848.json` on v1. The rate-constant rerun is
`live-1788614404231.json`. Numbers and the headline they support are in
[RESULTS.md](RESULTS.md).

This reads the existing DeepSeek API key from Pi's auth file without changing
it. Each arm allows at most eight post-resume requests, each <=64,000 serialized
UTF-8 bytes, with 512 output tokens. No retries or model catalog requests.
At the [documented peak prices](https://api-docs.deepseek.com/quick_start/pricing/)
of $0.44/M input and $1.32/M output, reserving 128,000 input tokens per request
bounds the pair's planned spend to $0.913. This conservative reserve is not
billed usage or a tokenizer proof; recheck pricing before a later run. Do not
infer cost savings from serialized request bytes. Raw provider usage is retained
in SSE responses when available.

A publishable result would be scoped as: "On one controlled saved-session task,
[model] passed X/1 with FreshCtx and Y/1 without, using A versus B post-resume
requests." It must say the history was seeded and the task is synthetic. It
cannot establish general success rates, Pass@1, SWE performance, or SOTA.

Before broadening the claim: run the approved real pair, inspect all traces,
then preregister more tasks with counterbalanced order and repetitions. Include
cross-file moves/renames, coding edits, and adverse outcomes. Do not change the frozen v1 task or silently replace failed runs. Do not
loosen gold answers.
