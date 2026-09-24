import json, re, difflib, time, statistics as S, concurrent.futures as cf, requests
from e1_triage import URL, KEY
C=json.load(open("results/e2_cands.json"))
EXCL={8,13,23,24,28}; POS={3,4,7,15,16,18,19,26,29}  # hand labels on PRE messages; all POST labelled fresh
items=[]
for k,x in enumerate(C):
    if k in EXCL: continue
    diff="\n".join(list(difflib.unified_diff(x["old"].split("\n"),x["new"].split("\n"),lineterm="",n=2))[2:])
    for which in ("pre","post"):
        items.append(dict(k=k,which=which,label=int(which=="pre" and k in POS),diff=diff,stmt=x[which],path=x["path"]))
Q={"stale":{"type":"noul",
  "instructions":"`statement` was written by a coding agent. `edit_diff` is an edit applied to `file` (lines starting with - were removed, + were added). Does `statement` make a concrete claim about the code in `file` that was true before the edit but is false after it?",
  "criteria":{"true":"statement describes code, lines, names or behaviour that the edit removed or changed, so the statement is now outdated",
              "false":"statement is a plan, a runtime observation, about another file, or still accurate after the edit"}}}
def ask(it):
    st={"file":it["path"],"edit_diff":it["diff"][:2500],"statement":it["stmt"]}
    for a in range(5):
        t0=time.time(); r=requests.post(URL,json={"state":st,"model":"jev-1.13.0","questions":Q},headers={"Authorization":f"Bearer {KEY}"},timeout=60)
        if r.status_code in (429,529): time.sleep(2**a); continue
        r.raise_for_status(); j=r.json(); return dict(it,p=j["answers"]["stale"]["noul"],lat=time.time()-t0,tok=j["usage"]["input_tokens"])
with cf.ThreadPoolExecutor(8) as ex: R=list(ex.map(ask,items))
# deterministic baseline: fraction of identifiers/tokens on removed lines that the statement mentions
TOK=re.compile(r"[A-Za-z_][A-Za-z0-9_\.]{2,}|\d+")
for r in R:
    rem=set(); add=set()
    for l in r["diff"].split("\n"):
        if l.startswith("-"): rem|=set(TOK.findall(l[1:]))
        if l.startswith("+"): add|=set(TOK.findall(l[1:]))
    only=rem-add; s=set(TOK.findall(r["stmt"]))
    r["base"]=len(only&s)/(1+len(only))
json.dump(R,open("results/e2_results.json","w"),indent=1)
def auc(key):
    P=[r[key] for r in R if r["label"]]; N=[r[key] for r in R if not r["label"]]
    return sum((p>n)+.5*(p==n) for p in P for n in N)/(len(P)*len(N))
print("n",len(R),"pos",sum(r["label"] for r in R))
print("AUC jev",round(auc("p"),3),"| AUC baseline(removed-token overlap)",round(auc("base"),3))
for th in (0.3,0.5,0.7):
    tp=sum(r["p"]>=th and r["label"] for r in R); fp=sum(r["p"]>=th and not r["label"] for r in R); fn=sum(r["p"]<th and r["label"] for r in R)
    print(f"jev th={th}: TP={tp} FP={fp} FN={fn} P={tp/max(1,tp+fp):.2f} R={tp/max(1,tp+fn):.2f}")
print("pre-positives:",[(r["k"],round(r["p"],2)) for r in R if r["label"]])
print("top false positives:",sorted([(round(r["p"],2),r["k"],r["which"]) for r in R if not r["label"]],reverse=True)[:6])
print("lat p50",round(S.median(r["lat"] for r in R),3),"tokens",sum(r["tok"] for r in R))
