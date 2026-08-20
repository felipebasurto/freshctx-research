import { FreshCtxEngine } from "../src/engine.mjs";
import { annotateReadMessage } from "../src/transcript.mjs";

const engine = new FreshCtxEngine();
const oldCode = "export const greeting = 'hello';";
const unit = engine.trackRead({ path: "src/greeting.ts", content: oldCode, scope: "file" });
const historicalRead = annotateReadMessage({ role: "tool", content: oldCode }, unit);

engine.advanceTurn();
const request = await engine.buildRequest([historicalRead], {
  sourceProvider: { "src/greeting.ts": "export const greeting = 'hola';" },
  task: "Use the current greeting",
});

console.log(request.messages.map((message) => message.content).join("\n\n"));
