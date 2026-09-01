/** CI fixture rows. Not a live host score. PCR 0137 unit-test provider pairs only. */

import { CELLS, MODEL } from "./pack.mjs";

/** Same pairs as `test/pcr-0137-cost-ledger.test.mjs` providerTurns nothing / freshctx-ts. */
export const FIXTURE_PROVIDER_PAIRS = {
  nothing: [
    [32000, 8000, 40],
    [33000, 8200, 40],
    [35000, 9000, 40],
    [36000, 9400, 40],
    [38000, 10000, 40],
    [40000, 11000, 40],
    [42000, 12000, 40],
    [45000, 13000, 40],
  ],
  "freshctx-ts": [
    [28000, 7000, 40],
    [27000, 6800, 40],
    [27500, 6900, 40],
    [27400, 6880, 40],
    [27300, 6860, 40],
    [27200, 6840, 40],
    [27100, 6820, 40],
    [27000, 6800, 40],
  ],
};

/** PCR 0135 Hermes two-turn live request_bytes. prompt_tokens were —. INVALID as long-session. */
export const TWO_TURN_0135_BYTES = {
  nothing: [83603, 32999],
  "freshctx-ts": [77372, 27826],
};

function turnsFromPairs(host, arm, pairs) {
  return pairs.map(([requestBytes, promptTokens, completionTokens], index) => ({
    arm,
    host,
    turn: index + 1,
    cellId: CELLS[index].id,
    requestBytes,
    promptTokens,
    completionTokens,
    model: MODEL,
    source: "fixture",
    usageFrom: "provider-response",
  }));
}

function twoTurnFromBytes(host, arm, bytes) {
  return bytes.map((requestBytes, index) => ({
    arm,
    host,
    turn: index + 1,
    cellId: index === 0 ? "t1-read" : "t2-settle",
    requestBytes,
    promptTokens: null,
    completionTokens: null,
    model: MODEL,
    source: "two-turn-ingest",
    usageFrom: "none",
  }));
}

function hostArmsFromPairs(host) {
  return {
    arms: {
      nothing: { turns: turnsFromPairs(host, "nothing", FIXTURE_PROVIDER_PAIRS.nothing) },
      "freshctx-ts": { turns: turnsFromPairs(host, "freshctx-ts", FIXTURE_PROVIDER_PAIRS["freshctx-ts"]) },
    },
  };
}

export function longSessionCiFixture() {
  return {
    label: "fixture",
    liveHost: false,
    sessionKind: "long-session",
    model: MODEL,
    note: "CI replay of PCR 0137 unit-test provider pairs as dump-shaped turns. Not a live host score. Do not cite as dollars saved.",
    hosts: {
      pi: hostArmsFromPairs("pi"),
      hermes: hostArmsFromPairs("hermes"),
    },
  };
}

export function twoTurnIngestFixture() {
  return {
    label: "two-turn-ingest",
    liveHost: false,
    sessionKind: "two-turn-ingest",
    model: MODEL,
    note: "PCR 0135 two-turn Hermes request_bytes. prompt_tokens were —. INVALID for long-session cost.",
    hosts: {
      pi: {
        arms: {
          nothing: { turns: twoTurnFromBytes("pi", "nothing", TWO_TURN_0135_BYTES.nothing) },
          "freshctx-ts": { turns: twoTurnFromBytes("pi", "freshctx-ts", TWO_TURN_0135_BYTES["freshctx-ts"]) },
        },
      },
      hermes: {
        arms: {
          nothing: { turns: twoTurnFromBytes("hermes", "nothing", TWO_TURN_0135_BYTES.nothing) },
          "freshctx-ts": { turns: twoTurnFromBytes("hermes", "freshctx-ts", TWO_TURN_0135_BYTES["freshctx-ts"]) },
        },
      },
    },
  };
}
