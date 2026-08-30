# nested-helper-showdown

Disposable Isolated Semantic Engine granularity cell. Not official symbol-pack gold and not a holdout result.
Spans come from Isolated Semantic Engine parse, not `bench/independent-symbols.mjs`.
Payload bytes are `Buffer.byteLength(JSON.stringify(messages), "utf8")`.
Latency uses 5 warmups and 21 measured repetitions.

| tier | system | selector | verdict | reason | payload_bytes | delta_vs_coarser | delta_vs_corvus | gold_in_payload | fail_open | engine_spawn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | isolated-semantic-engine | class View::method as_view::if@0::function view | pass |  | 1058 | -1937 | -6424 | true | false | ok |
| 2 | isolated-semantic-engine | class View::method as_view | pass |  | 2995 | -4487 | -4487 | true | false | ok |
| 3 | corvus-file | class View::method as_view::if@0::function view | pass |  | 7482 |  | 0 | true | false | n/a |
