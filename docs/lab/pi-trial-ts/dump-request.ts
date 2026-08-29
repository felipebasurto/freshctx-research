import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  MARKER_V0,
  MARKER_V1,
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
} from "./pack.mjs";

const RESOLUTION_ATTR_RE = /resolution="([^"]+)"/gu;

export default function dumpRequest(pi) {
  const dir = process.env.PI_TRIAL_DUMP_DIR;
  if (!dir) return;

  let n = 0;
  pi.on("before_provider_request", async (event) => {
    n += 1;
    const payload = (event as { payload?: unknown }).payload;
    const text = JSON.stringify(payload ?? null);
    const id = String(n).padStart(3, "0");
    const resolutions = [...text.matchAll(RESOLUTION_ATTR_RE)].map((match) => match[1]);
    const resolution = resolutions.length > 0 ? resolutions[resolutions.length - 1] : "none";
    const usage = (payload as { usage?: { prompt_tokens?: number } } | null)?.usage;
    const promptTokens =
      typeof usage?.prompt_tokens === "number" && Number.isFinite(usage.prompt_tokens)
        ? usage.prompt_tokens
        : null;

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.json`), text);
    await writeFile(
      join(dir, `${id}.scan.json`),
      `${JSON.stringify(
        {
          n,
          utf8Bytes: Buffer.byteLength(text),
          promptTokens,
          markers: {
            targetV0: text.includes(MARKER_V0),
            targetV1: text.includes(MARKER_V1),
            sibling: text.includes(SIBLING_MARKER),
          },
          t2ExactNewBytes: text.includes(MARKER_V1),
          siblingBytesInRequest: text.includes(SIBLING_MARKER),
          hasFreshCtxUnit: text.includes("<freshctx-unit"),
          resolution,
          targetFileMention: text.includes(TARGET_FILE),
          targetSymbolMention: text.includes(TARGET_SYMBOL),
          at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
  });
}
