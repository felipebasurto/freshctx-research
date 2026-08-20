/**
 * Documented CORVUS whole-file operations for CtxBench replay.
 *
 * Quoted from Zheng et al., CORVUS, arXiv:2607.22711, Algorithm 1 and §4:
 *   sync_file(fj): St ← St ∪ {fj}; ot ← "sync:" fj
 *   sync_context(St-1): Ct ← {(fj, cj(t)) : fj ∈ St-1}
 *   prompt: Ht-1 ⊕ Ct  (synced context after message history, §4.3)
 *
 * Deviations are recorded in docs/decisions/0003-corvus-reproduction-deviations.md.
 */

export function syncMarker(filePath) {
  return `sync: ${filePath}`;
}

export function renderSyncedContext(files) {
  return files
    .map((file) => `[corvus-file path="${file.path}"]\n${file.content}`)
    .join("\n\n");
}

export class CorvusSyncedFileSet {
  constructor() {
    this.paths = new Set();
  }

  /**
   * Paper Algorithm 1 lines 6–8: register fj and emit a lightweight marker.
   * Does not append file bytes to history.
   */
  syncFile(filePath) {
    this.paths.add(filePath);
    return syncMarker(filePath);
  }

  /**
   * Paper Algorithm 1 line 3 / §4.2: refresh registered files from the workspace.
   * Absent files are omitted from Ct (no last-known injection).
   */
  async syncContext(workspace) {
    const files = [];
    for (const filePath of [...this.paths].sort()) {
      const current = await workspace.tryRead(filePath);
      if (current === null) continue;
      files.push({ path: filePath, content: current });
    }
    return files;
  }
}
