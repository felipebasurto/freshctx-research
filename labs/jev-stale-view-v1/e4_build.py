"""E4 items: all earlier assistant messages (>=80 chars, nearest 30) for 25 held-out source edits."""
import json, random, difflib, pyarrow.parquet as pq
random.seed(4)
used = {x["tid"] for x in json.load(open("results/e2_cands.json"))} | {x["tid"] for x in json.load(open("results/e3_cands.json"))}
rows = [r for r in pq.read_table(".work/rg0.parquet").to_pylist() if r["trajectory_id"] not in used]
random.shuffle(rows)
edits = []
for r in rows:
    tr = r["trajectory"]
    for i, m in enumerate(tr):
        hit = None
        for tc in m["tool_calls"] or []:
            if tc["function"]["name"] != "str_replace_editor": continue
            a = json.loads(tc["function"]["arguments"]); p = a.get("path", "")
            if a.get("command") != "str_replace" or not p.endswith(".py") or any(s in p.lower() for s in ("test", "repro", "debug", "verify", "demo")): continue
            if "has been edited" not in ((tr[i + 1]["content"] if i + 1 < len(tr) else "") or ""): continue
            diff = "\n".join(list(difflib.unified_diff(a["old_str"].split("\n"), a["new_str"].split("\n"), lineterm="", n=2))[2:])
            if not diff.strip(): continue
            stmts = [dict(step=j, stmt=tr[j]["content"][:1500]) for j in range(i - 1, -1, -1)
                     if tr[j]["role"] == "assistant" and len((tr[j]["content"] or "").strip()) >= 80][:30]
            if len(stmts) >= 5:
                hit = dict(tid=r["trajectory_id"], edit_step=i, path=p.split("/workspace/")[-1], diff=diff[:2500], stmts=stmts)
            break
        if hit: edits.append(hit); break
    if len(edits) >= 25: break
for k, e in enumerate(edits):
    e["id"] = f"e4-{k:02d}"
    for s in e["stmts"]: s["id"] = f"{e['id']}-s{s['step']}"
json.dump(edits, open("results/e4_items.json", "w"), indent=1)
print(len(edits), sum(len(e["stmts"]) for e in edits))
