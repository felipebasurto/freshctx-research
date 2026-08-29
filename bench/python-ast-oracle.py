#!/usr/bin/env python3
import ast
import json
import sys


def qualified_selector(kind, name, owner):
    if kind == "class":
        return f"class {name}"
    if owner:
        return f"class {owner}::method {name}"
    return f"function {name}"


def unit_record(path, kind, name, owner, node):
    return {
        "path": path,
        "scope": "symbol",
        "kind": kind,
        "selector": name,
        "qualifiedSelector": qualified_selector(kind, name, owner),
        "language": "python",
        "startLine": int(node.lineno),
        "endLine": int(getattr(node, "end_lineno", None) or node.lineno),
    }


def enumerate_units(path, text):
    tree = ast.parse(text)
    units = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            units.append(unit_record(path, "class", node.name, None, node))
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if child.name == "__init__":
                        continue
                    units.append(unit_record(path, "method", child.name, node.name, child))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            units.append(unit_record(path, "function", node.name, None, node))
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
