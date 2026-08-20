# No-model request-capture provider

This dependency-free local server records the exact JSON payload a harness
sends and returns a fixed valid response. It makes no inference call and has no
outgoing network behavior.

```bash
FRESHCTX_CAPTURE_FILE=./capture/results/pi.jsonl \
FRESHCTX_EXPECTED_REQUESTS=1 \
npm run capture-provider
```

Configure an OpenAI-compatible host to use:

```text
base URL: http://127.0.0.1:8787/v1
model: freshctx-capture
API key: any non-empty local placeholder if the host requires one
```

Implemented endpoints:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`, streaming and non-streaming
- `POST /v1/responses`, non-streaming

Each JSONL entry stores the parsed request, raw/canonical byte counts, and
SHA-256 hashes. It intentionally excludes wall-clock time from the hashed
record. Set `FRESHCTX_EXPECTED_REQUESTS` to make an unexpected second semantic
request fail with HTTP 409.

The server binds to loopback only. CtxBench should still run it inside the
network-disabled benchmark sandbox so a misconfigured host cannot reach a real
provider.
