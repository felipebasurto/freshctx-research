import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defineHostCodec, applyHostCodec } from "../adapters/host-codec.mjs";
import {
  createPiAdapter,
  messageText,
  toProviderPayload,
} from "../adapters/pi/replay.mjs";
import { decodeProjectionUnits } from "../src/index.mjs";

const CALL_ID = "pi-read-c49906e";
const OBSERVED = "export const state = 'OBSERVATION_OLD';\n";
const CURRENT_ONE = "export const state = 'CURRENT_ONE';\n";
const CURRENT_TWO = "export const state = 'CURRENT_TWO';\n";
const BUDGET_CHARS = 8_000;

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

async function loadPiCodec() {
  return import("../adapters/pi/codec.mjs");
}

function piReadHistory(content = OBSERVED) {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: CALL_ID,
          name: "read",
          arguments: { path: "source.ts" },
        },
      ],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "capture-only",
      usage: structuredClone(USAGE),
      stopReason: "toolUse",
      timestamp: 1,
    },
    {
      role: "toolResult",
      toolCallId: CALL_ID,
      toolName: "read",
      content: [{ type: "text", text: content }],
      isError: false,
      timestamp: 2,
    },
    {
      role: "user",
      content: [{ type: "text", text: "Report the current state." }],
      timestamp: 3,
    },
  ];
}

function canonicalProviderBytes(messages) {
  return Buffer.from(JSON.stringify(toProviderPayload(messages)), "utf8");
}

function count(text, value) {
  return text.split(value).length - 1;
}

function projectionUnits(messages) {
  return decodeProjectionUnits(messageText(messages));
}

function nativePairSequence(messages) {
  const sequence = [];
  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === "toolCall") sequence.push(`call:${part.id}`);
      }
    }
    if (message?.role === "toolResult") {
      sequence.push(`result:${message.toolCallId}`);
    }
  }
  return sequence;
}

function withForcedFailure(codec, phase) {
  return defineHostCodec({
    name: codec.name,
    capabilities: codec.capabilities,
    capture: phase === "capture"
      ? () => {
          throw new Error("forced Pi capture failure");
        }
      : codec.capture,
    transform: phase === "transform"
      ? () => {
          throw new Error("forced Pi transform failure");
        }
      : codec.transform,
    validate: phase === "validate"
      ? () => {
          throw new Error("forced Pi validation failure");
        }
      : codec.validate,
    serialize: phase === "serialize"
      ? () => {
          throw new Error("forced Pi serialization failure");
        }
      : codec.serialize,
  });
}

test("Pi codec decodes pinned native read calls and publishes capabilities", async () => {
  const { createPiHostCodec, decodePiReadObservations } = await loadPiCodec();
  const lock = JSON.parse(
    await readFile(new URL("../bench/hosts.lock.json", import.meta.url), "utf8"),
  );
  const request = { messages: piReadHistory() };
  const observations = decodePiReadObservations(request, { turn: 7 });

  assert.deepEqual(observations, [
    {
      observationId: CALL_ID,
      toolCallId: CALL_ID,
      path: "source.ts",
      scope: "file",
      content: OBSERVED,
      turn: 7,
      input: { path: "source.ts" },
    },
  ]);

  const codec = createPiHostCodec();
  assert.deepEqual(codec.capabilities, {
    host: "pi",
    hostVersion: lock.hosts.pi.commit,
    adapter: "freshctx-pi-host-codec",
    adapterVersion: "0.1.0",
    canRewriteRequest: true,
  });
});

test("Pi codec preserves valid non-read native image results", async () => {
  const {
    decodePiReadObservations,
    validatePiNativeRequest,
  } = await loadPiCodec();
  const request = {
    messages: [
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "pi-image-call",
            name: "screenshot",
            arguments: {},
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "pi-image-call",
        toolName: "screenshot",
        content: [{ type: "image", data: "AA==", mimeType: "image/png" }],
        isError: false,
      },
    ],
  };

  assert.equal(validatePiNativeRequest(request), true);
  assert.deepEqual(decodePiReadObservations(request), []);
});

test("Pi validator rejects a tool result moved across a native message boundary", async () => {
  const { validatePiNativeRequest } = await loadPiCodec();
  const original = { messages: piReadHistory() };
  const reordered = {
    messages: [
      original.messages[0],
      original.messages[2],
      original.messages[1],
    ],
  };

  assert.equal(validatePiNativeRequest(reordered, original), false);
});

