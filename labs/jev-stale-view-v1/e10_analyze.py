"""E10 aggregate per item kind and arm, preregistered tests and decision (see PROTOCOL-E10.md)."""
import json, glob, collections
from math import comb

HIT, MISS, OUT = 0.014, 0.44, 1.32  # DeepSeek USD per MTok, as in the runners


def fisher_ge(a, n1, b, n2):
    """One-sided P(first group has >= a successes) under the hypergeometric null."""
    K, N = a + b, n1 + n2
    return sum(comb(n1, k) * comb(n2, K - k) for k in range(a, min(n1, K) + 1)) / comb(N, K)


def fisher_two(a, n1, b, n2):
    K, N = a + b, n1 + n2
    pmf = lambda k: comb(n1, k) * comb(n2, K - k) / comb(N, K)
    p0 = pmf(a)
    return min(1.0, sum(pmf(k) for k in range(max(0, K - n2), min(n1, K) + 1) if pmf(k) <= p0 * (1 + 1e-9)))


usd = lambda u, cached: ((u["prompt_cache_hit_tokens"] * HIT + u["prompt_cache_miss_tokens"] * MISS) if cached else u["prompt_tokens"] * MISS) / 1e6 + u["completion_tokens"] * OUT / 1e6

runs = [json.load(open(f)) for f in sorted(glob.glob("results/e10/live-*.json"))]
groups = collections.defaultdict(lambda: collections.defaultdict(list))
for r in runs:
    for a in r["arms"]:
        a["_item"], a["_rep"] = r["item"], r["rep"]
        groups[r["kind"]][a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5),
       "spendUsdCached": round(sum(r.get("spendUsdCached", 0) for r in runs), 5), "kinds": {}}
for kind in sorted(groups):
    K = out["kinds"][kind] = {}
    for name in sorted(groups[kind]):
        A = groups[kind][name]
        first = [a["submissions"][0] for a in A if a.get("submissions")]
        tot = collections.Counter()
        for a in A: tot.update(a.get("usage", {}))
        passes = sum(a.get("firstSubmissionPass", False) for a in A)
        K[name] = {
            "n": len(A), "errors": sum(bool(a["errors"]) for a in A),
            "pass_first": passes, "pass_within_two": sum(a.get("pass", False) for a in A),
            "first_stale_derived": sum(s.get("staleDerived", False) for s in first),
            "first_without_reading": sum(s["toolCalls"] == 0 for s in first),
            "first_without_reading_failed": sum(s["toolCalls"] == 0 and not s["pass"] for s in first),
            "first_after_reading_failed": sum(s["toolCalls"] > 0 and not s["pass"] for s in first),
            "requests_total": sum(len(a["requests"]) for a in A), "reads_total": sum(a.get("reads", 0) for a in A),
            "tail_applied": sum(bool(a.get("initialEvidence", {}).get("tailApplied")) for a in A),
            "claim_message_as_warm": sum(bool(a.get("initialEvidence", {}).get("claimMessageAsWarm")) for a in A),
            "warm_ok": sum(a.get("warm", {}).get("status") == 200 for a in A),
            "prompt_tokens": tot["prompt_tokens"], "hit_share": round(tot["prompt_cache_hit_tokens"] / max(1, tot["prompt_tokens"]), 3),
            "usd_with_cache": round(usd(tot, True), 5),
            "usd_per_correct_first_with_cache": round(usd(tot, True) / passes, 6) if passes else None,
            "jev_p": sorted(round(a["jevClaimP"], 2) for a in A if a.get("jevClaimP") is not None),
            "first_fail_items": sorted((a["_item"], a["_rep"], a["submissions"][0]["toolCalls"] if a.get("submissions") else None) for a in A if not a.get("firstSubmissionPass")),
        }
P = lambda kind, arm: (out["kinds"][kind][arm]["pass_first"], out["kinds"][kind][arm]["n"])
if {"stale", "control"} <= out["kinds"].keys():
    s_rule, s_jev, c_rule, c_jev = P("stale", "E_tail_rule"), P("stale", "E_tail"), P("control", "E_tail_rule"), P("control", "E_tail")
    cj, cr = out["kinds"]["control"]["E_tail"]["usd_per_correct_first_with_cache"], out["kinds"]["control"]["E_tail_rule"]["usd_per_correct_first_with_cache"]
    t2 = fisher_ge(*c_jev, *c_rule)
    out["tests"] = {
        "1 stale: E_tail_rule vs E_tail (two-sided)": round(fisher_two(*s_rule, *s_jev), 4),
        "2 control: E_tail > E_tail_rule (one-sided)": round(t2, 4),
        "3 control: B_claim first-pass": P("control", "B_claim"),
        "4 control: Jev p >= 0.5": sum(p >= 0.5 for p in out["kinds"]["control"]["E_tail"]["jev_p"]),
        "5 control: rule / Jev cost per correct first": round(cr / cj, 3) if cj and cr else None,
        "stale: E_tail_rule > B_claim (one-sided)": float("%.3g" % fisher_ge(*s_rule, *P("stale", "B_claim"))),
    }
    out["decision"] = "Jev selectivity has measured value" if t2 < 0.05 or (cj and cr and cr / cj >= 1.25) else "deterministic rule sufficient in this harness"
iids = sorted({a["_item"] for G in groups.values() for A in G.values() for a in A})
out["by_item"] = {i: {n: "".join("✓" if a.get("firstSubmissionPass") else "✗" for a in sorted(A, key=lambda a: a["_rep"]) if a["_item"] == i)
                      for G in groups.values() for n, A in sorted(G.items()) if any(a["_item"] == i for a in A)} for i in iids}
json.dump(out, open("results/e10_report.json", "w"), indent=1, ensure_ascii=False)
if __name__ == "__main__":
    print("runs", out["runs"], "spend peak", out["spendUsdPeak"], "cached", out["spendUsdCached"])
    print(out.get("tests")); print(out.get("decision"))
    for kind, K in out["kinds"].items():
        print("==", kind)
        for n, v in K.items():
            print(" ", n, {k: v[k] for k in ("n", "errors", "pass_first", "pass_within_two", "first_stale_derived", "first_without_reading", "first_without_reading_failed", "first_after_reading_failed", "requests_total", "reads_total", "tail_applied", "claim_message_as_warm", "warm_ok", "prompt_tokens", "hit_share", "usd_with_cache", "usd_per_correct_first_with_cache")})
            print("     fails:", v["first_fail_items"])
