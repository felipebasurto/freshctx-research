"""E1 v2: atomic Nouls (per TypeSafe guidance), cause decided in code."""
import json, sys, collections, statistics as S, concurrent.futures as cf, time, requests
from e1_triage import build, URL, KEY
Q = {
 "same_ignoring_ws": {"type": "noul", "instructions": "Ignoring indentation, spaces and blank lines, does every line of `old_str_the_agent_tried_to_replace` appear, in the same order and with the same text, inside `current_file_region`?"},
 "in_earlier": {"type": "noul", "instructions": "Does every line of `old_str_the_agent_tried_to_replace` appear, with the same text, inside `earlier_version_region`?",
                "criteria": {"true": "earlier_version_region exists and contains the old_str lines", "false": "earlier_version_region is missing, or it does not contain the old_str lines"}},
}
def ask(item):
    for a in range(5):
        t0=time.time(); r=requests.post(URL,json={"state":item["state"],"model":"jev-1.13.0","questions":Q},headers={"Authorization":f"Bearer {KEY}"},timeout=60)
        if r.status_code in (429,529): time.sleep(2**a); continue
        r.raise_for_status(); j=r.json(); return dict(item,ans={k:v["noul"] for k,v in j["answers"].items()},latency=time.time()-t0,usage=j["usage"])
def decide(a):
    if a["same_ignoring_ws"]>0.5: return "whitespace"
    if a["in_earlier"]>0.5: return "outdated"
    return "misremembered"
items=build(json.load(open(".work/events.json")))
with cf.ThreadPoolExecutor(8) as ex: r=list(ex.map(ask,items))
json.dump(r,open("results/e1v2_results.json","w"))
labs=["outdated","whitespace","misremembered"]
cm=collections.Counter((x["label"],decide(x["ans"])) for x in r)
print(" "*14+" ".join(f"{l[:9]:>10}" for l in labs))
for a in labs: print(f"{a:>14}"+" ".join(f"{cm[(a,b)]:>10}" for b in labs))
print("acc",round(sum(cm[(a,a)] for a in labs)/len(r),3))
for a in labs:
    tp=cm[(a,a)]; p=sum(cm[(b,a)] for b in labs); t=sum(cm[(a,b)] for b in labs); print(a,"P",round(tp/max(1,p),2),"R",round(tp/max(1,t),2))
# "stale" as binary detector: AUC of in_earlier for outdated vs rest
pos=[x["ans"]["in_earlier"] for x in r if x["label"]=="outdated"]; neg=[x["ans"]["in_earlier"] for x in r if x["label"]!="outdated"]
auc=sum((p>n)+0.5*(p==n) for p in pos for n in neg)/(len(pos)*len(neg)); print("AUC in_earlier (outdated vs rest)",round(auc,3))
L=[x["latency"] for x in r]; print("latency p50",round(S.median(L),3),"tokens",sum(x["usage"]["input_tokens"] for x in r))
