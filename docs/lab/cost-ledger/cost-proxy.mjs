/** Cited DeepSeek v4 flash cost proxy. Not a live host score. */

export const COST_PROXY_VERSION = 1;
export const COST_PROXY_SOURCE_URL = "https://api-docs.deepseek.com/quick_start/pricing/";
export const COST_PROXY_CITED_AT = "2026-09-01";
export const FLASH_MODEL = "deepseek-v4-flash";
export const BYTES_PER_ESTIMATED_TOKEN = 4;

/** USD per 1M tokens. Cited from COST_PROXY_SOURCE_URL on COST_PROXY_CITED_AT. */
export const FLASH_RATES_USD_PER_MTOK = {
  "off-peak": {
    cacheHitInput: 0.007,
    cacheMissInput: 0.22,
    output: 0.66,
  },
  peak: {
    cacheHitInput: 0.014,
    cacheMissInput: 0.44,
    output: 1.32,
  },
};

export function assertFlashOnly(model) {
  if (model !== FLASH_MODEL) {
    throw new Error(`cost-ledger model must be ${FLASH_MODEL}, got ${String(model)}`);
  }
}

export function ratesForSchedule({ schedule = "off-peak", cache = "miss" } = {}) {
  const band = FLASH_RATES_USD_PER_MTOK[schedule];
  if (!band) {
    throw new Error(`unknown cost-proxy schedule ${String(schedule)}`);
  }
  if (cache !== "hit" && cache !== "miss") {
    throw new Error(`unknown cost-proxy cache ${String(cache)}`);
  }
  return {
    schedule,
    cache,
    inputUsdPerMtok: cache === "hit" ? band.cacheHitInput : band.cacheMissInput,
    outputUsdPerMtok: band.output,
    version: COST_PROXY_VERSION,
    citedAt: COST_PROXY_CITED_AT,
    sourceUrl: COST_PROXY_SOURCE_URL,
  };
}

export function estimatePromptTokensFromBytes(requestBytes) {
  if (typeof requestBytes !== "number" || !Number.isFinite(requestBytes) || requestBytes < 0) {
    return null;
  }
  return Math.ceil(requestBytes / BYTES_PER_ESTIMATED_TOKEN);
}

function tokensToUsd(tokens, usdPerMtok) {
  if (typeof tokens !== "number" || !Number.isFinite(tokens)) return null;
  return (tokens / 1_000_000) * usdPerMtok;
}

export function costProxyUsd({
  promptTokens,
  completionTokens = 0,
  schedule = "off-peak",
  cache = "miss",
} = {}) {
  if (typeof promptTokens !== "number" || !Number.isFinite(promptTokens)) return null;
  const rates = ratesForSchedule({ schedule, cache });
  const outputTokens = typeof completionTokens === "number" && Number.isFinite(completionTokens) ? completionTokens : 0;
  return tokensToUsd(promptTokens, rates.inputUsdPerMtok) + tokensToUsd(outputTokens, rates.outputUsdPerMtok);
}
