/** Live Hermes auxiliary-model environment checks (PCR 0034 fail-closed). */

export const STUB_PAYLOAD_MARKER = "FRESHCTX_CAPTURE_OK";
export const DEFAULT_STUB_BASE_URL = "http://127.0.0.1:8787/v1";

const FAIL_CLOSED_HERMES_MODES = Object.freeze([
  "native-no-op",
  "precompress-no-api-key",
  "precompress-blocked",
  "select-context-only",
]);

export function resolveHermesBaseUrl() {
  return process.env.OPENAI_BASE_URL ?? process.env.HERMES_BASE_URL ?? DEFAULT_STUB_BASE_URL;
}

export function resolveHermesModelId() {
  return process.env.HERMES_MODEL ?? process.env.OPENAI_MODEL ?? "freshctx-capture";
}

export function isStubBaseUrl(baseUrl) {
  const normalized = String(baseUrl ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized.includes("127.0.0.1:8787") || normalized.includes("localhost:8787");
}

export function hasLiveApiKey() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.HERMES_API_KEY);
}

export function isCaptureStubEnabled() {
  return process.env.FRESHCTX_CAPTURE_OK === "1";
}

export function isStubPayload(payloadText) {
  if (typeof payloadText !== "string") return false;
  return payloadText.includes(STUB_PAYLOAD_MARKER);
}

export function isFailClosedHermesMode(mode) {
  return FAIL_CLOSED_HERMES_MODES.includes(mode);
}

/**
 * @returns {{
 *   live: boolean,
 *   blocked: boolean,
 *   blockedReasons: string[],
 *   apiKeyPresent: boolean,
 *   captureStubEnabled: boolean,
 *   baseUrl: string,
 *   stubBaseUrl: boolean,
 *   modelId: string,
 * }}
 */
export function assessLiveHermesEnv() {
  const apiKeyPresent = hasLiveApiKey();
  const captureStubEnabled = isCaptureStubEnabled();
  const baseUrl = resolveHermesBaseUrl();
  const stubBaseUrl = isStubBaseUrl(baseUrl);
  const modelId = resolveHermesModelId();
  const blockedReasons = [];

  if (captureStubEnabled) {
    blockedReasons.push("FRESHCTX_CAPTURE_OK=1 is set (capture stub forbidden for live pack)");
  }
  if (!apiKeyPresent) {
    blockedReasons.push("OPENAI_API_KEY and HERMES_API_KEY are both unset");
  }
  if (stubBaseUrl && !process.env.OPENAI_BASE_URL && !process.env.HERMES_BASE_URL) {
    blockedReasons.push(`default base URL is stub (${DEFAULT_STUB_BASE_URL}); set OPENAI_BASE_URL or HERMES_BASE_URL`);
  } else if (stubBaseUrl) {
    blockedReasons.push(`base URL points at capture-provider stub (${baseUrl})`);
  }

  return {
    live: blockedReasons.length === 0,
    blocked: blockedReasons.length > 0,
    blockedReasons,
    apiKeyPresent,
    captureStubEnabled,
    baseUrl,
    stubBaseUrl,
    modelId,
  };
}

export function sanitizeBaseHost(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.host;
  } catch {
    return String(baseUrl);
  }
}
