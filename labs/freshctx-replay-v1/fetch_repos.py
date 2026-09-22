"""Shallow-fetch each sampled trajectory's SWE-rebench base_commit into repos/<instance_id>."""

import glob
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import pyarrow.parquet as pq


def fetch(job):
    iid, repo, commit, out = job
    d = os.path.join(out, iid)
    if os.path.isdir(os.path.join(d, ".git")):
        return iid, "cached"
    os.makedirs(d, exist_ok=True)
    try:
        subprocess.run(["git", "init", "-q", d], check=True, capture_output=True)
        subprocess.run(["git", "-C", d, "fetch", "-q", "--depth", "1", f"https://github.com/{repo}.git", commit],
                       check=True, capture_output=True, timeout=300)
        head = subprocess.run(["git", "-C", d, "rev-parse", "FETCH_HEAD"], check=True, capture_output=True, text=True).stdout.strip()
        return iid, "ok" if head == commit else f"mismatch {head}"
    except Exception as e:
        subprocess.run(["rm", "-rf", d])
        return iid, f"failed {type(e).__name__}"


def main(trajectories, meta_glob, stride, out):
    meta = {}
    for p in glob.glob(meta_glob):
        for r in pq.read_table(p, columns=["instance_id", "repo", "base_commit"]).to_pylist():
            meta[r["instance_id"]] = (r["repo"], r["base_commit"])
    ids = pq.read_table(trajectories, columns=["instance_id"]).column("instance_id").to_pylist()
    sample = sorted({ids[k] for k in range(0, len(ids), stride)})
    jobs = [(i, *meta[i], out) for i in sample]
    with ThreadPoolExecutor(16) as pool:
        results = dict(pool.map(fetch, jobs))
    print(json.dumps({"instances": len(jobs), "status": {s: sum(1 for v in results.values() if v == s) for s in set(results.values())}}, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4])
