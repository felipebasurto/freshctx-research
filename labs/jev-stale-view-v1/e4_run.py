"""E4: single-call vs fan-out scoring of every earlier assistant message per edit."""
import json, time, statistics as S, concurrent.futures as cf
from e3_run import post, Q  # frozen E2 question, same HTTP helper

QQ = Q["stale"]


def single(args):
    e, s = args
    j, dt = post({"state": {"file": e["path"], "edit_diff": e["diff"], "statement": s["stmt"]},
                  "model": "jev-1.13.0", "questions": Q})
    return s["id"], j["answers"]["stale"]["noul"], dt, j["usage"]["input_tokens"]


def fanout(e):
    qs = {f"q{k}": {"type": "noul", "instructions": {"statement": s["stmt"], "question": QQ["instructions"]},
                    "criteria": QQ["criteria"]} for k, s in enumerate(e["stmts"])}
    j, dt = post({"state": {"file": e["path"], "edit_diff": e["diff"]}, "model": "jev-1.13.0", "questions": qs})
    return {s["id"]: j["answers"][f"q{k}"]["noul"] for k, s in enumerate(e["stmts"])}, dt, j["usage"]["input_tokens"], e["id"]


if __name__ == "__main__":
    E = json.load(open("results/e4_items.json"))
    pairs = [(e, s) for e in E for s in e["stmts"]]
    t0 = time.time()
    with cf.ThreadPoolExecutor(8) as ex:
        SR = list(ex.map(single, pairs))
    wall_single = time.time() - t0
    t0 = time.time()
    FR = [fanout(e) for e in E]  # sequential: latency per edit
    wall_fan = time.time() - t0
    single_p = {i: p for i, p, _, _ in SR}
    fan_p = {i: p for d, _, _, _ in FR for i, p in d.items()}
    # per-edit latency of single mode if an edit's statements were sent in parallel = max; sequential = sum
    lat = {i: dt for i, _, dt, _ in SR}
    per_edit_max = [max(lat[s["id"]] for s in e["stmts"]) for e in E]
    per_edit_sum = [sum(lat[s["id"]] for s in e["stmts"]) for e in E]
    out = {"single": single_p, "fanout": fan_p,
           "latency": {"single_call_p50": round(S.median(lat.values()), 3),
                       "single_per_edit_parallel_max_p50": round(S.median(per_edit_max), 3),
                       "single_per_edit_sequential_sum_p50": round(S.median(per_edit_sum), 3),
                       "fanout_per_edit_p50": round(S.median(dt for _, dt, _, _ in FR), 3),
                       "fanout_per_edit_max": round(max(dt for _, dt, _, _ in FR), 3),
                       "wall_single_8threads": round(wall_single, 1), "wall_fanout_sequential": round(wall_fan, 1)},
           "tokens": {"single": sum(t for *_, t in SR), "fanout": sum(t for _, _, t, _ in FR)}}
    json.dump(out, open("results/e4_scores.json", "w"), indent=1)
    ids = list(single_p)
    a = [single_p[i] for i in ids]; b = [fan_p[i] for i in ids]
    def rank(v): o = sorted(range(len(v)), key=lambda k: v[k]); r = [0]*len(v); [r.__setitem__(k, n) for n, k in enumerate(o)]; return r
    def pear(x, y):
        mx, my = S.mean(x), S.mean(y); return sum((i-mx)*(j-my) for i, j in zip(x, y)) / (sum((i-mx)**2 for i in x) * sum((j-my)**2 for j in y)) ** .5
    print(json.dumps(out["latency"], indent=1), out["tokens"])
    print("n", len(ids), "pearson", round(pear(a, b), 3), "spearman", round(pear(rank(a), rank(b)), 3),
          "max|dp|", round(max(abs(x-y) for x, y in zip(a, b)), 3), "mean|dp|", round(S.mean(abs(x-y) for x, y in zip(a, b)), 3))
    for th in (0.5, 0.7):
        print(f"flag rate @{th}: single {sum(x>=th for x in a)}/{len(a)}  fanout {sum(y>=th for y in b)}/{len(b)}  both {sum(x>=th and y>=th for x,y in zip(a,b))}")
