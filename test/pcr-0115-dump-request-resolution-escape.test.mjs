import assert from "node:assert/strict";
import test from "node:test";

import { resolutionFromStringifiedPayload } from "../docs/lab/pi-trial-ts/resolution-from-stringified.mjs";

const UNESCAPED_RESOLUTION_ATTR_RE = /resolution="([^"]+)"/gu;

// Dest-verified on research box captures (not re-dumped on this VM).
// Tree-sitter arm raw 002.json: resolution=\"isolated-semantic-engine\" after stringify.
// No-Tree-sitter arm: resolution=\"whole-file\".
const STRINGIFIED_TREESITTER_ARM = JSON.stringify({
  messages: [
    {
      role: "user",
      content:
        '<freshctx turn="2"><freshctx-unit id="fc_settle" resolution="isolated-semantic-engine" content-bytes="1">body</freshctx-unit></freshctx>',
    },
  ],
});

const STRINGIFIED_WHOLE_FILE = JSON.stringify({
  messages: [
    {
      role: "user",
      content: '<freshctx-unit id="fc_settle" resolution="whole-file" content-bytes="1">body</freshctx-unit>',
    },
  ],
});

test("PCR 0115: unescaped resolution regex misses stringified payload", () => {
  assert.match(STRINGIFIED_TREESITTER_ARM, /resolution=\\"isolated-semantic-engine\\"/u);
  assert.equal([...STRINGIFIED_TREESITTER_ARM.matchAll(UNESCAPED_RESOLUTION_ATTR_RE)].length, 0);
  assert.equal([...STRINGIFIED_WHOLE_FILE.matchAll(UNESCAPED_RESOLUTION_ATTR_RE)].length, 0);
});

test("PCR 0115: resolutionFromStringifiedPayload reads Tree-sitter arm token from escaped quotes", () => {
  assert.equal(resolutionFromStringifiedPayload(STRINGIFIED_TREESITTER_ARM), "isolated-semantic-engine");
});

test("PCR 0115: resolutionFromStringifiedPayload reads whole-file from escaped quotes", () => {
  assert.equal(resolutionFromStringifiedPayload(STRINGIFIED_WHOLE_FILE), "whole-file");
});

test("PCR 0115: last matching resolution attribute wins", () => {
  const stringified = JSON.stringify({
    earlier: '<freshctx-unit resolution="stored-line-span">',
    later: '<freshctx-unit resolution="isolated-semantic-engine">',
  });
  assert.equal(resolutionFromStringifiedPayload(stringified), "isolated-semantic-engine");
});

test("PCR 0115: defaults to none when stringified payload has no resolution attribute", () => {
  assert.equal(resolutionFromStringifiedPayload(JSON.stringify({ messages: [] })), "none");
});
