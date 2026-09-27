# swe-chat-v1 — stale views in real sessions

Plan and detectors: `PLAN.md`. Not run: needs Hugging Face access to
SWE-chat (`PLAN.md`, "Blocker").

```sh
./fetch.sh                                   # needs HF_TOKEN
python3 test_prevalence.py                   # synthetic sessions
uv run --with pandas --with pyarrow python prevalence.py data results/prevalence.json
```
