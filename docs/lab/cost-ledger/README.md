# Cost ledger (prototype harness)

Accumulate `request_bytes`, tokens, and a cited DeepSeek v4 flash cost proxy
across a long session. Two arms: FreshCtx off (`nothing`) and FreshCtx
(`freshctx-ts`: Isolated Semantic Engine / Tree-sitter, the default).
FreshCtx without Tree-sitter does not exist.

PCR 0140 adds Pi and Hermes dump ingest for `nothing` vs `freshctx-ts`.
Two-turn measure-pack ingest is INVALID for a long-session cost claim.
CI reprints `fixture/long-session-ci.json` / `fixture/dumps/` (label
`fixture`, `liveHost: false`). Those rows are not a live host score.

This is a lab harness, not product `src/`. It does not claim a live host win.

```bash
node --test test/pcr-0137-cost-ledger.test.mjs test/pcr-0140-long-session-cost.test.mjs
node docs/lab/cost-ledger/print-ledger.mjs --fixture
```

See `PLAN.md` and `BATTERY.md`. Never paste API keys. Official table stays
549/0/0/549.
