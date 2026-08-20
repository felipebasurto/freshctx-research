import assert from "node:assert/strict";
import test from "node:test";

import { createCaptureProvider } from "../capture/provider.mjs";

test("capture provider records one request and returns a fixed non-model response", async (t) => {
  const provider = createCaptureProvider({ expectedRequests: 1 });
  await new Promise((resolve) => provider.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => provider.server.close(resolve)));
  const address = provider.server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "freshctx-capture",
      messages: [{ role: "user", content: "one exact payload" }],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.choices[0].message.content, "FRESHCTX_CAPTURE_OK");
  assert.equal(body.usage.total_tokens, 0);
  assert.equal(provider.captures.length, 1);
  assert.equal(provider.captures[0].request.messages[0].content, "one exact payload");
  assert.match(provider.captures[0].canonical_sha256, /^[0-9a-f]{64}$/u);
});

test("capture provider rejects an unexpected second semantic request", async (t) => {
  const provider = createCaptureProvider({ expectedRequests: 1 });
  await new Promise((resolve) => provider.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => provider.server.close(resolve)));
  const address = provider.server.address();
  const url = `http://127.0.0.1:${address.port}/v1/chat/completions`;
  const options = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "freshctx-capture", messages: [] }),
  };

  assert.equal((await fetch(url, options)).status, 200);
  assert.equal((await fetch(url, options)).status, 409);
  assert.equal(provider.captures.length, 1);
});
