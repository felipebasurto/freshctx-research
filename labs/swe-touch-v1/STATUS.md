# swe-touch-v1 — status (2026-09-27): blocked at Step 0 (environment gate)

Nothing has run. No model calls and no sandbox spend: $0 model, $0 sandbox.

## Environment measured (cloud agent container)

| Check | Result | Needed |
| --- | --- | --- |
| `uname -m` | x86_64 | x86_64 ✓ |
| CPU / RAM | 4 vCPU / 15 GiB, no swap | — |
| Free disk | 30 GB (per-session allowance, not the 252 GB `df` size) | ~150 GB ✗ |
| Docker | CLI 29.3.1 and `dockerd` binary present; **no daemon** (`/var/run/docker.sock` missing) | running daemon ✗ |
| `DEEPSEEK_API_KEY` | **not set** in the environment | set ✗ |

We tried to start `dockerd` in the container, and the agent's sandbox policy
refused it. Even with a daemon, 30 GB is not enough for SWE-bench Verified
images, so local Docker is out in this environment.

## What would unblock it

The Harbor fork's external runner (`mini_swe_agent_runner.py`, host-side loop,
commands via the bridge's `/exec` → `environment.exec`) doesn't depend on the
backend, so a remote sandbox fits the integration design unchanged. Supported
backends in `harbor/src/harbor/environments/` and the credentials they read:

| Backend | Credential env vars | Note |
| --- | --- | --- |
| **Modal** (recommended) | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | pulls public SWE-bench images; widely used for SWE-bench |
| Daytona | `DAYTONA_API_KEY` (+ optional `DAYTONA_ORGANIZATION_ID`, `DAYTONA_TARGET`) | |
| E2B | `E2B_API_KEY` | |
| Runloop | `RUNLOOP_API_KEY` | |
| Novita | `NOVITA_API_KEY` | |

The owner needs to:
1. Pick a backend, and add its credentials and `DEEPSEEK_API_KEY` as
   environment secrets. Don't paste secrets into the chat.
2. Allow the backend's API host in the environment's network policy.
3. Optionally, raise the disk allowance. The mirror and trajectories need only
   a few GB once sandboxes are remote.

Alternative: an x86_64 VM with a running Docker daemon and ≥200 GB disk.

## Open item from the owner

The owner asked to use "4.1 flash" instead of `deepseek/deepseek-v4-flash`.
Before the first call, confirm the exact LiteLLM model id, and how LiteLLM
turns thinking off for it, and record both here.

## Steps that don't need the sandbox

Step 1 (the Mini-SWE-Agent FreshCtx bridge with offline tests) and the Step 2
protocol draft don't need Docker. The prompt says to stop at the Step 0 gate,
so neither was started. If the owner approves, they can go ahead before the
infrastructure is ready.
