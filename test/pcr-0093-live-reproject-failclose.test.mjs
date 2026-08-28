import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  createPiAdapter,
  messageText as piMessageText,
} from "../adapters/pi/replay.mjs";

const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'PCR_0093_OLD_TOOL_RESULT';\n".repeat(8);
const NEW_BODY = "export const marker = 'PCR_0093_NEW_ON_DISK';\n".repeat(8);
const NEWER_BODY = "export const marker = 'PCR_0093_NEWER_ON_DISK';\n".repeat(8);

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function piPersistedMessages() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-pi-0093",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: PROBE_PATH }),
          },
        },
      ],
    },
    {
      role: "tool",
      toolCallId: "call-pi-0093",
      content: OLD_BODY,
    },
    {
      role: "user",
      content: "quote the current marker",
    },
  ];
}

function hermesPersistedMessages() {
  return [
    buildHermesReadToolCall({
      toolCallId: "call-hermes-0093",
      path: PROBE_PATH,
    }),
    buildHermesToolResultMessage({
      toolCallId: "call-hermes-0093",
      content: OLD_BODY,
    }),
    {
      role: "user",
      content: "quote the current marker",
    },
  ];
}

test("PCR 0093: Pi later request-only re-project collapses unchanged NEW to an already-served marker", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0093-pi-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = piPersistedMessages();

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0093",
        input: { path: PROBE_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Persisted) }, ctx);
    assert.ok(turn1);
    assert.equal(countOccurrences(piMessageText(turn1.messages), NEW_BODY), 1);

    await adapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(turn1.messages),
      },
    });

    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 1);
    assert.match(turn2.projection.text, /\[freshctx:already-served units=1\]/u);
    assert.doesNotMatch(turn2.projection.text, /PCR_0093_NEW_ON_DISK/u);
    assert.equal(countOccurrences(piMessageText(turn2.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(turn2.projection.text, NEW_BODY), 0);
    assert.doesNotMatch(piMessageText(turn2.messages), /PCR_0093_OLD_TOOL_RESULT/u);
    assert.ok(turn2.telemetry.projectionBytes < turn1.telemetry.projectionBytes);

    await adapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(turn2.messages),
      },
    });
    await writeFile(join(workspace, PROBE_PATH), NEWER_BODY, "utf8");

    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: "second answer" },
      { role: "user", content: "quote the marker after disk change" },
    ];
    const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
    assert.ok(turn3);
    assert.equal(countOccurrences(piMessageText(turn3.messages), NEWER_BODY), 1);
    assert.equal(countOccurrences(turn3.projection.text, NEWER_BODY), 1);
    assert.doesNotMatch(turn3.projection.text, /\[freshctx:already-served/u);
    assert.doesNotMatch(piMessageText(turn3.messages), /PCR_0093_NEW_ON_DISK/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0093: Hermes later request-only re-project collapses unchanged NEW to an already-served marker", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0093-hermes-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0093-hermes-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesPersistedMessages();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    assert.equal(countOccurrences(hermesMessageText(turn1.messages), NEW_BODY), 1);
    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
        { role: "user", content: turn1.projectionText },
      ],
      ctx,
    );

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 1);
    assert.match(turn2.projectionText, /\[freshctx:already-served units=1\]/u);
    assert.doesNotMatch(turn2.projectionText, /PCR_0093_NEW_ON_DISK/u);
    assert.equal(countOccurrences(hermesMessageText(turn2.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(turn2.projectionText, NEW_BODY), 0);
    assert.doesNotMatch(hermesMessageText(turn2.messages), /PCR_0093_OLD_TOOL_RESULT/u);
    assert.ok(turn2.telemetry.projectionBytes < turn1.telemetry.projectionBytes);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn2Persisted),
        { role: "assistant", content: "second answer" },
        { role: "user", content: turn2.projectionText },
      ],
      ctx,
    );
    await writeFile(join(workspace, PROBE_PATH), NEWER_BODY, "utf8");

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: "second answer" },
      { role: "user", content: "quote the marker after disk change" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.equal(countOccurrences(hermesMessageText(turn3.messages), NEWER_BODY), 1);
    assert.equal(countOccurrences(turn3.projectionText, NEWER_BODY), 1);
    assert.doesNotMatch(turn3.projectionText, /\[freshctx:already-served/u);
    assert.doesNotMatch(hermesMessageText(turn3.messages), /PCR_0093_NEW_ON_DISK/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
