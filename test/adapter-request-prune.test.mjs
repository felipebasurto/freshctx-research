import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createHermesStateFile,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";
import {
  dropUnservedReadToolPairs,
  latestReadCallIdsByObservation,
  unservedReadToolCallIds,
} from "../adapters/request-prune.mjs";
import {
  captureProviderRequest as capturePiRequest,
} from "../adapters/pi/replay.mjs";

const UNUSED_BODY = Array.from(
  { length: 320 },
  (_, line) => `// freshctx-unused-context-padding line ${line}\n`,
).join("");

test("dropUnservedReadToolPairs removes unserved read pairs but keeps served markers", () => {
  const readTools = new Set(["read_file"]);
  const messages = [
    buildReadToolCall({ toolCallId: "unused-1", path: "src/unused.go" }),
    buildToolResultMessage({ toolCallId: "unused-1", content: UNUSED_BODY }),
    buildReadToolCall({
      toolCallId: "gold-1",
      path: "sample.go",
      scope: "region",
      startLine: 1,
      endLine: 1,
      selector: "sig",
    }),
    buildToolResultMessage({
      toolCallId: "gold-1",
      content: "[freshctx:fc_gold path=sample.go] Current content is supplied in the live projection.",
    }),
  ];

  assert.deepEqual([...unservedReadToolCallIds(messages, readTools, new Set(["gold-1"]))], ["unused-1"]);
  const pruned = dropUnservedReadToolPairs(messages, {
    readTools,
    servedCallIds: new Set(["gold-1"]),
  });
  assert.equal(pruned.length, 2);
  assert.doesNotMatch(JSON.stringify(pruned), /unused-context-padding/u);
  assert.match(JSON.stringify(pruned), /freshctx:fc_gold/u);
});

test("latestReadCallIdsByObservation counts Pi-native toolCall content parts", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "read it" },
        { type: "toolCall", id: "native-1", name: "read", arguments: { path: "src/large.ts" } },
      ],
    },
    { role: "toolResult", toolCallId: "native-1", content: "OLD" },
    {
      role: "assistant",
      content: [
        { type: "toolCall", id: "native-2", name: "read", arguments: { path: "src/large.ts" } },
      ],
    },
    { role: "toolResult", toolCallId: "native-2", content: "NEW" },
  ];
  const observations = new Map([
    ["native-1", { path: "src/large.ts", scope: "file" }],
    ["native-2", { path: "src/large.ts", scope: "file" }],
  ]);

  assert.deepEqual(
    [...latestReadCallIdsByObservation(messages, observations, new Set(["read"]))],
    ["native-2"],
  );
});

test("Hermes adapter drops unserved read at normal path under 4k and keeps gold projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-prune-"));
  const gold = "func ParseFile() {}\n";
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "sample.go"), gold);
  await writeFile(join(workspace, "src/unused.go"), UNUSED_BODY);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({ toolCallId: "unused-1", path: "src/unused.go" }),
    buildToolResultMessage({ toolCallId: "unused-1", content: UNUSED_BODY }),
    buildReadToolCall({
      toolCallId: "gold-1",
      path: "sample.go",
      scope: "region",
      startLine: 1,
      endLine: 1,
      selector: "sig",
    }),
    buildToolResultMessage({ toolCallId: "gold-1", content: gold }),
    { role: "user", content: "refresh sample.go signature" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 4_000,
  });

  assert.doesNotMatch(capture.payloadText, /unused-context-padding line 0/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.ok(capture.telemetry.projectionBytes < 2000);
  assert.match(capture.payloadText, /freshctx:/u);
});

