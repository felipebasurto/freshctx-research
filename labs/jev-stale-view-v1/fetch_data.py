"""Download row group 0 (4,096 trajectories) of nebius/SWE-rebench-openhands-trajectories (CC-BY-4.0) into .work/."""
import os, fsspec, pyarrow.parquet as pq
URL = "https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories/resolve/main/trajectories.parquet"
os.makedirs(".work", exist_ok=True)
pf = pq.ParquetFile(fsspec.open(URL, block_size=8 * 2**20).open())
cols = ["trajectory_id", "instance_id", "repo", "trajectory", "resolved", "exit_status"]
pq.write_table(pf.read_row_group(0, columns=cols), ".work/rg0.parquet")
