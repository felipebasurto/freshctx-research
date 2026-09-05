# Status

No FreshCtx turn-saving headline yet.

Isolation live N is now 5 frozen tasks (rate-constant-v1 plus the four
remaining). Across the four new pairs alone: withoutFreshCtx passed 4/4;
withFreshCtx passed 2/4. FreshCtx did not win pass rate or post-resume
request count on those four. On every without arm, first-request bytes were
still stale and the model passed after rereading. On every with arm,
first-request bytes were current. Two with arms hit the 8-request cap and
never submitted a checker-passing answer.

On frozen `rate-constant-v1`, DeepSeek-V4-Flash passed 1/1 with FreshCtx and
1/1 without. The without arm passed on the first submission in 2 post-resume
requests after rereading both files. Its first request still contained stale
`quantity * 13`. The with arm had current `quantity * 17` in the first
request and still needed a retry. It computed 80, then wrapped the JSON in
prose without fences, so the frozen checker rejected the first submission.
Retry returned `{"answer": 80}` at 5 post-resume requests.

The prior v1 pair remains 0/1 both arms and is not rewritten.

## Live pair on rate-constant-v1

Command, after the freeze commit and the $5 spend cap:

```sh
FRESHCTX_PRODUCT=/Users/felipe/Proyectos/freshctx/official FRESHCTX_APPROVED_USD=5 \
  node labs/pi-outcome-v1/run.mjs --live
```

Artifact: `labs/pi-outcome-v1/live-1788614404231.json`.
Product SHA `3e3c4489969fbe02b7313b666767651d1faf133c`.
Research SHA at measurement `7c2d0ebec4155f7bdc973a8ed5110cbbd5f852ac`.
Pi `0.85.0`. Node `v22.22.3`.
Requested and returned model id `deepseek-v4-flash`.
Provider `system_fingerprint` `a26a7955944dc5c60445bff77fac9c8e` on every chunk.
HTTP status 200 on all seven post-resume requests.
Harness errors: none.
Saved history retained the stale `quantity * 13` read on both arms.
Unread `return 29;` / `return 23;` bodies were absent from both first
measured requests.

| Arm | First submission | Within two submissions | Post-resume requests | Reads | Requests to pass | First-request code |
| --- | --- | --- | --- | --- | --- | --- |
| withoutFreshCtx | pass | pass | 2 | 2 | 2 | stale `quantity * 13`; no current `quantity * 17`; fee body unread |
| withFreshCtx | fail | pass | 5 | 6 | 5 | current `quantity * 17`; no stale `quantity * 13`; fee body unread |

withoutFreshCtx answer: computed `80` inside markdown fences. The fence-tolerant
checker accepted it. The model reread `price.js` and `fees.js` before
answering, so stale first-request bytes did not produce a stale answer.

withFreshCtx first answer: the same `80` as unfenced JSON after prose. The
frozen checker requires a JSON object or a fenced JSON object, so that
submission failed. The retry was exact `{"answer": 80}` and passed. After
rereads the model had current `fee` (`return 29;`) and current `total`
(`quantity * 17`).

Independently executed current answer is 80. Stale observed plus current
unread is 68. The checker never reveals those values in its feedback.
Scoring was not changed after seeing these live replies.

Provider usage from the last SSE `usage` object on each request:

| Arm | prompt_tokens | completion_tokens | cache_hit | cache_miss |
| --- | ---: | ---: | ---: | ---: |
| withoutFreshCtx | 2410 | 109 | 1152 | 1258 |
| withFreshCtx | 6489 | 262 | 3968 | 2521 |
| pair | 8899 | 371 | 5120 | 3779 |

Spend at the lab's documented peak prices of $0.44/M input and $1.32/M output,
ignoring cache discounts: **$0.004405**. With the runner's cache-read table of
$0.014/M hit and $0.44/M miss: $0.002224. Cap this run: $5. Remaining headroom:
about $4.995. Do not treat serialized request bytes as a cost claim.


## Live pairs on four remaining frozen tasks (2026-09-05)

Commands, each once, sequential, $5 spend cap, product read-only at
`3e3c4489969fbe02b7313b666767651d1faf133c`. Research at measurement
`b4f844d48540a649fc0da82415c23fb7eb0d1a29`. Pi `0.85.0`. Node `v22.22.3`.
Requested model `deepseek-v4-flash`. Scoring and gold were not changed after
seeing replies. Do not claim cost savings from bytes.

