import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
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
import {
  resolveProjectionText,
} from "../adapters/request-prune.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";

const PROBE_PATH = "probe.ts";
const PROBE_OLD = "export const marker = 'PCR_0099_OLD';\n".repeat(8);
const PROBE_NEW = "export const marker = 'PCR_0099_NEW';\n".repeat(8);

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function piTurn1Persisted() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-pi-0099",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: REGION_PATH }),
          },
        },
      ],
    },
    {
      role: "tool",
      toolCallId: "call-pi-0099",
      content: OLD_BODY,
    },
    { role: "user", content: "quote line 2 exactly" },
  ];
}

function hermesTurn1Persisted() {
  return [
    buildHermesReadToolCall({
      toolCallId: "call-hermes-0099",
      path: REGION_PATH,
    }),
    buildHermesToolResultMessage({
      toolCallId: "call-hermes-0099",
      content: OLD_BODY,
    }),
    { role: "user", content: "quote line 2 exactly" },
  ];
}

function hermesReadPair() {
  return [
    buildHermesReadToolCall({
      toolCallId: "call-hermes-0099-continue",
      path: PROBE_PATH,
    }),
    buildHermesToolResultMessage({
      toolCallId: "call-hermes-0099-continue",
      content: PROBE_OLD,
    }),
  ];
}

test("PCR 0099: resolveProjectionText returns empty tail on skip-eligible collapse", () => {
  const projection = {
    selected: [{ id: "fc_test", revision: "sha256:abc", path: "x.txt", content: "body" }],
    omitted: [],
    text: "<freshctx turn=\"0\">body</freshctx>",
  };
  assert.equal(
    resolveProjectionText({
      messages: [{ role: "user", content: "task" }, { role: "assistant", content: "ok" }, { role: "user", content: "again" }],
      projection,
      skipEligibleSelections: 1,
    }),
    "",
  );
});

test("PCR 0099: Pi turn-3 first collapse then turn-4+ omit repeated already-served stub", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0099-pi-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0099",
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(piTurn1Persisted()) }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2Persisted = [
      ...structuredClone(piTurn1Persisted()),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    assert.ok(turn2.projection.text.includes("<freshctx-unit"));
    assert.ok(turn2.telemetry.projectionBytes > 200);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
    assert.ok(turn3);
    assert.equal(turn3.projection.text, "");
    assert.equal(turn3.telemetry.projectionBytes, 0);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn3.messages) } });

    await adapter.onTurnStart({ turnIndex: 4 });
    const turn4Persisted = [
      ...structuredClone(turn3Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "still unchanged on turn four" },
    ];
    const turn4 = await adapter.onContext({ messages: structuredClone(turn4Persisted) }, ctx);
    assert.ok(turn4);
    assert.equal(turn4.projection.text, "");
    assert.equal(turn4.telemetry.projectionBytes, 0);
    assert.doesNotMatch(piMessageText(turn4.messages), /\[freshctx:already-served units=1\]/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0099: Hermes turn-3 first collapse then turn-4+ omit repeated already-served stub", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0099-hermes-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0099-hermes-state-");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesTurn1Persisted();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    await adapter.onTurnComplete(
      [...structuredClone(turn1Persisted), { role: "assistant", content: "first answer" }],
      ctx,
    );

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    assert.ok(turn2.projectionText.includes("<freshctx-unit"));
    await adapter.onTurnComplete(
      [...structuredClone(turn2Persisted), { role: "assistant", content: LINE2_NEW }],
      ctx,
    );

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.match(turn3.projectionText, /^$/u);
    assert.equal(turn3.telemetry.projectionBytes, 0);
    await adapter.onTurnComplete(
      [...structuredClone(turn3Persisted), { role: "assistant", content: LINE2_NEW }],
      ctx,
    );

    const turn4Persisted = [
      ...structuredClone(turn3Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "still unchanged on turn four" },
    ];
    await adapter.onTurnComplete(structuredClone(turn4Persisted), ctx);
    const turn4 = await adapter.onSelectContext(structuredClone(turn4Persisted), ctx);
    assert.ok(turn4);
    assert.equal(turn4.projectionText, "");
    assert.equal(turn4.telemetry.projectionBytes, 0);
    assert.doesNotMatch(hermesMessageText(turn4.messages), /\[freshctx:already-served units=1\]/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0099: Hermes request-only ack omits repeated collapsed stub on later unchanged turns", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0099-hermes-continue-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), PROBE_NEW, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0099-hermes-continue-state-");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    assert.equal(countOccurrences(hermesMessageText(turn1.messages), PROBE_NEW), 1);

    await adapter.onTurnComplete(
      [...structuredClone(turn1Persisted), { role: "assistant", content: "first answer" }],
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
    assert.equal(turn2.projectionText, "");
    assert.equal(turn2.telemetry.projectionBytes, 0);

    await adapter.onTurnComplete(
      [...structuredClone(turn2Persisted), { role: "assistant", content: "second answer" }],
      ctx,
    );
    const stateAfterTurn2 = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal(stateAfterTurn2.lastDeliveredCollapsedRevision, undefined);

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: "second answer" },
      { role: "user", content: "quote the same marker once more" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.equal(turn3.projectionText, "");
    assert.equal(turn3.telemetry.projectionBytes, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
