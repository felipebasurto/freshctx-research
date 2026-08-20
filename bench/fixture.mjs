export const fixture = {
  name: "auth-region-after-interior-edit",
  task: "Change authorization to use the write permission and explain the behavior.",
  path: "src/auth.ts",
  initialRegion: [
    "export function authorize(user) {",
    "  if (!user) return false;",
    "  return user.role === 'admin';",
    "}",
  ].join("\n"),
  currentRegion: [
    "export function authorize(user) {",
    "  if (!user) return false;",
    "  return user.permissions.includes('write');",
    "}",
  ].join("\n"),
};

const unrelatedPrefix = [
  "export const DEFAULT_TIMEOUT = 5_000;",
  "",
  "export function normalizeUser(user) {",
  "  return { ...user, name: user.name.trim() };",
  "}",
  "",
].join("\n");

const unrelatedSuffix = [
  "",
  "export function audit(event) {",
  "  return JSON.stringify({ ...event, at: Date.now() });",
  "}",
  "",
  ...Array.from({ length: 24 }, (_, index) => `// unrelated module documentation line ${index + 1}`),
].join("\n");

fixture.initialFile = `${unrelatedPrefix}${fixture.initialRegion}${unrelatedSuffix}`;
fixture.currentFile = `${unrelatedPrefix}${fixture.currentRegion}${unrelatedSuffix}`;
