"""E11 aggregate per arm, preregistered tests and decision (see PROTOCOL-E11.md)."""
import json, glob, collections, sys
NAME = sys.argv[1] if len(sys.argv) > 1 else "e11"
from math import comb

HIT, MISS, OUT = 0.014, 0.44, 1.32  # DeepSeek USD per MTok, as in the runners


def fisher_ge(a, n1, b, n2):
    """One-sided P(first group has >= a successes) under the hypergeometric null."""
    K, N = a + b, n1 + n2
    return sum(comb(n1, k) * comb(n2, K - k) for k in range(a, min(n1, K) + 1)) / comb(N, K)


usd = lambda u: (u["prompt_cache_hit_tokens"] * HIT + u["prompt_cache_miss_tokens"] * MISS + u["completion_tokens"] * OUT) / 1e6
runs = [json.load(open(f)) for f in sorted(glob.glob(f"results/{NAME}/live-*.json"))]
arms = collections.defaultdict(list)
inv = []
for r in runs:
    inv.append({"item": r["item"], "rep": r["rep"], "reads": r["investigate"].get("reads"), "errors": r["investigate"]["errors"],
                "requests": len(r["investigate"]["requests"]), "conclusion": r["investigate"].get("conclusion", "")})
    for a in r["arms"]:
        a["_item"], a["_rep"] = r["item"], r["rep"]
        arms[a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5),
       "spendUsdCached": round(sum(r.get("spendUsdCached", 0) for r in runs), 5),
       "investigations_failed": [(i["item"], i["rep"], i["errors"]) for i in inv if i["errors"]], "arms": {}}
for name in sorted(arms):
    A = arms[name]
    first = [a["submissions"][0] for a in A if a.get("submissions")]
    tot = collections.Counter()
    for a in A: tot.update(a.get("usage", {}))
    passes = sum(a.get("firstSubmissionPass", False) for a in A)
    ev = lambda k: sum(bool(a.get("initialEvidence", {}).get(k)) for a in A)
    out["arms"][name] = {
        "n": len(A), "errors": sum(bool(a["errors"]) for a in A),
        "pass_first": passes, "pass_within_two": sum(a.get("pass", False) for a in A),
        "first_stale_derived": sum(s.get("staleDerived", False) for s in first),
        "first_without_reading": sum(s["toolCalls"] == 0 for s in first),
        "first_without_reading_failed": sum(s["toolCalls"] == 0 and not s["pass"] for s in first),
        "first_after_reading_failed": sum(s["toolCalls"] > 0 and not s["pass"] for s in first),
        "requests_total": sum(len(a["requests"]) for a in A), "reads_total": sum(a.get("reads", 0) for a in A),
        "stale_code_in_first": ev("staleCode"), "current_code_in_first": ev("currentCode"), "tail_applied": ev("tailApplied"),
        "history_preserved": sum(bool(a.get("historyPreserved")) for a in A),
        "prompt_tokens": tot["prompt_tokens"], "hit_share": round(tot["prompt_cache_hit_tokens"] / max(1, tot["prompt_tokens"]), 3),
        "usd_with_cache": round(usd(tot), 5), "usd_per_correct_first": round(usd(tot) / passes, 6) if passes else None,
        "first_fail_items": sorted((a["_item"], a["_rep"], a["submissions"][0]["toolCalls"] if a.get("submissions") else None) for a in A if not a.get("firstSubmissionPass")),
    }
P = {k: (v["pass_first"], v["n"]) for k, v in out["arms"].items()}
if len(P) == 4:
    out["tests"] = {
        "1 F_rule > F_fc": round(fisher_ge(*P["F_rule"], *P["F_fc"]), 4),
        "2 A_rule > A_native": round(fisher_ge(*P["A_rule"], *P["A_native"]), 4),
        "3 F_fc > A_native": float("%.3g" % fisher_ge(*P["F_fc"], *P["A_native"])),
    }
    f, fr = out["arms"]["F_fc"], out["arms"]["F_rule"]
    better = out["tests"]["1 F_rule > F_fc"] < 0.05 or (f["pass_first"] < 34 and fr["pass_first"] >= f["pass_first"] + 4)
    cost_ok = bool(f["usd_per_correct_first"] and fr["usd_per_correct_first"] and fr["usd_per_correct_first"] <= 1.25 * f["usd_per_correct_first"])
    out["decision"] = "propose rule for product" if better and cost_ok else "rule stays in the lab"
iids = sorted({a["_item"] for A in arms.values() for a in A})
out["by_item"] = {i: {n: "".join("✓" if a.get("firstSubmissionPass") else "✗" for a in sorted(A, key=lambda a: a["_rep"]) if a["_item"] == i) for n, A in sorted(arms.items())} for i in iids}
out["investigations"] = inv
json.dump(out, open(f"results/{NAME}_report.json", "w"), indent=1, ensure_ascii=False)
if __name__ == "__main__":
    print("runs", out["runs"], "spend peak", out["spendUsdPeak"], "cached", out["spendUsdCached"])
    print("investigations failed:", out["investigations_failed"])
    print(out.get("tests"), "|", out.get("decision"))
    for n, v in out["arms"].items():
        print(" ", n, {k: v[k] for k in ("n", "errors", "pass_first", "pass_within_two", "first_stale_derived", "first_without_reading", "first_without_reading_failed", "first_after_reading_failed", "requests_total", "reads_total", "stale_code_in_first", "current_code_in_first", "tail_applied", "hit_share", "usd_with_cache", "usd_per_correct_first")})
        print("     fails:", v["first_fail_items"])
    for i, row in out["by_item"].items(): print(" ", i, row)
