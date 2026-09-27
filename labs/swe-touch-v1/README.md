# swe-touch-v1 — FreshCtx on SWE-Touch's silent-edit condition

Does FreshCtx recover the resolve-rate loss when a user silently edits
task-critical code mid-task (SWE-Touch `patch_only`), and does it beat a notice
carrying the diff? Plan: `PLAN.md`. Preregistration: `PROTOCOL.md`. Current
state: `STATUS.md`.

| File | Role |
| --- | --- |
| `harbor/swe-touch-freshctx.patch` | Changes to SWE-Touch `4bd121b` that install the FreshCtx Mini-SWE-Agent bridge; no intervention logic changed |
| `offline/offline_touch.py` | Offline check of the integration: real SWE-Touch bridge, controller and runner, local repository, scripted model, five arms |
| `make_jobs.py` | Item list from the data file, pilot selection, Harbor job configs per arm |
| `spend.py` | Spend from trajectories, cap checks before each batch, planned vs found trials |
| `analyze.py`, `test_analyze.py` | Preregistered tests, decision rule, mechanism measures, pilot gate; tested on synthetic trials |
| `run.sh` | smoke / pilot / main, with every check and gate in order |
| `results/items.json` | The 192 records with a code edit and the 15 pilot tasks |
| `results/offline/` | Output of the offline check (synthetic repository, no dataset code) |

## Results

Not run: blocked at the environment gate (`STATUS.md`). No model or sandbox
spend.
