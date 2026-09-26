"""E8 aggregate and exact one-sided Fisher tests (see PROTOCOL-E8.md)."""
import json, glob, collections
from math import comb


def fisher_ge(a, n1, b, n2):
    """One-sided P(first group has >= a successes) under the hypergeometric null."""
    K, N = a + b, n1 + n2
    return sum(comb(n1, k) * comb(n2, K - k) for k in range(a, min(n1, K) + 1)) / comb(N, K)


items = {i["id"]: i for i in json.load(open("results/e7_items.json"))}


def claim_quotes_old(i):
    """Does the claim quote a before-only line of the file (trimmed, >= 12 chars)?"""
    after = {l.strip() for l in i["after"].split("\n")}
    return any(l.strip() in i["claim"] for l in i["before"].split("\n") if len(l.strip()) >= 12 and l.strip() not in after)


runs = [json.load(open(f)) for f in sorted(glob.glob("results/e8/live-*.json"))]
arms = collections.defaultdict(list)
for r in runs:
    for a in r["arms"]:
        a["_item"], a["_rep"], a["_gold"] = r["item"], r["rep"], r["gold"]
        arms[a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5),
       "claims_quoting_old_code": sorted(k for k, i in items.items() if claim_quotes_old(i)), "arms": {}}
for name in sorted(arms):
    A = arms[name]
    first = [a["submissions"][0] for a in A if a.get("submissions")]
    ev = lambda k: sum(bool(a.get("initialEvidence", {}).get(k)) for a in A)
    out["arms"][name] = {
        "n": len(A), "errors": sum(bool(a["errors"]) for a in A),
        "pass_first": sum(a.get("firstSubmissionPass", False) for a in A),
        "pass_within_two": sum(a.get("pass", False) for a in A),
        "first_stale_derived": sum(s.get("staleDerived", False) for s in first),
        "first_unparseable": sum(s.get("parsed") is None for s in first),
        "first_without_reading": sum(s["toolCalls"] == 0 for s in first),
        "first_without_reading_failed": sum(s["toolCalls"] == 0 and not s["pass"] for s in first),
        "first_after_reading_failed": sum(s["toolCalls"] > 0 and not s["pass"] for s in first),
        "requests_total": sum(len(a["requests"]) for a in A),
        "reads_total": sum(a.get("reads", 0) for a in A),
        "prompt_tokens": sum(a.get("usage", {}).get("prompt_tokens", 0) for a in A),
        "completion_tokens": sum(a.get("usage", {}).get("completion_tokens", 0) for a in A),
        "seed_cleared": ev("seedCleared"), "stale_code_outside_claim": ev("staleCodeOutsideClaim"),
        "file_lines_outside_claim": sum(len(a.get("initialEvidence", {}).get("fileLinesOutsideClaim", [])) for a in A),
        "current_code_in_first_request": ev("currentCode"), "claim_present": ev("claimPresent"),
        "marker_applied": ev("markerApplied"), "withdrawn": ev("withdrawn"),
        "history_preserved": sum(bool(a.get("historyPreserved")) for a in A),
        "jev_p": sorted(round(a["jevClaimP"], 2) for a in A if a.get("jevClaimP") is not None),
        "first_fail_items": sorted((a["_item"], a["_rep"], a["submissions"][0]["toolCalls"] if a.get("submissions") else None) for a in A if not a.get("firstSubmissionPass")),
    }
P = {k: (v["pass_first"], v["n"]) for k, v in out["arms"].items()}
tests = {}
for hi, lo in [("D_noclaim", "B_claim"), ("E_jev_withdraw", "B_claim"), ("C_jev_mark", "B_claim"), ("E_jev_withdraw", "C_jev_mark")]:
    if hi in P and lo in P:
        tests[f"{hi} > {lo}"] = round(fisher_ge(P[hi][0], P[hi][1], P[lo][0], P[lo][1]), 4)
out["fisher_one_sided_first_pass"] = tests
iids = sorted({a["_item"] for A in arms.values() for a in A})
out["by_item"] = {i: {name: [a.get("firstSubmissionPass") for a in sorted(arms[name], key=lambda a: a["_rep"]) if a["_item"] == i] for name in sorted(arms)} for i in iids}
out["jev_p_by_item"] = {i: sorted(round(a["jevClaimP"], 2) for A in arms.values() for a in A if a["_item"] == i and a.get("jevClaimP") is not None) for i in iids}
json.dump(out, open("results/e8_report.json", "w"), indent=1)
print(json.dumps({k: out[k] for k in ("runs", "spendUsdPeak", "fisher_one_sided_first_pass", "claims_quoting_old_code")}, indent=1))
for n, v in out["arms"].items():
    print(n, {k: v[k] for k in v if k not in ("first_fail_items", "jev_p")})
    print("   fails (item, rep, reads before first answer):", v["first_fail_items"]); print("   jev p:", v["jev_p"])
for i, row in out["by_item"].items():
    print(i, {k[:1]: "".join("✓" if x else "✗" for x in v) for k, v in row.items()}, out["jev_p_by_item"][i])
