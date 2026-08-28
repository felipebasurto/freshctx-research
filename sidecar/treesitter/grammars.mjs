import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const QUERIES = {
  python: `
    (class_definition
      name: (identifier) @name) @unit
    (function_definition
      name: (identifier) @name) @unit
  `,
  javascript: `
    (class_declaration
      name: (identifier) @name) @unit
    (function_declaration
      name: (identifier) @name) @unit
    (generator_function_declaration
      name: (identifier) @name) @unit
    (method_definition
      name: (property_identifier) @name) @unit
  `,
  typescript: `
    (class_declaration
      name: [(type_identifier) (identifier)] @name) @unit
    (abstract_class_declaration
      name: (type_identifier) @name) @unit
    (function_declaration
      name: (identifier) @name) @unit
    (generator_function_declaration
      name: (identifier) @name) @unit
    (method_definition
      name: (property_identifier) @name) @unit
  `,
};

const WASM_FILES = {
  python: ["tree-sitter-python", "tree-sitter-python.wasm"],
  javascript: ["tree-sitter-javascript", "tree-sitter-javascript.wasm"],
  typescript: ["tree-sitter-typescript", "tree-sitter-typescript.wasm"],
  tsx: ["tree-sitter-typescript", "tree-sitter-tsx.wasm"],
};

const CLASS_TYPES = new Set(["class_definition", "class_declaration", "abstract_class_declaration"]);
const METHOD_TYPES = new Set(["method_definition"]);
const FUNCTION_TYPES = new Set([
  "function_definition",
  "function_declaration",
  "generator_function_declaration",
]);

function packageFile(pkg, file) {
  return join(dirname(require.resolve(`${pkg}/package.json`)), file);
}

function webTreeSitterWasm(scriptName) {
  return join(dirname(require.resolve("web-tree-sitter")), scriptName);
}

function kindFor(node) {
  if (CLASS_TYPES.has(node.type)) return "class";
  if (METHOD_TYPES.has(node.type)) return "method";
  if (FUNCTION_TYPES.has(node.type)) return "function";
  return null;
}

function enclosingClassName(node) {
  let current = node.parent;
  while (current) {
    if (CLASS_TYPES.has(current.type)) {
      const nameNode = current.childForFieldName("name");
      return nameNode?.text ?? null;
    }
    current = current.parent;
  }
  return null;
}

export function inclusiveEndLine(startPosition, endPosition) {
  if (endPosition.column === 0 && endPosition.row > startPosition.row) {
    return endPosition.row;
  }
  return endPosition.row + 1;
}

function qualifiedSelector(kind, name, className) {
  if (kind === "class") return `class ${name}`;
  if (className) return `class ${className}::method ${name}`;
  return `function ${name}`;
}

function unitFromCapture({ path, language, text, unitNode, name }) {
  if (!name || name === "constructor") return null;
  if (unitNode.type === "ERROR" || unitNode.isMissing) return null;
  const kind = kindFor(unitNode);
  if (!kind) return null;
  const className = kind === "class" ? null : enclosingClassName(unitNode);
  const startLine = unitNode.startPosition.row + 1;
  const endLine = inclusiveEndLine(unitNode.startPosition, unitNode.endPosition);
  const lines = text.split("\n");
  const slice = lines.slice(startLine - 1, endLine).join("\n");
  const prefix = lines.slice(0, startLine - 1).join("\n");
  const startByte = prefix.length === 0 ? 0 : Buffer.byteLength(`${prefix}\n`);
  return {
    path,
    selector: name,
    qualifiedSelector: qualifiedSelector(kind, name, className),
    language,
    startLine,
    endLine,
    byteRange: [startByte, startByte + Buffer.byteLength(slice)],
  };
}

let runtime = null;

async function loadRuntime() {
  if (runtime) return runtime;
  let Parser;
  let Language;
  let Query;
  try {
    ({ Parser, Language, Query } = await import("web-tree-sitter"));
  } catch {
    throw new Error("sidecar-missing");
  }
  await Parser.init({
    locateFile(scriptName) {
      return webTreeSitterWasm(scriptName);
    },
  });
  runtime = { Parser, Language, Query, languages: new Map(), queries: new Map() };
  return runtime;
}

async function languageForKey(key) {
  const loaded = await loadRuntime();
  if (loaded.languages.has(key)) return loaded.languages.get(key);
  const spec = WASM_FILES[key];
  if (!spec) throw new Error("sidecar-missing");
  const wasm = packageFile(spec[0], spec[1]);
  const language = await loaded.Language.load(wasm);
  loaded.languages.set(key, language);
  return language;
}

function queryFor(languageKey, language) {
  const loaded = runtime;
  const queryKey = languageKey === "tsx" ? "typescript" : languageKey;
  if (loaded.queries.has(queryKey)) return loaded.queries.get(queryKey);
  const source = QUERIES[queryKey];
  if (!source) throw new Error("sidecar-missing");
  const query = new loaded.Query(language, source);
  loaded.queries.set(queryKey, query);
  return query;
}

export async function extractTreeSitterUnits({ path, bytes, language }) {
  const grammarKey = path.toLowerCase().endsWith(".tsx") ? "tsx" : language;
  const loaded = await loadRuntime();
  const grammar = await languageForKey(grammarKey);
  const parser = new loaded.Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(bytes);
  if (!tree) {
    parser.delete();
    return { units: [], error: "parse-broken", hasError: true };
  }
  const query = queryFor(grammarKey, grammar);
  const seen = new Set();
  const units = [];
  for (const match of query.matches(tree.rootNode)) {
    const nameNode = match.captures.find((capture) => capture.name === "name")?.node;
    const unitNode = match.captures.find((capture) => capture.name === "unit")?.node;
    if (!nameNode || !unitNode) continue;
    const unit = unitFromCapture({
      path,
      language,
      text: bytes,
      unitNode,
      name: nameNode.text,
    });
    if (!unit) continue;
    const key = `${unit.startLine}:${unit.endLine}:${unit.qualifiedSelector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(unit);
  }
  units.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  const hasError = tree.rootNode.hasError;
  tree.delete();
  parser.delete();
  return { units, error: null, hasError };
}
