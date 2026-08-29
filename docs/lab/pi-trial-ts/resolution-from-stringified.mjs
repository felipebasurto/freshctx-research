/** Match resolution="token" after JSON.stringify escapes inner XML quotes. */
const STRINGIFIED_RESOLUTION_ATTR_RE = /resolution=\\"([^\\"]+)\\"/gu;

/**
 * Read the last resolution= attribute from a JSON.stringify provider payload.
 * @param {string} stringifiedPayload
 * @returns {string}
 */
export function resolutionFromStringifiedPayload(stringifiedPayload) {
  const resolutions = [...stringifiedPayload.matchAll(STRINGIFIED_RESOLUTION_ATTR_RE)].map(
    (match) => match[1],
  );
  return resolutions.length > 0 ? resolutions[resolutions.length - 1] : "none";
}
