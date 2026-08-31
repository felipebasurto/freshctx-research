import assert from "node:assert/strict";
import test from "node:test";

import { applyHostCodec, defineHostCodec } from "../adapters/host-codec.mjs";
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
  assert.equal(result.request.messages[0].tool_calls[0].id, "read-1");
  assert.equal(result.request.messages[0].tool_calls[0].function.name, "read");
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
    assert.equal(result.captured, null, failAt);
    assert.match(
      result.error,
      new RegExp(failAt === "validate" ? "validation" : failAt, "u"),
      failAt,
    );
    assert.deepEqual(Buffer.from(JSON.stringify(result.request)), originalBytes, failAt);
    assert.deepEqual(Buffer.from(JSON.stringify(original)), originalBytes, failAt);
  }
});

test("pair corruption fails open to the untouched original request", async () => {
  for (const corruptPairing of ["drop-result", "drop-all"]) {
    const original = nativeRequest();
    const originalBytes = Buffer.from(JSON.stringify(original));
    const host = createHostCodecTestDouble({ corruptPairing });

    const result = await applyHostCodec(host.codec, original, {
      replacementByCallId: new Map([["read-1", "current"]]),
    });

    assert.equal(result.applied, false, corruptPairing);
    assert.equal(result.request, original, corruptPairing);
    assert.deepEqual(Buffer.from(JSON.stringify(result.request)), originalBytes, corruptPairing);
    assert.equal(validateTestHostPairing(result.request), true, corruptPairing);
  }
});

test("codec callbacks cannot mutate the original request", async () => {
  const original = nativeRequest();
  const originalBytes = Buffer.from(JSON.stringify(original));
  const codec = defineHostCodec({
    name: "mutating-serializer-probe",
    serialize: (request) => {
      request.metadata.requestId = "mutated-copy";
      return JSON.stringify(request);
    },
    capture: () => {
      throw new Error("capture stops the probe");
    },
    transform: () => {
      throw new Error("unreachable transform");
    },
    validate: () => false,
  });

  const result = await applyHostCodec(codec, original);

  assert.equal(result.applied, false);
  assert.equal(result.request, original);
  assert.deepEqual(Buffer.from(JSON.stringify(original)), originalBytes);
});
