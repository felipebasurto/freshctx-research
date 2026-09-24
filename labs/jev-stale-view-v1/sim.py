"""Deterministic stale-view simulator over OpenHands trajectories.

For every file the agent touches through str_replace_editor we keep:
  - versions: list of full texts the agent has *seen or produced* (view / create / applied edit)
  - cur: our best reconstruction of the current file (None if unknown)
  - last_view_step, last_mod_step
Each str_replace call becomes an event with its outcome and a deterministic cause.
"""
import json, re, sys, collections
import pyarrow.parquet as pq

VIEW_HDR = re.compile(r"^Here's the result of running `cat -n` on (\S+?):\n", re.M)
LINE = re.compile(r"^\s*(\d+)\t(.*)$")
BASH_MUT = re.compile(r"(sed\s+-i|>\s*\S|\btee\b|\bpatch\b|git\s+(checkout|stash|apply|reset|restore)|\bmv\b|\bcp\b|\brm\b|open\([^)]*['\"]w)")


def parse_cat(body):
    lines = {}
    for ln in body.split("\n"):
        m = LINE.match(ln)
        if m:
            lines[int(m.group(1))] = m.group(2)
    return lines


def norm_ws(s):
    return re.sub(r"\s+", " ", s).strip()


class F:
    def __init__(self):
        self.cur = None          # full text if known
        self.partial = {}        # line -> text from ranged views
        self.seen = []           # (step, text) history of full versions seen/produced
        self.last_view = -1
        self.last_mod = -1
        self.mods = []           # (step, old_str, new_str) successful edits


def run(traj):
    files = collections.defaultdict(F)
    events = []
    pending = {}  # tool_call_id -> (step, name, args)
    for step, m in enumerate(traj):
        for tc in m.get("tool_calls") or []:
            try:
                a = json.loads(tc["function"]["arguments"])
            except Exception:
                a = {}
            pending[tc["id"]] = (step, tc["function"]["name"], a, m.get("content") or "")
        if m["role"] != "tool":
            continue
        call = pending.pop(m.get("tool_call_id"), None)
        if not call:
            continue
        cstep, name, a, thought = call
        out = m.get("content") or ""
        if name == "execute_bash":
            cmd = a.get("command", "")
            if BASH_MUT.search(cmd):
                for p, f in files.items():
                    if p.rsplit("/", 1)[-1] in cmd:
                        f.cur = None; f.partial = {}; f.last_mod = step
            continue
        if name != "str_replace_editor":
            continue
        path, cmd = a.get("path", ""), a.get("command")
        f = files[path]
        if cmd == "view" and "cat -n" in out[:200]:
            body = VIEW_HDR.split(out, 1)[-1]
            lines = parse_cat(body)
            if not lines:
                continue
            if a.get("view_range"):
                f.partial.update(lines)
            else:
                txt = "\n".join(lines[k] for k in sorted(lines))
                f.cur = txt; f.partial = {}
                f.seen.append((step, txt))
            f.last_view = step
        elif cmd == "create" and "created successfully" in out:
            f.cur = a.get("file_text", ""); f.seen.append((step, f.cur)); f.last_mod = step
            f.last_view = step  # agent authored it
        elif cmd == "str_replace":
            old, new = a.get("old_str") or "", a.get("new_str") or ""
            if "has been edited" in out:
                outcome = "ok"
            elif "did not appear verbatim" in out:
                outcome = "not_verbatim"
            elif "Multiple occurrences" in out:
                outcome = "multiple"
            else:
                outcome = "other_error"
            ev = dict(step=cstep, path=path, old=old, new=new, outcome=outcome,
                      last_view=f.last_view, last_mod=f.last_mod,
                      mod_since_view=f.last_mod > f.last_view,
                      cur_known=f.cur is not None, n_mods=len(f.mods), thought=thought[:1500])
            # cause for not_verbatim
            if outcome == "not_verbatim":
                in_cur = f.cur is not None and old in f.cur
                in_old = any(old in t for s, t in f.seen[:-1]) or any(old == o or old in o for s, o, n in f.mods)
                in_partial = old.strip() and any(old.strip().split("\n")[0].strip() == v.strip() for v in f.partial.values())
                ws = f.cur is not None and norm_ws(old) in norm_ws(f.cur)
                if f.cur is None:
                    cause = "unknown_state"
                elif in_old and not in_cur:
                    cause = "stale"
                elif ws:
                    cause = "whitespace"
                else:
                    cause = "never_seen"
                ev["cause"] = cause
                # context for a judge: last seen text around the most similar region + edits since last view
                ev["last_seen"] = f.cur
                ev["edits_since_view"] = [(o, n) for s, o, n in f.mods if s > f.last_view]
                ev["prior_versions"] = [t for s, t in f.seen[:-1]][-2:]
            events.append(ev)
            if outcome == "ok":
                f.mods.append((step, old, new))
                f.last_mod = step
                if f.cur is not None and old in f.cur:
                    f.cur = f.cur.replace(old, new, 1)
                    f.seen.append((step, f.cur))
                else:
                    f.cur = None
    return events


if __name__ == "__main__":
    t = pq.read_table(sys.argv[1]).to_pylist()
    allev = []
    for r in t:
        evs = run(r["trajectory"])
        for e in evs:
            e.update(tid=r["trajectory_id"], repo=r["repo"], resolved=r["resolved"])
        allev += evs
    json.dump(allev, open(sys.argv[2], "w"))
    c = collections.Counter(e["outcome"] for e in allev)
    print("str_replace events", len(allev), c)
    print("causes", collections.Counter(e.get("cause") for e in allev if e["outcome"] == "not_verbatim"))
    for msv in (False, True):
        sub = [e for e in allev if e["mod_since_view"] == msv]
        nv = sum(e["outcome"] == "not_verbatim" for e in sub)
        print(f"mod_since_view={msv}: n={len(sub)} not_verbatim={nv} ({nv/max(1,len(sub)):.1%})")
    # trajectory-level: resolved rate vs having a stale failure
    by = collections.defaultdict(list)
    for e in allev:
        by[e["tid"]].append(e)
    grp = collections.Counter()
    for tid, evs in by.items():
        st = any(e.get("cause") == "stale" for e in evs)
        grp[(st, evs[0]["resolved"])] += 1
    for st in (False, True):
        n = grp[(st, 0)] + grp[(st, 1)]
        print(f"traj with stale failure={st}: n={n} resolved={grp[(st,1)]/max(1,n):.1%}")
