import assert from "node:assert/strict";
import test from "node:test";

import { settleDaily } from "../src/settle.mjs";

test("settleDaily exposes MARKER_SETTLE", () => {
  assert.equal(settleDaily().marker, "ST0");
});
