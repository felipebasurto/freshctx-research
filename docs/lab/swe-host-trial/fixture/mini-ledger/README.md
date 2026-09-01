# synthetic mini-ledger

Local fixture for the SWE-bench-like host-eval scaffold.
Not a SWE-bench dump. Not a public-repo performance claim.

Target symbol: `settleDaily` in `src/settle.mjs`.
Turn-1 host read uses `scope=symbol` with that selector.
`fail_to_pass` is `node --test test/settle.test.mjs` inside this fixture.
