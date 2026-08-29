# pi-trial-ts fixture

Synthetic TypeScript workspace for the Pi-only TypeScript measure pack.
Not a real app. Markers exist only for live-host measurement.

Target symbol: `settleDailyLedger` in `src/settlement.ts`.
Interior marker: `MARKER_SETTLE=ST0` flipped to `ST1` by `live.mjs mutate flip-settle`.
