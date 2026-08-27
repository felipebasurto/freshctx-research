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
import {
  createPiAdapter,
  messageText as piMessageText,
} from "../adapters/pi/replay.mjs";

const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'PCR_0087_OLD_TOOL_RESULT';\n".repeat(20);
const NEW_BODY = "export const marker = 'PCR_0087_NEW_ON_DISK';\n".repeat(20);

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function singleRevision(entries) {
  assert.equal(entries.length, 1);
  const [[unitId, revision]] = entries;
  assert.equal(typeof unitId, "string");
  assert.equal(typeof revision, "string");
  return { unitId, revision };
}

function piMessages() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-pi-0087",
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
      toolCallId: "call-pi-0087",
      content: OLD_BODY,
    },
    {
      role: "user",
      content: "quote the current marker",
    },
  ];
}

function hermesMessages() {
  return [
    buildReadToolCall({
      toolCallId: "call-hermes-0087",
      path: PROBE_PATH,
    }),
    buildToolResultMessage({
      toolCallId: "call-hermes-0087",
      content: OLD_BODY,
    }),
    {
      role: "user",
      content: "quote the current marker",
    },
  ];
}

test("PCR 0087: discarded NEW projection does not let turn 2 skip or fall back to old tool-result bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0087-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY);

    const piAdapter = createPiAdapter({ budgetChars: 120_000 });
    const piPersisted = piMessages();
    const piCtx = { cwd: workspace };
    await piAdapter.onTurnStart({ turnIndex: 1 });
    await piAdapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0087",
        input: { path: PROBE_PATH },
        content: OLD_BODY,
        isError: false,
      },
      piCtx,
    );
    const piTurn1 = await piAdapter.onContext({ messages: structuredClone(piPersisted) }, piCtx);
    await piAdapter.onTurnStart({ turnIndex: 2 });
    const piTurn2 = await piAdapter.onContext({ messages: structuredClone(piPersisted) }, piCtx);

    assert.ok(piTurn1);
    assert.ok(piTurn2);
    assert.equal(piAdapter.lastInjectedRevision.size, 0);
    assert.equal(piAdapter.pendingInjectedRevision.size, 1);
    assert.equal(countOccurrences(piMessageText(piTurn1.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(piMessageText(piTurn2.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(piTurn2.projection.text, NEW_BODY), 1);
    assert.doesNotMatch(piMessageText(piTurn2.messages), /PCR_0087_OLD_TOOL_RESULT/u);
    assert.doesNotMatch(piTurn2.projection.text, /PCR_0087_OLD_TOOL_RESULT/u);
    assert.doesNotMatch(piTurn2.projection.text, /unchanged="true"/u);
    await piAdapter.onBeforeProviderRequest({
      payload: {
        messages: structuredClone(piTurn2.messages),
      },
    });
    const piApplied = singleRevision([...piAdapter.lastInjectedRevision.entries()]);
    assert.equal(piAdapter.pendingInjectedRevision.size, 0);
    assert.match(piApplied.revision, /^sha256:/u);

    const stateFile = await createHermesStateFile();
    const hermesAdapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const hermesPersisted = hermesMessages();
    const hermesCtx = { cwd: workspace };
    await hermesAdapter.onTurnComplete(structuredClone(hermesPersisted), hermesCtx);
    const hermesTurn1 = await hermesAdapter.onSelectContext(structuredClone(hermesPersisted), hermesCtx);
    const hermesTurn2 = await hermesAdapter.onSelectContext(structuredClone(hermesPersisted), hermesCtx);
    const stateAfterDiscardedSelect = JSON.parse(await readFile(stateFile, "utf8"));

    assert.ok(hermesTurn1);
    assert.ok(hermesTurn2);
    assert.equal("lastInjectedRevision" in stateAfterDiscardedSelect, false);
    const hermesPending = singleRevision(Object.entries(stateAfterDiscardedSelect.pendingInjectedRevision ?? {}));
    assert.equal(stateAfterDiscardedSelect.projectionStateVersion, 1);
    assert.equal(countOccurrences(hermesMessageText(hermesTurn1.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(hermesMessageText(hermesTurn2.messages), NEW_BODY), 1);
    assert.equal(countOccurrences(hermesTurn2.projectionText, NEW_BODY), 1);
    assert.doesNotMatch(hermesMessageText(hermesTurn2.messages), /PCR_0087_OLD_TOOL_RESULT/u);
    assert.doesNotMatch(hermesTurn2.projectionText, /PCR_0087_OLD_TOOL_RESULT/u);
    assert.doesNotMatch(hermesTurn2.projectionText, /unchanged="true"/u);
    await hermesAdapter.onTurnComplete(structuredClone(hermesPersisted), hermesCtx);
    const stateAfterAppliedTurn = JSON.parse(await readFile(stateFile, "utf8"));
    const hermesApplied = singleRevision(Object.entries(stateAfterAppliedTurn.lastInjectedRevision ?? {}));
    assert.deepEqual(hermesApplied, hermesPending);
    assert.equal("pendingInjectedRevision" in stateAfterAppliedTurn, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
