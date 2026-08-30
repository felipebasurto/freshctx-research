# symbol-scope-dev-v0.1

Label: `symbol-scope-dev`. Disposable public-repo smoke pack. Not a holdout or Level 4 result.

Gold spans come from `bench/independent-symbols.mjs` (Python `ast` / JavaScript declaration scan).
Payload bytes are `Buffer.byteLength(JSON.stringify(messages), "utf8")`.
Latency uses 5 warmups and 21 measured repetitions.

| system | repo | symbol | verdict | reason | payload_bytes | peak_rss_bytes | latency_p50_ms | latency_p95_ms | gold_in_payload | fail_open | engine_spawn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| isolated-semantic-engine | flask | as_view | pass |  | 2995 | 56033280 | 71.17 | 77.26 | true | false | ok |
| corvus-file | flask | as_view | pass |  | 7473 | 56066048 | 0.00 | 0.00 | true | false | n/a |
| isolated-semantic-engine | express | createApplication | pass |  | 1316 | 56688640 | 70.94 | 86.37 | true | false | ok |
| corvus-file | express | createApplication | pass |  | 1952 | 56688640 | 0.00 | 0.00 | true | false | n/a |

flask/as_view: payload_bytes delta (isolated-semantic-engine - corvus-file) = -4478
express/createApplication: payload_bytes delta (isolated-semantic-engine - corvus-file) = -636
