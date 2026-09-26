"""E7 items: real stale conclusions (E4, labelled 1 and Jev p>=0.5) with real before/after code and a yes/no question
whose answer the edit flipped. Questions and golds written by the author from the diff, before any E7 model call."""
import json, pyarrow.parquet as pq
Q = {  # edit id: (question, gold answer for the AFTER code)
 "e4-00": ("In the current code, is `.squeeze()` still called on `shotnum` when it is already a 1-D array (ndim == 1)?", False),
 "e4-01": ("Does `_remove_names` currently remove every `name` key regardless of where it appears?", False),
 "e4-02": ("Does `got_update` currently catch exceptions raised by a callback so the remaining callbacks still run?", True),
 "e4-03": ("Does `Submission` currently convert its `attachments` into `File` objects?", True),
 "e4-04": ("Does this file currently import the `re` module?", True),
 "e4-05": ("Does the current code parse the opclass with `self._parse_var(any_token=True)`?", False),
 "e4-06": ("Does the current code handle a `STORED` or `VIRTUAL` keyword after a generated column expression?", True),
 "e4-07": ("Does the current code emit an `ADD` instruction (rather than `COPY`) for `~/.ansible.cfg`?", False),
 "e4-08": ("Does the current code honour the `HY_HISTORY` environment variable for the history file path?", True),
 "e4-09": ("Does the current code keep the parentheses when they contain a `yield` expression?", True),
 "e4-10": ("If the dataframe already has a default RangeIndex (start 0, step 1, stop == len), does the current code still call `reset_index`?", False),
 "e4-15": ("Is `remote_path` currently built with `os.sep`?", False),
 "e4-17": ("Does the current code unpack `parts` into exactly four variables without checking how many columns there are?", False),
 "e4-18": ("Does the current code handle file-like objects that have a `read()` method?", True),
 "e4-20": ("Does this file currently define an `open_async` method?", True),
 "e4-21": ("When `sampled` is None, does the current code set `carrier[_SAMPLED]` to the integer `1`?", False),
 "e4-22": ("Can the current `name` property raise IndexError for an instance that has tags but none with Key 'Name'?", False),
 "e4-23": ("Does the current code convert an empty-string `port` to None?", True),
 "e4-24": ("Does the current lexer have special handling for a lone `-` followed by whitespace?", True),
}
E = {e["id"]: e for e in json.load(open("results/e4_items.json"))}
S = json.load(open("results/e4_scores.json")); L = json.load(open("labels/e4_author.json"))["labels"]
rows = {r["trajectory_id"]: r for r in pq.read_table(".work/rg0.parquet", columns=["trajectory_id", "trajectory"]).to_pylist() if r["trajectory_id"] in {E[k]["tid"] for k in Q}}
items = []
for eid, (q, gold) in Q.items():
    e = E[eid]; m = rows[e["tid"]]["trajectory"][e["edit_step"]]
    a = next(json.loads(tc["function"]["arguments"]) for tc in m["tool_calls"] if tc["function"]["name"] == "str_replace_editor")
    pos = [s for s in e["stmts"] if L.get(s["id"]) == "1" and S["single"][s["id"]] >= 0.5]
    best = max(pos, key=lambda s: S["single"][s["id"]])
    items.append(dict(id=eid.replace("e4", "e7"), source=eid, stmt_id=best["id"], path=e["path"], file=e["path"].rsplit("/", 1)[-1],
                      before=a["old_str"], after=a["new_str"], diff=e["diff"], claim=best["stmt"], question=q, gold=gold,
                      e4_single_p=S["single"][best["id"]]))
json.dump(items, open("results/e7_items.json", "w"), indent=1)
print(len(items), sum(i["gold"] for i in items), "true golds")
