# PCR 0074 — live Pi confirm BLOCKED (not filed as live PCR)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0074-live-blocker-1d4f` (draft PR; **do not merge**)
- Base: `363a03c8a3a8cf76d6d79976e255d8967f931117` (PCR 0073 squash on main)
- Decision: **blocked** — live confirm did not run; **not** appended to `INDEX.md` or `METRICS.md`

## Intended measurement

Live confirm of PCR 0073 (Pi offset/limit Hermes-parity clamp) via official hook
`pi -e adapters/pi/extension.ts`, WITH FreshCtx vs WITHOUT (native), five boards on
the 4-line trailing-NL fixture (`lineCount=4`), DeepSeek turn-2 token-in-request
scoring. Same protocol family as PCR 0043 / Hermes 0053.

Synthetic replay coverage already exists in PCR 0073. This note records why live
did not execute on the Cloud Agent VM.

## Blockers (STOP)

| blocker | status | notes |
|---|---|---|
| DeepSeek credentials | **missing** | `OPENAI_API_KEY` and `DEEPSEEK_API_KEY` unset in VM; no `.env` in repo |
| `pi` on PATH at boot | **missing** | `which pi` → not found (remediable locally; see probe below) |
| Live turn-2 POST | **not run** | cannot score without API key |
| WITH vs WITHOUT table | **not run** | no live cells |

Per protocol: do **not** file a replay-only PCR labeled live. Replay remains PCR 0073.

## Probes performed (non-live)

| probe | result |
|---|---|
| FreshCtx base | `363a03c8a3a8cf76d6d79976e255d8967f931117` |
| Door `src/anchors.mjs` | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| Pi host checkout `bench/hosts/pi` | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` (matches PCR 0043 pin) |
| `@earendil-works/pi-coding-agent@0.84.2` local install | **ok** (`npm install --prefix .pcr-tools …`; version `0.84.2`) |
| Node engine warning | current Node v22.14.0; package wants `>=22.19.0` (warn only) |

Host pin is fetchable and Pi 0.84.2 is installable, but **DeepSeek credentials are
required** for the live confirm and were not available in this environment.

## Benchmarks run (baseline only; not live confirm)

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 215 pass / 0 fail / 17 skip |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| live `pi -e adapters/pi/extension.ts` × boards | **no** | — | blocked on credentials |

## Metric snapshot (unchanged; no live delta)

| metric | value |
|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` |
| Door blob | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| Live WITH vs WITHOUT table | **not measured** |

## What is needed to unblock

1. Isolated `HOME` research box (or Cloud Agent environment secret) with DeepSeek
   API access: `OPENAI_BASE_URL=https://api.deepseek.com/v1`, model `deepseek-chat`.
   Never commit the key.
2. Pi host pin `c49906ec` / `@earendil-works/pi-coding-agent` **0.84.2** on PATH
   (PCR 0043 lineage).
3. Run five boards × two modes; score turn-2 request JSON only.
4. If live succeeds, file a **new** PCR 0074 live note and append INDEX/METRICS after 0073.

## Comparison

- PCR 0073: synthetic Pi replay; adapter Hermes-parity clamp locked in tests.
- PCR 0043: last live Pi official-hook confirm (pre-0073 adapter fix).
- This note: blocker record only; **not** a live PCR.

## Limitations

- No product code changes in this branch.
- `.pcr-tools/` local Pi install is workspace-only; not committed.
- Thinker should run live confirm on a credentialed box before any INDEX append.
