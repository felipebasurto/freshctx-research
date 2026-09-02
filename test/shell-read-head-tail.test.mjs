import assert from "node:assert/strict";
import test from "node:test";

import { observedSpanForShellRead, parseShellFileRead, tryTrackShellRead } from "../adapters/shell-read.mjs";

const FILE_NL = "a\nb\nc\n";      // lineCount 4 (trailing empty line)
const FILE_NO_NL = "a\nb\nc";     // lineCount 3

test("lineCountFlag accepts -n N, -nN, -N and --lines=N", () => {
  assert.deepEqual(parseShellFileRead("head -n 2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("head -n2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("head -2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("head --lines=2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("tail -n2 f.txt"), { path: "f.txt", scope: "region", tailLines: 2 });
  assert.equal(parseShellFileRead("head -n0 f.txt"), null);
});

test("observedSpanForShellRead: tail on a trailing-newline file", () => {
  assert.deepEqual(
    observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "b\nc\n"),
    { startLine: 2, endLine: 4 },
  );
});

test("observedSpanForShellRead: tail on a file without trailing newline", () => {
  assert.deepEqual(
    observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NO_NL, "b\nc"),
    { startLine: 2, endLine: 3 },
  );
});

test("observedSpanForShellRead: head shorter than the request clamps to observed lines", () => {
  assert.deepEqual(
    observedSpanForShellRead({ scope: "region", startLine: 1, endLine: 10 }, FILE_NL, "a\nb\nc\n"),
    { startLine: 1, endLine: 4 },
  );
});

test("observedSpanForShellRead fails closed when observed bytes are not the file slice", () => {
  assert.equal(observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "zzz\n"), null);
  assert.equal(observedSpanForShellRead({ scope: "region", startLine: 1, endLine: 2 }, FILE_NL, "b\nc\n"), null);
});

test("tryTrackShellRead tracks tail with the observed span and refuses a mismatching observation", async () => {
  const lineCount = (text) => String(text).replaceAll("\r\n", "\n").split("\n").length;
  async function run(command, observed) {
    const tracked = [];
    const ok = await tryTrackShellRead({
      toolName: "bash",
      input: { command },
      content: observed,
      isError: false,
      cwd: "/unused",
      engine: { trackRead: (args) => { tracked.push(args); return { id: "u1" }; } },
      callToUnit: new Map(),
      toolCallId: "c1",
      safeWorkspaceFile: async () => ({ path: "f.txt", content: FILE_NL }),
      observedToolContent: (value) => value,
      lineCount,
    });
    return { ok, tracked };
  }
  const good = await run("tail -n 2 f.txt", "b\nc\n");
  assert.equal(good.ok, true);
  assert.equal(good.tracked[0].startLine, 2);
  assert.equal(good.tracked[0].endLine, 4);

  const bad = await run("tail -n 2 f.txt", "stale\nbytes\n");
  assert.equal(bad.ok, false);
  assert.equal(bad.tracked.length, 0);
});
