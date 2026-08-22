# FreshCtx live session evidence — 2026-08-22

Label: live-session on a synthetic workspace. Not a paper result. Not SOTA.

This pack records first live numbers from real DeepSeek calls after FreshCtx install on this box. The workspace under ws/ is disposable text only. No secrets were placed in those files.

Written: 2026-08-22 21:26 PT.

## Pins and install

- FreshCtx commit 4ccb008385e223c0e67eb95080d5398dc3f8cc5e (confirmed).
- Hermes host commit 999703fd43ab6d75c4a5c7bc8b610dd73ecece76 (confirmed).
- Pi host commit c49906ec77788625aacbdc53ebca6fbe65bd20f5 (confirmed, not used in the live cells).
- System Node was v20.19.2. FreshCtx asks for Node 22+.
- Plugin runtime was bun. No extra JS packages were installed.
- Hermes plugin symlink: hosts/hermes/plugins/context_engine/freshctx -> adapters/hermes
- Isolated venv at this evidence folder. User global Hermes config was not overwritten.
- Capture stub was not used. All model calls went to api.deepseek.com.

## DeepSeek reachability

Yes. A tiny chat completion returned HTTP 200. Requested model deepseek-chat. Response model name deepseek-v4-flash. Host api.deepseek.com. Latency 1179 ms. Reply text was PONG.

## How the cells were run

This is a scripted multi-turn driver, not a full Hermes CLI chat. Each cell builds a persisted conversation with a real read_file tool call and the old file bytes as the tool result. Files are then mutated on disk. hermes-fresh calls the installed FreshCtxContextEngine (observe + select_context + request-prune bridge). hermes-native calls Hermes ContextCompressor on the same messages. Then both send the resulting request to DeepSeek.

stale-bytes means an old unique token is still in the JSON request after a mutation that should have removed it. For A-append the old token is still on disk, so stale-bytes is only yes if the NEW token is missing.

## Cell table

| cell | mode | stale-bytes | current bytes present | current char count | request bytes | projection bytes | transform ms | model HTTP ms | full request ms | DeepSeek model | compress | mode detail | error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-append | hermes-fresh | no | yes | 21 | 1129 | 797 | 72.87 | 1762.27 | 1835.51 | deepseek-v4-flash | no | fresh-select | no |
| A-append | hermes-native | yes | no | 0 | 555 | 277 | 0.08 | 1548.28 | 1548.62 | deepseek-v4-flash | no | native-no-op | no |
| B-interior | hermes-fresh | yes | no | 0 | 806 | 397 | 71.22 | 2160.63 | 2232.16 | deepseek-v4-flash | no | fresh-select | no |
| B-interior | hermes-native | yes | no | 0 | 658 | 284 | 0.05 | 1758.09 | 1758.33 | deepseek-v4-flash | no | native-no-op | no |
| C-delete | hermes-fresh | no | yes | 0 | 712 | 397 | 65.81 | 1951.49 | 2017.54 | deepseek-v4-flash | no | fresh-select | no |
| C-delete | hermes-native | yes | yes | 0 | 540 | 262 | 0.05 | 1852.62 | 1852.89 | deepseek-v4-flash | no | native-no-op | no |
| D-two-files | hermes-fresh | no | yes | 33 | 1665 | 1101 | 71.18 | 1766.25 | 1837.68 | deepseek-v4-flash | no | fresh-select | no |
| D-two-files | hermes-native | yes | no | 18 | 803 | 307 | 0.06 | 1928.16 | 1928.43 | deepseek-v4-flash | no | native-no-op | no |
| E-large | hermes-fresh | no | yes | 18 | 9484 | 9034 | 69.41 | 1887.98 | 1957.64 | deepseek-v4-flash | no | fresh-select | no |
| E-large | hermes-native | yes | no | 0 | 8944 | 8547 | 0.07 | 1664.28 | 1664.56 | deepseek-v4-flash | no | native-no-op | no |
| E-large-pressure | hermes-native | yes | no | 0 | 8944 | 8547 | 0.12 | 1585.08 | 1585.45 | deepseek-v4-flash | yes | compress | no |
| G-edit-one-of-two | hermes-fresh | no | yes | 36 | 1690 | 1125 | 64.26 | 2091.34 | 2155.83 | deepseek-v4-flash | no | fresh-select | no |
| G-edit-one-of-two | hermes-native | yes | no | 18 | 827 | 330 | 0.07 | 1986.87 | 1987.13 | deepseek-v4-flash | no | native-no-op | no |
| B2-file-scope-interior | hermes-fresh | no | yes | 17 | 1104 | 769 | 64.7 | 1917.61 | 1982.66 | deepseek-v4-flash | no | fresh-select | no |
| B2-file-scope-interior | hermes-native | yes | no | 0 | 566 | 284 | 0.06 | 1718.95 | 1719.18 | deepseek-v4-flash | no | native-no-op | no |

