import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";
import {
  createPiAdapter,
  messageText as piMessageText,
} from "../adapters/pi/replay.mjs";
import { analyzeCapture } from "../bench/metrics.mjs";
import { sha256 } from "../src/hash.mjs";

const PROBE_PATH = "probe.ts";
const PROBE_BODY = "export const marker = 'PCR_0079_CURRENT';\n".repeat(40);
const BUDGET_CHARS = 120_000;

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function piMessages() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-pi-0079",
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
      toolCallId: "call-pi-0079",
      content: PROBE_BODY,
    },
    {
      role: "user",
      content: "What is the marker?",
    },
  ];
}

function hermesMessages() {
  return [
    buildReadToolCall({
      toolCallId: "call-hermes-0079",
      path: PROBE_PATH,
    }),
    buildToolResultMessage({
      toolCallId: "call-hermes-0079",
      content: PROBE_BODY,
    }),
    {
      role: "user",
      content: "What is the marker?",
    },
  ];
}

test("Pi sends one current body in every stateless request", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0079-pi-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), PROBE_BODY);
    const adapter = createPiAdapter({ budgetChars: BUDGET_CHARS });
    const messages = piMessages();
    const ctx = { cwd: workspace };

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0079",
        input: { path: PROBE_PATH },
        content: PROBE_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(messages) }, ctx);

    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(messages) }, ctx);

    assert.ok(turn1);
    assert.ok(turn2);
    assert.equal(countOccurrences(piMessageText(turn1.messages), PROBE_BODY), 1);
    assert.equal(countOccurrences(piMessageText(turn2.messages), PROBE_BODY), 1);
    assert.equal(countOccurrences(turn2.projection.text, PROBE_BODY), 1);
    assert.doesNotMatch(turn2.projection.text, /unchanged="true"/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Hermes sends one current body in every stateless request", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0079-hermes-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), PROBE_BODY);
    const adapter = createHermesAdapter({
      stateFile: join(workspace, "state", "session.json"),
      budgetChars: BUDGET_CHARS,
    });
    const messages = hermesMessages();
    const ctx = { cwd: workspace };

    await adapter.onTurnComplete(structuredClone(messages), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(messages), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(messages), ctx);

    assert.equal(countOccurrences(hermesMessageText(turn1.messages), PROBE_BODY), 1);
    assert.equal(countOccurrences(hermesMessageText(turn2.messages), PROBE_BODY), 1);
    assert.equal(countOccurrences(turn2.projectionText, PROBE_BODY), 1);
    assert.doesNotMatch(turn2.projectionText, /unchanged="true"/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Hermes removes obsolete revision state on the next state write", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0079-state-"));
  try {
    const stateFile = join(workspace, "session.json");
    await writeFile(
      stateFile,
      `${JSON.stringify({
        calls: {},
        lastInjectedRevision: {
          fc_old: `sha256:${sha256(PROBE_BODY)}`,
        },
      })}\n`,
    );
    const adapter = createHermesAdapter({ stateFile });

    await adapter.onTurnComplete([], { cwd: workspace });

    const state = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal("lastInjectedRevision" in state, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Hermes selection leaves persisted state byte-identical", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0079-read-only-"));
  try {
    const stateFile = join(workspace, "session.json");
    const stateText = `${JSON.stringify({
      calls: {},
      updatedAt: "2026-08-25T00:00:00.000Z",
    }, null, 2)}\n`;
    await writeFile(stateFile, stateText);
    const adapter = createHermesAdapter({ stateFile });

    await adapter.onSelectContext([], { cwd: workspace });

    assert.equal(await readFile(stateFile, "utf8"), stateText);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("marker-only frames do not count as byte-exact recall", () => {
  const revision = `sha256:${sha256(PROBE_BODY)}`;
  const projectionText = [
    '<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">',
    `<freshctx-unit id="fc_pcr0079" path="${PROBE_PATH}" lines="1-40" revision="${revision}" resolution="whole-file" content-bytes="0" unchanged="true">`,
    "",
    "</freshctx-unit>",
    "</freshctx>",
  ].join("\n");
  const metrics = analyzeCapture({
    baseline: "freshctx-region",
    payloadText: projectionText,
    payloadBytes: Buffer.byteLength(projectionText, "utf8"),
    projectionText,
    trackedReads: [],
    requiredUnits: [{ key: "probe", path: PROBE_PATH }],
    goldBytesByKey: { probe: PROBE_BODY },
  });

  assert.equal(metrics.requiredRecall, 0);
  assert.equal(metrics.exactCurrentRate, 0);
});
