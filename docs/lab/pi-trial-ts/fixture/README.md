# pi-trial-ts fixture

Synthetic TypeScript workspace for the Pi-only TypeScript measure pack.
Not a real app. Markers exist only for live-host measurement.

Target symbol: `settleDailyLedger` in `src/settlement.ts`.
Turn-1 host read uses `scope=symbol` with that selector.
Interior flip is scoped to `settleDailyLedger` only (`flipTargetInteriorMarker`).
Lookalike `computeDailyLedgerTotal` uses distinct marker `CT0`.
