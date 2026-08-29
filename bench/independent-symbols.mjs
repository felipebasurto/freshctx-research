import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const PYTHON_AST = `
import ast, json, sys
source = sys.stdin.read()
tree = ast.parse(source)
units = []

class Walker(ast.NodeVisitor):
    def visit_FunctionDef(self, node):
        self._add("function", node)
        self.generic_visit(node)
    def visit_AsyncFunctionDef(self, node):
        self._add("function", node)
        self.generic_visit(node)
    def visit_ClassDef(self, node):
        self._add("class", node)
        self.generic_visit(node)
    def _add(self, kind, node):
        end = node.end_lineno
        if end is None:
            raise SystemExit("python ast missing end_lineno")
        units.append({
            "name": node.name,
            "kind": kind,
            "startLine": node.lineno,
            "endLine": end,
        })

Walker().visit(tree)
print(json.dumps(units))
`;

const JS_FUNCTION = /^(?<indent>\s*)(?:export\s+)?(?:async\s+)?function\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\(/u;
const JS_CLASS = /^(?<indent>\s*)(?:export\s+)?class\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\b/u;

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function languageFor(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
  return null;
}

export function sliceSpan(text, startLine, endLine) {
  const lines = String(text).replaceAll("\r\n", "\n").split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

function attachBytes(text, units, path, language, source) {
  return units.map((unit) => {
    const bytes = sliceSpan(text, unit.startLine, unit.endLine);
    return {
      path,
      language,
      source,
      name: unit.name,
      kind: unit.kind,
      selector: unit.name,
      startLine: unit.startLine,
      endLine: unit.endLine,
      bytes,
      sha256: sha256Bytes(bytes),
    };
  });
}

function scanPythonAst(text, path) {
  const run = spawnSync("python3", ["-c", PYTHON_AST], {
    input: text,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) {
    throw new Error(`independent-symbols python ast spawn failed: ${run.error.message}`);
  }
  if (run.status !== 0) {
    throw new Error(
      `independent-symbols python ast failed: ${String(run.stderr || run.stdout || "exit " + run.status).trim()}`,
    );
  }
  const parsed = JSON.parse(String(run.stdout || "[]"));
  if (!Array.isArray(parsed)) {
    throw new Error("independent-symbols python ast returned a non-array");
  }
  return attachBytes(text, parsed, path, "python", "python-ast");
}

function jsDeclarationEnd(lines, startIndex) {
  let depth = 0;
  let seen = false;
  for (let cursor = startIndex; cursor < lines.length; cursor += 1) {
    for (const char of lines[cursor]) {
      if (char === "{") {
        depth += 1;
        seen = true;
      }
      if (char === "}") depth -= 1;
    }
    if (seen && depth <= 0) return cursor;
  }
  throw new Error(`independent-symbols javascript declaration is unclosed at line ${startIndex + 1}`);
}

function scanJavascriptDeclarations(text, path) {
  const lines = text.split("\n");
  const units = [];
  for (let index = 0; index < lines.length; index += 1) {
    const functionMatch = lines[index].match(JS_FUNCTION);
    const classMatch = functionMatch ? null : lines[index].match(JS_CLASS);
    const match = functionMatch ?? classMatch;
    if (!match?.groups?.name) continue;
    const end = jsDeclarationEnd(lines, index);
    units.push({
      name: match.groups.name,
      kind: functionMatch ? "function" : "class",
      startLine: index + 1,
      endLine: end + 1,
    });
  }
  return attachBytes(text, units, path, "javascript", "javascript-declaration-scan");
}

export function uniqueSymbols(units) {
  const counts = new Map();
  for (const unit of units) {
    counts.set(unit.name, (counts.get(unit.name) ?? 0) + 1);
  }
  return units.filter((unit) => counts.get(unit.name) === 1);
}

export function findUniqueSymbol(units, name) {
  const matches = units.filter((unit) => unit.name === name);
  if (matches.length === 0) {
    throw new Error(`independent-symbols missing unique symbol ${name}`);
  }
  if (matches.length > 1) {
    throw new Error(`independent-symbols symbol ${name} is not unique`);
  }
  return matches[0];
}

export function extractIndependentSymbols({ path, bytes }) {
  const text = String(bytes ?? "").replaceAll("\r\n", "\n");
  const language = languageFor(path);
  if (!language) {
    throw new Error(`independent-symbols has no declaration scan for ${path}`);
  }
  const units = language === "python"
    ? scanPythonAst(text, path)
    : scanJavascriptDeclarations(text, path);
  return {
    path,
    language,
    units,
    unique: uniqueSymbols(units),
  };
}
