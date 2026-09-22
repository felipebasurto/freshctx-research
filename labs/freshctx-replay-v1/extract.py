"""Rebuild workspace state for sampled trajectories so the real FreshCtx engine can replay them.

Reads nebius/SWE-rebench-openhands-trajectories and writes one JSON line per
sampled trajectory: an event script of file writes, observed views and model
requests, cut at the first event the rebuild cannot follow exactly.

A file's first content comes from the task repository at its SWE-rebench
base_commit, a successful `create`, or (without a checkout) a full `view`.
Successful `str_replace` / `insert` edits are applied exactly as OpenHands does.
Every view must match the rebuild line for line, or the script is cut there.
It is also cut at a str_replace whose old_str is not unique in the rebuild, at
undo_edit, at edits to files containing tabs (the editor may expand them), and
at a shell command that could write (see READ_ONLY) and names an observed file
or matches RESTORE while any file is known. A file named by such a command
before it is loaded is never loaded from the base commit.
"""

import json
import os
import re
import subprocess
import sys
from collections import Counter

import pyarrow.parquet as pq

VIEW_PREFIX = "Here's the result of running `cat -n` on "
CLIP = "<response clipped>"
LINE = re.compile(r"^ *(\d+)\t(.*)$")
RESTORE = re.compile(r"\bgit\b|\bpatch\b|\bcp\b|\bmv\b|\brsync\b|\btar\b|\bunzip\b")
ROOT = re.compile(r"<uploaded_files>\s*\n(/workspace/[^\n]+?)\s*\n</uploaded_files>")
READ_ONLY = {"cd", "grep", "egrep", "fgrep", "rg", "cat", "head", "tail", "wc", "ls", "nl", "sort", "uniq", "pwd", "echo", "diff", "file", "stat"}
READ_ONLY_GIT = {"diff", "status", "log", "show", "blame"}
WRITE_HINTS = (">", "`", "$(", "<(", "tee", " -i", "--in-place", "-delete", "-exec", "xargs", "--output")


def read_only(cmd):
    if any(h in cmd for h in WRITE_HINTS):
        return False
    for seg in re.split(r"&&|\|\||;|\||\n", cmd):
        words = seg.split()
        if not words:
            continue
        if words[0] == "git" and len(words) > 1 and words[1] in READ_ONLY_GIT:
            continue
        if words[0] not in READ_ONLY:
            return False
    return True


def nbytes(s):
    return len(s.encode("utf-8")) if s else 0


def message_bytes(m):
    total = nbytes(m.get("content"))
    for c in m.get("tool_calls") or []:
        total += nbytes(c["function"].get("arguments"))
    return total


def parse_view(content, path):
    """Return (start_line, complete_lines, partial_last_line_prefix_or_None) or None/"unparsed"."""
    header = VIEW_PREFIX + path + ":\n"
    if not content.startswith(header):
        return None
    body = content[len(header):]
    partial = None
    if CLIP in body:
        body = body[:body.index(CLIP)]
        body, _, partial = body.rpartition("\n")
        m = LINE.match(partial)
        partial = (int(m.group(1)), m.group(2)) if m else None
    raw = body.split("\n")
    if raw and raw[-1] == "":
        raw = raw[:-1]
    lines = []
    for r in raw:
        m = LINE.match(r)
        if not m:
            return "unparsed"
        lines.append((int(m.group(1)), m.group(2)))
    if not lines or any(n != lines[0][0] + k for k, (n, _) in enumerate(lines)):
        return "unparsed"
    if partial and partial[0] != lines[-1][0] + 1:
        return "unparsed"
    return lines[0][0], [t for _, t in lines], partial and partial[1]


class Repo:
    def __init__(self, directory):
        self.directory = directory if directory and os.path.isdir(directory) else None

    def read(self, rel):
        if self.directory is None:
            return None
        r = subprocess.run(["git", "-C", self.directory, "cat-file", "blob", f"FETCH_HEAD:{rel}"], capture_output=True)
        if r.returncode:
            return None
        try:
            return r.stdout.decode("utf-8")
        except UnicodeDecodeError:
            return None


