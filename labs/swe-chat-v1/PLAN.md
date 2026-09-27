# swe-chat-v1 — how often real sessions hit a stale view (plan, 2026-09-27; nothing run)

TODO item 3. No model calls. Data: SWE-chat (arXiv 2604.20779,
`SALT-NLP/SWE-chat` on Hugging Face, ODC-BY, gated with automatic approval):
5,851 real sessions from Claude Code, Codex, Gemini CLI and other agents, with
every tool call and result (results truncated to 10 KB) and per-line human
vs agent attribution.

## Questions

1. How often does code the agent has read change underneath it, from outside
   the agent (the user, an editor, a formatter, another process)?
2. When Claude Code announces such a change (its "was modified, either by the
   user or by a linter" reminder, which carries the changed lines), what does
   the agent do next: re-read, edit without re-reading, or nothing?
3. How often do edits fail because the text to replace is gone or the file
   changed since it was read, overall and after a change the agent had not
   re-read?
4. Natural experiment (descriptive, confounded by agent, model and users):
   Claude Code, which announces changes, against agents that don't.

SWE-Touch reports 59.0% of SWE-chat sessions have user-attributed changes;
that counts committed lines, not changes to code the agent had read.

## Detectors (`prevalence.py`, fixed before looking at the data)

- **Clean external change:** two reads of the same file by the agent, with no
  agent edit of that file and no shell command in between, whose overlapping
  lines differ. Reads: `Read`/`read_file`/`view`… and allowlisted shell reads
  (`cat`, `cat -n`, `nl -ba`, `head -n`, `sed -n`). With a shell command in
  between, the change is counted apart (`change_with_shell_between`), since
  the agent's own command may have caused it.
- **Claude Code notice:** the reminder text in injected messages or tool
  results; the next agent tool call on that file classifies the response.
- **Stale edit failures:** edit results matching the harnesses' "not found /
  modified since read" errors (regex in `prevalence.py`).

Lower bounds by construction: a change is only seen when the agent reads the
file again, or (Claude Code) when the harness announces it.

## Validation before the full run

On 50 random sessions per agent, print every match of the notice and
stale-edit patterns and every clean external change with its differing lines;
check them by hand and record false positives here. Adjust the patterns only
in that step, then run all sessions once.

## Output

`results/prevalence.json` per agent: sessions; sessions with a clean external
change; with a Claude Code notice; comparable re-reads; response to notices;
edits, stale-edit failures, and failures after an unread change; sessions
with human-attributed lines. Report counts exactly, including zeros.

## Blocker

The data files return 401 without a Hugging Face token that has accepted the
dataset's terms. The owner must accept them on the dataset page and set
`HF_TOKEN` in the environment (never in chat or a file); `fetch.sh` then
downloads the two tables needed (`conversations.parquet`, `sessions.parquet`).
