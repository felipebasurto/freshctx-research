"""E11 metadata: base commit for each E7 item's SWE-rebench instance (column reads over HTTP)."""
import json, fsspec, pyarrow.parquet as pq
E = {e["id"]: e for e in json.load(open("results/e4_items.json"))}
items = json.load(open("results/e7_items.json"))
tids = {E[i["source"]]["tid"] for i in items}
inst = {r["trajectory_id"]: r for r in pq.read_table(".work/rg0.parquet", columns=["trajectory_id", "instance_id", "repo"]).to_pylist() if r["trajectory_id"] in tids}
want = {v["instance_id"] for v in inst.values()}
meta = {}
for split, n in (("test", 2), ("filtered", 1)):
    for k in range(n):
        url = f"https://huggingface.co/api/datasets/nebius/SWE-rebench/parquet/default/{split}/{k}.parquet"
        pf = pq.ParquetFile(fsspec.open(url, block_size=4 * 2**20).open())
        for g in range(pf.num_row_groups):
            for r in pf.read_row_group(g, columns=["instance_id", "repo", "base_commit"]).to_pylist():
                if r["instance_id"] in want: meta[r["instance_id"]] = r
        if len(meta) == len(want): break
    if len(meta) == len(want): break
out = []
for i in items:
    row = inst[E[i["source"]]["tid"]]
    m = meta.get(row["instance_id"], {})
    out.append(dict(id=i["id"], instance_id=row["instance_id"], repo=row["repo"], base_commit=m.get("base_commit"), path=i["path"]))
json.dump(out, open("results/e11_meta.json", "w"), indent=1)
print(len(out), sum(bool(o["base_commit"]) for o in out), "with base_commit")
