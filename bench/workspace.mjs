import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { normalizePath, sha256 } from "../src/hash.mjs";

function assertSafeRelativePath(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.startsWith("..") || normalized.includes("/../")) {
    throw new Error(`path escapes workspace root: ${filePath}`);
  }
  if (posix.isAbsolute(normalized)) {
    throw new Error(`absolute paths are not allowed: ${filePath}`);
  }
  return normalized;
}

export class Workspace {
  constructor(root, { followSymlinks = false } = {}) {
    this.root = root;
    this.followSymlinks = followSymlinks;
  }

  static async fromInitialFiles(root, initialFiles = {}) {
    const workspace = new Workspace(root);
    for (const [filePath, content] of Object.entries(initialFiles)) {
      await workspace.write(filePath, content);
    }
    return workspace;
  }

  resolve(filePath) {
    const relative = assertSafeRelativePath(filePath);
    const absolute = join(this.root, relative);
    const resolvedRoot = join(this.root);
    if (!absolute.startsWith(resolvedRoot)) {
      throw new Error(`path escapes workspace root: ${filePath}`);
    }
    return { relative, absolute };
  }

  async read(filePath) {
    const { relative, absolute } = this.resolve(filePath);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink() && !this.followSymlinks) {
      throw new Error(`refusing to follow symlink: ${relative}`);
    }
    if (!stats.isFile()) {
      throw new Error(`not a regular file: ${relative}`);
    }
    return (await readFile(absolute, "utf8")).replaceAll("\r\n", "\n");
  }

  async write(filePath, content) {
    const { absolute } = this.resolve(filePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, String(content).replaceAll("\r\n", "\n"), "utf8");
  }

  async delete(filePath) {
    const { relative, absolute } = this.resolve(filePath);
    await rm(absolute, { force: true });
    return relative;
  }

  async replaceExact(filePath, expected, replacement) {
    const current = await this.read(filePath);
    const normalizedExpected = String(expected).replaceAll("\r\n", "\n");
    if (!current.includes(normalizedExpected)) {
      throw new Error(`replace-exact miss in ${filePath}`);
    }
    const next = current.replace(normalizedExpected, String(replacement).replaceAll("\r\n", "\n"));
    await this.write(filePath, next);
    return next;
  }

  extractRegion(filePath, startLine, endLine) {
    return async () => {
      const content = await this.read(filePath);
      const lines = content.split("\n");
      return lines.slice(startLine - 1, endLine).join("\n");
    };
  }

  async goldForUnit({ path: filePath, startLine, endLine, scope = "file" }) {
    const content = await this.read(filePath);
    if (scope === "file") return content;
    const lines = content.split("\n");
    return lines.slice(startLine - 1, endLine).join("\n");
  }

  async tryRead(filePath) {
    try {
      return await this.read(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }
}
