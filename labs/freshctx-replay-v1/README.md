# FreshCtx replayed on public agent transcripts v1

[stale-view-prevalence-v1](../stale-view-prevalence-v1/README.md) counted how
often an OpenHands agent re-sends a file view that its own edit already made
wrong. This lab runs the product engine (`freshctx serve --stdio`) on those
transcripts. It rebuilds each workspace, feeds every view and model request
through `observe`, `prepare` and `commit`, and compares the request as sent with
the FreshCtx copy. It measures what the engine would put in each request. It
does not run a model, so it measures neither answers nor turns nor cost.

## Result (measured)

1,198 trajectories (every 56th of 67,074). 26,528 of their 77,089 model requests
could be replayed exactly (see Rebuild). Default budget, 131,072 bytes:

| Measure | As sent | FreshCtx copy |
| --- | ---: | ---: |
| Requests carrying at least one stale file view | 3,845 | **0** |
| Stale file-view instances | 15,110 | 0 (all replaced by markers) |
| Requests carrying any stale code (file views or editor snippets) | 3,891 | 1,237 |
| Request bytes, sum over replayed requests | 1,805,322,174 | 1,840,174,817 (+1.93%) |
| Final replayed request per run, median bytes | 74,377 | 75,017 |

The 1,237 remaining requests all carry an editor snippet: the `cat -n` excerpt
that `str_replace_editor` prints after an edit, which a later edit can make wrong.
FreshCtx does not observe that output, so it is identical in both copies.

Checks run on every request: the body of each of the 87,968 projection frames
appears verbatim in the rebuilt file on disk at that request; all 22,058 plans
committed; no projection exceeded its budget; no replay errors.

Where the stale view's unit went in the default-budget projection:

| Outcome | Stale view instances |
| --- | ---: |
| Unit projected with current code | 9,047 |
| Omitted: an overlapping, more recently observed unit was projected instead | 5,732 |
| Unresolved (`referent_missing` 178, `ambiguous` 101), marker only | 279 |
| Omitted for budget, marker only | 52 |

## Size is not reduced at the default budget

FreshCtx widens a partial view to its enclosing declaration, so the projection
can be larger than the view results it replaces. File-view results are 26% of
the bytes in the replayed requests (468,834,032 of 1,805,322,174); the rest is
shell output, edit results and messages, which FreshCtx leaves alone. A smaller
budget shrinks requests only by projecting fewer units:

| Budget (bytes) | Request bytes vs as sent | Final request median | Stale views whose unit was projected | Omitted for budget |
| ---: | ---: | ---: | ---: | ---: |
| 131,072 | +1.93% | 75,017 | 9,047 | 52 |
| 65,536 | -1.20% | 74,039 | 8,855 | 282 |
| 32,768 | -6.81% | 69,447 | 8,175 | 1,022 |
| 16,384 | -14.08% | 63,634 | 6,978 | 2,569 |

Every budget still left 0 requests with a stale file view. Bytes are UTF-8 bytes
of message text and tool-call arguments, not tokens. Raw output:
[results/](results/).

## Inputs

- Trajectories: [nebius/SWE-rebench-openhands-trajectories](https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories)
  revision `35455389ab51bf5e2306bfd436ef72d0f98bf882`, `trajectories.parquet`,
  sha256 `14048dd1fcd22ce094b6e85f8a38f223a9ef1327031aaaad052804870212efa1`,
  CC-BY-4.0. OpenHands v0.54.0, Qwen3-Coder-480B-A35B-Instruct, condenser
  `noop`, history truncation off.
- Task metadata (repository and `base_commit`): [nebius/SWE-rebench](https://huggingface.co/datasets/nebius/SWE-rebench)
  revision `89cdfbab4ab1bd8f5a658bb212d1b63624f4f881`, CC-BY-4.0, files
  `data/filtered-00000-of-00001.parquet` (sha256 `b2f03721…817cfa`),
  `data/test-00000-of-00002.parquet` (`39d4791f…c87067`),
  `data/test-00001-of-00002.parquet` (`c50af8bf…8193d7`).
- Source: 1,085 of the sample's 1,092 task commits fetched from GitHub with
  `git fetch --depth 1`; 7 failed, and those runs rebuild from full views only.
- Engine: product at `ecaaf137fad81bb8901300c7472cfe385ba84843`, Node
  v22.14.0, Python 3 with pyarrow 25.0.1.

## Rebuild

`extract.py` turns each trajectory into a script of file writes, views, editor
snippets and requests:

- A file's first content comes from the task repository at `base_commit`, or a
  successful `create`. Successful `str_replace` and `insert` are applied as
  OpenHands applies them.
- Every later view, and every editor snippet except OpenHands' padded empty last
  line, must equal the rebuild line for line. Clipped views check their complete
  lines and the prefix of the clipped one.
- The script stops at the first event the rebuild cannot follow: a view that
  disagrees (41 runs), a file whose content is unknown (457), a shell command that
  could write and names an observed file (605) or could restore files (42), a
  non-unique `old_str`, `undo_edit`, or an edit to a file containing tabs.
  Only requests before the stop are replayed; 51 runs replayed to the end.
- Shell commands count as read-only only if every segment starts with a listed
  read command (`grep`, `cat`, `git diff`, …) and has no redirect, substitution,
  `tee`, `-i`, `-exec` or `-delete`. Other commands that name no observed file
  are assumed not to change observed files; the per-view checks test that
  assumption wherever the agent looked again.

`replay.mjs` creates one temporary workspace and engine process per run. For
each view it sends `observe` with the exact displayed source bytes and their
byte range. For each request that has views it sends `prepare` with every view
result ID and the budget, verifies the projection hash, and sends `commit`. The FreshCtx copy
replaces each view result with its marker and appends the projection, as
`bridges/openhands` does. A view is stale when any displayed line number now
holds different text on the rebuilt disk.

`test_extract.py` covers the rebuild and cut rules.

## Limitations

- The replayed requests are the first 34% of the sampled runs' requests, biased
  toward exploration before shell commands touch observed files.
- The replay supplies the engine with native OpenHands views. It is not a run of
  the OpenHands bridge or of a live host.
- Presence, not harm: nothing here shows stale views change answers, turns or
  cost, and the Pi outcome lab found models reread and recover.
- One agent, one model, one task source, in-workspace files only.

## Reproduce

Requires Python 3 with pyarrow, git, network access to GitHub, and Node 22+.

```sh
H=https://huggingface.co/datasets/nebius
curl -L -o trajectories.parquet $H/SWE-rebench-openhands-trajectories/resolve/35455389ab51bf5e2306bfd436ef72d0f98bf882/trajectories.parquet
for f in filtered-00000-of-00001 test-00000-of-00002 test-00001-of-00002; do
  curl -L -o rebench-$f.parquet $H/SWE-rebench/resolve/89cdfbab4ab1bd8f5a658bb212d1b63624f4f881/data/$f.parquet
done
D=labs/freshctx-replay-v1
python3 $D/fetch_repos.py trajectories.parquet 'rebench-*.parquet' 56 repos
python3 $D/extract.py trajectories.parquet 56 scripts.jsonl repos
for b in 131072 65536 32768 16384; do
  node $D/replay.mjs <product-checkout>/bin/freshctx.mjs scripts.jsonl $b > budget-$b.json
done
(cd $D && python3 -m unittest test_extract)
```
