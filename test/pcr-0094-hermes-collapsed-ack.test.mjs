import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";

const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'PCR_0094_OLD_TOOL_RESULT';\n".repeat(8);
const NEW_BODY = "export const marker = 'PCR_0094_NEW_ON_DISK';\n".repeat(8);

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function hermesPersistedMessages() {
  return [
    buildReadToolCall({
      toolCallId: "call-hermes-0094",
      path: PROBE_PATH,
    }),
    buildToolResultMessage({
      toolCallId: "call-hermes-0094",
      content: OLD_BODY,
    }),
    {
      role: "user",
      content: "quote the current marker",
    },
  ];
}

test("PCR 0094: Hermes acknowledges the collapsed marker text and keeps later unchanged turns collapsed", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0094-hermes-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0094-hermes-state-");
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
    assert.equal(countOccurrences(hermesMessageText(turn2.messages), NEW_BODY), 0);
    const stateAfterTurn2Select = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal(stateAfterTurn2Select.pendingProjectionText, turn2.projectionText);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn2Persisted),
        { role: "assistant", content: "second answer" },
        { role: "user", content: turn2.projectionText },
      ],
      ctx,
    );

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: "second answer" },
      { role: "user", content: "quote the same marker once more" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.equal(turn3.telemetry.skipEligibleSelections, 1);
    assert.match(turn3.projectionText, /\[freshctx:already-served units=1\]/u);
    assert.equal(countOccurrences(hermesMessageText(turn3.messages), NEW_BODY), 0);
    assert.equal(turn3.telemetry.projectionBytes, turn2.telemetry.projectionBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
