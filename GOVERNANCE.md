# Governance

FreshCtx is evidence-led. Maintainers may merge implementation changes, but a
public performance claim requires review of the frozen benchmark, baseline
fidelity, corpus locks, raw results, and failure ledger by someone who did not
author the optimized policy.

Benchmark maintainers and optimization authors should be separate roles for a
release when possible. Changes to CtxBench metrics, gold generation, trace
splits, materiality thresholds, or the required paper corpus require a labeled
benchmark change and cannot be mixed with a candidate optimization.

Security reports follow `SECURITY.md`. Technical disagreements should be
resolved with a smaller falsifiable experiment or an explicit competing design
record. Negative results are retained.
