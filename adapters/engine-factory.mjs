import { FreshCtxEngine } from "../src/index.mjs";
import { createIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";

export function createAdapterEngine({ semanticEngineRunner = createIsolatedSemanticEngineRunner() } = {}) {
  return new FreshCtxEngine({ semanticEngineRunner });
}
