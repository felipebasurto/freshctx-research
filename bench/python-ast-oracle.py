#!/usr/bin/env python3
import ast
import json
import sys

FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
ALREADY_BRANCHED = frozenset({"elif", "else"})
CONTROL_TYPES = {
    ast.For: "for",
    ast.AsyncFor: "for",
    ast.While: "while",
    ast.With: "with",
    ast.AsyncWith: "with",
    ast.Try: "try",
}
if hasattr(ast, "Match"):
    CONTROL_TYPES[ast.Match] = "match"


def is_function(node):
    return isinstance(node, FUNCTION_TYPES)


def is_class(node):
    return isinstance(node, ast.ClassDef)


def build_parents(tree):
    parents = {}

    def visit(node, parent):
        parents[id(node)] = parent
        for child in ast.iter_child_nodes(node):
            visit(child, parent=node)

    visit(tree, None)
    return parents


def sibling_container(node, parents):
    parent = parents.get(id(node))
    if parent is None:
        return []
    for _field, value in ast.iter_fields(parent):
        if isinstance(value, list) and node in value:
            return value
    return []


def anonymous_sibling_index(node, parents, predicate):
    siblings = [item for item in sibling_container(node, parents) if predicate(item)]
    if len(siblings) <= 1:
        return None
    try:
        return siblings.index(node)
    except ValueError:
        return None


def is_elif_if(node, parents):
    if not isinstance(node, ast.If):
        return False
    parent = parents.get(id(node))
    return isinstance(parent, ast.If) and parent.orelse == [node]


def is_method_like(node, parents):
    current = parents.get(id(node))
    while current is not None:
        if is_class(current):
            return True
        if is_function(current):
            return False
        current = parents.get(id(current))
    return False


def named_scope_kind(node, parents):
    if is_class(node):
        return "class"
    if is_function(node):
        return "method" if is_method_like(node, parents) else "function"
    return None


def unit_kind(node, parents):
    return named_scope_kind(node, parents)


def field_of_child(parent, child):
    for field, value in ast.iter_fields(parent):
        if value is child:
            return field
        if isinstance(value, list) and child in value:
            return field
    return None


def block_kind(node, parents):
    if isinstance(node, ast.If) and is_elif_if(node, parents):
        return "elif"
    if isinstance(node, ast.ExceptHandler):
        return "except"
    return CONTROL_TYPES.get(type(node))


def format_segment(kind, name, index):
    if isinstance(index, int):
        return f"{kind}@{index}"
    if name:
        return f"{kind} {name}"
    return kind


def enclosing_segments(node, parents):
    segments = []
    current = parents.get(id(node))
    from_child = node
    while current is not None:
        named = named_scope_kind(current, parents)
        if named:
            name = getattr(current, "name", None)
            if name:
                segments.append((named, name, None))
        elif isinstance(current, ast.If):
            from_kind = block_kind(from_child, parents)
            if from_kind not in ALREADY_BRANCHED:
                field = field_of_child(current, from_child)
                if field == "orelse" and not is_elif_if(from_child, parents):
                    segments.append(("else", None, None))
                elif field == "body":
                    kind = "elif" if is_elif_if(current, parents) else "if"
                    index = anonymous_sibling_index(
                        current,
                        parents,
                        lambda item, k=kind: isinstance(item, ast.If)
                        and (
                            (k == "elif" and is_elif_if(item, parents))
                            or (k == "if" and not is_elif_if(item, parents))
                        ),
                    )
                    segments.append((kind, None, index))
        else:
            kind = block_kind(current, parents)
            if kind:
                index = anonymous_sibling_index(
                    current,
                    parents,
                    lambda item, t=type(current): isinstance(item, t),
                )
                segments.append((kind, None, index))
        from_child = current
        current = parents.get(id(current))
    segments.reverse()
    return segments


def qualified_selector_from_segments(kind, name, segments):
    parts = [format_segment(seg_kind, seg_name, index) for seg_kind, seg_name, index in segments]
    parts.append(f"class {name}" if kind == "class" else f"{kind} {name}")
    return "::".join(parts)


def unit_record(path, kind, name, node, parents):
    return {
        "path": path,
        "scope": "symbol",
        "kind": kind,
        "selector": name,
        "qualifiedSelector": qualified_selector_from_segments(kind, name, enclosing_segments(node, parents)),
        "language": "python",
        "startLine": int(node.lineno),
        "endLine": int(getattr(node, "end_lineno", None) or node.lineno),
    }


def enumerate_units(path, text):
    tree = ast.parse(text)
    parents = build_parents(tree)
    units = []
    for node in ast.walk(tree):
        if is_class(node):
            units.append(unit_record(path, "class", node.name, node, parents))
            continue
        if not is_function(node):
            continue
        if node.name == "__init__" and is_method_like(node, parents):
            continue
        kind = unit_kind(node, parents)
        units.append(unit_record(path, kind, node.name, node, parents))
    units.sort(key=lambda unit: (unit["startLine"], unit["endLine"], unit["qualifiedSelector"]))
    return units


def main():
    raw = sys.stdin.read()
    request = json.loads(raw or "{}")
    path = request.get("path") or "module.py"
    text = str(request.get("bytes") or "").replace("\r\n", "\n")
    try:
        units = enumerate_units(path, text)
    except SyntaxError:
        json.dump({"units": [], "error": "parse-broken"}, sys.stdout)
        return
    except Exception as exc:
        json.dump({"units": [], "error": "oracle-unavailable", "detail": str(exc)}, sys.stdout)
        return
    json.dump({"units": units, "error": None}, sys.stdout)


if __name__ == "__main__":
    main()
