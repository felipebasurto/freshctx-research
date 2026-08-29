import { FreshCtxEngine } from "../src/index.mjs";
import { createSidecarRunner } from "../sidecar/treesitter/client.mjs";

export function createAdapterEngine({ sidecarRunner = createSidecarRunner() } = {}) {
  return new FreshCtxEngine({ sidecarRunner });
}
