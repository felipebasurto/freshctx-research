"""E8c aggregate per arm and exact one-sided Fisher tests (see PROTOCOL-E8c.md)."""
import json, glob, collections
from math import comb


def fisher_ge(a, n1, b, n2):
    """One-sided P(first group has >= a successes) under the hypergeometric null."""
    K, N = a + b, n1 + n2
    return sum(comb(n1, k) * comb(n2, K - k) for k in range(a, min(n1, K) + 1)) / comb(N, K)


runs = [json.load(open(f)) for f in sorted(glob.glob("results/e8c/live-*.json"))]
cells = collections.defaultdict(lambda: collections.defaultdict(list))
for r in runs:
    for a in r["arms"]:
        a["_item"], a["_rep"] = r["item"], r["rep"]
        cells[r["cell"]][a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5), "cells": {}}
for cell in sorted(cells):
    C = out["cells"][cell] = {"arms": {}}
    for name in sorted(cells[cell]):
        A = cells[cell][name]
        first = [a["submissions"][0] for a in A if a.get("submissions")]
        ev = lambda k: sum(bool(a.get("initialEvidence", {}).get(k)) for a in A)
        C["arms"][name] = {
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
            "seed_cleared": ev("seedCleared"), "seed_removed": ev("seedRemoved"),
            "file_lines_outside_claim": sum(len(a.get("initialEvidence", {}).get("fileLinesOutsideClaim", [])) for a in A),
            "current_code_in_first_request": ev("currentCode"), "claim_present": ev("claimPresent"), "withdrawn": ev("withdrawn"), "withdrawn_quiet": ev("withdrawnQuiet"), "marker_applied": ev("markerApplied"),
            "history_preserved": sum(bool(a.get("historyPreserved")) for a in A),
            "jev_p": sorted(round(a["jevClaimP"], 2) for a in A if a.get("jevClaimP") is not None),
            "first_fail_items": sorted((a["_item"], a["_rep"], a["submissions"][0]["toolCalls"] if a.get("submissions") else None) for a in A if not a.get("firstSubmissionPass")),
            "no_read_items": sorted((a["_item"], a["_rep"], a["submissions"][0]["pass"]) for a in A if a.get("submissions") and a["submissions"][0]["toolCalls"] == 0),
        }
    P = {k: (v["pass_first"], v["n"]) for k, v in C["arms"].items()}
    C["fisher_one_sided_first_pass"] = {f"{hi} > {lo}": round(fisher_ge(*P[hi], *P[lo]), 4)
                                         for hi, lo in [("E_jev_withdraw", "E_quiet"), ("D_warn", "D_noclaim"), ("E_quiet", "B_claim"), ("C_jev_mark", "B_claim"), ("E_jev_withdraw", "B_claim"), ("D_noclaim", "B_claim")] if hi in P and lo in P}
    iids = sorted({a["_item"] for A in cells[cell].values() for a in A})
    C["by_item"] = {i: {n: "".join("✓" if a.get("firstSubmissionPass") else "✗" for a in sorted(cells[cell][n], key=lambda a: a["_rep"]) if a["_item"] == i) for n in sorted(cells[cell])} for i in iids}
json.dump(out, open("results/e8c_report.json", "w"), indent=1, ensure_ascii=False)
print("runs", out["runs"], "spend", out["spendUsdPeak"])
for cell, C in out["cells"].items():
    print("==", cell, C["fisher_one_sided_first_pass"])
    for n, v in C["arms"].items():
        print(" ", n, {k: v[k] for k in ("n", "errors", "pass_first", "pass_within_two", "first_stale_derived", "first_unparseable", "first_without_reading", "first_without_reading_failed", "first_after_reading_failed", "requests_total", "reads_total", "prompt_tokens", "claim_present", "withdrawn", "withdrawn_quiet", "marker_applied")})
        print("     fails:", v["first_fail_items"], "| no-read:", v["no_read_items"])
