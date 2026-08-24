import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";

const PROBE_PATH = "ws/t2append_probe.txt";
const OLD_LINE = "T2APPEND_OLD_a3f1";
const NEW_LINE = "T2APPEND_NEW_c91e";
const OLD_BYTES = `${OLD_LINE}\n`;
const APPENDED_BYTES = `${OLD_LINE}\n${NEW_LINE}\n`;

async function writeProbe(workspace, content) {
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, PROBE_PATH), content, { encoding: "utf8" });
}

test("PCR 0061: inter-turn append refreshes whole-file projection on product main lifecycle", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0061-"));
  await writeProbe(workspace, OLD_BYTES);

  assert.equal(Buffer.byteLength(OLD_BYTES, "utf8"), 18);
  assert.equal((OLD_BYTES.match(/\n/g) ?? []).length, 1);
  assert.doesNotMatch(OLD_BYTES, /\\n/u);

  const stateFile = await createHermesStateFile();
  const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });
  const ctx = { cwd: workspace };

  const turn1Messages = [
    buildReadToolCall({ toolCallId: "call-t1", path: PROBE_PATH }),
    buildToolResultMessage({ toolCallId: "call-t1", content: OLD_BYTES }),
    { role: "user", content: "read the probe file" },
  ];

  await adapter.onTurnComplete(structuredClone(turn1Messages), ctx);
  const turn1Select = await adapter.onSelectContext(structuredClone(turn1Messages), ctx, {
    budgetChars: 8_000,
  });

  assert.match(turn1Select.projectionText, new RegExp(OLD_LINE, "u"));
  assert.doesNotMatch(turn1Select.projectionText, new RegExp(NEW_LINE, "u"));
  assert.match(turn1Select.projectionText, /content-bytes="18"/u);
  assert.match(turn1Select.projectionText, /lines="1-2"/u);
  assert.match(turn1Select.projectionText, /resolution="whole-file"/u);
  assert.match(JSON.stringify(turn1Select.messages), /\[freshctx:/u);

  await writeProbe(workspace, APPENDED_BYTES);

  assert.equal(Buffer.byteLength(APPENDED_BYTES, "utf8"), 36);
  assert.equal((APPENDED_BYTES.match(/\n/g) ?? []).length, 2);

  const turn2Select = await adapter.onSelectContext(structuredClone(turn1Messages), ctx, {
    budgetChars: 8_000,
  });

  assert.match(turn2Select.projectionText, new RegExp(OLD_LINE, "u"));
  assert.match(turn2Select.projectionText, new RegExp(NEW_LINE, "u"));
  assert.match(turn2Select.projectionText, /content-bytes="36"/u);
  assert.match(turn2Select.projectionText, /lines="1-3"/u);
  assert.match(turn2Select.projectionText, /resolution="whole-file"/u);
  assert.match(turn2Select.projectionText, /path="ws\/t2append_probe.txt"/u);

  const lastLine = turn2Select.projectionText.split("\n").find((line) => line.includes(NEW_LINE));
  assert.ok(lastLine, "projection must include appended last line token");
});
