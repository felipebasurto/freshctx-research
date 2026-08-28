import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { createPiAdapter } from "../adapters/pi/replay.mjs";
import {
  currentProjectionMarker,
  resolveProjectionText,
} from "../adapters/request-prune.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";

test("PCR 0106: skip-eligible collapse returns empty tail without current already-served stub", () => {
  const projection = {
    selected: [{ id: "fc_test", revision: "sha256:abc", path: REGION_PATH, content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="3">${NEW_BODY}</freshctx>`,
  };
  const laterMessages = [
    { role: "user", content: "task" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "again" },
  ];
  assert.equal(
    resolveProjectionText({
      messages: laterMessages,
      projection,
      skipEligibleSelections: 1,
    }),
    "",
  );
  assert.notEqual(currentProjectionMarker({ unitCount: 1 }), "");
});

test("PCR 0106: Pi adapter no longer tracks lastDeliveredCollapsedRevision", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0106-pi-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    assert.equal("lastDeliveredCollapsedRevision" in adapter, false);

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0106",
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1Persisted = [
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call-pi-0106",
          type: "function",
          function: { name: "read", arguments: JSON.stringify({ path: REGION_PATH }) },
        }],
      },
      { role: "tool", toolCallId: "call-pi-0106", content: OLD_BODY },
      { role: "user", content: "quote line 2" },
    ];
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Persisted) }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3 = await adapter.onContext({
      messages: [
        ...structuredClone(turn2Persisted),
        { role: "assistant", content: "line2 NEW interior" },
        { role: "user", content: "again unchanged" },
      ],
    }, ctx);
    assert.ok(turn3);
    assert.equal(turn3.projection.text, "");
    assert.equal(turn3.telemetry.projectionBytes, 0);
    assert.ok(adapter.lastInjectedRevision.size > 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0106: Hermes persisted state drops legacy lastDeliveredCollapsedRevision on load", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0106-hermes-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0106-hermes-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");
    await writeFile(stateFile, `${JSON.stringify({
      calls: {},
      projectionStateVersion: 1,
      lastInjectedRevision: { fc_test: "sha256:legacy" },
      lastDeliveredCollapsedRevision: { fc_test: "sha256:legacy" },
    }, null, 2)}\n`, "utf8");

    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = [
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call-hermes-0106",
          type: "function",
          function: { name: "read", arguments: JSON.stringify({ path: REGION_PATH }) },
        }],
      },
      { role: "tool", tool_call_id: "call-hermes-0106", content: OLD_BODY },
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);

    const state = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal(state.lastDeliveredCollapsedRevision, undefined);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
