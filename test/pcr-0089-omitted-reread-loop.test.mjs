import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall as buildHermesReadToolCall,
  buildToolResultMessage as buildHermesToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";
import {
  buildReadToolCall as buildPiReadToolCall,
  buildToolResultMessage as buildPiToolResultMessage,
  createPiAdapter,
  DEFAULT_BUDGET_CHARS,
  messageText as piMessageText,
} from "../adapters/pi/replay.mjs";

const PROBE_PATH = "src/viajante/cli.py";
const PAD = "x".repeat(39_000);
const OMITTED_BODY = `# MARKER_CLI=CL0\n${PAD}\n`;
const FIT_BODY = "print('PCR_0089_FITS_NOW')\n";

function toolResultFor(messages, callId) {
  return messages.find((message) =>
    (message.toolCallId ?? message.tool_call_id) === callId
    && (message.role === "tool" || message.role === "toolResult"),
  );
}

function piPersisted(callId, content) {
  return [
    buildPiReadToolCall({ toolCallId: callId, path: PROBE_PATH }),
    buildPiToolResultMessage({ toolCallId: callId, content }),
  ];
}

function piNativePersisted(callId, content) {
  return [
    {
      role: "assistant",
      content: [
        { type: "toolCall", id: callId, name: "read", arguments: { path: PROBE_PATH } },
      ],
    },
    {
      role: "toolResult",
      toolCallId: callId,
      toolName: "read",
      content: [{ type: "text", text: content }],
      isError: false,
    },
  ];
}

function hermesPersisted(callId, content) {
  return [
    buildHermesReadToolCall({ toolCallId: callId, path: PROBE_PATH }),
    buildHermesToolResultMessage({ toolCallId: callId, content }),
  ];
}

async function applyHermesProjection(adapter, persistedMessages, projectionText, ctx) {
  await adapter.onTurnComplete(
    [
      ...structuredClone(persistedMessages),
      { role: "assistant", content: "reply after projection" },
      { role: "user", content: projectionText },
    ],
    ctx,
  );
}