```sh
FRESHCTX_PRODUCT=/Users/felipe/Proyectos/freshctx/official FRESHCTX_APPROVED_USD=5 \
  node labs/pi-outcome-v1/run.mjs --live --task=labs/pi-outcome-v1/tasks/<task>.json
```

N for this batch: 4 tasks × 2 arms. Pass: withoutFreshCtx 4/4, withFreshCtx
2/4. FreshCtx did not win turns or pass on this batch. Aggregate peak spend
for the four pairs: **$0.022016**. Aggregate cache-table spend: **$0.009857**.
Cap headroom remains under $5 per command.

### moved-symbol-v1

Artifact: `labs/pi-outcome-v1/live-1788623217761.json`.
Gold 104. Stale-observed-plus-current-unread 80.
spendUsdPeak `$0.008442`. spendUsdCache `$0.003643`.

| Arm | First submission | Within two submissions | Post-resume requests | Reads | Requests to pass | First-request code |
| --- | --- | --- | --- | --- | --- | --- |
| withoutFreshCtx | pass | pass | 2 | 2 | 2 | stale `quantity * 11`; no current `quantity * 19`; unread body not exposed |
| withFreshCtx | fail | fail | 8 | 16 | null | current `quantity * 19`; no stale `quantity * 11`; unread body not exposed |

withoutFreshCtx answer: fenced `{"answer": 104}` after rereads.
withFreshCtx: all eight post-resume requests returned HTTP 200, then the
runner stopped with `Post-resume request cap reached` / submission error
`500 Harness request rejected` and an empty answer. No checker pass.

### operator-shift-v1

Artifact: `labs/pi-outcome-v1/live-1788623234679.json`.
Gold 89. Stale-observed-plus-current-unread 82.
spendUsdPeak `$0.004080`. spendUsdCache `$0.002117`.

| Arm | First submission | Within two submissions | Post-resume requests | Reads | Requests to pass | First-request code |
| --- | --- | --- | --- | --- | --- | --- |
| withoutFreshCtx | pass | pass | 2 | 2 | 2 | stale `quantity * 7`; no current `quantity + 25`; unread body not exposed |
| withFreshCtx | pass | pass | 4 | 6 | 4 | current `quantity + 25`; no stale `quantity * 7`; unread body not exposed |

Both arms returned fenced `{"answer": 89}` on the first submission.
withFreshCtx used more post-resume requests (4 vs 2).

### tax-base-v1

Artifact: `labs/pi-outcome-v1/live-1788623248484.json`.
Gold 125. Stale-observed-plus-current-unread 113.
spendUsdPeak `$0.007152`. spendUsdCache `$0.002735`.

| Arm | First submission | Within two submissions | Post-resume requests | Reads | Requests to pass | First-request code |
| --- | --- | --- | --- | --- | --- | --- |
| withoutFreshCtx | pass | pass | 2 | 2 | 2 | stale `quantity * 14`; no current `quantity * 18`; unread body not exposed |
| withFreshCtx | fail | fail | 8 | 16 | null | current `quantity * 18`; no stale `quantity * 14`; unread body not exposed |

withoutFreshCtx answer: fenced `{"answer": 125}` after rereads.
withFreshCtx: same 8-request cap failure pattern as moved-symbol-v1 (HTTP 200
on every request, empty answer, `Post-resume request cap reached`).

### quote-surcharge-v1

Artifact: `labs/pi-outcome-v1/live-1788623270229.json`.
Gold 100. Stale-observed-plus-current-unread 85.
spendUsdPeak `$0.002343`. spendUsdCache `$0.001361`.

| Arm | First submission | Within two submissions | Post-resume requests | Reads | Requests to pass | First-request code |
| --- | --- | --- | --- | --- | --- | --- |
| withoutFreshCtx | pass | pass | 2 | 2 | 2 | stale `quantity * 16`; no current `quantity * 21`; unread body not exposed |
| withFreshCtx | pass | pass | 2 | 2 | 2 | current `quantity * 21`; no stale `quantity * 16`; unread body not exposed |

withoutFreshCtx: fenced `{"answer": 100}`. withFreshCtx: exact
`{"answer":100}`. Same request count on both arms.

