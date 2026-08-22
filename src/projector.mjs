import { selectWorkingSet } from "./policy.mjs";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeAttribute(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseAttributes(header) {
  const attributes = {};
  for (const match of header.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/giu)) {
    attributes[match[1]] = unescapeAttribute(match[2]);
  }
  return attributes;
}

export function renderUnit(unit) {
  const contentBytes = Buffer.byteLength(unit.content, "utf8");
  const attributes = [
    `id="${escapeAttribute(unit.id)}"`,
    `path="${escapeAttribute(unit.path)}"`,
    `lines="${unit.startLine}-${unit.endLine}"`,
    `revision="${escapeAttribute(unit.revision)}"`,
    `resolution="${escapeAttribute(unit.resolutionMethod)}"`,
    `content-bytes="${contentBytes}"`,
  ].join(" ");

  return `<freshctx-unit ${attributes}>\n${unit.content}\n</freshctx-unit>`;
}

/**
 * Decode rendered units using their UTF-8 byte length rather than delimiter
 * search. Source code may legally contain FreshCtx's closing tag; length
 * framing keeps the benchmark oracle exact in that case.
 */
export function decodeProjectionUnits(text) {
  const source = Buffer.from(String(text), "utf8");
  const opening = Buffer.from("<freshctx-unit ");
  const headerEndMarker = Buffer.from(">\n");
  const closing = Buffer.from("\n</freshctx-unit>");
  const decoded = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(opening, cursor);
    if (start === -1) break;
    const headerEnd = source.indexOf(headerEndMarker, start + opening.length);
    if (headerEnd === -1) throw new Error("unterminated FreshCtx unit header");

    const header = source.subarray(start, headerEnd + 1).toString("utf8");
    const attributes = parseAttributes(header);
    const contentBytes = Number(attributes["content-bytes"]);
    if (!Number.isSafeInteger(contentBytes) || contentBytes < 0) {
      throw new Error("invalid FreshCtx content-bytes attribute");
    }

    const contentStart = headerEnd + headerEndMarker.length;
    const contentEnd = contentStart + contentBytes;
    if (contentEnd > source.length) throw new Error("truncated FreshCtx unit content");
    if (!source.subarray(contentEnd, contentEnd + closing.length).equals(closing)) {
      throw new Error("FreshCtx unit length does not align with its closing frame");
    }

    decoded.push({
      ...attributes,
      contentBytes,
      content: source.subarray(contentStart, contentEnd).toString("utf8"),
    });
    cursor = contentEnd + closing.length;
  }

  return decoded;
}

export function projectContext(
  units,
  { turn = 0, task = "", budgetChars, policy = {} } = {},
) {
  const selection = selectWorkingSet(units, { turn, task, budgetChars, policy });
  const renderOrder = selection.selected
    .map(({ unit }) => unit)
    .sort((a, b) => a.changeCount - b.changeCount || a.id.localeCompare(b.id));
  const unresolved = selection.omitted.filter((item) => item.reason === "unresolved");
  const budgetOmitted = selection.omitted.filter((item) => item.reason === "budget");
  const envelopeOpen = [
    `<freshctx turn="${turn}" selected="${renderOrder.length}"`,
    ` unresolved="${unresolved.length}" budget-omitted="${budgetOmitted.length}">`,
  ].join("");
  const preamble =
    renderOrder.length === 0
      ? ""
      : "The following code is the current workspace state. Historical read markers refer here.";
  const footer = "</freshctx>";
  const text = [envelopeOpen + preamble, ...renderOrder.map(renderUnit), footer].join("\n");

  return {
    text,
    selected: renderOrder,
    omitted: selection.omitted,
    rawCodeChars: selection.usedChars,
    renderedChars: text.length,
    estimatedTokens: Math.ceil(text.length / 4),
  };
}
