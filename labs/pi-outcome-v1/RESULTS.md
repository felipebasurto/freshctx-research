# Status

Checker false-fail on fenced numeric JSON is fixed. Five isolation tasks are
preregistered under `tasks/`. Gold 74 on the frozen v1 task is unchanged.
Scripted 4-vs-2 fixtures pass on all five tasks with zero LLM samples. No new
paid call has been recorded in this freeze. Live primary after this freeze:
`rate-constant-v1`.

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
