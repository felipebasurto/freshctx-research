"""E7 aggregate and exact one-sided Fisher tests."""
import json, glob, collections, statistics as S
from math import comb


def fisher_ge(a, n1, b, n2):
    """One-sided P(first group has >= a successes) under the hypergeometric null."""
    K, N = a + b, n1 + n2
    return sum(comb(n1, k) * comb(n2, K - k) for k in range(a, min(n1, K) + 1)) / comb(N, K)


runs = [json.load(open(f)) for f in sorted(glob.glob("results/e7/live-*.json"))]
arms = collections.defaultdict(list)
for r in runs:
    for a in r["arms"]:
        a["_item"], a["_rep"], a["_gold"] = r["item"], r["rep"], r["gold"]
        arms[a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5), "arms": {}}
for name in sorted(arms):
    A = arms[name]
    first = [a["submissions"][0] for a in A if a.get("submissions")]
    out["arms"][name] = {
        "n": len(A), "errors": sum(bool(a["errors"]) for a in A),
        "pass_first": sum(a.get("firstSubmissionPass", False) for a in A),
        "pass_within_two": sum(a.get("pass", False) for a in A),
        "first_stale_derived": sum(s.get("staleDerived", False) for s in first),
        "first_unparseable": sum(s.get("parsed") is None for s in first),
        "first_without_reading": sum(s["toolCalls"] == 0 for s in first),
        "requests_total": sum(len(a["requests"]) for a in A),
        "reads_total": sum(a.get("reads", 0) for a in A),
        "prompt_tokens": sum(a.get("usage", {}).get("prompt_tokens", 0) for a in A),
        "marker_applied": sum(a.get("initialEvidence", {}).get("markerApplied", False) for a in A),
        "withdrawn": sum(a.get("initialEvidence", {}).get("withdrawn", False) for a in A),
        "current_code_in_first_request": sum(a.get("initialEvidence", {}).get("currentCode", False) for a in A),
        "jev_p": sorted(round(a["jevClaimP"], 2) for a in A if a.get("jevClaimP") is not None),
        "first_fail_items": sorted((a["_item"], a["_rep"]) for a in A if not a.get("firstSubmissionPass")),
    }
P = {k: (v["pass_first"], v["n"]) for k, v in out["arms"].items()}
tests = {}
for hi, lo in [("D_fc_noclaim", "B_fc"), ("C_fc_jev", "B_fc"), ("E_fc_jev_withdraw", "B_fc"), ("E_fc_jev_withdraw", "C_fc_jev")]:
    if hi in P and lo in P:
        tests[f"{hi} > {lo}"] = round(fisher_ge(P[hi][0], P[hi][1], P[lo][0], P[lo][1]), 4)
out["fisher_one_sided_first_pass"] = tests
# per-item view: first-pass per arm, both reps
items = sorted({a["_item"] for A in arms.values() for a in A})
out["by_item"] = {i: {name: [a.get("firstSubmissionPass") for a in sorted(arms[name], key=lambda a: a["_rep"]) if a["_item"] == i] for name in sorted(arms)} for i in items}
json.dump(out, open("results/e7_report.json", "w"), indent=1)
print(json.dumps({k: out[k] for k in ("runs", "spendUsdPeak", "fisher_one_sided_first_pass")}, indent=1))
for n, v in out["arms"].items():
    print(n, {k: v[k] for k in v if k not in ("first_fail_items", "jev_p")})
    print("   fails:", v["first_fail_items"]); print("   jev p:", v["jev_p"])
for i, row in out["by_item"].items():
    print(i, {k[:1]: "".join("✓" if x else "✗" for x in v) for k, v in row.items()})
