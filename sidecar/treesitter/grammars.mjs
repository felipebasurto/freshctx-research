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
  go: `
    (function_declaration
      name: (identifier) @name) @unit
    (method_declaration
      name: (field_identifier) @name) @unit
  `,
  rust: `
    (function_item
      name: (identifier) @name) @unit
  `,
};

const WASM_FILES = {
  python: ["tree-sitter-python", "tree-sitter-python.wasm"],
  javascript: ["tree-sitter-javascript", "tree-sitter-javascript.wasm"],
  typescript: ["tree-sitter-typescript", "tree-sitter-typescript.wasm"],
  tsx: ["tree-sitter-typescript", "tree-sitter-tsx.wasm"],
  go: ["tree-sitter-go", "tree-sitter-go.wasm"],
  rust: ["tree-sitter-rust", "tree-sitter-rust.wasm"],
};

const CLASS_TYPES = new Set(["class_definition", "class_declaration", "abstract_class_declaration"]);
const METHOD_TYPES = new Set(["method_definition", "method_declaration"]);
const FUNCTION_TYPES = new Set([
  "function_definition",
  "function_declaration",
  "generator_function_declaration",
  "function_item",
]);

const NAMED_SCOPE_TYPES = new Map([
  ["class_definition", "class"],
  ["class_declaration", "class"],
  ["abstract_class_declaration", "class"],
  ["impl_item", "class"],
  ["function_definition", "function"],
  ["function_declaration", "function"],
  ["generator_function_declaration", "function"],
  ["function_item", "function"],
  ["method_definition", "method"],
  ["method_declaration", "method"],
]);

const BLOCK_SCOPE_TYPES = new Map([
  ["if_statement", "if"],
  ["if_expression", "if"],
  ["elif_clause", "elif"],
  ["else_clause", "else"],
  ["else_if_clause", "elif"],
  ["for_statement", "for"],
  ["for_in_statement", "for"],
  ["for_expression", "for"],
  ["while_statement", "while"],
  ["while_expression", "while"],
  ["do_statement", "do"],
  ["loop_expression", "loop"],
  ["with_statement", "with"],
  ["match_statement", "match"],
  ["match_expression", "match"],
  ["case_clause", "case"],
  ["match_arm", "case"],
  ["try_statement", "try"],
  ["except_clause", "except"],
  ["except_group_clause", "except"],
  ["catch_clause", "except"],
  ["finally_clause", "finally"],
  ["switch_statement", "switch"],
  ["expression_switch_statement", "switch"],
  ["type_switch_statement", "switch"],
  ["switch_case", "case"],
]);

const IF_LIKE_TYPES = new Set(["if_statement", "if_expression"]);
const ALREADY_BRANCHED = new Set(["elif", "else"]);

function packageFile(pkg, file) {
  return join(dirname(require.resolve(`${pkg}/package.json`)), file);
}

function webTreeSitterWasm(scriptName) {
  return join(dirname(require.resolve("web-tree-sitter")), scriptName);
}

function namedChildrenOf(node) {
  if (node.namedChildren) return node.namedChildren;
  return (node.children ?? []).filter((child) => child.isNamed);
}

function sameNode(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (typeof left.id === "number" && typeof right.id === "number") return left.id === right.id;
  return left.startIndex === right.startIndex && left.endIndex === right.endIndex && left.type === right.type;
}

function nodeContains(parent, node) {
  if (!parent || !node) return false;
  return node.startIndex >= parent.startIndex && node.endIndex <= parent.endIndex;
}

function scopeName(node) {
  if (node.type === "impl_item") {
    return node.childForFieldName("type")?.text ?? null;
  }
  return node.childForFieldName("name")?.text ?? null;
}

function isMethodLike(node) {
  if (METHOD_TYPES.has(node.type)) return true;
  if (!FUNCTION_TYPES.has(node.type)) return false;
  let current = node.parent;
  while (current) {
    const ancestorKind = NAMED_SCOPE_TYPES.get(current.type);
    if (ancestorKind) return ancestorKind === "class";
    current = current.parent;
  }
  return false;
}

