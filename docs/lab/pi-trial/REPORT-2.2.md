# Pi trial 2.2

Label. live-host. This is not a paper result and not a ranking claim.

Working tree on top of `9741d00` (PCR 0079 stateless requests) plus PCR 0080 and 0081. Official Pi
on this Mac. Model DeepSeek V4 Pro. Same two-arm battery as
[REPORT-2.1.md](REPORT-2.1.md). The original viajante folder was not touched. I
did not raise the size cap. The code default is 32,768 characters.

Driver: `docs/lab/pi-trial/auto-rpc.mjs`. Without-arm completed first. With-arm
was rerun after marker-replace of Pi-native shell dumps. Capture:
`docs/lab/pi-trial/.work/capture/` (gitignored).

## Without FreshCtx, did Pi keep the old text?

Yes.

After `src/viajante/cli.py` on disk was already CL1, Pi said `CLI=CL0`.
After `README.md` on disk was already RD1, Pi said `README=RD0`.
After `notes/freshctx-todo.md` was already deleted, Pi said `TODO=TD0`.
Last turn: `README=RD0 CLI=CL0 MODELS=MD0 TODO=TD0 FLIGHTS=FL0`.

The intercepted request still had CL0, RD0, and TD0. It never had CL1 or RD1.
Request sizes: 133,383 after the first read, 137,781 on the last turn.

## With FreshCtx, did Pi say the new text?

Yes, for the files this battery edits.

CLI. Disk was CL1. Pi said `CLI=CL1`. The request contained CL1 and not CL0.
README. Disk was RD1. Pi said `README=RD1`. The request contained RD1.
Todo file. Disk was gone. Pi said `TODO=gone`.
Last turn: `README=RD1 CLI=CL1 MODELS=MD0 TODO=gone FLIGHTS=FL0`.

Cell 1 may still omit CLI on the first send. That is allowed. One mid-cell-1
request still contained CL0 (205,275 bytes) before the CLI flip. After the flip,
cell 2 CL0 count was 0.

## Did the FreshCtx request get smaller later?

No.

| cell | 2.1 with-arm | 2.2 with-arm |
|---|---|---|
| 2-cli | 163,726 | 266,986 |
| 3-readme | ~179,000 | 253,612 |
| 4-todo | ~167,000 | 221,613 |
| 5-inventory | 171,172 | 222,450 |

Cell 5 is not 20% below 171,172. Capture `021.json` (cell 5): no CL0 file body;
about 102 kB is a five-file `cat` / `python` dump that names more than one
tracked path (left undropped on purpose); about 87 kB is assistant
`reasoning_content`; single-path dumps of registry paths are markers. Cell 1
used 32 tools and 17 provider requests. 0079 also injects the 39 kB CLI file
once it changes on disk.

## Invented markers or "cannot see the file"?

It never invented RD2 or CL2. It never wrote the English phrase "no accessible
content".

## Did it use cat or bash?

Without FreshCtx, no. Only the normal read tool, five times.

With FreshCtx, yes, on the first turn. Official `read`, then `cat`, then
`python3 -c` / heredoc dumps. Single-path dumps of already-tracked files were
replaced with markers. A `cat` of all five files in one command kept its body.

## Adapter smokes and holdout bake-off

Label `synthetic`. Not a live-host claim.

| Command | Exit | Notes |
|---|---|---|
| `npm run ctxbench:pi-smoke` | 0 | 10 traces; stale 0; recall 1; `failures: []` |
| `npm run ctxbench:hermes-smoke` | 0 | 10 traces; stale 0; recall 1; `failures: []` |
| `npm run ctxbench:holdout-adapter-bakeoff` | 0 | `hermes-fresh` and `pi-fresh` matched region on stale/recall (10/10); native still stale on 5/10 (same families as PCR 0075) |

`AUTORESEARCH_SCORE=89.107165`. ctxbench payload sha256 unchanged
(`697e74e3…`). Door `f8771c93…`. Lock `79e29d09…`.

## Could not measure

Price, cache hits, and the vendor token bill. I have byte sizes of the
intercepted request body, not an invoice.

PCRs: [0080](../pcr/0080-refresh-over-budget.md),
[0081](../pcr/0081-stale-shell-dump.md).
