export const VENDORED_GO_TOOLS_LABS = [
  "test/delete-unit-fail-close-lab.test.mjs",
  "test/delete-unit-lab.test.mjs",
  "test/duplicate-boundary-lab.test.mjs",
  "test/duplicate-boundary-markers-lab.test.mjs",
  "test/grow-inside-lab.test.mjs",
  "test/grow-shrink-exact-decoy-lab.test.mjs",
  "test/insert-before-interior-lab.test.mjs",
  "test/insert-before-lab.test.mjs",
  "test/insert-before-tie-lab.test.mjs",
  "test/insert-before-unique-last-lab.test.mjs",
  "test/move-cross-file-lab.test.mjs",
  "test/move-in-file-lab.test.mjs",
  "test/move-lookalike-lab.test.mjs",
  "test/parse-broken-lab.test.mjs",
  "test/rename-boundary-lab.test.mjs",
  "test/stored-start-leftover-fail-close-lab.test.mjs",
];

export const VENDORED_GO_TOOLS_ROOT = "test/fixtures/go-tools";

export const ENVIRONMENT_SKIP_GATES = [];

export const BARE_CLONE_SKIP_COUNT = 0;

export const LIVE_HERMES_COVERAGE = {
  removedIn: "b0f7282",
  replayRemains: [
    "test/budget-pressure-hermes-fresh.test.mjs",
    "test/native-holdout.test.mjs",
    "test/pcr-0097-hermes-continue-request-only.test.mjs",
    "test/pcr-0098-quoteable-first-new-projection.test.mjs",
    "test/pcr-0102-later-turn-quoteability-characterization.test.mjs",
  ],
  hostsFetch: "npm run hosts:fetch",
};
