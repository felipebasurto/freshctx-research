export function stableReadMarker(unit) {
  return `[freshctx:${unit.id} path=${unit.path}] Current content is supplied in the live projection.`;
}

function unitIdFromMessage(message) {
  return message?.metadata?.freshctx?.unitId ?? message?.freshctx?.unitId;
}

function replaceContent(content, marker) {
  if (Array.isArray(content)) return [{ type: "text", text: marker }];
  return marker;
}

export function rewriteHistoricalReads(messages, registry) {
  return messages.map((message) => {
    const unitId = unitIdFromMessage(message);
    if (!unitId) return structuredClone(message);
    const unit = registry.get(unitId);
    if (!unit) return structuredClone(message);

    return {
      ...structuredClone(message),
      content: replaceContent(message.content, stableReadMarker(unit)),
    };
  });
}

export function annotateReadMessage(message, unit) {
  return {
    ...structuredClone(message),
    metadata: {
      ...(message.metadata ?? {}),
      freshctx: { unitId: unit.id, path: unit.path },
    },
  };
}
