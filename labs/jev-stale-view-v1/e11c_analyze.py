"""E11c aggregate per arm, preregistered tests and decision (see PROTOCOL-E11c.md). Reuses e11_analyze.py for the per-arm table."""
import json, glob, collections, runpy, sys

sys.argv = [sys.argv[0], "e11c"]
base = runpy.run_path("e11_analyze.py")  # writes results/e11c_report.json with the E11 per-arm table
out, fisher_ge = base["out"], base["fisher_ge"]
runs = [json.load(open(f)) for f in sorted(glob.glob("results/e11c/live-*.json"))]

P = {k: (v["pass_first"], v["n"]) for k, v in out["arms"].items()}
out["tests"] = {
    "1 F_fc > A_native": float("%.3g" % fisher_ge(*P["F_fc"], *P["A_native"])),
    "2 F_fc > A_notice": float("%.3g" % fisher_ge(*P["F_fc"], *P["A_notice"])),
    "3 A_notice > A_native": float("%.3g" % fisher_ge(*P["A_notice"], *P["A_native"])),
}
if out["tests"]["2 F_fc > A_notice"] < 0.05:
    out["decision"] = "verified refresh beats a diff notice here"
elif P["F_fc"][0] - P["A_notice"][0] <= 2:
    out["decision"] = "a diff notice is enough here"
else:
    out["decision"] = "inconclusive"

served = collections.Counter()
ambiguous = []
for r in runs:
    for q in r["investigate"]["requests"] + [q for a in r["arms"] for q in a["requests"]]:
        served[q.get("servedModel")] += 1
    for a in r["arms"]:
        if a["arm"] == "F_fc" and a["requests"] and "ambiguous" in json.dumps(a["requests"][0]["payload"]["messages"]):
            ambiguous.append((r["item"], r["rep"]))
out["served_models"] = dict(served)
out["F_fc_first_requests_with_ambiguous"] = ambiguous
json.dump(out, open("results/e11c_report.json", "w"), indent=1, ensure_ascii=False)
print("tests", out["tests"], "|", out["decision"])
print("served models", out["served_models"], "| ambiguous in F_fc first requests:", ambiguous)
