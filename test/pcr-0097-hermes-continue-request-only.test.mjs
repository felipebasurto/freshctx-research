import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
const OLD_BODY = "export const marker = 'PCR_0097_OLD_TOOL_RESULT';\n".repeat(8);
const NEW_BODY = "export const marker = 'PCR_0097_NEW_ON_DISK';\n".repeat(8);

function hermesReadPair() {
  return [
    buildReadToolCall({
      toolCallId: "call-hermes-0097",
      path: PROBE_PATH,
    }),
    buildToolResultMessage({
      toolCallId: "call-hermes-0097",
      content: OLD_BODY,
    }),
  ];
}

test("PCR 0097: replay adapter promotes request-only apply ack from assistant follow-through", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0097-replay-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0097-replay-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx, {
      conversationMessages: structuredClone(turn1Persisted),
    });
    assert.ok(turn1);
    assert.match(turn1.projectionText, /<freshctx /u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
      ],
      ctx,
    );

    const turn2RequestMessages = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2ConversationMessages = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2 = await adapter.onSelectContext(structuredClone(turn2RequestMessages), ctx, {
      conversationMessages: structuredClone(turn2ConversationMessages),
    });
    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 1);
    assert.equal(turn2.projectionText, "");
    assert.equal(turn2.telemetry.projectionBytes, 0);
    assert.equal(hermesMessageText(turn2.messages).split(NEW_BODY).length - 1, 1);
    assert.equal(turn2.projectionText.split(NEW_BODY).length - 1, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0097: continue leftover pending does not promote from prior tool+assistant when this turn projection was not delivered", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0097-continue-leftover-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0097-continue-leftover-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const priorHistory = [
      ...hermesReadPair(),
      { role: "user", content: "prior continue turn" },
      { role: "assistant", content: "prior assistant answer" },
    ];
    const undeliveredTurn = [
      ...structuredClone(priorHistory),
      { role: "user", content: "this projection is discarded" },
    ];

    await adapter.onTurnComplete(structuredClone(priorHistory), ctx);
    await adapter.onTurnComplete(structuredClone(undeliveredTurn), ctx);
    const discardedSelect = await adapter.onSelectContext(structuredClone(undeliveredTurn), ctx, {
      conversationMessages: structuredClone(undeliveredTurn),
    });
    assert.ok(discardedSelect);
    assert.match(discardedSelect.projectionText, /<freshctx /u);

    await adapter.onTurnComplete(structuredClone(undeliveredTurn), ctx);

    const retrySelect = await adapter.onSelectContext(structuredClone(undeliveredTurn), ctx, {
      conversationMessages: structuredClone(undeliveredTurn),
    });
    assert.ok(retrySelect);
    assert.equal(retrySelect.telemetry.skipEligibleSelections, 0);
    assert.match(retrySelect.projectionText, /<freshctx /u);
    assert.doesNotMatch(retrySelect.projectionText, /\[freshctx:already-served/u);
    assert.equal(hermesMessageText(retrySelect.messages).split(NEW_BODY).length - 1, 1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
