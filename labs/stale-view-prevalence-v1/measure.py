"""Count model requests that re-send a file view the agent's own edit has since replaced.

Dataset: nebius/SWE-rebench-openhands-trajectories @ 35455389ab51bf5e2306bfd436ef72d0f98bf882
(OpenHands v0.54.0, condenser "noop", history truncation disabled, so each model
request carries every earlier message).

A read is a str_replace_editor `view` of a file. It becomes stale only when the
first event after it that could touch that file is a successful `str_replace`
whose `old_str` appears verbatim inside one contiguous run of the displayed lines
and whose replacement, replayed on those lines, changes the text at some
displayed line number. OpenHands requires `old_str` to occur exactly once in the
file, so that displayed line no longer holds. Events that could touch a file are
successful str_replace/insert/create/undo_edit on its path, shell commands naming
its basename, and shell commands matching RESTORE. A read touched by anything
else first is never counted. A stale window closes at the next such event.
Unobserved writes (e.g. a script that edits the file without naming it) are the
remaining assumption; the reread check in `validation` measures it.
"""

import json
import re
import sys
from collections import Counter

import pyarrow.parquet as pq

VIEW_PREFIX = "Here's the result of running `cat -n` on "
LINE = re.compile(r"^ *(\d+)\t(.*)$")
RESTORE = re.compile(r"\bgit\b[^\n;&|]*\b(checkout|stash|reset|restore|apply|revert|switch|am|pull|merge|rebase|cherry-pick)\b|\bpatch\b|\bcp\b|\bmv\b|\brsync\b|\btar\b|\bunzip\b")


def parse_view(content, path):
    header = VIEW_PREFIX + path + ":\n"
    if not content.startswith(header):
        return None
    lines = {}
    for raw in content[len(header):].split("\n"):
        m = LINE.match(raw)
        if m:
            lines[int(m.group(1))] = m.group(2)
    if not lines:
        return None
    runs, run, prev = [], [], None
    for n in sorted(lines):
        if prev is not None and n != prev + 1:
            runs.append(run)
            run = []
        run.append(n)
        prev = n
    runs.append(run)
    return lines, ["\n".join(lines[n] for n in r) for r in runs]


def changes_lines(run_text, old, new):
    """True if replacing `old` inside the displayed run alters a displayed line number's text.

    Only positions that stay inside known text are compared, so a pure append or a
    shrink that pulls in unseen lines never counts on its own.
    """
    at = run_text.find(old)
    if at < 0:
        return False
    before = run_text.split("\n")
    after = (run_text[:at] + new + run_text[at + len(old):]).split("\n")
    return any(before[k] != after[k] for k in range(min(len(before), len(after))))


