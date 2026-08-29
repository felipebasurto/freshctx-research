# symbol-scope-dev-v0.1

Label: `symbol-scope-dev`. Disposable public-repo smoke pack. Not a holdout or Level 4 result.

Gold spans come from `bench/independent-symbols.mjs` (Python `ast` / JavaScript declaration scan).
Payload bytes are `Buffer.byteLength(JSON.stringify(messages), "utf8")`.
Latency uses 5 warmups and 21 measured repetitions.

| system | repo | symbol | verdict | reason | payload_bytes | peak_rss_bytes | latency_p50_ms | latency_p95_ms | gold_in_payload | fail_open | engine_spawn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| isolated-semantic-engine | flask | as_view | fail | gold-absent | 390 | 60416000 | 83.59 | 89.43 | false | false | ok |
| corvus-file | flask | as_view | pass |  | 7473 | 60895232 | 0.00 | 0.00 | true | false | n/a |
| isolated-semantic-engine | express | createApplication | pass |  | 1316 | 62029824 | 82.26 | 84.77 | true | false | ok |
| corvus-file | express | createApplication | pass |  | 1952 | 62029824 | 0.00 | 0.00 | true | false | n/a |

flask/as_view: payload_bytes delta (isolated-semantic-engine - corvus-file) = -7083
express/createApplication: payload_bytes delta (isolated-semantic-engine - corvus-file) = -636

Failed cells are not small-payload wins. A missing Isolated Semantic Engine spawn is `missing-engine`. A transformed request that equals the original host request is `fail-open`. Current-revision gold bytes absent from the serialized payload is `gold-absent`, including when the engine omits a symbol after a file-level ambiguous parse.