### Batch read on turns and pass

| Task | without pass / reqs | with pass / reqs | FreshCtx turn win? |
| --- | --- | --- | --- |
| moved-symbol-v1 | pass / 2 | fail / null (cap 8) | no |
| operator-shift-v1 | pass / 2 | pass / 4 | no |
| tax-base-v1 | pass / 2 | fail / null (cap 8) | no |
| quote-surcharge-v1 | pass / 2 | pass / 2 | tie on requests; no pass edge |

Across the full isolation set of five live pairs including rate-constant-v1:
withoutFreshCtx 5/5 pass; withFreshCtx 3/5 pass. Still no FreshCtx
turn-saving or pass-rate headline. Models continue to reread observed files
on the without arm, so stale first-request evidence did not force wrong
answers. Do not treat serialized request bytes as a cost claim.

## Freeze before this paid call

Checker false-fail on fenced numeric JSON was fixed first. Five isolation
tasks were preregistered under `tasks/`. Gold 74 on the frozen v1 task stayed
unchanged. Scripted 4-vs-2 fixtures passed on all five tasks with zero LLM
samples. That freeze is `7c2d0ebec4155f7bdc973a8ed5110cbbd5f852ac`.

## What still blocks N-scale

N is still 1 live pair on the isolation set. Arm order is still baseline-first.
The history is still seeded, not a natural coding session. The provider alias
is still mutable. Live models reread observed files, so stale first-request
bytes did not force a wrong answer. Unfenced JSON after prose still fails the
frozen checker. The other four frozen tasks, coding edits, and cross-file
moves were not run live. No cost-saving claim is supported.

## Prior live pair on 2026-09-05 (do not rewrite)

Direction chosen: one externally scored, controlled saved-session task through
the actual Pi Chat Completions HTTP path. The frozen pair has now run on
`deepseek-v4-flash`. **Both arms failed the external checker. There is no
success-rate or turn-saving headline.**

## Live pair

Command, after this run's $5 spend cap and the existing runner gate:

```sh
FRESHCTX_PRODUCT=/Users/felipe/Proyectos/freshctx/official FRESHCTX_APPROVED_USD=1 \
  node labs/pi-outcome-v1/run.mjs --live
```

Artifact: `labs/pi-outcome-v1/live-1788612329848.json`.
Product SHA `3e3c4489969fbe02b7313b666767651d1faf133c`.
Research SHA at measurement `ba367442c8188e9189783ead208393681b90d305`.
Pi `0.85.0`. Node `v22.22.3`.
Requested and returned model id `deepseek-v4-flash`.
Provider `system_fingerprint` `a26a7955944dc5c60445bff77fac9c8e` on every chunk.
HTTP status 200 on all eight post-resume requests.
Harness errors: none.
Saved history retained the stale `quantity * 10` read on both arms.
Unread `quantity + 11` / `quantity + 7` bodies were absent from both first
measured requests.

| Arm | First submission | Within two submissions | Post-resume requests | Reads | Requests to pass | First-request code |
| --- | --- | --- | --- | --- | --- | --- |
| withoutFreshCtx | fail | fail | 4 | 4 | null | stale `quantity * 10`; no current `quantity * 20`; fee body unread |
| withFreshCtx | fail | fail | 4 | 4 | null | current `quantity * 20`; no stale `quantity * 10`; fee body unread |

withoutFreshCtx answers (both attempts): computed `74` inside markdown fences, so
`JSON.parse` of the whole assistant text failed. After rereading both current
files it wrote `total(3) = 3 * 20 = 60`, `fee(3) = 3 + 11 = 14`, `60 + 14 = 74`.
The frozen checker requires the entire reply to be exact numeric JSON.

withFreshCtx answers (both attempts): `{"answer": 71}`. That is valid JSON and
the wrong number. `71` equals `3 * 20 + 11`, not `total(3) + fee(3) = 74`.
The first request already contained the current `total` symbol. After rereads
the live projection contained current `fee` (`quantity + 11`) and current
`total` (`quantity * 20`). The model still returned `71`.

Live projection units are concatenated without an extra separator. The first
with-FreshCtx live suffix was
`fees.js:region:12\n// Fee rulesprice.js:symbol:52\nfunction total(quantity) {\n  return quantity * 20;\n}`.
That is the compact envelope, not a missing current `total`. Native tool
results on that arm were FreshCtx markers, not file bodies.

