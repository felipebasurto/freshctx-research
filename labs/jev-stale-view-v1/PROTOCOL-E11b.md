# E11b protocol — E11's small files with the whole-file relocation fix (written before any E11b model call)

Labelled follow-up to E11 (PROTOCOL-E11.md). E11's results are not modified.

## Question

In E11 every file of 190 lines or fewer was read whole, the FreshCtx bridge
marked that read `ambiguous` instead of refreshing it, and all 12 bridge runs
on those files failed. The product fix (`official` branch
`fix/whole-file-ambiguous`, commit `6e8fac8`: short region anchors pin to the
file edge) turns all 19 E11 whole-file relocations into `updated` offline.
Does it change the bridge's answers live?

## Items and procedure

The six E11 items whose bridge runs all failed: e11-03, -04, -08, -18, -21,
-22. Same runner (`e11_run.mjs`), same prompts, caps, model and arms, 2 reps.
The only changes: `FRESHCTX_PRODUCT` points at the `c15f5ad` export with
`src/relocate.mjs` replaced by the fixed file, and results go to
`results/e11b/` (runner option `--out`, added for this; default unchanged).

The investigation is live again, so conclusions are new and not the E11
ones; all four arms are run so the rerun has its own within-run baseline.

## Analysis (descriptive; 12 runs per arm is too few for a test)

First-submission and within-two accuracy per arm; whether the first bridge
request carries the `ambiguous` marker or the current file; answers given
without reading. Compared with E11's same six items: bridge arms 0/12 first
submission each, plain Pi 0/12.

Spend cap $1 in `results/e11b/.spent.json`. Estimated spend about $0.30.
