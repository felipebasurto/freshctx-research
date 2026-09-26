"""E9 side estimate: tokens behind the earliest Jev-flagged message on the E4 edits, and the one-off cost of rewriting it in place (chars/4, DeepSeek prices)."""
import json, statistics as st, pyarrow.parquet as pq
items = json.load(open("results/e4_items.json")); sc = json.load(open("results/e4_scores.json"))["single"]
tids = {e["tid"] for e in items}
rows = {r["trajectory_id"]: r["trajectory"] for r in pq.read_table(".work/rg0.parquet").to_pylist() if r["trajectory_id"] in tids}
tok = lambda m: (len(m.get("content") or "") + sum(len(tc["function"]["arguments"]) for tc in (m.get("tool_calls") or []))) / 4
res = []
for e in items:
    tr = rows[e["tid"]]; ctx = sum(tok(m) for m in tr[:e["edit_step"] + 2])
    flagged = [s["step"] for s in e["stmts"] if sc[s["id"]] >= 0.5]
    after = sum(tok(m) for m in tr[min(flagged):e["edit_step"] + 2]) if flagged else 0
    remaining = sum(1 for m in tr[e["edit_step"] + 2:] if m["role"] == "assistant")
    res.append(dict(ctx=ctx, after=after, share=after / ctx, flagged=len(flagged), remaining=remaining))
f = [r for r in res if r["flagged"]]
print("edits", len(res), "with flagged", len(f))
print("context tokens at edit, median", round(st.median(r["ctx"] for r in res)))
print("tokens after earliest flagged msg, median", round(st.median(r["after"] for r in f)), "share median", round(st.median(r["share"] for r in f), 2))
pen = [r["after"] * (0.44 - 0.014) / 1e6 for r in f]
print("one-off rewrite penalty USD median %.5f max %.5f" % (st.median(pen), max(pen)))
print("vs one uncached request of full context, median USD %.5f; cached %.5f" % (st.median(r["ctx"] for r in res) * 0.44 / 1e6, st.median(r["ctx"] for r in res) * 0.014 / 1e6))
print("remaining model calls after edit, median", st.median(r["remaining"] for r in res))
