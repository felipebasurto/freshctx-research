import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertT1HostReadTools as assertHermesT1HostReadTools,
  readToolMatchesHostArgs as hermesReadToolMatchesHostArgs,
  t1HostReadToolsInvalidReason as hermesT1HostReadToolsInvalidReason,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  assertT1HostReadTools as assertPiT1HostReadTools,
  readToolMatchesHostArgs as piReadToolMatchesHostArgs,
  t1HostReadToolsInvalidReason as piT1HostReadToolsInvalidReason,
} from "../docs/lab/pi-trial-ts/auto-rpc-host-read.mjs";
import {
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
  isDestRootSettlementPath,
  isWorkFixtureSettlementPath,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checkoutWork = join(here, "../docs/lab/multi-turn-trial/.work/hermes/nothing");

/** Exact t1 tool from dest `freshctx-measure-8dc28af7-multiturn-retry` auto-rpc exit 1. */
const DEST_T1_READ = {
  toolCallId: "call_00_bW2pSnaR8pOElPzDgZpx1875",
  toolName: "read_file",
  args: {
    path: "/workspace/freshctx-measure-8dc28af7-multiturn-retry/docs/lab/multi-turn-trial/.work/hermes/nothing/src/settlement.ts",
    scope: "symbol",
    selector: "settleDailyLedger",
  },
};

test("dest-copy .work fixture path is not dest-root", () => {
  assert.equal(isWorkFixtureSettlementPath(DEST_T1_READ.args.path), true);
  assert.equal(isWorkFixtureSettlementPath(TARGET_FILE), false);
  assert.equal(
    isWorkFixtureSettlementPath(join("/workspace/freshctx-measure-8dc28af7-multiturn-retry", TARGET_FILE)),
    false,
  );
  assert.equal(
    isDestRootSettlementPath(DEST_T1_READ.args.path, { workspace: checkoutWork }),
    false,
    "dest-copy .work fixture must not be classified as dest-root",
  );
  assert.equal(isDestRootSettlementPath(TARGET_FILE, { workspace: checkoutWork }), true);
});

test("assertT1HostReadTools accepts dest-copy .work fixture when workspace is checkout .work", () => {
  assert.equal(hermesReadToolMatchesHostArgs(DEST_T1_READ, { workspace: checkoutWork }), true);
  assert.equal(hermesT1HostReadToolsInvalidReason([DEST_T1_READ], { workspace: checkoutWork }), null);
  assert.doesNotThrow(() => assertHermesT1HostReadTools([DEST_T1_READ], { arm: "nothing", workspace: checkoutWork }));

  const destWork = "/workspace/freshctx-measure-8dc28af7-multiturn-retry/docs/lab/multi-turn-trial/.work/hermes/nothing";
  assert.doesNotThrow(() => assertHermesT1HostReadTools([DEST_T1_READ], { arm: "nothing", workspace: destWork }));
});

test("dest-root settlement read still fails when workspace is .work", () => {
  const destRoot = "/workspace/freshctx-measure-8dc28af7-multiturn-retry";
  assert.equal(
    hermesReadToolMatchesHostArgs(
      { toolName: "read_file", args: { path: TARGET_FILE, scope: "symbol", selector: TARGET_SYMBOL } },
      { workspace: checkoutWork },
    ),
    false,
  );
  assert.equal(
    hermesReadToolMatchesHostArgs(
      { toolName: "read_file", args: { path: join(destRoot, TARGET_FILE), scope: "symbol", selector: TARGET_SYMBOL } },
      { workspace: checkoutWork },
    ),
    false,
  );
  assert.match(
    hermesT1HostReadToolsInvalidReason(
      [{ toolName: "read_file", args: { path: join(destRoot, TARGET_FILE), scope: "symbol", selector: TARGET_SYMBOL } }],
      { workspace: checkoutWork },
    ),
    /scope=symbol/u,
  );
});

test("dest-copy .work fixture with offset/limit still fails", () => {
  const offsetRead = {
    toolName: "read_file",
    args: { ...DEST_T1_READ.args, offset: 1, limit: 40 },
  };
  assert.equal(hermesReadToolMatchesHostArgs(offsetRead, { workspace: checkoutWork }), false);
  assert.match(hermesT1HostReadToolsInvalidReason([offsetRead], { workspace: checkoutWork }), /scope=symbol/u);
});

test("Pi matcher accepts dest-copy .work fixture read when workspace prefix differs", () => {
  const piRead = { toolName: "read", args: DEST_T1_READ.args };
  assert.equal(piReadToolMatchesHostArgs(piRead, { workspace: checkoutWork }), true);
  assert.equal(piT1HostReadToolsInvalidReason([piRead], { workspace: checkoutWork }), null);
  assert.doesNotThrow(() => assertPiT1HostReadTools([piRead], { arm: "nothing", workspace: checkoutWork }));
  assert.deepEqual(hostReadToolArgs({ workspace: checkoutWork }).selector, TARGET_SYMBOL);
});
