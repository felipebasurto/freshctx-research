import { runPiHoldoutPack } from "./pi-holdout.mjs";
import { runHermesHoldoutPack } from "./hermes-holdout.mjs";
import { guardLegacyHoldoutEntrypoint, HOLDOUT_V01 } from "./legacy-holdout-guard.mjs";

guardLegacyHoldoutEntrypoint("ctxbench:adapters-holdout", { tracesDir: HOLDOUT_V01.tracesDir });

const piSummary = await runPiHoldoutPack();
console.log(JSON.stringify(piSummary, null, 2));

const hermesSummary = await runHermesHoldoutPack();
console.log(JSON.stringify(hermesSummary, null, 2));

if (piSummary.failures.length > 0 || hermesSummary.failures.length > 0) {
  process.exitCode = 1;
}