def analyse(traj_id, traj, stats, validation):
    calls = {}
    reads = []  # dict(path, idx, bytes, lines, texts, stale_from, stale_until)
    requests = []  # message indices of assistant turns
    first_edit_idx = None

    def touch(path_pred, idx, flag=None):
        """Something may have changed the file: close open stale windows, and let
        only reads that were untouched since they were taken become stale via `flag`."""
        for r in reads:
            if not path_pred(r["path"]):
                continue
            if r["stale_from"] is not None:
                if r["stale_until"] is None:
                    r["stale_until"] = idx
            elif not r["tainted"] and flag is not None and flag(r):
                r["stale_from"] = idx
            else:
                r["tainted"] = True

    for i, m in enumerate(traj):
        role = m["role"]
        if role == "assistant":
            requests.append(i)
            for c in m["tool_calls"] or []:
                calls[c["id"]] = c["function"]
            continue
        if role != "tool":
            continue
        fn = calls.get(m["tool_call_id"])
        if fn is None:
            continue
        try:
            args = json.loads(fn["arguments"])
        except (TypeError, ValueError):
            stats["bad_args"] += 1
            continue
        content = m["content"] or ""
        if m["name"] == "execute_bash":
            cmd = str(args.get("command", ""))
            broad = bool(RESTORE.search(cmd))
            touch(lambda p: broad or p.rsplit("/", 1)[-1] in cmd, i)
            continue
        if m["name"] != "str_replace_editor":
            continue
        command, path = args.get("command"), args.get("path")
        if not isinstance(path, str):
            continue
        if command == "view":
            parsed = parse_view(content, path)
            if parsed is None:
                continue
            lines, texts = parsed
            for r in reads:
                if r["path"] == path and r["stale_from"] is not None and r["stale_until"] is None:
                    shared = [n for n in lines if n in r["lines"]]
                    if len(shared) == len(r["lines"]) and len(lines) >= len(r["lines"]):
                        validation["rereads_covering_stale"] += 1
                        if any(lines[n] != r["lines"][n] for n in shared):
                            validation["reread_differs"] += 1
                        else:
                            validation["reread_identical"] += 1
                            validation.setdefault("identical_examples", []).append((traj_id, path, i))
            reads.append(dict(path=path, idx=i, bytes=len(content.encode()), lines=lines,
                              texts=texts, stale_from=None, stale_until=None, tainted=False))
            stats["file_views"] += 1
            continue
        success = content.startswith(f"The file {path} has been edited.") or content.startswith(
            f"File created successfully at: {path}") or (command == "undo_edit" and not content.startswith("ERROR"))
        if not success:
            continue
        if first_edit_idx is None:
            first_edit_idx = i
        old, new = args.get("old_str"), args.get("new_str")
        flag = None
        if command == "str_replace" and isinstance(old, str) and old and isinstance(new, str) and old != new:
            stats["successful_str_replace"] += 1
            flag = lambda r: any(changes_lines(t, old, new) for t in r["texts"])
        touch(lambda p: p == path, i, flag)

    stats["trajectories"] += 1
    stats["requests"] += len(requests)
    if reads:
        stats["trajectories_with_file_view"] += 1
    if first_edit_idx is not None:
        stats["trajectories_with_edit"] += 1
    traj_hit = False
    per_traj_stale_requests = 0
    stale = []
    for a in requests:
        in_ctx = [r for r in reads if r["idx"] < a]
        stale = [r for r in in_ctx if r["stale_from"] is not None and r["stale_from"] < a
                 and (r["stale_until"] is None or r["stale_until"] > a)]
        view_bytes = sum(r["bytes"] for r in in_ctx)
        stale_bytes = sum(r["bytes"] for r in stale)
        stats["view_bytes_resent"] += view_bytes
        stats["stale_view_bytes_resent"] += stale_bytes
        if first_edit_idx is not None and a > first_edit_idx:
            stats["requests_after_first_edit"] += 1
            if stale:
                stats["requests_after_first_edit_stale"] += 1
        if stale:
            stats["requests_with_stale"] += 1
            per_traj_stale_requests += 1
            traj_hit = True
    if traj_hit:
        stats["trajectories_with_stale_request"] += 1
    if stale:
        stats["trajectories_final_request_stale"] += 1
    stats["hist_stale_requests_per_traj"][per_traj_stale_requests] += 1
    flagged = [r for r in reads if r["stale_from"] is not None]
    stats["reads_ever_stale"] += len(flagged)
    if flagged and len(validation["spot_check"]) < 12 and stats["trajectories"] % 5000 == 1:
        validation["spot_check"].append((traj_id, flagged[0]["idx"], flagged[0]["stale_from"]))


def main(path, limit=None):
    stats = Counter()
    stats["hist_stale_requests_per_traj"] = Counter()
    validation = {"rereads_covering_stale": 0, "reread_differs": 0, "reread_identical": 0, "spot_check": []}
    f = pq.ParquetFile(path)
    seen = 0
    for g in range(f.num_row_groups):
        table = f.read_row_group(g, columns=["trajectory_id", "trajectory"])
        for traj_id, traj in zip(table.column("trajectory_id").to_pylist(), table.column("trajectory").to_pylist()):
            analyse(traj_id, traj, stats, validation)
            seen += 1
            if limit and seen >= limit:
                break
        if limit and seen >= limit:
            break
        print(f"row group {g}: {seen} trajectories", file=sys.stderr)
    hist = stats.pop("hist_stale_requests_per_traj")
    out = dict(stats)
    out["stale_requests_per_trajectory_histogram"] = dict(sorted(hist.items()))
    out["validation"] = {k: v if k != "identical_examples" else v[:20] for k, v in validation.items()}
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None)
