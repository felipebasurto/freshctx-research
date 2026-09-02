/** Provider usage comes from the response body, never from a dummy dump-only reply. */

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isDummyUsage(scan = {}) {
  return scan.dumpOnly === true || scan.usageFrom === "dummy" || scan.usageFrom === "none";
}

export function usageFromResponseText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { promptTokens: null, completionTokens: null, usageFrom: "none" };
  }
  const parsed = parseJson(text);
  const usage = parsed && typeof parsed === "object" ? parsed.usage : null;
  if (usage && typeof usage === "object") {
    return {
      promptTokens: finiteNumber(usage.prompt_tokens ?? usage.input_tokens),
      completionTokens: finiteNumber(usage.completion_tokens ?? usage.output_tokens),
      usageFrom: "provider-response",
    };
  }
  if (!/"usage"\s*:/u.test(text)) {
    return { promptTokens: null, completionTokens: null, usageFrom: "none" };
  }
  const promptMatch = /"prompt_tokens"\s*:\s*(\d+)/u.exec(text);
  const completionMatch = /"completion_tokens"\s*:\s*(\d+)/u.exec(text);
  const promptTokens = promptMatch ? Number(promptMatch[1]) : null;
  const completionTokens = completionMatch ? Number(completionMatch[1]) : null;
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : null,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : null,
    usageFrom: "provider-response",
  };
}

export function usageFromScan(scan = {}) {
  if (isDummyUsage(scan)) {
    return { promptTokens: null, completionTokens: null, usageFrom: scan.usageFrom ?? "none" };
  }
  if (scan.usageFrom === "request" || scan.usageFrom === "request-body") {
    return { promptTokens: null, completionTokens: null, usageFrom: "request-ignored" };
  }
  const promptTokens = finiteNumber(scan.promptTokens ?? scan.usage?.prompt_tokens);
  const completionTokens = finiteNumber(scan.completionTokens ?? scan.usage?.completion_tokens);
  return {
    promptTokens,
    completionTokens,
    usageFrom: scan.usageFrom ?? (promptTokens === null ? "none" : "scan"),
  };
}