Provider usage from the last SSE `usage` object on each request:

| Arm | prompt_tokens | completion_tokens | cache_hit | cache_miss |
| --- | ---: | ---: | ---: | ---: |
| withoutFreshCtx | 5300 | 230 | 3840 | 1460 |
| withFreshCtx | 4968 | 160 | 2304 | 2664 |
| pair | 10268 | 390 | 6144 | 4124 |

Spend at the lab's documented peak prices of $0.44/M input and $1.32/M output,
ignoring cache discounts: **$0.005033**. With the runner's cache-read table of
$0.014/M hit and $0.44/M miss: $0.002415. Cap this run: $5. Remaining headroom:
about $4.99. Do not treat serialized request bytes as a cost claim.

## Local evidence

All files below are scripted validation runs, not LLM samples.

| Artifact | Result |
| --- | --- |
| fixture-1788610076187.json | Empty reservation from sandbox loopback EPERM, before HTTP measurement. Preserved as an incomplete attempt. |
| fixture-1788610096839.json | Development fixture: baseline correction did not trigger because the fixture compared a structured user message to a string. Baseline failed; treatment passed. Invalid for regression expectations. |
| fixture-1788610131960.json | Fixed fixture message extraction: both pass; baseline 4 requests, treatment 2. |
| fixture-1788610224317.json | Final regression: both pass; baseline first submission rejected, treatment first submission accepted; 4 vs 2 requests and 2 vs 1 read calls. Initial evidence and saved history checks pass. |

The fixture's policy deliberately uses available code before rereading on
checker rejection. Its 4-vs-2 requests are not evidence of agent improvement.
The live model reread both files on both arms and erased that scripted gap.
The independently executed current answer is 74. The checker never reveals
that value in its feedback. Scoring was not changed after seeing the live
replies.

## Verification

- Product at `3e3c4489969fbe02b7313b666767651d1faf133c`: `npm run verify`
  passes, including 40 core tests, package allowlist, and 14 Pi tests with resume.
- `node --test labs/pi-outcome-v1/checker.test.mjs labs/pi-outcome-v1/live.test.mjs`:
  PASS. Expected current value remains 74. The recorded live answers still
  fail. Stale, header-guess, malformed, and stubbed answers fail.
- Scripted runner assertions: PASS on a 2026-09-05 re-run
  (`fixture-1788612307066.json`, untracked duplicate of the frozen 4-vs-2
  pattern; not committed).
- Live runner exit 0 with empty error lists. Checker scores on the live
  artifact: without 0/2, with 0/2.
- Frozen bench reports were not modified. Research PDF hash mismatch remains
  out of scope.

## Pins and delivery

Task/scorer freeze commit: `985b0617d797cbc55bb1f9b23f8484d4bd819965`.
Runner freeze commit: `f7cfc1ee389b56a0af9953f2cbb7944e5d51402b`.
Task SHA-256 `5bf9d4d9a748d16c2b77b72cfa2054bd8412404a4f5e900eabd02158878446ba`.
Checker SHA-256 `fd3b257f452dda346f448f582c88a99c0bb6230a1251d46e54ec3dccfa42a937`.
Runner SHA-256 `7001a2c406d83f0d37f69dc510a3c256125cb3da267a13631b3fdbf35d015208`.
This work stays on private branch `codex/pi-outcome-v1`. Product main was not
changed. The live JSON is the measurement; do not replace it.

## Honest prospective headline and blockers

Headline the numbers support: "On one seeded Pi resume task, DeepSeek-V4-Flash
passed 0/1 with FreshCtx and 0/1 without. FreshCtx put current `price.js`
bytes in the first request. That did not produce a checker pass, and both arms
used four post-resume requests."

What N would unlock next: a preregistered set of at least five tasks, with
counterbalanced arm order and frozen scoring before any call. Include at least
one coding edit, one cross-file move or rename, and one case where the without
arm's native stale bytes cause a wrong numeric JSON answer. Do not loosen this
checker's exact-JSON rule on this task after the fact.

Blog-scale claim still blocked by N=1, a synthetic seeded history, fixed
baseline-first order, a mutable provider alias, both arms failing, and no
coverage of edits the user would recognize as "I changed the file and the
agent finished." No cost-saving claim is supported.
