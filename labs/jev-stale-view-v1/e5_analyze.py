"""E5 aggregate: per-arm pass rates, stale-derived answers, requests, reads, Jev p, spend."""
import json, glob, collections, re, sys, statistics as S

pattern, report_path = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("results/e5/live-[!e]*.json", "results/e5_report.json")

runs = [json.load(open(f)) for f in sorted(glob.glob(pattern))]
arms = collections.defaultdict(list)
for r in runs:
    for a in r["arms"]:
        a["_task"], a["_rep"] = r["task"], r["rep"]
        arms[a["arm"]].append(a)
out = {"runs": len(runs), "spendUsdPeak": round(sum(r.get("spendUsdPeak", 0) for r in runs), 5), "arms": {}}
for name in sorted(arms):
    A = arms[name]
    sub1 = [a["submissions"][0] for a in A if a.get("submissions")]
    out["arms"][name] = {
        "n": len(A),
        "errors": sum(bool(a["errors"]) for a in A),
        "pass_first": sum(a.get("firstSubmissionPass", False) for a in A),
        "pass_within_two": sum(a.get("pass", False) for a in A),
        "first_answer_stale_derived": sum(s.get("staleDerived", False) for s in sub1),
        "requests_to_pass_median": S.median([a["requestsToPass"] for a in A if a.get("requestsToPass")] or [0]),
        "requests_total": sum(len(a["requests"]) for a in A),
        "reads_total": sum(a.get("reads", 0) for a in A),
        "zero_read_runs": sum(a.get("reads", 0) == 0 for a in A),
        "jev_claim_p": [round(a["jevClaimP"], 2) for a in A if a.get("jevClaimP") is not None],
        "marker_applied": sum(a.get("initialEvidence", {}).get("markerApplied", False) for a in A),
        "prompt_tokens": sum(a.get("usage", {}).get("prompt_tokens", 0) for a in A),
        "first_answer_without_reading": sum(a["submissions"][0]["toolCalls"] == 0 for a in A if a.get("submissions")),
        "first_fail_without_reading": sum(a["submissions"][0]["toolCalls"] == 0 and not a["submissions"][0]["pass"] for a in A if a.get("submissions")),
        "first_answers": [(a["_task"], a["_rep"], a["submissions"][0]["answer"][:40]) for a in A if a.get("submissions") and not a["submissions"][0]["pass"]],
    }
    out["arms"][name]["by_task"] = {t: [(a["_rep"], a.get("firstSubmissionPass"), a.get("pass"), a["submissions"][0]["staleDerived"] if a.get("submissions") else None, a.get("reads"))
                                        for a in A if a["_task"] == t] for t in sorted({a["_task"] for a in A})}
json.dump(out, open(report_path, "w"), indent=1)
print(json.dumps({k: v for k, v in out.items() if k != "arms"}, indent=1))
for n, v in out["arms"].items():
    print(n, {k: v[k] for k in v if k != "by_task"})
