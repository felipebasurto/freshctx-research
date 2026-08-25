import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MARKERS = ["RD0", "RD1", "RD2", "CL0", "CL1", "CL2", "MD0", "MD1", "FL0", "FL1", "TD0", "TD1"];

export default function dumpRequest(pi) {
  const dir = process.env.PI_TRIAL_DUMP_DIR;
  if (!dir) return;

  let n = 0;
  pi.on("before_provider_request", async (event) => {
    n += 1;
    const payload = (event as { payload?: unknown }).payload;
    const text = JSON.stringify(payload ?? null);
    const id = String(n).padStart(3, "0");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.json`), text);
    await writeFile(
      join(dir, `${id}.scan.json`),
      `${JSON.stringify(
        {
          n,
          utf8Bytes: Buffer.byteLength(text),
          markers: MARKERS.filter((mark) => text.includes(mark)),
          hasFreshCtxUnit: text.includes("<freshctx-unit"),
          hasNoAccessibleContent: text.includes("no accessible content"),
          at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
  });
}
