const REQUIRED_METHODS = ["capture", "transform", "validate", "serialize"];

function asBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("host codec serialize() must return bytes or a string");
}

export function defineHostCodec({ name, capture, transform, validate, serialize }) {
  const methods = { capture, transform, validate, serialize };
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("host codec requires a name");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof methods[method] !== "function") {
      throw new TypeError(`host codec requires ${method}()`);
    }
  }
  return Object.freeze({ name, ...methods });
}

export async function applyHostCodec(codec, originalRequest, context = {}) {
  let originalBytes;
  try {
    const originalSnapshot = structuredClone(originalRequest);
    originalBytes = asBytes(codec.serialize(structuredClone(originalSnapshot)));
    const requestCopy = structuredClone(originalSnapshot);
    const captured = await codec.capture(requestCopy, context);
    const transformed = await codec.transform(requestCopy, { captured, context });
    const candidate = transformed ?? requestCopy;
    if (await codec.validate(candidate, { captured, context }) !== true) {
      throw new Error("host codec produced an invalid native request");
    }
    if (!asBytes(codec.serialize(structuredClone(originalRequest))).equals(originalBytes)) {
      throw new Error("host codec mutated the original request");
    }
    return {
      applied: true,
      request: candidate,
      captured,
      codec: codec.name,
    };
  } catch (error) {
    return {
      applied: false,
      request: originalRequest,
      captured: null,
      codec: codec?.name ?? "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
