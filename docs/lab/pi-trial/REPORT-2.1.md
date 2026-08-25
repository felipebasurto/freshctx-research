# Pi trial 2.1

Label. live-host. This is not a paper result and not a ranking claim.

Commit `8875cd7`. Official Pi on this Mac. Model DeepSeek V4 Pro. Two disposable copies of viajante. The original viajante folder was not touched. I did not raise the size cap. The code default is about 32,000 characters. `README.md` is about 19 kB so it fits. `src/viajante/cli.py` is about 39 kB so it does not.

Two live Pi processes. FreshCtx ran first. Without FreshCtx was rerun after the first without reply summarized the files instead of listing RD0, CL0, MD0, FL0, TD0. The stale-text answers below come from the later no-tool turns, not from that summary.

## Without FreshCtx, did Pi keep the old text?

Yes.

After `src/viajante/cli.py` on disk was already CL1, Pi said `CLI=CL0`.
After `README.md` on disk was already RD1, Pi said `README=RD0`.
After `notes/freshctx-todo.md` was already deleted, Pi said `TODO=TD0`.

The intercepted request still had CL0, RD0, and TD0. It never had CL1 or RD1.

## With FreshCtx, did Pi say the new text?

Only for some files.

README. Yes. Disk was RD1. Pi said `README=RD1`. The request contained RD1.
CLI. No. Disk was CL1. Pi said `CLI=CL0`. The request still had CL0 and never had CL1. This run cannot separate "FreshCtx ignored the edit" from "the CLI file is larger than the default cap".
Todo file. Yes for existence. Disk was gone. Pi said `TODO=gone`. Old TD0 text was still present in earlier messages inside that same request.

## Did the FreshCtx request get smaller later?

No. It stayed large.

Without FreshCtx, about 130 kB after the first read and about 136 kB on the last turn.
With FreshCtx, about 160 kB after the CLI change, 179 kB after the README change, 167 kB on the last turn. The with-FreshCtx first turn also dumped a lot of terminal output into the conversation, so those later sizes are not FreshCtx alone.

## Invented markers or "cannot see the file"?

It never invented RD2 or CL2. It never wrote the English phrase "no accessible content".

With FreshCtx it did hedge in Spanish. After the README change it said flights content was not sent again this turn. On the last turn it said only README had been reconfirmed and the other values were the last known ones.

## Did it use cat or bash?

Without FreshCtx, no. Only the normal read tool, five times.

With FreshCtx, yes, on the first turn only, before any file was edited. It ran `cat` and `base64` on repo files. FreshCtx kept sending current README and the todo note. It did not keep `src/viajante/cli.py` current. This design never cats again after the edit, so it does not prove what a later `cat` would do.

## Could not measure

Price, cache hits, and the vendor token bill. I have byte sizes of the intercepted request body, not an invoice.

A tiny logger extension saved those outgoing requests. The without-FreshCtx run did not load FreshCtx. The with-FreshCtx run did.

Follow-up at the same default cap after PCR 0080/0081: [REPORT-2.2.md](REPORT-2.2.md).
