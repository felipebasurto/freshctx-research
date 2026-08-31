import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  servedReadToolResultContent,
  shouldInlineServedReadAtToolResult,
  shouldInlineSelectedReadAtToolResult,
} from "../adapters/request-prune.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { stableReadMarker } from "../src/transcript.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";


function piTurn1Persisted() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-pi-0098",
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
      toolCallId: "call-pi-0098",
      content: OLD_BODY,
    },
    {
      role: "user",
      content: "quote line 2 exactly",
    },
  ];
}

function hermesReadPair() {
  return [
    buildHermesReadToolCall({
      toolCallId: "call-hermes-0098",
      path: REGION_PATH,
    }),
    buildHermesToolResultMessage({
      toolCallId: "call-hermes-0098",
      content: OLD_BODY,
    }),
  ];
}


function hermesTurn1Persisted() {
  return [
    ...hermesReadPair(),
    {
      role: "user",
      content: "quote line 2 exactly",
    },
  ];
}

function toolResultText(message) {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

test("PCR 0098: turn-2 first-NEW gate requires an assistant reply between user turns", () => {
  const projection = {
    selected: [{ id: "fc_test", content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="1">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
  };
  const liveTurn2 = [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second" },
  ];
  const smokeSecondCapture = [
    { role: "user", content: "first task" },
    { role: "user", content: "second task" },
  ];
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: liveTurn2,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    true,
  );
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: smokeSecondCapture,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    false,
  );
});

test("PCR 0098: Hermes inline gate counts users from conversationMessages, not the narrowed request slice", () => {
  const projection = {
    selected: [{ id: "fc_test", content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="1">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
  };
  const requestSlice = [
    ...hermesReadPair(),
    { role: "user", content: "quote line 2 raw bytes exactly" },
  ];
  const conversationMessages = [
    ...hermesReadPair(),
    { role: "user", content: "quote line 2 exactly" },
    { role: "assistant", content: "first answer" },
    { role: "user", content: "quote line 2 raw bytes exactly" },
  ];
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: requestSlice,
      userCountMessages: conversationMessages,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    true,
  );
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: requestSlice,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    false,
  );
});

test("PCR 0098: turn-2 first-NEW gate fires only on the second user turn with a live unit body", () => {
  const projection = {
    selected: [{ id: "fc_test", content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="1">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
  };
  const twoUserTurns = [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second" },
  ];
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: [{ role: "user", content: "only one" }],
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    false,
  );
});

test("PCR 0098: stale served read tool results carry current bytes on turn 2", () => {
  const unit = { id: "fc_test", path: REGION_PATH, content: NEW_BODY };
  const selectedUnitIds = new Set(["fc_test"]);
  const fullProjection = `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="${Buffer.byteLength(NEW_BODY, "utf8")}">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`;
  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: OLD_BODY,
      projectionText: fullProjection,
      selectedUnitIds,
      turn2FirstNewGate: true,
    }),
    true,
  );
  assert.equal(
    servedReadToolResultContent({
      unit,
      inlineSelectedRead: true,
      selectedUnitIds,
    }),
    NEW_BODY,
  );
  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: NEW_BODY,
      projectionText: fullProjection,
      selectedUnitIds,
      turn2FirstNewGate: true,
    }),
    false,
  );
  assert.equal(
    servedReadToolResultContent({
      unit,
      inlineSelectedRead: false,
      selectedUnitIds,
    }),
    stableReadMarker(unit),
  );
});

test("PCR 0098: Pi turn-2 first-NEW keeps quoteable interior bytes at the tracked read and full live projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-pi-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0098",
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
    assert.match(decodeProjectionUnits(turn2.projection.text)[0]?.content ?? "", /line2 NEW interior/u);
    const toolResult = turn2.messages.find((message) => message.role === "tool");
    assert.match(toolResultText(toolResult), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(toolResult), /supplied in the live projection/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
    assert.doesNotMatch(turn2.projection.text, /already-served units=1\] Current tracked content was already served/u);

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
    assert.doesNotMatch(turn3.projection.text, /<freshctx-unit/u);
    assert.equal(turn3.telemetry.projectionBytes, 0);
    assert.doesNotMatch(piMessageText(turn3.messages), /line2 OLD interior/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0098: Hermes turn-2 first-NEW keeps quoteable interior bytes at the tracked read and full live projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-hermes-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0098-hermes-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesTurn1Persisted();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
      ],
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
    assert.match(decodeProjectionUnits(turn2.projectionText)[0]?.content ?? "", /line2 NEW interior/u);
    const toolResult = turn2.messages.find((message) => message.role === "tool");
    assert.match(toolResultText(toolResult), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(toolResult), /supplied in the live projection/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
    assert.doesNotMatch(turn2.projectionText, /already-served units=1\] Current tracked content was already served/u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn2Persisted),
        { role: "assistant", content: LINE2_NEW },
      ],
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
    assert.equal(turn3.projectionText, "");
    assert.doesNotMatch(turn3.projectionText, /<freshctx-unit/u);
    assert.equal(turn3.telemetry.projectionBytes, 0);
    assert.doesNotMatch(hermesMessageText(turn3.messages), /line2 OLD interior/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0098: Hermes narrowed request slice still inlines quoteable bytes when conversation history proves turn-2 first-NEW", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-hermes-narrow-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0098-hermes-narrow-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesTurn1Persisted();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx, {
      conversationMessages: structuredClone(turn1Persisted),
    });
    assert.ok(turn1);
    assert.match(decodeProjectionUnits(turn1.projectionText)[0]?.content ?? "", /line2 OLD interior/u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
      ],
      ctx,
    );

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2RequestMessages = [
      ...hermesReadPair(),
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    const turn2ConversationMessages = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2ConversationMessages), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2RequestMessages), ctx, {
      conversationMessages: structuredClone(turn2ConversationMessages),
    });
    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.ok(turn2.projectionText.includes("<freshctx-unit"));
    assert.match(decodeProjectionUnits(turn2.projectionText)[0]?.content ?? "", /line2 NEW interior/u);
    const toolResult = turn2.messages.find((message) => message.role === "tool");
    assert.match(toolResultText(toolResult), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(toolResult), /supplied in the live projection/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
