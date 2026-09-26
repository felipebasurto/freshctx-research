"""E4 scoring: precision of flags, miss rate from the unflagged sample, estimated prevalence and recall."""
import json
S = json.load(open("results/e4_scores.json")); L = json.load(open("labels/e4_author.json"))
lab, flagged, samp = L["labels"], set(L["set"]["flagged"]), L["set"]["unflagged_sample"]
N = len(S["single"]); n_unflag = N - len(flagged)
out = {"n_statements": N, "flagged_union_0.5": len(flagged), "unflagged": n_unflag}
s_pos = sum(lab[i] == "1" for i in samp); s_neg = sum(lab[i] == "0" for i in samp)
miss_rate = s_pos / (s_pos + s_neg)
out["unflagged_sample"] = dict(n=len(samp), pos=s_pos, neg=s_neg, excluded=len(samp) - s_pos - s_neg, pos_rate=round(miss_rate, 3),
                               ids_pos=[i for i in samp if lab[i] == "1"])
est_missed = miss_rate * n_unflag
for mode in ("single", "fanout"):
    for th in (0.5, 0.7):
        fl = [i for i in flagged if S[mode][i] >= th]
        tp = sum(lab[i] == "1" for i in fl); fp = sum(lab[i] == "0" for i in fl); ex = len(fl) - tp - fp
        # positives in union-flagged but below th for this mode count as misses too
        fn_flag = sum(lab[i] == "1" for i in flagged if S[mode][i] < th)
        est_pos = tp + fn_flag + est_missed
        out[f"{mode}@{th}"] = dict(flags=len(fl), tp=tp, fp=fp, excluded=ex, precision=round(tp / max(1, tp + fp), 3),
                                   est_recall=round(tp / est_pos, 3), fp_ids=[i for i in fl if lab[i] == "0"])
labelled_pos = sum(v == "1" for k, v in lab.items() if k in flagged)
out["est_prevalence"] = round((labelled_pos + est_missed) / N, 3)
json.dump(out, open("results/e4_report.json", "w"), indent=1)
print(json.dumps(out, indent=1))
