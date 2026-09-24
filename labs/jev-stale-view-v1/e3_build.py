"""E3 candidates: held-out replication of E2 on PRE-edit statements only.
Excludes every trajectory used in E2. One source edit per trajectory. Diff computed on full strings."""
import json, re, random, difflib, pyarrow.parquet as pq
random.seed(20260924)
IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
STOP = set("self None True False return import from class def print with else elif pass raise except try assert lambda yield async await".split())
used = {x["tid"] for x in json.load(open("results/e2_cands.json"))}
rows = [r for r in pq.read_table(".work/rg0.parquet").to_pylist() if r["trajectory_id"] not in used]
random.shuffle(rows)
out = []
for r in rows:
    tr = r["trajectory"]
    for i, m in enumerate(tr):
        hit = None
        for tc in m["tool_calls"] or []:
            if tc["function"]["name"] != "str_replace_editor": continue
            a = json.loads(tc["function"]["arguments"]); p = a.get("path", "")
            if a.get("command") != "str_replace" or not p.endswith(".py") or any(s in p.lower() for s in ("test", "repro", "debug", "verify", "demo")): continue
            if "has been edited" not in ((tr[i + 1]["content"] if i + 1 < len(tr) else "") or ""): continue
            old, new = a["old_str"], a["new_str"]
            diff = "\n".join(list(difflib.unified_diff(old.split("\n"), new.split("\n"), lineterm="", n=2))[2:])
            if not diff.strip(): continue
            ids = {w for w in IDENT.findall(old) if w not in STOP}
            for j in range(i - 1, max(0, i - 25), -1):
                c = tr[j]["content"] if tr[j]["role"] == "assistant" else ""
                if c and len(c) > 120 and sum(w in c for w in ids) >= 2:
                    hit = dict(tid=r["trajectory_id"], path=p.split("/workspace/")[-1], diff=diff[:2500], stmt=c[:1500]); break
            if hit: break
        if hit: out.append(hit); break
    if len(out) >= 150: break
for k, x in enumerate(out): x["id"] = f"e3-{k:03d}"
json.dump(out, open("results/e3_cands.json", "w"), indent=1)
print(len(out))
