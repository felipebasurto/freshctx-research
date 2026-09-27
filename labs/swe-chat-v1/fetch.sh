#!/usr/bin/env bash
# Download the two SWE-chat tables prevalence.py needs. Needs HF_TOKEN with the dataset's terms accepted.
set -euo pipefail
[ -n "${HF_TOKEN:-}" ] || { echo "missing HF_TOKEN (accept the terms at huggingface.co/datasets/SALT-NLP/SWE-chat first)"; exit 2; }
mkdir -p "$(dirname "$0")/data"
for table in sessions conversations; do
  curl -fL --retry 3 -H "Authorization: Bearer ${HF_TOKEN}" \
    -o "$(dirname "$0")/data/$table.parquet" \
    "https://huggingface.co/datasets/SALT-NLP/SWE-chat/resolve/main/$table.parquet"
done
ls -la "$(dirname "$0")/data"