test("Pi validator does not authorize retirement of non-read native pairs", async () => {
  const { validatePiNativeRequest } = await loadPiCodec();
  const original = {
    messages: [
      {
        role: "assistant",
        content: [{
          type: "toolCall",
          id: "pi-write-call",
          name: "write",
          arguments: { path: "source.ts", content: "new" },
        }],
      },
      {
        role: "toolResult",
        toolCallId: "pi-write-call",
        toolName: "write",
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
    ],
  };

  assert.equal(validatePiNativeRequest({ messages: [] }, original), false);
});

test("Pi read observation turns follow assistant turns, not user-message count", async () => {
  const { decodePiReadObservations } = await loadPiCodec();
  const pair = (id, timestamp) => [
    {
      role: "assistant",
      content: [{
        type: "toolCall",
        id,
        name: "read",
        arguments: { path: `${id}.ts` },
      }],
      timestamp,
    },
    {
      role: "toolResult",
      toolCallId: id,
      toolName: "read",
      content: [{ type: "text", text: `// ${id}\n` }],
      isError: false,
      timestamp: timestamp + 1,
    },
  ];
  const request = {
    messages: [
      { role: "user", content: "inspect both", timestamp: 1 },
      ...pair("first", 2),
      ...pair("second", 4),
      { role: "user", content: "continue", timestamp: 6 },
    ],
  };

  assert.deepEqual(
    decodePiReadObservations(request).map(({ toolCallId, turn }) => ({ toolCallId, turn })),
    [
      { toolCallId: "first", turn: 0 },
      { toolCallId: "second", turn: 1 },
    ],
  );
});

test("Pi codec matches the existing adapter path byte-for-byte on one semantic trace", async () => {
  const {
    createPiHostCodec,
    validatePiNativeRequest,
  } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-parity-"));
  try {
    await writeFile(join(workspace, "source.ts"), OBSERVED);
    const persistedMessages = piReadHistory();
    const originalRequest = { messages: persistedMessages };
    const persistedBytes = Buffer.from(JSON.stringify(originalRequest), "utf8");

    const oldAdapter = createPiAdapter({ budgetChars: BUDGET_CHARS });
    await oldAdapter.onTurnStart({ turnIndex: 1 });
    await oldAdapter.onToolResult(
      {
        toolName: "read",
        toolCallId: CALL_ID,
        input: { path: "source.ts" },
        content: [{ type: "text", text: OBSERVED }],
        isError: false,
      },
      { cwd: workspace },
    );

    await writeFile(join(workspace, "source.ts"), CURRENT_ONE);
    const oldPath = await oldAdapter.onContext(
      { messages: structuredClone(persistedMessages), budgetChars: BUDGET_CHARS },
      { cwd: workspace },
    );
    assert.ok(oldPath);

    const codecPath = await applyHostCodec(createPiHostCodec(), originalRequest, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    assert.equal(codecPath.applied, true);
    assert.notEqual(codecPath.request, originalRequest);
    assert.deepEqual(
      projectionUnits(codecPath.request.messages).map(
        ({ id, path, revision, content }) => ({ id, path, revision, content }),
      ),
      oldPath.projection.selected.map(
        ({ id, path, revision, content }) => ({ id, path, revision, content }),
      ),
    );
    assert.deepEqual(
      canonicalProviderBytes(codecPath.request.messages),
      canonicalProviderBytes(oldPath.messages),
    );

    const codecText = messageText(codecPath.request.messages);
    assert.equal(count(codecText, OBSERVED), 0);
    assert.equal(count(codecText, CURRENT_ONE), 1);
    assert.equal(validatePiNativeRequest(codecPath.request, originalRequest), true);
    assert.deepEqual(
      nativePairSequence(codecPath.request.messages),
      nativePairSequence(persistedMessages),
    );
    assert.deepEqual(Buffer.from(JSON.stringify(originalRequest), "utf8"), persistedBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec fails open without retiring a mixed refused read pair", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-refused-"));
  try {
    await writeFile(join(workspace, "source.ts"), CURRENT_ONE);
    const safePair = piReadHistory().slice(0, 2);
    const refusedPair = [
      {
        role: "assistant",
        content: [{
          type: "toolCall",
          id: "pi-read-outside",
          name: "read",
          arguments: { path: "/etc/hosts" },
        }],
      },
      {
        role: "toolResult",
        toolCallId: "pi-read-outside",
        toolName: "read",
        content: [{ type: "text", text: "outside observation" }],
        isError: false,
      },
    ];
    const original = {
      messages: [
        ...safePair,
        ...refusedPair,
        { role: "user", content: "compare reads" },
      ],
    };
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");

    const result = await applyHostCodec(createPiHostCodec(), original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 2,
    });

    assert.equal(result.applied, false);
    assert.equal(result.request, original);
    assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec fails open on a truncated whole-file observation", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-truncated-"));
  try {
    const current = `${CURRENT_ONE}${"x".repeat(64_000)}\n`;
    await writeFile(join(workspace, "source.ts"), current);
    const messages = piReadHistory("truncated prefix\n");
    messages[1].details = {
      truncation: {
        truncated: true,
        truncatedBy: "bytes",
        outputLines: 1,
        totalLines: 2,
      },
    };
    const original = { messages };
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");

    const result = await applyHostCodec(createPiHostCodec(), original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    assert.equal(result.applied, false);
    assert.equal(result.request, original);
    assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec promotes reconstructable offset-one EOF reads exactly like the existing path", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-eof-"));
  try {
    const content = "line one\nline two\n";
    await writeFile(join(workspace, "source.ts"), content);
    const messages = piReadHistory(content);
    messages[0].content[0].arguments = {
      path: "source.ts",
      offset: 1,
      limit: 10,
    };
    const original = { messages };
    const oldAdapter = createPiAdapter({ budgetChars: BUDGET_CHARS });
    await oldAdapter.onTurnStart({ turnIndex: 1 });
    await oldAdapter.onToolResult(
      {
        toolName: "read",
        toolCallId: CALL_ID,
        input: { path: "source.ts", offset: 1, limit: 10 },
        content: [{ type: "text", text: content }],
        isError: false,
      },
      { cwd: workspace },
    );

    const oldPath = await oldAdapter.onContext(
      { messages: structuredClone(messages), budgetChars: BUDGET_CHARS },
      { cwd: workspace },
    );
    const codecPath = await applyHostCodec(createPiHostCodec(), original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    assert.ok(oldPath);
    assert.equal(codecPath.applied, true);
    assert.deepEqual(
      canonicalProviderBytes(codecPath.request.messages),
      canonicalProviderBytes(oldPath.messages),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec matches existing-path retirement of a superseded same-path read", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-reread-"));
  const firstCallId = "pi-read-first";
  const secondCallId = "pi-read-second";
  const firstObserved = "export const state = 'FIRST_OBSERVATION';\n";
  const secondObserved = "export const state = 'SECOND_OBSERVATION';\n";
  const readPair = (toolCallId, content, timestamp) => [
    {
      role: "assistant",
      content: [{
        type: "toolCall",
        id: toolCallId,
        name: "read",
        arguments: { path: "source.ts" },
      }],
      timestamp,
    },
    {
      role: "toolResult",
      toolCallId,
      toolName: "read",
      content: [{ type: "text", text: content }],
      isError: false,
      timestamp: timestamp + 1,
    },
  ];

  try {
    const oldAdapter = createPiAdapter({ budgetChars: BUDGET_CHARS });
    await oldAdapter.onTurnStart({ turnIndex: 1 });
    await writeFile(join(workspace, "source.ts"), firstObserved);
    await oldAdapter.onToolResult(
      {
        toolName: "read",
        toolCallId: firstCallId,
        input: { path: "source.ts" },
        content: [{ type: "text", text: firstObserved }],
        isError: false,
      },
      { cwd: workspace },
    );
    await writeFile(join(workspace, "source.ts"), secondObserved);
    await oldAdapter.onToolResult(
      {
        toolName: "read",
        toolCallId: secondCallId,
        input: { path: "source.ts" },
        content: [{ type: "text", text: secondObserved }],
        isError: false,
      },
      { cwd: workspace },
    );

    const persistedMessages = [
      ...readPair(firstCallId, firstObserved, 1),
      ...readPair(secondCallId, secondObserved, 3),
      { role: "user", content: "Use the latest source.", timestamp: 5 },
    ];
    const original = { messages: persistedMessages };
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");
    await writeFile(join(workspace, "source.ts"), CURRENT_ONE);

    const oldPath = await oldAdapter.onContext(
      { messages: structuredClone(persistedMessages), budgetChars: BUDGET_CHARS },
      { cwd: workspace },
    );
    const codecPath = await applyHostCodec(createPiHostCodec(), original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    assert.ok(oldPath);
    assert.equal(codecPath.applied, true);
    assert.deepEqual(
      canonicalProviderBytes(codecPath.request.messages),
      canonicalProviderBytes(oldPath.messages),
    );
    assert.equal(count(messageText(codecPath.request.messages), firstObserved), 0);
    assert.equal(count(messageText(codecPath.request.messages), secondObserved), 0);
    assert.equal(count(messageText(codecPath.request.messages), CURRENT_ONE), 1);
    assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec reconstructs a deleted observation and matches fail-closed old-path bytes", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-delete-"));
  try {
    const filePath = join(workspace, "source.ts");
    await writeFile(filePath, OBSERVED);
    const persistedMessages = piReadHistory();
    const original = { messages: persistedMessages };
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");
    const oldAdapter = createPiAdapter({ budgetChars: BUDGET_CHARS });
    await oldAdapter.onTurnStart({ turnIndex: 1 });
    await oldAdapter.onToolResult(
      {
        toolName: "read",
        toolCallId: CALL_ID,
        input: { path: "source.ts" },
        content: [{ type: "text", text: OBSERVED }],
        isError: false,
      },
      { cwd: workspace },
    );
    await rm(filePath);

    const oldPath = await oldAdapter.onContext(
      { messages: structuredClone(persistedMessages), budgetChars: BUDGET_CHARS },
      { cwd: workspace },
    );
    const codecPath = await applyHostCodec(createPiHostCodec(), original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    assert.ok(oldPath);
    assert.equal(codecPath.applied, true);
    assert.deepEqual(
      canonicalProviderBytes(codecPath.request.messages),
      canonicalProviderBytes(oldPath.messages),
    );
    assert.equal(count(messageText(codecPath.request.messages), OBSERVED), 0);
    assert.deepEqual(projectionUnits(codecPath.request.messages), []);
    assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec failures return the exact original request object unchanged", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-failure-"));
  try {
    await writeFile(join(workspace, "source.ts"), CURRENT_ONE);
    for (const phase of ["capture", "transform", "validate", "serialize"]) {
      const original = { messages: piReadHistory() };
      const originalBytes = Buffer.from(JSON.stringify(original), "utf8");
      const result = await applyHostCodec(
        withForcedFailure(createPiHostCodec(), phase),
        original,
        { cwd: workspace, budgetChars: BUDGET_CHARS, turnIndex: 1 },
      );

      assert.equal(result.applied, false, phase);
      assert.equal(result.request, original, phase);
      const errorPhase = {
        capture: "capture",
        transform: "transform",
        validate: "validation",
        serialize: "serialization",
      }[phase];
      assert.match(result.error, new RegExp(errorPhase, "u"), phase);
      assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes, phase);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Pi codec rejects native pair corruption and fails open", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const codec = createPiHostCodec();
  const corruptingCodec = defineHostCodec({
    name: codec.name,
    capabilities: codec.capabilities,
    capture: codec.capture,
    transform: async (request, args) => {
      const transformed = await codec.transform(request, args);
      transformed.messages[1].toolCallId = "corrupted-id";
      return transformed;
    },
    validate: codec.validate,
    serialize: codec.serialize,
  });
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-pair-"));
  try {
    await writeFile(join(workspace, "source.ts"), CURRENT_ONE);
    const original = { messages: piReadHistory() };
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");
    const result = await applyHostCodec(corruptingCodec, original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    assert.equal(result.applied, false);
    assert.equal(result.request, original);
    assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("each Pi codec transformation starts from observation-time history", async () => {
  const { createPiHostCodec } = await loadPiCodec();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-codec-ephemeral-"));
  try {
    const original = { messages: piReadHistory() };
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");
    const codec = createPiHostCodec();

    await writeFile(join(workspace, "source.ts"), CURRENT_ONE);
    const first = await applyHostCodec(codec, original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 1,
    });

    await writeFile(join(workspace, "source.ts"), CURRENT_TWO);
    const second = await applyHostCodec(codec, original, {
      cwd: workspace,
      budgetChars: BUDGET_CHARS,
      turnIndex: 2,
    });

    assert.equal(first.applied, true);
    assert.equal(second.applied, true);
    assert.equal(first.captured.observations[0].content, OBSERVED);
    assert.equal(second.captured.observations[0].content, OBSERVED);
    assert.match(messageText(first.request.messages), /CURRENT_ONE/u);
    assert.doesNotMatch(messageText(first.request.messages), /CURRENT_TWO/u);
    assert.match(messageText(second.request.messages), /CURRENT_TWO/u);
    assert.doesNotMatch(messageText(second.request.messages), /CURRENT_ONE/u);
    assert.deepEqual(Buffer.from(JSON.stringify(original), "utf8"), originalBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
