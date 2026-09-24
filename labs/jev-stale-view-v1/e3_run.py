"""E3: frozen E2 Noul on 150 held-out pre-edit statements. Scores against labels/author.json (+ labels/opus.json if present)."""
import ast, json, os, re, time, statistics as S, concurrent.futures as cf
import requests

URL = "https://api.typesafe.ai/v1/systemone"
KEY = os.environ["TYPESAFE_API_KEY"]
H = {"Authorization": f"Bearer {KEY}"}

# Reuse the E2 question byte-for-byte.
src = open("e2_run.py").read()
Q = ast.literal_eval(next(n for n in ast.parse(src).body
                          if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "Q").value)
TOK = re.compile(r"[A-Za-z_][A-Za-z0-9_\.]{2,}|\d+")


def post(body):
    for a in range(6):
        t0 = time.time()
        r = requests.post(URL, json=body, headers=H, timeout=60)
        dt = time.time() - t0
        if r.status_code in (429, 529):
            time.sleep(2 ** a); continue
        r.raise_for_status()
        return r.json(), dt
    raise RuntimeError("rate limited")


def ask(x):
    j, dt = post({"state": {"file": x["path"], "edit_diff": x["diff"], "statement": x["stmt"]},
                  "model": "jev-1.13.0", "questions": Q})
    return dict(id=x["id"], p=j["answers"]["stale"]["noul"], lat=dt, tok=j["usage"]["input_tokens"], model=j["model"])


def baseline(x):
    rem, add = set(), set()
    for l in x["diff"].split("\n"):
        if l.startswith("-"): rem |= set(TOK.findall(l[1:]))
        if l.startswith("+"): add |= set(TOK.findall(l[1:]))
    only = rem - add
    return len(only & set(TOK.findall(x["stmt"]))) / (1 + len(only))


def auc(P, N):
    return sum((p > n) + .5 * (p == n) for p in P for n in N) / (len(P) * len(N))


def score(R, labels, name):
    it = [r for r in R if labels.get(r["id"]) in ("0", "1")]
    y = {r["id"]: labels[r["id"]] == "1" for r in it}
    out = {"labels": name, "n": len(it), "pos": sum(y.values())}
    for key in ("p", "base"):
        out[f"auc_{key}"] = round(auc([r[key] for r in it if y[r["id"]]], [r[key] for r in it if not y[r["id"]]]), 3)
    for th in (0.3, 0.5, 0.7):
        tp = sum(r["p"] >= th and y[r["id"]] for r in it); fp = sum(r["p"] >= th and not y[r["id"]] for r in it)
        fn = sum(r["p"] < th and y[r["id"]] for r in it)
        out[f"th{th}"] = dict(tp=tp, fp=fp, fn=fn, precision=round(tp / max(1, tp + fp), 3), recall=round(tp / max(1, tp + fn), 3))
    return out


if __name__ == "__main__":
    C = json.load(open("results/e3_cands.json"))
    # network/overhead floor: a trivial request, sequential
    floor = [post({"state": "ok", "model": "jev-1.13.0", "questions": {"q": {"type": "noul", "instructions": "Is this text non-empty?"}}})[1] for _ in range(10)]
    with cf.ThreadPoolExecutor(8) as ex:
        R = list(ex.map(ask, C))
    base = {x["id"]: baseline(x) for x in C}
    for r in R: r["base"] = base[r["id"]]
    json.dump(R, open("results/e3_results.json", "w"), indent=1)
    report = {"latency": {"trivial_p50": round(S.median(floor), 3),
                          "item_p50": round(S.median(r["lat"] for r in R), 3),
                          "item_p90": round(sorted(r["lat"] for r in R)[int(.9 * len(R))], 3)},
              "input_tokens": sum(r["tok"] for r in R), "models": sorted({r["model"] for r in R}), "scores": []}
    for name in ("author", "opus"):
        f = f"labels/{name}.json"
        if os.path.exists(f):
            report["scores"].append(score(R, json.load(open(f))["labels"], name))
    json.dump(report, open("results/e3_report.json", "w"), indent=1)
    print(json.dumps(report, indent=1))
