# Cost ledger (prototype harness)

Accumulate `request_bytes`, tokens, and a cited DeepSeek v4 flash cost proxy
across a long session. Three arms: FreshCtx off, FreshCtx with Isolated Semantic
Engine off, FreshCtx with Tree-sitter Isolated Semantic Engine on.

This is a lab harness, not product `src/`. It does not claim a live host win.

```bash
node --test test/pcr-0137-cost-ledger.test.mjs
node docs/lab/cost-ledger/print-ledger.mjs
```

See `PLAN.md` and `BATTERY.md`. Never paste API keys. Official table stays
549/0/0/549.
