import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
const OLD_BODY = "export const marker = 'PCR_0092_OLD_TOOL_RESULT';\n".repeat(8);
const NEW_BODY = "export const marker = 'PCR_0092_NEW_ON_DISK';\n".repeat(8);
const NEWER_BODY = "export const marker = 'PCR_0092_NEWER_ON_DISK';\n".repeat(8);

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
          id: "call-pi-0092",
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
      toolCallId: "call-pi-0092",
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
      toolCallId: "call-hermes-0092",
      path: PROBE_PATH,
    }),
    buildHermesToolResultMessage({
      toolCallId: "call-hermes-0092",
      content: OLD_BODY,
    }),
    {
      role: "user",
      content: "quote the current marker",
    },
  ];
}

test("PCR 0092: Pi later turns do not replay an already-served full projection body while disk is unchanged", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0092-pi-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = piPersistedMessages();

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0092",
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
      ...structuredClone(turn1.messages),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    assert.equal(countOccurrences(piMessageText(turn2.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(turn2.projection.text, NEW_BODY), 1);
    assert.match(piMessageText(turn2.messages), /\[freshctx:already-served/u);
    assert.doesNotMatch(piMessageText(turn2.messages), /PCR_0092_OLD_TOOL_RESULT/u);

    await adapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(turn2.messages),
      },
    });
    await writeFile(join(workspace, PROBE_PATH), NEWER_BODY, "utf8");

    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3Persisted = [
      ...structuredClone(turn2.messages),
      { role: "assistant", content: "second answer" },
      { role: "user", content: "quote the marker after disk change" },
    ];
    const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
    assert.ok(turn3);
    assert.equal(countOccurrences(piMessageText(turn3.messages), NEWER_BODY), 1);
    assert.equal(countOccurrences(turn3.projection.text, NEWER_BODY), 1);
    assert.doesNotMatch(piMessageText(turn3.messages), /PCR_0092_NEW_ON_DISK/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0092: Hermes later turns do not replay an already-served full projection body while disk is unchanged", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0092-hermes-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0092-hermes-state-");
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
        ...structuredClone(turn1.messages),
        { role: "assistant", content: "first answer" },
      ],
      ctx,
    );

    const turn2Persisted = [
      ...structuredClone(turn1.messages),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    assert.equal(countOccurrences(hermesMessageText(turn2.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(turn2.projectionText, NEW_BODY), 1);
    assert.match(hermesMessageText(turn2.messages), /\[freshctx:already-served/u);
    assert.doesNotMatch(hermesMessageText(turn2.messages), /PCR_0092_OLD_TOOL_RESULT/u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn2.messages),
        { role: "assistant", content: "second answer" },
      ],
      ctx,
    );
    await writeFile(join(workspace, PROBE_PATH), NEWER_BODY, "utf8");

    const turn3Persisted = [
      ...structuredClone(turn2.messages),
      { role: "assistant", content: "second answer" },
      { role: "user", content: "quote the marker after disk change" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.equal(countOccurrences(hermesMessageText(turn3.messages), NEWER_BODY), 1);
    assert.equal(countOccurrences(turn3.projectionText, NEWER_BODY), 1);
    assert.doesNotMatch(hermesMessageText(turn3.messages), /PCR_0092_NEW_ON_DISK/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