## Findings

1. Native is stale; FreshCtx is fresh on file-scope edits. After A (append), D (edit one of two files), E (8.3k file marker replace), G (edit one of two), and B2 (file-scope interior replace), hermes-native still sent the old tool-result bytes and DeepSeek quoted the OLD tokens. hermes-fresh put the NEW disk bytes into a live projection and DeepSeek quoted those NEW tokens. That is the main contrast.

2. Region-scoped interior edit (cell B) failed to project the new line. FreshCtx rewrote the tool result to a marker, but BETA_NEW_INTERIOR never appeared in the request. DeepSeek said it could not see markers. The same mutation with a whole-file read (cell B2) was fresh. This is a live miss, not a native-only problem.

   **Later note (PCR 0041 / METHODS.md):** finding 2 is withdrawn as a product claim. The driver wrote literal backslash-n; `region_b.txt` is one line; `startLine=2` is not a valid region test.

3. Delete (cell C): FreshCtx dropped GAMMA_DELETE_MARKER from the request (empty projection). Native still sent the deleted file text, and DeepSeek quoted it as if the file existed. FreshCtx was correct on bytes, but the model only saw an empty projection and called it stale.

## Timing (measured, not invented)

hermes-fresh transform time was 64 to 73 ms on these tiny files (includes observe + Node bridge + project). hermes-native transform was about 0.05 to 0.12 ms because it did not compact. DeepSeek HTTP time was 1.5 to 2.2 seconds and dominates the full request. FreshCtx added tens of milliseconds, not seconds.

An 8.3k file did not trigger native compress at the default 128k window (should_compress false). The budget-pressure cell reported compress=true but finished in 0.12 ms and still contained the full old snippet, so that compress did not refresh bytes and did not look like a live summary call.

## Did the model see current bytes?

Yes, when FreshCtx projected them. On A, D, E, G, and B2, DeepSeek named the NEW tokens in its reply. On every native cell it named only the OLD tokens. On B-region and C-delete FreshCtx, the model did not quote current file text (region miss / empty delete envelope).

## Artifacts

- This report: docs/lab/live-2026-08-22/REPORT.md
- Cell timings: cells.json on the box at /workspace/freshctx-live-2026-08-22/artifacts/timings/cells.json (not all JSON copied into git)
- Synthetic leftover workspace: ws/
- Driver (box only; loads API key): /workspace/freshctx-live-2026-08-22/logs/run_live.py and extra_b2.py

## Blockers

- Full Hermes CLI oneshot was not used for the matrix. Controlled file mutations needed a scripted driver. The driver uses the real installed plugin class and the real DeepSeek API.
- Pi native/fresh live cells were not run.
- System Node 20 vs required 22 was handled with bun.

Note on C-delete: current-bytes-present is vacuously yes because no new token was required after delete. Native still has the old GAMMA token (stale-bytes yes). FreshCtx does not (stale-bytes no).

- Isolated Hermes config (not written to ~/.hermes): hermes-home/config.yaml
- DeepSeek ping: ping.json
- Command log: commands.txt