test("PCR 0089: Pi omitted-read reread loop keeps turn-1 omission honest and serves turn-2 fit", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0089-pi-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, PROBE_PATH), OMITTED_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const turn1CallId = "call-pi-0089-turn1";
    const turn2CallId = "call-pi-0089-turn2";
    const turn1Messages = [
      ...piPersisted(turn1CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: turn1CallId,
        input: { path: PROBE_PATH },
        content: OMITTED_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Messages) }, ctx);

    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);
    const turn1Result = toolResultFor(turn1.messages, turn1CallId);
    assert.ok(turn1Result);
    assert.match(piMessageText([turn1Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.match(piMessageText([turn1Result]), /omitted from the live projection for budget/u);
    assert.doesNotMatch(piMessageText([turn1Result]), /Current content is supplied in the live projection/u);

    await adapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(turn1.messages),
      },
    });

    await writeFile(join(workspace, PROBE_PATH), FIT_BODY, "utf8");
    const turn2Messages = [
      ...piPersisted(turn1CallId, OMITTED_BODY),
      ...piPersisted(turn2CallId, FIT_BODY),
      { role: "user", content: "quote the current cli body again" },
    ];

    await adapter.onTurnStart({ turnIndex: 2 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: turn2CallId,
        input: { path: PROBE_PATH },
        content: FIT_BODY,
        isError: false,
      },
      ctx,
    );
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Messages) }, ctx);

    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.equal(turn2.projection.selected.length, 1);
    assert.equal(turn2.projection.selected[0].path, PROBE_PATH);
    assert.equal(turn2.projection.selected[0].content, FIT_BODY);
    assert.equal(turn2.projection.text.split(FIT_BODY).length - 1, 1);
    assert.doesNotMatch(piMessageText(turn2.messages), /MARKER_CLI=CL0/u);

    const turn2Turn1Result = toolResultFor(turn2.messages, turn1CallId);
    assert.ok(turn2Turn1Result);
    assert.match(piMessageText([turn2Turn1Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.match(piMessageText([turn2Turn1Result]), /omitted from the live projection for budget/u);
    assert.doesNotMatch(piMessageText([turn2Turn1Result]), /Current content is supplied in the live projection/u);

    const turn2Turn2Result = toolResultFor(turn2.messages, turn2CallId);
    assert.ok(turn2Turn2Result);
    assert.match(piMessageText([turn2Turn2Result]), /Current content is supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0089: Hermes omitted-read reread loop keeps turn-1 omission honest and serves turn-2 fit", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0089-hermes-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, PROBE_PATH), OMITTED_BODY, "utf8");

    const stateFile = await createHermesStateFile("freshctx-pcr-0089-hermes-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: DEFAULT_BUDGET_CHARS,
    });
    const ctx = { cwd: workspace };
    const turn1CallId = "call-hermes-0089-turn1";
    const turn2CallId = "call-hermes-0089-turn2";
    const turn1Messages = [
      ...hermesPersisted(turn1CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Messages), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Messages), ctx);

    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);
    const turn1Result = toolResultFor(turn1.messages, turn1CallId);
    assert.ok(turn1Result);
    assert.match(hermesMessageText([turn1Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.match(hermesMessageText([turn1Result]), /omitted from the live projection for budget/u);
    assert.doesNotMatch(hermesMessageText([turn1Result]), /Current content is supplied in the live projection/u);

    await applyHermesProjection(adapter, turn1Messages, turn1.projectionText, ctx);
    const stateAfterTurn1Apply = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal("lastInjectedRevision" in stateAfterTurn1Apply, false);

    await writeFile(join(workspace, PROBE_PATH), FIT_BODY, "utf8");
    const turn2Messages = [
      ...hermesPersisted(turn1CallId, OMITTED_BODY),
      ...hermesPersisted(turn2CallId, FIT_BODY),
      { role: "user", content: "quote the current cli body again" },
    ];

    await adapter.onTurnComplete(structuredClone(turn2Messages), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Messages), ctx);

    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.equal(turn2.selected, 1);
    assert.equal(turn2.projectionText.split(FIT_BODY).length - 1, 1);
    assert.doesNotMatch(hermesMessageText(turn2.messages), /MARKER_CLI=CL0/u);

    const turn2Turn1Result = toolResultFor(turn2.messages, turn1CallId);
    assert.ok(turn2Turn1Result);
    assert.match(hermesMessageText([turn2Turn1Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.match(hermesMessageText([turn2Turn1Result]), /omitted from the live projection for budget/u);
    assert.doesNotMatch(hermesMessageText([turn2Turn1Result]), /Current content is supplied in the live projection/u);

    const turn2Turn2Result = toolResultFor(turn2.messages, turn2CallId);
    assert.ok(turn2Turn2Result);
    assert.match(hermesMessageText([turn2Turn2Result]), /Current content is supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0089: Pi discarded turn-1 omit does not authorize skip or stale replay on turn-2 reread", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0089-pi-discard-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, PROBE_PATH), OMITTED_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const turn1CallId = "call-pi-0089-discard-turn1";
    const turn2CallId = "call-pi-0089-discard-turn2";
    const turn1Messages = [
      ...piPersisted(turn1CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: turn1CallId,
        input: { path: PROBE_PATH },
        content: OMITTED_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Messages) }, ctx);
    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);
    assert.match(piMessageText(turn1.messages), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);

    await adapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(turn1Messages),
      },
    });

    await writeFile(join(workspace, PROBE_PATH), FIT_BODY, "utf8");
    const turn2Messages = [
      ...piPersisted(turn1CallId, OMITTED_BODY),
      ...piPersisted(turn2CallId, FIT_BODY),
      { role: "user", content: "quote the current cli body again" },
    ];

    await adapter.onTurnStart({ turnIndex: 2 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: turn2CallId,
        input: { path: PROBE_PATH },
        content: FIT_BODY,
        isError: false,
      },
      ctx,
    );
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Messages) }, ctx);

    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.equal(turn2.projection.selected.length, 1);
    assert.equal(turn2.projection.selected[0].content, FIT_BODY);
    assert.equal(turn2.projection.text.split(FIT_BODY).length - 1, 1);
    assert.doesNotMatch(piMessageText(turn2.messages), /MARKER_CLI=CL0/u);

    const turn2Turn1Result = toolResultFor(turn2.messages, turn1CallId);
    if (turn2Turn1Result) {
      assert.doesNotMatch(piMessageText([turn2Turn1Result]), /Current content is supplied in the live projection/u);
    }
    const turn2Turn2Result = toolResultFor(turn2.messages, turn2CallId);
    assert.ok(turn2Turn2Result);
    assert.match(piMessageText([turn2Turn2Result]), /Current content is supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0089: Hermes discarded turn-1 omit does not authorize skip or stale replay on turn-2 reread", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0089-hermes-discard-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, PROBE_PATH), OMITTED_BODY, "utf8");

    const stateFile = await createHermesStateFile("freshctx-pcr-0089-hermes-discard-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: DEFAULT_BUDGET_CHARS,
    });
    const ctx = { cwd: workspace };
    const turn1CallId = "call-hermes-0089-discard-turn1";
    const turn2CallId = "call-hermes-0089-discard-turn2";
    const turn1Messages = [
      ...hermesPersisted(turn1CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Messages), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Messages), ctx);
    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);
    assert.match(hermesMessageText(turn1.messages), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);

    await adapter.onTurnComplete(structuredClone(turn1Messages), ctx);
    const stateAfterDiscard = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal("appliedReadDispositionByCallId" in stateAfterDiscard, false);
    assert.equal("lastInjectedRevision" in stateAfterDiscard, false);

    await writeFile(join(workspace, PROBE_PATH), FIT_BODY, "utf8");
    const turn2Messages = [
      ...hermesPersisted(turn1CallId, OMITTED_BODY),
      ...hermesPersisted(turn2CallId, FIT_BODY),
      { role: "user", content: "quote the current cli body again" },
    ];

    await adapter.onTurnComplete(structuredClone(turn2Messages), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Messages), ctx);

    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.equal(turn2.selected, 1);
    assert.equal(turn2.projectionText.split(FIT_BODY).length - 1, 1);
    assert.doesNotMatch(hermesMessageText(turn2.messages), /MARKER_CLI=CL0/u);

    const turn2Turn1Result = toolResultFor(turn2.messages, turn1CallId);
    if (turn2Turn1Result) {
      assert.doesNotMatch(hermesMessageText([turn2Turn1Result]), /Current content is supplied in the live projection/u);
    }
    const turn2Turn2Result = toolResultFor(turn2.messages, turn2CallId);
    assert.ok(turn2Turn2Result);
    assert.match(hermesMessageText([turn2Turn2Result]), /Current content is supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0089: Pi native toolCall reread still over budget keeps both turns honest and does not retire tracking", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0089-pi-native-over-budget-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, PROBE_PATH), OMITTED_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const turn1CallId = "call-pi-0089-native-turn1";
    const turn2CallId = "call-pi-0089-native-turn2";
    const turn1Messages = [
      ...piNativePersisted(turn1CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: turn1CallId,
        input: { path: PROBE_PATH },
        content: OMITTED_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Messages) }, ctx);
    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);
    assert.equal(turn1.projection.selected.length, 0);
    assert.equal(
      turn1.projection.omitted.some((item) => item.unit.path === PROBE_PATH && item.reason === "budget"),
      true,
    );

    await adapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(turn1.messages),
      },
    });

    const turn2Messages = [
      ...piNativePersisted(turn1CallId, OMITTED_BODY),
      ...piNativePersisted(turn2CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body again" },
    ];

    await adapter.onTurnStart({ turnIndex: 2 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: turn2CallId,
        input: { path: PROBE_PATH },
        content: OMITTED_BODY,
        isError: false,
      },
      ctx,
    );
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Messages) }, ctx);

    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.equal(turn2.projection.selected.length, 0);
    assert.equal(
      turn2.projection.omitted.some((item) => item.unit.path === PROBE_PATH && item.reason === "budget"),
      true,
    );
    assert.doesNotMatch(piMessageText(turn2.messages), /MARKER_CLI=CL0/u);

    const turn2Turn1Result = toolResultFor(turn2.messages, turn1CallId);
    assert.ok(turn2Turn1Result);
    assert.match(piMessageText([turn2Turn1Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.doesNotMatch(piMessageText([turn2Turn1Result]), /Current content is supplied in the live projection/u);

    const turn2Turn2Result = toolResultFor(turn2.messages, turn2CallId);
    assert.ok(turn2Turn2Result);
    assert.match(piMessageText([turn2Turn2Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.doesNotMatch(piMessageText([turn2Turn2Result]), /Current content is supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0089: Hermes reread still over budget keeps both turns honest and does not retire tracking", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0089-hermes-over-budget-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, PROBE_PATH), OMITTED_BODY, "utf8");

    const stateFile = await createHermesStateFile("freshctx-pcr-0089-hermes-over-budget-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: DEFAULT_BUDGET_CHARS,
    });
    const ctx = { cwd: workspace };
    const turn1CallId = "call-hermes-0089-over-turn1";
    const turn2CallId = "call-hermes-0089-over-turn2";
    const turn1Messages = [
      ...hermesPersisted(turn1CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Messages), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Messages), ctx);
    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);
    assert.equal(turn1.selected, 0);
    assert.match(hermesMessageText(turn1.messages), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);

    await applyHermesProjection(adapter, turn1Messages, turn1.projectionText, ctx);

    const turn2Messages = [
      ...hermesPersisted(turn1CallId, OMITTED_BODY),
      ...hermesPersisted(turn2CallId, OMITTED_BODY),
      { role: "user", content: "quote the current cli body again" },
    ];

    await adapter.onTurnComplete(structuredClone(turn2Messages), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Messages), ctx);

    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.equal(turn2.selected, 0);
    assert.doesNotMatch(hermesMessageText(turn2.messages), /MARKER_CLI=CL0/u);

    const turn2Turn1Result = toolResultFor(turn2.messages, turn1CallId);
    assert.ok(turn2Turn1Result);
    assert.match(hermesMessageText([turn2Turn1Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.doesNotMatch(hermesMessageText([turn2Turn1Result]), /Current content is supplied in the live projection/u);

    const turn2Turn2Result = toolResultFor(turn2.messages, turn2CallId);
    assert.ok(turn2Turn2Result);
    assert.match(hermesMessageText([turn2Turn2Result]), /freshctx:omitted-read path=src\/viajante\/cli\.py/u);
    assert.doesNotMatch(hermesMessageText([turn2Turn2Result]), /Current content is supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
