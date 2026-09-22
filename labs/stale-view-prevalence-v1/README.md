# Stale file views in public agent transcripts v1

How often does a coding agent send the model a file view that its own edit has
already made wrong? This lab counts that in a public trajectory dataset. It
measures prevalence of the problem FreshCtx targets. It does not measure
FreshCtx outcomes, harm to the model, or cost.

## Result (measured)

Across 67,074 OpenHands trajectories, lower bound:

| Measure | Count | Share |
| --- | ---: | ---: |
| Model requests carrying at least one stale file view | 645,736 / 4,316,962 | 14.96% |
| Same, counting only requests after the run's first successful edit | 645,736 / 2,619,010 | 24.66% |
| Runs with at least one such request | 52,151 / 67,074 | 77.75% |
| Runs whose final request carries one | 14,793 / 67,074 | 22.05% |
| File views that became stale | 113,705 / 897,160 | 12.67% |
| Stale bytes among all re-sent file-view bytes | 2,852,968,456 / 125,404,865,432 | 2.28% |

Precision check: in all 6,277 cases where the agent viewed the same lines again
while a read was counted stale, the new view differed from the old one (0
identical). Raw output: [results.json](results.json).

A stale view means at least one displayed line number now holds different text.
It does not mean the old code is gone: an inserted line shifts the rest down
and they still exist.

## Dataset

[nebius/SWE-rebench-openhands-trajectories](https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories)
at revision `35455389ab51bf5e2306bfd436ef72d0f98bf882`, file
`trajectories.parquet`, sha256
`14048dd1fcd22ce094b6e85f8a38f223a9ef1327031aaaad052804870212efa1`, CC-BY-4.0
(Trofimova et al., Nebius, 2025). OpenHands v0.54.0 with
Qwen3-Coder-480B-A35B-Instruct on SWE-rebench issues. The dataset's published
`config.toml` sets condenser `noop` and `enable_history_truncation = false`, so
each model request carries every earlier message. A request is one assistant
message; its context is every message before it.

## Rule

`measure.py` tracks only `str_replace_editor` calls and shell commands:

- A read is a successful `view` of a file (`cat -n` output). Directory views,
  failed views and shell `cat` are not reads.
- A read becomes stale only if the first later event that could touch its file
  is a successful `str_replace` whose `old_str` appears verbatim in the displayed
  lines, and replaying the replacement on those lines changes the text at some
  displayed line number. OpenHands requires `old_str` to occur exactly once, so
  that displayed line no longer holds. Pure appends do not count.
- Events that could touch a file: successful `str_replace`, `insert`, `create`
  or `undo_edit` on its path; a shell command containing its basename; a shell
  command running git checkout/stash/reset/restore/apply/revert/switch/am/pull/
  merge/rebase/cherry-pick, `patch`, `cp`, `mv`, `rsync`, `tar` or `unzip`.
  Any such event before the qualifying edit disqualifies the read for good.
- A stale window closes at the next such event, in case it restored the text.

Everything the rule skips (shell reads and edits, `insert`, later edits to an
already-touched file) lowers the count. The remaining assumption is that no
unmatched command, such as a script that edits a file without naming it,
restored the text. The reread check above measures that assumption on the
cases where a reread happened.

`test_measure.py` covers the rule's edge cases.

## Engine replay (one case)

`replay.mjs` runs trajectory `chatcmpl-a20439b9e2e539f90fe8653cc265fd82` through
the product sidecar at `ecaaf137fad81bb8901300c7472cfe385ba84843`, Node
v22.14.0. The agent viewed all 231 lines of `canvasapi/module.py` (canvasapi,
MIT), then its own `str_replace` changed lines 126 onward. [case.json](case.json)
holds that view and edit from the dataset. The replay observes the view, applies
the edit on disk, and runs prepare and commit.

| Request copy | Stale `if "content_id" in module_item:` | Current `# content_id is not required ...` |
| --- | --- | --- |
| Original view result | present | absent |
| FreshCtx marker plus projection (8,329 bytes) | absent | present |

The transcript also carries the edit tool's own snippet of the new code. This
case checks engine behavior only; it is not an OpenHands host test, and the
product's OpenHands bridge is fixture-only.

## Limitations

- One agent, one model, one task source. Other hosts, condensers or models may
  differ.
- Presence, not harm. The Pi outcome lab found models reread files and recover.
  Nothing here shows stale views change answers, turns or cost.
- Only the tracked tool surface is counted.

## Reproduce

Requires Python 3 with `pyarrow`, and Node 22+ for the replay.

```sh
curl -L -o trajectories.parquet \
  https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories/resolve/35455389ab51bf5e2306bfd436ef72d0f98bf882/trajectories.parquet
python3 labs/stale-view-prevalence-v1/measure.py trajectories.parquet > results.json
(cd labs/stale-view-prevalence-v1 && python3 -m unittest test_measure)
node labs/stale-view-prevalence-v1/replay.mjs <product-checkout>/bin/freshctx.mjs
```
