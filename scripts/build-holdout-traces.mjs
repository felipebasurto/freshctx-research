#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPOS = join(ROOT, "bench", "repos");
const OUT = join(ROOT, "bench", "traces", "holdout");
const CANDIDATES_PATH = join(OUT, "candidates-rejected.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function region(content, startLine, endLine) {
  return content.replaceAll("\r\n", "\n").split("\n").slice(startLine - 1, endLine).join("\n");
}

function goldAfterMutation(content, initialRegion) {
  const lineCount = initialRegion.split("\n").length;
  const anchor = initialRegion.split("\n")[0];
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line === anchor);
  if (start === -1) throw new Error(`anchor missing after mutation: ${anchor}`);
  return lines.slice(start, start + lineCount).join("\n");
}

function rankKey(commit, selector, scenario) {
  return sha256(`${commit}:${selector}:${scenario}`);
}

async function readRepo(repoId, filePath) {
  return (await readFile(join(REPOS, repoId, filePath), "utf8")).replaceAll("\r\n", "\n");
}

async function writeTrace(name, trace) {
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(trace, null, 2)}\n`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const lock = JSON.parse(await readFile(join(ROOT, "bench", "repos.lock.json"), "utf8"));
  const goCommit = lock.repositories["go-tools"].commit;
  const nvCommit = lock.repositories.neovim.commit;

  const candidates = {
    schemaVersion: 1,
    label: "holdout-v0.1-candidate-audit",
    note: "EVALUATION §5.1 parsers not implemented; hand-authored slice with documented rejection.",
    selectionRule: "sha256(commit + selector + scenario) ranking among enumerated eligible units",
    rejected: [],
    selected: [],
  };

  const goUtil = await readRepo("go-tools", "go/buildutil/util.go");
  const nvSecure = await readRepo("neovim", "runtime/lua/vim/secure.lua");

  candidates.rejected.push(
    {
      repo: "go-tools",
      path: "go/ast/astutil/imports.go",
      selector: "AddNamedImport.doc",
      reason: "whole file exceeds 12000-char smoke-parity budget (14003 bytes); freshctx-file cannot satisfy region gold",
      rankKey: rankKey(goCommit, "AddNamedImport.doc", "interior-edit"),
    },
    {
      repo: "go-tools",
      path: "go/ast/astutil/imports.go",
      selector: "AddNamedImport.doc",
      reason: "duplicate godoc block caused false stale-byte detection after interior edit on first draft",
      rankKey: rankKey(goCommit, "AddNamedImport.doc", "interior-edit-draft"),
    },
    {
      repo: "neovim",
      path: "runtime/lua/nvim/dir.lua",
      selector: "dir.module",
      reason: "396 lines; deferred to expanded holdout (rank below secure.read_trust for delete family)",
      rankKey: rankKey(nvCommit, "dir.module", "delete"),
    },
    {
      repo: "neovim",
      path: "runtime/lua/vim/_meta.lua",
      selector: "meta.generated",
      reason: "generated/meta surface; excluded unless scenario targets generated code",
    },
  );

  const goSource = {
    repository: "https://go.googlesource.com/tools",
    commit: goCommit,
    license: "BSD-3-Clause",
  };
  const nvSource = {
    repository: "https://github.com/neovim/neovim.git",
    commit: nvCommit,
    license: "Apache-2.0",
  };

  const parseBody = region(goUtil, 32, 38);
  const parseBodyMutated = parseBody.replace(
    "if !IsAbsPath(ctxt, file) {",
    "if !IsAbsPath(ctxt, file) { // holdout interior edit",
  );
  candidates.selected.push({
    repo: "go-tools",
    family: "interior-edit",
    path: "go/buildutil/util.go",
    selector: "ParseFile.body",
    rankKey: rankKey(goCommit, "ParseFile.body", "interior-edit"),
  });

  await writeTrace("go-tools-interior-edit", {
    schemaVersion: 1,
    name: "go-tools/interior-edit/parse-file-body",
    source: goSource,
    initialFiles: { "go/buildutil/util.go": goUtil },
    events: [
      { type: "read", path: "go/buildutil/util.go", scope: "region", startLine: 32, endLine: 38, selector: "ParseFile.body" },
      {
        type: "capture-request",
        task: "review ParseFile body",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "ParseFile.body", sha256: sha256(parseBody) }],
      },
      {
        type: "replace-exact",
        path: "go/buildutil/util.go",
        expected: "if !IsAbsPath(ctxt, file) {",
        replacement: "if !IsAbsPath(ctxt, file) { // holdout interior edit",
      },
      {
        type: "capture-request",
        task: "review ParseFile body",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "ParseFile.body", sha256: sha256(parseBodyMutated) }],
      },
    ],
  });

  const parseFileSig = region(goUtil, 31, 33);
  const parseNeedle = "func ParseFile(fset *token.FileSet, ctxt *build.Context, displayPath func(string) string, dir string, file string, mode parser.Mode) (*ast.File, error) {";
  const parseReplacement = "// holdout-append marker\n\nfunc ParseFile(fset *token.FileSet, ctxt *build.Context, displayPath func(string) string, dir string, file string, mode parser.Mode) (*ast.File, error) {";
  const goAfterAppend = goUtil.replace(parseNeedle, parseReplacement);
  const parseFileAfterAppend = goldAfterMutation(goAfterAppend, parseFileSig);
  candidates.selected.push({
    repo: "go-tools",
    family: "append",
    path: "go/buildutil/util.go",
    selector: "ParseFile.sig",
    rankKey: rankKey(goCommit, "ParseFile.sig", "append"),
  });

  await writeTrace("go-tools-append", {
    schemaVersion: 1,
    name: "go-tools/append/parse-file-sig",
    source: goSource,
    initialFiles: { "go/buildutil/util.go": goUtil },
    events: [
      { type: "read", path: "go/buildutil/util.go", scope: "region", startLine: 31, endLine: 33, selector: "ParseFile.sig" },
      {
        type: "capture-request",
        task: "inspect ParseFile signature",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "ParseFile.sig", sha256: sha256(parseFileSig) }],
      },
      { type: "replace-exact", path: "go/buildutil/util.go", expected: parseNeedle, replacement: parseReplacement },
      {
        type: "capture-request",
        task: "inspect ParseFile signature",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "ParseFile.sig", sha256: sha256(parseFileAfterAppend) }],
      },
    ],
  });

  const holdoutTempGo = "package holdouttemp\n\nfunc HoldoutTemp() string {\n\treturn \"temp\"\n}\n";
  candidates.selected.push({
    repo: "go-tools",
    family: "delete",
    path: "internal/holdouttemp/temp.go",
    selector: "HoldoutTemp.file",
    rankKey: rankKey(goCommit, "HoldoutTemp.file", "delete"),
  });

  await writeTrace("go-tools-delete", {
    schemaVersion: 1,
    name: "go-tools/delete/holdout-temp",
    source: goSource,
    initialFiles: { "go/buildutil/util.go": goUtil, "internal/holdouttemp/temp.go": holdoutTempGo },
    events: [
      { type: "read", path: "internal/holdouttemp/temp.go", scope: "file" },
      {
        type: "capture-request",
        task: "review holdout temp helper",
        budgetChars: 12000,
        requiredUnits: [{ path: "internal/holdouttemp/temp.go", sha256: sha256(holdoutTempGo) }],
      },
      { type: "delete-file", path: "internal/holdouttemp/temp.go" },
      { type: "capture-request", task: "review holdout temp helper", budgetChars: 12000, requiredUnits: [] },
    ],
  });

  const hasSubdirHeader = region(goUtil, 79, 81);
  const goMoved = `${goUtil.replace(`${hasSubdirHeader}\n`, "").trimEnd()}\n\n${hasSubdirHeader}\n`;
  candidates.selected.push({
    repo: "go-tools",
    family: "move-in-file",
    path: "go/buildutil/util.go",
    selector: "HasSubdir.header",
    rankKey: rankKey(goCommit, "HasSubdir.header", "move-in-file"),
  });

  await writeTrace("go-tools-move-in-file", {
    schemaVersion: 1,
    name: "go-tools/move-in-file/has-subdir-header",
    source: goSource,
    initialFiles: { "go/buildutil/util.go": goUtil },
    events: [
      { type: "read", path: "go/buildutil/util.go", scope: "region", startLine: 79, endLine: 81, selector: "HasSubdir.header" },
      {
        type: "capture-request",
        task: "relocate HasSubdir header",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "HasSubdir.header", sha256: sha256(hasSubdirHeader) }],
      },
      { type: "replace-exact", path: "go/buildutil/util.go", expected: goUtil, replacement: goMoved },
      {
        type: "capture-request",
        task: "relocate HasSubdir header",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "HasSubdir.header", sha256: sha256(hasSubdirHeader) }],
      },
    ],
  });

  const containingPkgSig = region(goUtil, 46, 53);
  const dupInsert = `${containingPkgSig}\n\n// ContainingPackageDuplicate is an intentional duplicate-boundary holdout mutation.\nfunc ContainingPackageDuplicate(ctxt *build.Context, dir, filename string) (*build.Package, error) {\n\treturn ContainingPackage(ctxt, dir, filename)\n}\n`;
  candidates.selected.push({
    repo: "go-tools",
    family: "duplicate-boundary",
    path: "go/buildutil/util.go",
    selector: "ContainingPackage.sig",
    rankKey: rankKey(goCommit, "ContainingPackage.sig", "duplicate-boundary"),
  });

  await writeTrace("go-tools-duplicate-boundary", {
    schemaVersion: 1,
    name: "go-tools/duplicate-boundary/containing-package-sig",
    source: goSource,
    initialFiles: { "go/buildutil/util.go": goUtil },
    events: [
      { type: "read", path: "go/buildutil/util.go", scope: "region", startLine: 46, endLine: 53, selector: "ContainingPackage.sig" },
      {
        type: "capture-request",
        task: "resolve duplicated ContainingPackage signatures",
        budgetChars: 12000,
        requiredUnits: [{ path: "go/buildutil/util.go", selector: "ContainingPackage.sig", sha256: sha256(containingPkgSig) }],
      },
      { type: "replace-exact", path: "go/buildutil/util.go", expected: containingPkgSig, replacement: dupInsert },
      { type: "capture-request", task: "resolve duplicated ContainingPackage signatures", budgetChars: 12000, requiredUnits: [] },
    ],
  });

  const readTrustFn = region(nvSecure, 6, 22);
  const readTrustMutated = readTrustFn.replace(
    "local trust = {} ---@type table<string, string>",
    "local trust = {} ---@type table<string, string> -- holdout interior edit",
  );
  candidates.selected.push({
    repo: "neovim",
    family: "interior-edit",
    path: "runtime/lua/vim/secure.lua",
    selector: "read_trust.fn",
    rankKey: rankKey(nvCommit, "read_trust.fn", "interior-edit"),
  });

  await writeTrace("neovim-interior-edit", {
    schemaVersion: 1,
    name: "neovim/interior-edit/read-trust-fn",
    source: nvSource,
    initialFiles: { "runtime/lua/vim/secure.lua": nvSecure },
    events: [
      { type: "read", path: "runtime/lua/vim/secure.lua", scope: "region", startLine: 6, endLine: 22, selector: "read_trust.fn" },
      {
        type: "capture-request",
        task: "review trust database reader",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "read_trust.fn", sha256: sha256(readTrustFn) }],
      },
      {
        type: "replace-exact",
        path: "runtime/lua/vim/secure.lua",
        expected: "local trust = {} ---@type table<string, string>",
        replacement: "local trust = {} ---@type table<string, string> -- holdout interior edit",
      },
      {
        type: "capture-request",
        task: "review trust database reader",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "read_trust.fn", sha256: sha256(readTrustMutated) }],
      },
    ],
  });

  const computeHashHeader = region(nvSecure, 24, 34);
  const computeNeedle = "local function compute_hash(fullpath, bufnr)";
  const computeReplacement = "-- holdout-append marker\n\nlocal function compute_hash(fullpath, bufnr)";
  const nvAfterAppend = nvSecure.replace(computeNeedle, computeReplacement);
  const computeAfterAppend = goldAfterMutation(nvAfterAppend, computeHashHeader);
  candidates.selected.push({
    repo: "neovim",
    family: "append",
    path: "runtime/lua/vim/secure.lua",
    selector: "compute_hash.header",
    rankKey: rankKey(nvCommit, "compute_hash.header", "append"),
  });

  await writeTrace("neovim-append", {
    schemaVersion: 1,
    name: "neovim/append/compute-hash-header",
    source: nvSource,
    initialFiles: { "runtime/lua/vim/secure.lua": nvSecure },
    events: [
      { type: "read", path: "runtime/lua/vim/secure.lua", scope: "region", startLine: 24, endLine: 34, selector: "compute_hash.header" },
      {
        type: "capture-request",
        task: "inspect compute_hash helper",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "compute_hash.header", sha256: sha256(computeHashHeader) }],
      },
      { type: "replace-exact", path: "runtime/lua/vim/secure.lua", expected: computeNeedle, replacement: computeReplacement },
      {
        type: "capture-request",
        task: "inspect compute_hash helper",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "compute_hash.header", sha256: sha256(computeAfterAppend) }],
      },
    ],
  });

  const holdoutTempLua = "local M = {}\n\nfunction M.holdoutTemp()\n  return 'temp'\nend\n\nreturn M\n";
  candidates.selected.push({
    repo: "neovim",
    family: "delete",
    path: "runtime/lua/vim/_holdout_temp.lua",
    selector: "holdoutTemp.file",
    rankKey: rankKey(nvCommit, "holdoutTemp.file", "delete"),
  });

  await writeTrace("neovim-delete", {
    schemaVersion: 1,
    name: "neovim/delete/holdout-temp",
    source: nvSource,
    initialFiles: { "runtime/lua/vim/secure.lua": nvSecure, "runtime/lua/vim/_holdout_temp.lua": holdoutTempLua },
    events: [
      { type: "read", path: "runtime/lua/vim/_holdout_temp.lua", scope: "file" },
      {
        type: "capture-request",
        task: "review holdout temp module",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/_holdout_temp.lua", sha256: sha256(holdoutTempLua) }],
      },
      { type: "delete-file", path: "runtime/lua/vim/_holdout_temp.lua" },
      { type: "capture-request", task: "review holdout temp module", budgetChars: 12000, requiredUnits: [] },
    ],
  });

  const writeTrustBlock = region(nvSecure, 79, 89);
  const nvMoved = `${nvSecure.replace(`${writeTrustBlock}\n`, "").trimEnd()}\n\n${writeTrustBlock}\n`;
  candidates.selected.push({
    repo: "neovim",
    family: "move-in-file",
    path: "runtime/lua/vim/secure.lua",
    selector: "write_trust.fn",
    rankKey: rankKey(nvCommit, "write_trust.fn", "move-in-file"),
  });

  await writeTrace("neovim-move-in-file", {
    schemaVersion: 1,
    name: "neovim/move-in-file/write-trust-fn",
    source: nvSource,
    initialFiles: { "runtime/lua/vim/secure.lua": nvSecure },
    events: [
      { type: "read", path: "runtime/lua/vim/secure.lua", scope: "region", startLine: 79, endLine: 89, selector: "write_trust.fn" },
      {
        type: "capture-request",
        task: "relocate write_trust helper",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "write_trust.fn", sha256: sha256(writeTrustBlock) }],
      },
      { type: "replace-exact", path: "runtime/lua/vim/secure.lua", expected: nvSecure, replacement: nvMoved },
      {
        type: "capture-request",
        task: "relocate write_trust helper",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "write_trust.fn", sha256: sha256(writeTrustBlock) }],
      },
    ],
  });

  const secureReadSig = region(nvSecure, 107, 112);
  const secureDupInsert = `${secureReadSig}\n\nfunction M.read_duplicate(path)\n  return M.read(path)\nend\n`;
  candidates.selected.push({
    repo: "neovim",
    family: "duplicate-boundary",
    path: "runtime/lua/vim/secure.lua",
    selector: "M.read.sig",
    rankKey: rankKey(nvCommit, "M.read.sig", "duplicate-boundary"),
  });

  await writeTrace("neovim-duplicate-boundary", {
    schemaVersion: 1,
    name: "neovim/duplicate-boundary/secure-read-sig",
    source: nvSource,
    initialFiles: { "runtime/lua/vim/secure.lua": nvSecure },
    events: [
      { type: "read", path: "runtime/lua/vim/secure.lua", scope: "region", startLine: 107, endLine: 112, selector: "M.read.sig" },
      {
        type: "capture-request",
        task: "resolve duplicated secure.read signatures",
        budgetChars: 12000,
        requiredUnits: [{ path: "runtime/lua/vim/secure.lua", selector: "M.read.sig", sha256: sha256(secureReadSig) }],
      },
      { type: "replace-exact", path: "runtime/lua/vim/secure.lua", expected: secureReadSig, replacement: secureDupInsert },
      { type: "capture-request", task: "resolve duplicated secure.read signatures", budgetChars: 12000, requiredUnits: [] },
    ],
  });

  await writeFile(CANDIDATES_PATH, `${JSON.stringify(candidates, null, 2)}\n`);
  process.stdout.write(`Wrote holdout traces to ${OUT}\n`);
}

await main();
