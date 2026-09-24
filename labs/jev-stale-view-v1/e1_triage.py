"""E1: can Jev triage failed str_replace edits by cause (outdated view vs whitespace vs misremembered)?
Labels come from the deterministic simulator (sim.py). Jev sees only compact code regions."""
import json, os, sys, time, difflib, random, collections, concurrent.futures as cf
import requests

KEY = os.environ["TYPESAFE_API_KEY"]
URL = "https://api.typesafe.ai/v1/systemone"


def region(text, old, pad=6):
    if not text:
        return None
    tl = text.split("\n")
    ol = [l for l in old.split("\n") if l.strip()]
    if not ol:
        return None
    # anchor on the old_str line that best matches any file line
    best = (0, 0)
    for j, o in enumerate(ol[:5]):
        for i, l in enumerate(tl):
            r = difflib.SequenceMatcher(None, o.strip(), l.strip()).ratio()
            if r > best[0]:
                best = (r, i - j)
    s = max(0, best[1] - pad)
    return "\n".join(tl[s:s + len(old.split("\n")) + 2 * pad])


def build(events):
    items = []
    for e in events:
        if e.get("cause") not in ("stale", "whitespace", "never_seen"):
            continue
        prior = None
        for v in reversed(e["prior_versions"]):
            if v != e["last_seen"]:
                prior = v; break
        st = {
            "file": e["path"].split("/workspace/", 1)[-1],
            "old_str_the_agent_tried_to_replace": e["old"][:1500],
            "current_file_region": region(e["last_seen"], e["old"]),
        }
        if prior:
            st["earlier_version_region"] = region(prior, e["old"])
        if e["edits_since_view"]:
            st["edits_applied_since_agent_last_viewed"] = [
                {"before": o[:400], "after": n[:400]} for o, n in e["edits_since_view"][-3:]]
        items.append(dict(label={"stale": "outdated", "whitespace": "whitespace", "never_seen": "misremembered"}[e["cause"]],
                          state=st, tid=e["tid"], step=e["step"]))
    return items


Q = {
    "cause": {
        "type": "choice",
        "instructions": "An edit tool failed because `old_str_the_agent_tried_to_replace` was not found verbatim in the file. Compare it with `current_file_region` (and `earlier_version_region` if present). Why did it fail?",
        "criteria": {
            "outdated": "old_str matches code as it was in an earlier version of the file, but that code has since been changed by an edit; the agent is working from an outdated view",
            "whitespace": "old_str has the same code content as the current file, differing only in indentation, trailing spaces or blank lines",
            "misremembered": "old_str differs in content from every version shown: lines omitted, reordered, altered or invented, as if written from memory",
        },
    }
}


def ask(item):
    body = {"state": item["state"], "model": "jev-1.13.0", "questions": Q}
    for attempt in range(5):
        t0 = time.time()
        r = requests.post(URL, json=body, headers={"Authorization": f"Bearer {KEY}"}, timeout=60)
        dt = time.time() - t0
        if r.status_code in (429, 529):
            time.sleep(2 ** attempt); continue
        r.raise_for_status()
        j = r.json()
        return dict(item, answer=j["answers"]["cause"], latency=dt, usage=j["usage"])
    raise RuntimeError("rate limited")


if __name__ == "__main__":
    ev = json.load(open(sys.argv[1]))
    items = build(ev)
    print("items", collections.Counter(i["label"] for i in items))
    with cf.ThreadPoolExecutor(8) as ex:
        res = list(ex.map(ask, items))
    json.dump(res, open(sys.argv[2], "w"))
