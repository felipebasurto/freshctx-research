"""E9 aggregate per arm, preregistered Fisher tests and cache accounting (see PROTOCOL-E9.md)."""
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
runs = [json.load(open(f)) for f in sorted(glob.glob("results/e9/live-*.json"))]
arms = collections.defaultdict(list)
for r in runs:
    for a in r["arms"]:
        a["_item"], a["_rep"] = r["item"], r["rep"]
        arms[a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5),
       "spendUsdCached": round(sum(r.get("spendUsdCached", 0) for r in runs), 5), "arms": {}}
for name in sorted(arms):
    A = arms[name]
    first = [a["submissions"][0] for a in A if a.get("submissions")]
    ev = lambda k: sum(bool(a.get("initialEvidence", {}).get(k)) for a in A)
    tot = collections.Counter(); r1 = collections.Counter()
    for a in A:
        tot.update(a.get("usage", {}))
        if a["requests"]: r1.update(a["requests"][0].get("usage", {}))
    passes = sum(a.get("firstSubmissionPass", False) for a in A)
    out["arms"][name] = {
        "n": len(A), "errors": sum(bool(a["errors"]) for a in A),
        "pass_first": passes, "pass_within_two": sum(a.get("pass", False) for a in A),
        "first_stale_derived": sum(s.get("staleDerived", False) for s in first),
        "first_without_reading": sum(s["toolCalls"] == 0 for s in first),
        "first_without_reading_failed": sum(s["toolCalls"] == 0 and not s["pass"] for s in first),
        "first_after_reading_failed": sum(s["toolCalls"] > 0 and not s["pass"] for s in first),
        "requests_total": sum(len(a["requests"]) for a in A), "reads_total": sum(a.get("reads", 0) for a in A),
        "claim_present": ev("claimPresent"), "withdrawn": ev("withdrawn"), "tail_applied": ev("tailApplied"),
        "claim_message_as_warm": ev("claimMessageAsWarm"), "seed_cleared": ev("seedCleared"),
        "history_preserved": sum(bool(a.get("historyPreserved")) for a in A),
        "warm_ok": sum(a.get("warm", {}).get("status") == 200 for a in A),
        "first_request": {**dict(r1), "hit_share": round(r1["prompt_cache_hit_tokens"] / max(1, r1["prompt_tokens"]), 3)},
        "all_requests": {**dict(tot), "hit_share": round(tot["prompt_cache_hit_tokens"] / max(1, tot["prompt_tokens"]), 3)},
        "usd_no_cache": round(usd(tot, False), 5), "usd_with_cache": round(usd(tot, True), 5),
        "usd_per_correct_first_with_cache": round(usd(tot, True) / passes, 6) if passes else None,
        "jev_p": sorted(round(a["jevClaimP"], 2) for a in A if a.get("jevClaimP") is not None),
        "first_fail_items": sorted((a["_item"], a["_rep"], a["submissions"][0]["toolCalls"] if a.get("submissions") else None) for a in A if not a.get("firstSubmissionPass")),
    }
P = {k: (v["pass_first"], v["n"]) for k, v in out["arms"].items()}
if {"E_tail", "B_claim", "E_jev_withdraw"} <= P.keys():
    out["tests"] = {
        "E_tail > B_claim (one-sided)": float("%.3g" % fisher_ge(*P["E_tail"], *P["B_claim"])),
        "E_jev_withdraw vs E_tail (two-sided)": round(fisher_two(*P["E_jev_withdraw"], *P["E_tail"]), 4),
        "E_jev_withdraw > B_claim (one-sided, replication)": float("%.3g" % fisher_ge(*P["E_jev_withdraw"], *P["B_claim"])),
        "E_tail >= 35/38 (non-inferiority threshold)": P["E_tail"][0] >= 35,
    }
iids = sorted({a["_item"] for A in arms.values() for a in A})
out["by_item"] = {i: {n: "".join("✓" if a.get("firstSubmissionPass") else "✗" for a in sorted(arms[n], key=lambda a: a["_rep"]) if a["_item"] == i) for n in sorted(arms)} for i in iids}
json.dump(out, open("results/e9_report.json", "w"), indent=1, ensure_ascii=False)
print("runs", out["runs"], "spend peak", out["spendUsdPeak"], "cached", out["spendUsdCached"])
print(out.get("tests"))
for n, v in out["arms"].items():
    print(" ", n, {k: v[k] for k in ("n", "errors", "pass_first", "pass_within_two", "first_stale_derived", "first_without_reading", "first_without_reading_failed", "first_after_reading_failed", "requests_total", "reads_total", "claim_present", "withdrawn", "tail_applied", "claim_message_as_warm", "warm_ok", "usd_no_cache", "usd_with_cache", "usd_per_correct_first_with_cache")})
    print("     first req:", v["first_request"], "| all:", v["all_requests"])
    print("     fails:", v["first_fail_items"])