test("Hermes adapter drops unserved read at normal path at 12k and keeps gold projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-prune-12k-"));
  const gold = "func ParseFile() {}\n";
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "sample.go"), gold);
  await writeFile(join(workspace, "src/unused.go"), UNUSED_BODY);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({ toolCallId: "unused-1", path: "src/unused.go" }),
    buildToolResultMessage({ toolCallId: "unused-1", content: UNUSED_BODY }),
    buildReadToolCall({
      toolCallId: "gold-1",
      path: "sample.go",
      scope: "region",
      startLine: 1,
      endLine: 1,
      selector: "sig",
    }),
    buildToolResultMessage({ toolCallId: "gold-1", content: gold }),
    { role: "user", content: "refresh sample.go signature" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 12_000,
  });

  assert.doesNotMatch(capture.payloadText, /unused-context-padding line 0/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.match(capture.payloadText, /freshctx:/u);
});

test("Pi adapter drops unserved read at normal path under 4k and keeps gold projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-prune-"));
  const gold = "func ParseFile() {}\n";
  await mkdir(join(workspace, "cmd"), { recursive: true });
  await writeFile(join(workspace, "sample.go"), gold);
  await writeFile(join(workspace, "cmd/legacy.c"), UNUSED_BODY);

  const persisted = [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "unused-1",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: "cmd/legacy.c" }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "unused-1", content: UNUSED_BODY },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "gold-1",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({
              path: "sample.go",
              scope: "region",
              startLine: 1,
              endLine: 1,
              selector: "sig",
            }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "gold-1", content: gold },
    { role: "user", content: "refresh sample.go signature" },
  ];

  const capture = await capturePiRequest({
    cwd: workspace,
    persistedMessages: persisted,
    budgetChars: 4_000,
  });

  assert.doesNotMatch(capture.payloadText, /unused-context-padding line 0/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.ok(capture.telemetry.projectionBytes < 2000);
});

test("Pi adapter drops unserved read at normal path at 12k and keeps gold projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-prune-12k-"));
  const gold = "func KeepMe() {}\n";
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "sample.go"), gold);
  await writeFile(join(workspace, "src/unused.go"), UNUSED_BODY);

  const persisted = [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "unused-1",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: "src/unused.go" }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "unused-1", content: UNUSED_BODY },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "gold-1",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: "sample.go" }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "gold-1", content: gold },
    { role: "user", content: "keep gold at 12k" },
  ];

  const capture = await capturePiRequest({
    cwd: workspace,
    persistedMessages: persisted,
    budgetChars: 12_000,
  });

  assert.doesNotMatch(capture.payloadText, /unused-context-padding line 0/u);
  assert.match(capture.payloadText, /KeepMe/u);
});

test("Hermes adapter keeps omitted whole-file read pair truthful when a region on the same path is selected", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-prune-same-path-"));
  const stateFile = await createHermesStateFile();
  const largeBody = `${"export const marker = 'CL0';\n".repeat(2_000)}export const tail = 'TAIL_ONLY';\n`;
  const headBody = `${largeBody.split("\n").slice(0, 120).join("\n")}\n`;
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src/large.ts"), largeBody);

  const persisted = [
    buildReadToolCall({ toolCallId: "whole-1", path: "src/large.ts", toolName: "read_file" }),
    buildToolResultMessage({ toolCallId: "whole-1", content: largeBody }),
    buildReadToolCall({
      toolCallId: "head-1",
      path: "src/large.ts",
      toolName: "read_file",
      offset: 1,
      limit: 120,
    }),
    buildToolResultMessage({ toolCallId: "head-1", content: headBody }),
    { role: "user", content: "Keep the large head only." },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 32_768,
  });

  const wholeResult = capture.requestMessages.find(
    (message) => message?.role === "tool" && (message.tool_call_id ?? message.toolCallId) === "whole-1",
  );
  assert.ok(wholeResult);
  const wholeText = hermesMessageText([wholeResult]);
  assert.match(wholeText, /freshctx:omitted-read path=src\/large\.ts/u);
  assert.match(wholeText, /omitted from the live projection for budget/u);
  assert.doesNotMatch(wholeText, /Current content is supplied in the live projection/u);
  assert.match(capture.projectionText, /CL0/u);
  assert.equal(capture.payloadText.includes("TAIL_ONLY"), false);
});
