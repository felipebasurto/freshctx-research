"""E10 items: the 19 E7 stale items plus 19 controls with the same claim and question, where the edit is an
unrelated comment line and the claim stays true (see PROTOCOL-E10.md)."""
import json, difflib

COMMENT = "# TODO: add type hints"
items = []
for it in json.load(open("results/e7_items.json")):
    items.append({**it, "id": it["id"].replace("e7", "e10s"), "kind": "stale"})
    first = it["before"].split("\n")[0]
    indent = first[: len(first) - len(first.lstrip())]
    after = f"{indent}{COMMENT}\n{it['before']}"
    diff = "\n".join(list(difflib.unified_diff(it["before"].split("\n"), after.split("\n"), lineterm="", n=2))[2:])
    items.append({**it, "id": it["id"].replace("e7", "e10c"), "kind": "control", "after": after, "diff": diff, "gold": not it["gold"]})
json.dump(items, open("results/e10_items.json", "w"), indent=1)
print(len(items), sum(i["kind"] == "control" for i in items), "controls")
