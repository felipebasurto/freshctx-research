import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createPiAdapter,
  messageText,
} from "../adapters/pi/replay.mjs";

const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'T76_OLD';\n";
const NEW_BODY = "export const marker = 'T76_NEW';\n";

async function writeProbe(workspace, content) {
  await writeFile(join(workspace, PROBE_PATH), content, { encoding: "utf8" });
}

function turn1Messages(staleBody = OLD_BODY) {
  return [
    buildReadToolCall({ toolCallId: "call-t76", path: PROBE_PATH }),
    buildToolResultMessage({ toolCallId: "call-t76", content: staleBody }),
    { role: "user", content: "what is the marker?" },
  ];
}

test("PCR 0076: empty registry fail-open preserves original provider payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0076-empty-"));
  const original = [{ role: "user", content: "task only" }];

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const hookResult = await adapter.onContext({ messages: original }, { cwd: workspace });
  assert.equal(hookResult, undefined);

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: original,
    budgetChars: 8_000,
  });
  assert.equal(capture.adapterApplied, false);
  assert.deepEqual(capture.requestMessages, capture.persistedMessages);
  assert.equal(messageText(capture.requestMessages), "task only");
});

test("PCR 0076: context throw fail-open preserves original provider payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0076-throw-"));
  await writeProbe(workspace, OLD_BODY);

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const persisted = turn1Messages();

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-t76",
      input: { path: PROBE_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );
  assert.equal(adapter.engine.registry.list().length, 1);

  const originalProject = adapter.engine.project.bind(adapter.engine);
  adapter.engine.project = () => {
    throw new Error("simulated context failure");
  };

  const hookResult = await adapter.onContext({ messages: persisted }, ctx);
  assert.equal(hookResult, undefined);

  const requestMessages = hookResult?.messages ?? persisted;
  assert.deepEqual(requestMessages, persisted);
  assert.match(messageText(requestMessages), /T76_OLD/u);

  adapter.engine.project = originalProject;
});

test("PCR 0076: in-memory callToUnit map survives two turns in one process", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0076-map-"));
  await writeProbe(workspace, OLD_BODY);

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-t76",
      input: { path: PROBE_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );

  const unitIdTurn1 = adapter.callToUnit.get("call-t76");
  assert.ok(typeof unitIdTurn1 === "string");

  await adapter.onTurnStart({ turnIndex: 2 });
  assert.equal(adapter.callToUnit.get("call-t76"), unitIdTurn1);
  assert.equal(adapter.callToUnit.size, 1);
});

test("PCR 0076: two-turn interior edit without re-read serves current bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0076-t2-"));
  await writeProbe(workspace, OLD_BODY);

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const persisted = turn1Messages();

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-t76",
      input: { path: PROBE_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );

  const turn1 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
  assert.ok(turn1);
  assert.match(turn1.projection.text, /T76_OLD/u);
  assert.doesNotMatch(turn1.projection.text, /T76_NEW/u);

  await writeProbe(workspace, NEW_BODY);

  await adapter.onTurnStart({ turnIndex: 2 });
  const turn2 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
  assert.ok(turn2);
  assert.match(turn2.projection.text, /T76_NEW/u);
  assert.doesNotMatch(turn2.projection.text, /T76_OLD/u);

  const payloadText = messageText(turn2.messages);
  assert.doesNotMatch(payloadText, /T76_OLD/u);
  assert.match(payloadText, /T76_NEW/u);
  assert.equal(payloadText.split("T76_NEW").length - 1, 1);
});

test("PCR 0076: deleted file after read omits stale body from provider payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0076-delete-"));
  const filePath = join(workspace, PROBE_PATH);
  await writeProbe(workspace, OLD_BODY);

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const persisted = turn1Messages();

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-t76",
      input: { path: PROBE_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );

  await rm(filePath);

  const result = await adapter.onContext({ messages: persisted }, ctx);
  assert.ok(result);
  const payloadText = messageText(result.messages);
  assert.doesNotMatch(payloadText, /T76_OLD/u);
  assert.doesNotMatch(payloadText, /T76_NEW/u);
});
