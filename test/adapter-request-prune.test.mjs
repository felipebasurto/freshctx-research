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
  dropStaleFillerToolPairs,
  fillerToolCallIds,
  isStaleFillerPath,
  shouldPruneAdapterRequest,
} from "../adapters/request-prune.mjs";
import { fillerBytes } from "../bench/budget-pressure-lab.mjs";
import {
  captureProviderRequest as capturePiRequest,
} from "../adapters/pi/replay.mjs";

test("isStaleFillerPath recognizes budget-pressure filler fixtures", () => {
  assert.equal(isStaleFillerPath("lab/filler/filler-001.dat"), true);
  assert.equal(isStaleFillerPath("parse.go"), false);
});

test("shouldPruneAdapterRequest is true at budget-pressure threshold", () => {
  assert.equal(shouldPruneAdapterRequest(BUDGET_PRUNE_CHARS_THRESHOLD), true);
  assert.equal(shouldPruneAdapterRequest(BUDGET_PRUNE_CHARS_THRESHOLD + 1), false);
});

test("dropStaleFillerToolPairs removes filler assistant/tool pairs but keeps gold markers", () => {
  const readTools = new Set(["read_file"]);
  const fillerBody = fillerBytes(1, 3);
  const messages = [
    buildReadToolCall({ toolCallId: "filler-1", path: "lab/filler/filler-001.dat" }),
    buildToolResultMessage({ toolCallId: "filler-1", content: fillerBody }),
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

  assert.equal(fillerToolCallIds(messages, readTools).size, 1);
  const pruned = dropStaleFillerToolPairs(messages, { readTools });
  assert.equal(pruned.length, 2);
  assert.doesNotMatch(JSON.stringify(pruned), /budget-pressure-filler/u);
  assert.match(JSON.stringify(pruned), /freshctx:fc_gold/u);
});

test("Hermes adapter drops filler bodies under 4k budget and keeps gold projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-prune-"));
  const gold = "func ParseFile() {}\n";
  await writeFile(join(workspace, "sample.go"), gold);
  const stateFile = await createHermesStateFile();
  const fillerBody = fillerBytes(2, 8);

  const persisted = [
    buildReadToolCall({ toolCallId: "filler-1", path: "lab/filler/filler-002.dat" }),
    buildToolResultMessage({ toolCallId: "filler-1", content: fillerBody }),
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

  assert.doesNotMatch(capture.payloadText, /budget-pressure-filler/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.ok(capture.telemetry.projectionBytes < 2000);
  assert.match(capture.payloadText, /freshctx:/u);
});

test("Pi adapter drops filler bodies under 4k budget and keeps gold projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-prune-"));
  const gold = "func ParseFile() {}\n";
  await writeFile(join(workspace, "sample.go"), gold);
  const fillerBody = fillerBytes(3, 8);

  const persisted = [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "filler-1",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: "lab/filler/filler-003.dat" }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "filler-1", content: fillerBody },
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

  assert.doesNotMatch(capture.payloadText, /budget-pressure-filler/u);
  assert.match(capture.payloadText, /ParseFile/u);
  assert.ok(capture.telemetry.projectionBytes < 2000);
});

test("Pi adapter does not prune filler pairs above budget threshold", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-no-prune-"));
  const gold = "func KeepMe() {}\n";
  const fillerBody = fillerBytes(4, 4);
  await writeFile(join(workspace, "sample.go"), gold);
  await mkdir(join(workspace, "lab/filler"), { recursive: true });
  await writeFile(join(workspace, "lab/filler/filler-004.dat"), fillerBody);

  const persisted = [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "filler-1",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: "lab/filler/filler-004.dat" }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "filler-1", content: fillerBody },
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
    { role: "user", content: "keep filler transcript" },
  ];

  const capture = await capturePiRequest({
    cwd: workspace,
    persistedMessages: persisted,
    budgetChars: 12_000,
  });

  assert.match(capture.payloadText, /budget-pressure-filler/u);
  assert.match(capture.payloadText, /KeepMe/u);
});
