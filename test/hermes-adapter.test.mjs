import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createHermesAdapter,
  createHermesStateFile,
  messageText,
  toProviderPayload,
} from "../adapters/hermes/replay.mjs";
import { finalHermesCapture, runHermesTrace } from "../bench/hermes-trace-runner.mjs";
import { createCaptureProvider } from "../capture/provider.mjs";

test("Hermes adapter is request-only: persisted session stays unchanged", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-request-only-"));
  const stale = "export const value = 'stale';\n";
  const current = "export const value = 'current';\n";
  await writeFile(join(workspace, "source.ts"), current);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({ toolCallId: "call-1", path: "source.ts" }),
    buildToolResultMessage({ toolCallId: "call-1", content: stale }),
    { role: "user", content: "refresh source.ts" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.match(JSON.stringify(capture.persistedMessages), /stale/u);
  assert.doesNotMatch(JSON.stringify(capture.persistedMessages), /current/u);
  assert.equal(capture.persistedMessages.length, 3);
  assert.ok(capture.requestMessages.length > capture.persistedMessages.length);
  assert.doesNotMatch(capture.payloadText, /stale/u);
  assert.match(capture.payloadText, /export const value = 'current'/u);
  assert.equal(capture.payloadText.split("export const value = 'current'").length - 1, 1);
});

test("Hermes adapter fails open when select cannot refresh", async () => {
  const stateFile = await createHermesStateFile();
  const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });
  const original = [{ role: "user", content: "task only" }];
  const result = await adapter.onSelectContext(original, { cwd: "/tmp/missing-root" });
  assert.equal(result.applied, false);
  assert.deepEqual(result.messages, original);
});

test("fake capture provider records Hermes payload without a model", async () => {
  const provider = createCaptureProvider({ expectedRequests: 1 });
  await new Promise((resolvePromise) => provider.server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = provider.server.address();
  const payload = toProviderPayload([{ role: "user", content: "hello" }]);

  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].message.content, "FRESHCTX_CAPTURE_OK");
  assert.equal(provider.captures.length, 1);
  assert.equal(provider.captures[0].request.model, "freshctx-capture");
  await new Promise((resolvePromise) => provider.server.close(resolvePromise));
});

test("Hermes trace runner passes freshness gates on express interior-edit smoke trace", async () => {
  const trace = JSON.parse(
    await readFile(new URL("../bench/traces/smoke/express-interior-edit.json", import.meta.url), "utf8"),
  );
  const result = await runHermesTrace(trace);
  const capture = finalHermesCapture(result);
  assert.ok(capture);
  assert.equal(capture.metrics.staleBytes, 0);
  assert.equal(capture.metrics.duplicateUnits, 0);
  assert.equal(capture.metrics.requiredRecall, 1);
  assert.ok(capture.adapterApplied);
  assert.notEqual(messageText(capture.persistedMessages), capture.payloadText);
});

test("Hermes smoke pack runs all traces and compares against core board", async () => {
  const { runHermesSmokePack } = await import("../bench/hermes-smoke.mjs");
  const summary = await runHermesSmokePack({ strictGates: true });
  assert.equal(summary.traces, 10);
  assert.equal(summary.adapter, "hermes");
  assert.equal(summary.supported, true);
  assert.equal(summary.failures.length, 0);
});
