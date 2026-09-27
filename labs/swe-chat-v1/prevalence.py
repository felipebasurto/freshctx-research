"""How often real coding sessions hit a stale view, and what agents do about it (SWE-chat, no model calls).

    uv run --with pandas --with pyarrow python prevalence.py data/ results/prevalence.json

Reads `conversations.parquet` and `sessions.parquet` from SALT-NLP/SWE-chat
(PLAN.md). Three detectors, per session, in turn order:

1. External change: the agent reads a file twice, with no agent edit of it and
   no shell command in between, and the overlapping lines differ. The change
   came from outside the agent (the user, an editor, a watcher). With a shell
   command in between, the change is counted separately as ambiguous.
2. Claude Code's notice: "<path> was modified, either by the user or by a
   linter", and the agent's next action on that file: re-read, edit without
   re-reading, or nothing.
3. Stale edits: edits rejected because the text to replace is gone or the file
   changed since it was read, overall and after a detected change.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

READ_TOOLS = {"Read", "read_file", "read", "view", "ReadFile", "read_many_files"}
EDIT_TOOLS = {"Edit", "MultiEdit", "Write", "NotebookEdit", "write_file", "edit_file", "replace", "edit", "write",
              "apply_patch", "str_replace_editor", "str_replace_based_edit_tool", "create_file"}
SHELL_TOOLS = {"Bash", "run_command", "run_shell_command", "shell", "exec_command", "bash", "local_shell"}
NUMBERED = re.compile(r"^\s*(\d+)(?:→|\t)(.*)$")
SHELL_READ = re.compile(r"^\s*(?:cd \S+ && )?(?:cat(?: -n)?|nl -ba|head -n \d+|sed -n '?\d+(?:,\d+)?p'?)\s+(?P<path>[\w./@+-]+)"
                        r"(?:\s*\|\s*sed -n '?(?P<a>\d+)(?:,\d+)?p'?)?\s*$")
NOTICE = re.compile(r"(?:Note: )?(?P<path>\S+?) was modified, either by the user or by a linter")
STALE_EDIT = re.compile(r"(String to replace not found|old_string (?:was )?not found|File has been modified since read"
                        r"|could not find the string to replace|0 occurrences found|No changes made|did not appear verbatim)", re.I)
TRUNCATED = 10_000


def lines_of(content: str, offset: int | None) -> dict[int, str]:
    """Line number -> text from a read result; numbered formats are used as given."""
    text = content or ""
    raw = text.split("\n")
    if len(text) >= TRUNCATED and raw:  # SWE-chat truncates tool results to 10 KB: drop the cut line
        raw = raw[:-1]
    numbered = [NUMBERED.match(line) for line in raw if line.strip()]
    if numbered and sum(1 for m in numbered if m) >= 0.8 * len(numbered):
        return {int(m.group(1)): m.group(2) for m in numbered if m}
    start = (offset or 1)
    return {start + index: line for index, line in enumerate(raw) if index < len(raw) - 1 or line}


def same_file(a: str, b: str) -> bool:
    a, b = a.lstrip("./"), b.lstrip("./")
    return a == b or a.endswith("/" + b) or b.endswith("/" + a)


class Session:
    def __init__(self, agent: str) -> None:
        self.agent = agent
        self.known: dict[str, dict[int, str]] = {}
        self.flags: dict[str, set[str]] = defaultdict(set)
        self.pending: dict[str, dict] = {}
        self.noticed: dict[str, int] = {}  # path -> turn of an unanswered Claude Code notice
        self.changed: set[str] = set()  # paths with a detected change the agent has not re-read since
        self.counts: Counter = Counter()
        self.after_notice: Counter = Counter()

    def path_key(self, path: str | None) -> str | None:
        if not path:
            return None
        for known in self.known:
            if same_file(known, path):
                return known
        return path

    def tool_use(self, row: dict) -> None:
        name, call = row.get("tool_name") or "", row.get("tool_call_id") or ""
        payload = {}
        try:
            payload = json.loads(row.get("tool_input_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            pass
        kind, path, offset = None, row.get("file_path"), payload.get("offset")
        if name in READ_TOOLS:
            kind = "read"
        elif name in EDIT_TOOLS:
            kind = "edit"
        elif name in SHELL_TOOLS:
            match = SHELL_READ.match(row.get("command") or "")
            if match:
                kind, path, offset = "read", match.group("path"), int(match.group("a")) if match.group("a") else None
            else:
                kind = "shell"
        if kind is None:
            return
        key = self.path_key(path)
        self.pending[call] = {"kind": kind, "path": key, "offset": offset if isinstance(offset, int) else None}
        if key and key in self.noticed and kind in ("read", "edit"):
            self.after_notice["re-read first" if kind == "read" else "edited without re-reading"] += 1
            del self.noticed[key]
        if kind == "shell":
            for known in self.known:
                self.flags[known].add("shell")

    def tool_result(self, row: dict) -> None:
        call = self.pending.pop(row.get("tool_call_id") or "", None)
        content = row.get("content") or ""
        self.scan_notice(content, row)
        if call is None:
            return
        path = call["path"]
        if call["kind"] == "edit":
            self.counts["edits"] += 1
            failed = bool(STALE_EDIT.search(content))
            self.counts["stale_edit_failures"] += failed
            if path and path in self.changed:
                self.counts["edits_after_unread_change"] += 1
                self.counts["stale_edit_failures_after_unread_change"] += failed
            if path:
                self.flags[path].add("agent_edit")
            return
        if call["kind"] != "read" or not path:
            return
        self.counts["reads"] += 1
        new = lines_of(content, call["offset"])
        old = self.known.get(path)
        if old is not None and new:
            overlap = set(old) & set(new)
            differs = any(old[line] != new[line] for line in overlap)
            flags = self.flags[path]
            if overlap and "agent_edit" not in flags:
                self.counts["rereads_comparable"] += 1
                if differs:
                    self.counts["external_change_clean" if "shell" not in flags else "change_with_shell_between"] += 1
        self.known[path] = new
        self.flags[path] = set()
        self.changed.discard(path)

    def scan_notice(self, content: str, row: dict) -> None:
        for match in NOTICE.finditer(content or ""):
            path = self.path_key(match.group("path"))
            self.counts["claude_code_notices"] += 1
            self.noticed[path] = row.get("turn_number", 0)
            self.changed.add(path)

    def finish(self) -> None:
        if self.noticed:
            self.after_notice["no later action on the file"] += len(self.noticed)


def analyze(conversations, sessions=None) -> dict:
    """`conversations`: iterable of row dicts sorted by (session_id, turn_number)."""
    per_session: dict[str, Session] = {}
    for row in conversations:
        sid = row["session_id"]
        session = per_session.get(sid)
        if session is None:
            session = per_session[sid] = Session(row.get("agent") or "unknown")
        kind = row.get("turn_type")
        if kind == "tool_use":
            session.tool_use(row)
        elif kind == "tool_result":
            session.tool_result(row)
        elif kind in ("system_injected", "user_prompt", "file_snapshot", "system_event"):
            session.scan_notice(row.get("content") or "", row)
    by_agent: dict[str, dict] = defaultdict(lambda: {"sessions": 0, "sessions_with_clean_external_change": 0,
                                                     "sessions_with_claude_code_notice": 0, "counts": Counter(),
                                                     "after_notice": Counter()})
    for session in per_session.values():
        session.finish()
        entry = by_agent[session.agent]
        entry["sessions"] += 1
        entry["sessions_with_clean_external_change"] += session.counts["external_change_clean"] > 0
        entry["sessions_with_claude_code_notice"] += session.counts["claude_code_notices"] > 0
        entry["counts"].update(session.counts)
        entry["after_notice"].update(session.after_notice)
    report = {agent: {**entry, "counts": dict(entry["counts"]), "after_notice": dict(entry["after_notice"])}
              for agent, entry in sorted(by_agent.items())}
    if sessions is not None:
        for row in sessions:
            entry = report.get(row.get("agent") or "unknown")
            if entry is None:
                continue
            human = sum(float(row.get(key) or 0) for key in ("human_added", "human_modified", "human_removed"))
            entry["sessions_with_human_lines"] = entry.get("sessions_with_human_lines", 0) + (human > 0)
    return report


def main() -> None:
    import pyarrow.parquet as pq

    data, out = Path(sys.argv[1]), Path(sys.argv[2])
    columns = ["session_id", "turn_number", "turn_type", "tool_name", "tool_call_id", "file_path", "command",
               "tool_input_json", "content", "agent"]
    table = pq.read_table(data / "conversations.parquet", columns=columns,
                          filters=[("turn_type", "in", ["tool_use", "tool_result", "system_injected", "user_prompt",
                                                        "file_snapshot", "system_event"])])
    frame = table.to_pandas().sort_values(["session_id", "turn_number"], kind="stable")
    sessions = pq.read_table(data / "sessions.parquet", columns=["session_id", "agent", "human_added", "human_modified",
                                                                 "human_removed"]).to_pandas()
    report = analyze(frame.to_dict("records"), sessions.to_dict("records"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
