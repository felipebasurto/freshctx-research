export const MARKER_AUTH = "AU0";

export function refreshToken(userId: string) {
  return `${userId}:${MARKER_AUTH}`;
}
