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
} from "../adapters/hermes/replay.mjs";
import {
  BUDGET_PRUNE_CHARS_THRESHOLD,
  dropUnservedReadToolPairs,
  shouldPruneAdapterRequest,
  unservedReadToolCallIds,
} from "../adapters/request-prune.mjs";
import {
  captureProviderRequest as capturePiRequest,
} from "../adapters/pi/replay.mjs";

const UNUSED_BODY = Array.from(
  { length: 120 },
  (_, line) => `// freshctx-unused-context-padding line ${line}\n`,
).join("");

test("shouldPruneAdapterRequest is true at budget-pressure threshold", () => {
  assert.equal(shouldPruneAdapterRequest(BUDGET_PRUNE_CHARS_THRESHOLD), true);
  assert.equal(shouldPruneAdapterRequest(BUDGET_PRUNE_CHARS_THRESHOLD + 1), false);
});

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
    budgetChars: BUDGET_PRUNE_CHARS_THRESHOLD,
  });

  assert.doesNotMatch(capture.payloadText, /unused-context-padding line 0/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.ok(capture.telemetry.projectionBytes < 2000);
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
    budgetChars: BUDGET_PRUNE_CHARS_THRESHOLD,
  });

  assert.doesNotMatch(capture.payloadText, /unused-context-padding line 0/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.ok(capture.telemetry.projectionBytes < 2000);
});

test("Pi adapter keeps unserved read transcript above budget threshold", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-no-prune-"));
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
    { role: "user", content: "keep unused transcript" },
  ];

  const capture = await capturePiRequest({
    cwd: workspace,
    persistedMessages: persisted,
    budgetChars: 12_000,
  });

  assert.match(capture.payloadText, /path=src\/unused\.go/u);
  assert.match(capture.payloadText, /KeepMe/u);
});
