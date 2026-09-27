"""E11 items: the 19 E7 edits on the real files at their SWE-rebench base commit (see PROTOCOL-E11.md).
Needs results/e11_meta.json (e11_meta.py) and the files fetched into .work/e11_files/ by this script."""
import json, os, re, urllib.request, hashlib

def neutral(q):  # same mechanical rewrite as e8b/e8c/e9/e10 runners
    q = re.sub(r"^In the current code, is ", "Is ", q)
    q = re.sub(r"\bthe current code\b", "the code", q)
    q = re.sub(r"\bthe current (\S+)", r"the \1", q)
    return re.sub(r" still\b", "", re.sub(r" currently\b", "", q))

meta = {m["id"]: m for m in json.load(open("results/e11_meta.json"))}
os.makedirs(".work/e11_files", exist_ok=True)
items = []
for it in json.load(open("results/e7_items.json")):
    m = meta[it["id"]]; rel = m["path"].split("/", 1)[1]
    cache = f".work/e11_files/{it['id']}.py"
    if not os.path.exists(cache):
        url = f"https://raw.githubusercontent.com/{m['repo']}/{m['base_commit']}/{rel}"
        open(cache, "w").write(urllib.request.urlopen(url, timeout=30).read().decode())
    before = open(cache).read()
    assert before.count(it["before"]) == 1, it["id"]
    after = before.replace(it["before"], it["after"], 1)
    items.append(dict(id=it["id"].replace("e7", "e11"), source=it["id"], repo=m["repo"], base_commit=m["base_commit"], rel=rel,
                      before=before, after=after, before_sha256=hashlib.sha256(before.encode()).hexdigest(),
                      edit_old=it["before"], edit_new=it["after"], diff=it["diff"],
                      question=neutral(it["question"]), original_question=it["question"], gold=it["gold"],
                      lines=len(before.splitlines()), bytes=len(before.encode())))
json.dump(items, open("results/e11_items.json", "w"), indent=1)
print(len(items), "items;", "lines", sorted(i["lines"] for i in items))