def script(traj, repo):
    root = None
    for m in traj:
        if m["role"] == "user":
            hit = ROOT.search(m["content"] or "")
            if hit:
                root = hit.group(1)
            break
    if root is None:
        return None, "no_root"
    prefix = root + "/"
    state, observed, poisoned = {}, set(), set()
    writer_cmds, restore_seen = [], False
    events, calls = [], {}
    base = 0

    def done(reason):
        return {"root": root, "events": events, "cut": reason}, reason

    def load(rel):
        if rel in poisoned or restore_seen or any(rel.rsplit("/", 1)[-1] in c for c in writer_cmds):
            return None
        return repo.read(rel)

    for i, m in enumerate(traj):
        if m["role"] == "assistant":
            events.append({"op": "request", "i": i, "base_bytes": base})
            for c in m["tool_calls"] or []:
                calls[c["id"]] = c["function"]
        base += message_bytes(m)
        if m["role"] != "tool":
            continue
        fn = calls.get(m["tool_call_id"])
        if fn is None:
            continue
        try:
            args = json.loads(fn["arguments"])
        except (TypeError, ValueError):
            return done("bad_args")
        content = m["content"] or ""
        if m["name"] == "execute_bash":
            cmd = str(args.get("command", ""))
            if read_only(cmd):
                continue
            writer_cmds.append(cmd)
            if RESTORE.search(cmd):
                if state:
                    return done("shell_may_restore_files")
                restore_seen = True
            for p in list(state):
                if p.rsplit("/", 1)[-1] in cmd:
                    if p in observed:
                        return done("shell_may_write_observed_file")
                    del state[p]
                    poisoned.add(p)
            continue
        if m["name"] != "str_replace_editor":
            continue
        command, path = args.get("command"), args.get("path")
        if not isinstance(path, str) or not path.startswith(prefix):
            continue
        rel = path[len(prefix):]
        if command == "view":
            parsed = parse_view(content, path)
            if parsed is None:
                continue
            if parsed == "unparsed":
                return done("unparsed_view")
            start, shown, partial = parsed
            full = ("view_range" not in args or args.get("view_range") in (None, [])) and partial is None
            if rel not in state:
                text = load(rel)
                if text is None:
                    if not (full and start == 1) or repo.directory is not None:
                        return done("file_content_unknown")
                    text = "\n".join(shown)
                state[rel] = text
                events.append({"op": "write", "path": rel, "text": text})
            current = state[rel].split("\n")
            end = start - 1 + len(shown)
            if current[start - 1:end] != shown or (full and len(current) != len(shown)) or (
                    partial is not None and (len(current) <= end or not current[end].startswith(partial))):
                return done("view_disagrees_with_rebuild")
            observed.add(rel)
            events.append({"op": "view", "rid": m["tool_call_id"], "path": rel, "start_line": start,
                           "text": "\n".join(shown), "native_bytes": nbytes(content)})
            continue
        if command == "undo_edit":
            if not content.startswith("ERROR"):
                return done("undo_edit")
            continue
        ok = content.startswith(f"The file {path} has been edited.") or content.startswith(
            f"File created successfully at: {path}")
        if not ok:
            continue
        if command == "create":
            state[rel] = args.get("file_text") or ""
            poisoned.discard(rel)
        else:
            if rel not in state:
                text = load(rel)
                if text is None:
                    poisoned.add(rel)
                    continue
                state[rel] = text
            old, new = args.get("old_str") or "", args.get("new_str") or ""
            if "\t" in state[rel] or "\t" in old or "\t" in new:
                return done("tabs_editor_may_expand")
            if command == "str_replace":
                if not old or state[rel].count(old) != 1:
                    return done("str_replace_not_unique_in_rebuild")
                state[rel] = state[rel].replace(old, new)
            elif command == "insert":
                lines = state[rel].split("\n")
                k = int(args.get("insert_line"))
                state[rel] = "\n".join(lines[:k] + new.split("\n") + lines[k:])
            else:
                continue
        events.append({"op": "write", "path": rel, "text": state[rel]})
        snippet = parse_snippet(content)
        if snippet is not None:
            start, shown = snippet
            if state[rel].split("\n")[start - 1:start - 1 + len(shown)] != shown:
                return done("edit_snippet_disagrees_with_rebuild")
            events.append({"op": "snippet", "path": rel, "start_line": start, "text": "\n".join(shown)})
    return {"root": root, "events": events, "cut": None}, "complete"


def parse_snippet(content):
    """The `cat -n` snippet OpenHands prints after a successful str_replace/insert."""
    marker = "Here's the result of running `cat -n` on a snippet of "
    at = content.find(marker)
    if at < 0:
        return None
    body = content[content.index(":\n", at) + 2:]
    end = body.find("\nReview the changes")
    if end < 0:
        return None
    lines = []
    for r in body[:end].split("\n"):
        m = LINE.match(r)
        if not m:
            return None
        lines.append((int(m.group(1)), m.group(2)))
    if lines and lines[-1][1] == "":
        # OpenHands pads the snippet with an empty last line even when the file line is not empty.
        lines.pop()
    if not lines or any(n != lines[0][0] + k for k, (n, _) in enumerate(lines)):
        return None
    return lines[0][0], [t for _, t in lines]


def main(path, stride, out_path, repos_dir):
    f = pq.ParquetFile(path)
    reasons, n = Counter(), 0
    with open(out_path, "w") as out:
        for g in range(f.num_row_groups):
            table = f.read_row_group(g, columns=["trajectory_id", "instance_id", "trajectory"])
            for tid, iid, traj in zip(table.column("trajectory_id").to_pylist(), table.column("instance_id").to_pylist(),
                                      table.column("trajectory").to_pylist()):
                n += 1
                if (n - 1) % stride:
                    continue
                s, reason = script(traj, Repo(repos_dir and os.path.join(repos_dir, iid)))
                reasons[reason] += 1
                if s is not None:
                    s["trajectory_id"] = tid
                    s["instance_id"] = iid
                    s["requests_total"] = sum(1 for m in traj if m["role"] == "assistant")
                    out.write(json.dumps(s) + "\n")
            print(f"row group {g}", file=sys.stderr)
    print(json.dumps({"sampled": sum(reasons.values()), "stride": stride, "end_reasons": reasons}, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