function unitKind(node) {
  if (CLASS_TYPES.has(node.type)) return "class";
  if (METHOD_TYPES.has(node.type)) return "method";
  if (FUNCTION_TYPES.has(node.type)) return isMethodLike(node) ? "method" : "function";
  return null;
}

function namedScopeKind(node) {
  const kind = NAMED_SCOPE_TYPES.get(node.type);
  if (!kind) return null;
  if (kind === "function" && isMethodLike(node)) return "method";
  return kind;
}

function anonymousSiblingIndex(node) {
  const parent = node.parent;
  if (!parent) return null;
  const siblings = namedChildrenOf(parent).filter((child) => child.type === node.type);
  if (siblings.length <= 1) return null;
  const index = siblings.findIndex((child) => sameNode(child, node));
  return index >= 0 ? index : null;
}

function ifBranchKind(ifNode, fromChild) {
  const alternative = ifNode.childForFieldName("alternative");
  if (alternative && (sameNode(fromChild, alternative) || nodeContains(alternative, fromChild))) {
    return "else";
  }
  return "if";
}

function formatSegment(segment) {
  if (Number.isInteger(segment.index)) return `${segment.kind}@${segment.index}`;
  if (segment.name) return `${segment.kind} ${segment.name}`;
  return segment.kind;
}

function enclosingSegments(unitNode) {
  const segments = [];
  let current = unitNode.parent;
  let fromChild = unitNode;
  while (current) {
    const namedKind = namedScopeKind(current);
    if (namedKind) {
      const name = scopeName(current);
      if (name) segments.push({ kind: namedKind, name, index: null });
    } else if (IF_LIKE_TYPES.has(current.type)) {
      const fromKind = BLOCK_SCOPE_TYPES.get(fromChild.type);
      if (!ALREADY_BRANCHED.has(fromKind)) {
        const kind = ifBranchKind(current, fromChild);
        const index = anonymousSiblingIndex(current);
        segments.push({ kind, name: null, index });
      }
    } else {
      const blockKind = BLOCK_SCOPE_TYPES.get(current.type);
      if (blockKind) {
        const index = anonymousSiblingIndex(current);
        segments.push({ kind: blockKind, name: null, index });
      }
    }
    fromChild = current;
    current = current.parent;
  }
  segments.reverse();
  const receiver = goReceiverTypeName(unitNode);
  if (receiver && !segments.some((segment) => segment.kind === "class" && segment.name === receiver)) {
    segments.unshift({ kind: "class", name: receiver, index: null });
  }
  return segments;
}

function qualifiedSelector(kind, name, segments) {
  const parts = segments.map(formatSegment);
  parts.push(kind === "class" ? `class ${name}` : `${kind} ${name}`);
  return parts.join("::");
}

function firstTypeIdentifier(node) {
  if (!node) return null;
  if (node.type === "type_identifier") return node.text;
  for (const child of node.children ?? []) {
    const found = firstTypeIdentifier(child);
    if (found) return found;
  }
  return null;
}

function goReceiverTypeName(node) {
  if (node.type !== "method_declaration") return null;
  return firstTypeIdentifier(node.childForFieldName("receiver"));
}

export function inclusiveEndLine(startPosition, endPosition) {
  if (endPosition.column === 0 && endPosition.row > startPosition.row) {
    return endPosition.row;
  }
  return endPosition.row + 1;
}

function unitFromCapture({ path, language, text, unitNode, name }) {
  if (!name || name === "constructor") return null;
  if (unitNode.type === "ERROR" || unitNode.isMissing) return null;
  const kind = unitKind(unitNode);
  if (!kind) return null;
  const startLine = unitNode.startPosition.row + 1;
  const endLine = inclusiveEndLine(unitNode.startPosition, unitNode.endPosition);
  const lines = text.split("\n");
  const slice = lines.slice(startLine - 1, endLine).join("\n");
  const prefix = lines.slice(0, startLine - 1).join("\n");
  const startByte = prefix.length === 0 ? 0 : Buffer.byteLength(`${prefix}\n`);
  return {
    path,
    selector: name,
    qualifiedSelector: qualifiedSelector(kind, name, enclosingSegments(unitNode)),
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
