import assert from "node:assert/strict";
import test from "node:test";

import { applyHostCodec } from "../adapters/host-codec.mjs";
import {
  createHostCodecTestDouble,
  validateTestHostPairing,
} from "../adapters/host-codec-test-double.mjs";

function nativeRequest() {
  return {
    metadata: { requestId: "req-1" },
    messages: [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "read-1",
            type: "function",
            function: {
              name: "read",
              arguments: JSON.stringify({ path: "src/a.mjs" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "read-1",
        content: "export const value = 'old';\n",
      },
      { role: "user", content: "What is value?" },
    ],
  };
}

test("codec captures and transforms an ephemeral copy while preserving native pairing", async () => {
  const original = nativeRequest();
  const originalBytes = Buffer.from(JSON.stringify(original));
  const host = createHostCodecTestDouble();

  const result = await applyHostCodec(host.codec, original, {
    replacementByCallId: new Map([
      ["read-1", "export const value = 'current';\n"],
    ]),
  });

  assert.equal(result.applied, true);
  assert.notEqual(result.request, original);
  assert.deepEqual(host.captures, [original]);
  assert.equal(validateTestHostPairing(result.request), true);
  assert.equal(result.request.messages[1].tool_call_id, "read-1");
  assert.match(result.request.messages[1].content, /current/u);
  assert.deepEqual(Buffer.from(JSON.stringify(original)), originalBytes);
});

test("codec failure returns the original request byte-identically", async () => {
  for (const failAt of ["capture", "transform", "validate"]) {
    const original = nativeRequest();
    const originalBytes = Buffer.from(JSON.stringify(original));
    const host = createHostCodecTestDouble({ failAt });

    const result = await applyHostCodec(host.codec, original, {
      replacementByCallId: new Map([["read-1", "unreachable"]]),
    });

    assert.equal(result.applied, false, failAt);
    assert.equal(result.request, original, failAt);
    assert.deepEqual(Buffer.from(JSON.stringify(result.request)), originalBytes, failAt);
    assert.deepEqual(Buffer.from(JSON.stringify(original)), originalBytes, failAt);
  }
});

test("pair corruption fails open to the untouched original request", async () => {
  const original = nativeRequest();
  const originalBytes = Buffer.from(JSON.stringify(original));
  const host = createHostCodecTestDouble({ corruptPairing: true });

  const result = await applyHostCodec(host.codec, original, {
    replacementByCallId: new Map([["read-1", "current"]]),
  });

  assert.equal(result.applied, false);
  assert.equal(result.request, original);
  assert.deepEqual(Buffer.from(JSON.stringify(result.request)), originalBytes);
  assert.equal(validateTestHostPairing(result.request), true);
});
