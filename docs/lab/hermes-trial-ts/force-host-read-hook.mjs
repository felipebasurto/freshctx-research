#!/usr/bin/env node
/** stdin JSON tool event → handleForceHostReadToolCall → Hermes pre_tool_call directive. */

import { readFileSync } from "node:fs";

import {
  forceHostReadEnabled,
  forcedArgsFromEvent,
  hermesPreToolCallDirective,
} from "./force-host-read.mjs";

const raw = readFileSync(0, "utf8");
const event = JSON.parse(raw.length > 0 ? raw : "{}");
if (!forceHostReadEnabled(process.env)) {
  process.stdout.write(`${JSON.stringify({ enabled: false, directive: null, tool: null })}\n`);
  process.exit(0);
}

const state = { hostReadSatisfied: false };
const directive = hermesPreToolCallDirective(event, state);
const tool = {
  toolCallId: event.toolCallId ?? null,
  toolName: event.toolName,
  args: forcedArgsFromEvent(event),
};
process.stdout.write(`${JSON.stringify({ enabled: true, directive, tool })}\n`);
