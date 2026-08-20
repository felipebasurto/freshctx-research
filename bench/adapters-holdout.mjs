import { runPiHoldoutPack } from "./pi-holdout.mjs";
import { runHermesHoldoutPack } from "./hermes-holdout.mjs";

const piSummary = await runPiHoldoutPack();
console.log(JSON.stringify(piSummary, null, 2));

const hermesSummary = await runHermesHoldoutPack();
console.log(JSON.stringify(hermesSummary, null, 2));

if (piSummary.failures.length > 0 || hermesSummary.failures.length > 0) {
  process.exitCode = 1;
}
