import json, re, random, pyarrow.parquet as pq
random.seed(7)
IDENT=re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
STOP=set("self None True False return import from class def print with else elif pass raise except try assert lambda yield async await".split())
rows=pq.read_table(".work/rg0.parquet").to_pylist(); random.shuffle(rows)
out=[]
for r in rows:
    tr=r["trajectory"]
    for i,m in enumerate(tr):
        done=False
        for tc in m["tool_calls"] or []:
            if tc["function"]["name"]!="str_replace_editor": continue
            a=json.loads(tc["function"]["arguments"])
            p=a.get("path","")
            if a.get("command")!="str_replace" or "test" in p.lower() or "repro" in p.lower() or "debug" in p.lower() or not p.endswith(".py"): continue
            res=tr[i+1]["content"] if i+1<len(tr) else ""
            if "has been edited" not in (res or ""): continue
            old,new=a["old_str"],a["new_str"]
            ids={w for w in IDENT.findall(old) if w not in STOP}
            changed={w for w in ids|set(IDENT.findall(new)) if (w in old)!=(w in new) or True}
            def pick(rng):
                for j in rng:
                    c=tr[j]["content"] if tr[j]["role"]=="assistant" else ""
                    if c and len(c)>120 and sum(w in c for w in ids)>=2: return c
            pre=pick(range(i-1,max(0,i-25),-1)); post=pick(range(i+2,min(len(tr),i+25)))
            if pre and post:
                out.append(dict(tid=r["trajectory_id"],path=p.split("/workspace/")[-1],old=old[:1200],new=new[:1200],pre=pre[:1500],post=post[:1500]))
                done=True; break
        if done: break
    if len(out)>=30: break
json.dump(out,open("results/e2_cands.json","w"),indent=1)
print(len(out))
