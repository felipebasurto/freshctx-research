# Host adapter contract

Host-specific message translation stays in `adapters/`. The core accepts
observations and emits projections; it does not import provider schemas or host
message types.

`host-codec.mjs` defines the minimal request-boundary contract:

1. snapshot the original native request and serialize a clone for byte-identity
   evidence;
2. pass only clones to codec callbacks;
3. capture host-native observations from that ephemeral copy;
4. transform only the copy;
5. validate the resulting native schema and assistant/tool/result pairing;
6. return the original request object unchanged if any phase fails.

A codec's serializer must be deterministic and side-effect-free. Its validator
owns host-native protocol rules. `applyHostCodec()` never persists the
transformed copy and never invokes a provider.

`host-codec-test-double.mjs` is a no-model executable example. It captures one
OpenAI-shaped request, replaces selected tool-result bodies, validates native
call/result IDs and ordering, and can force capture, transform, validation, or
pair-corruption failures. It is a contract fixture, not a complete adapter for
Pi, Hermes, Oh My Pi, or a model provider.

MCP may expose status, recovery, or explicit inspection tools. It is not the
data plane for this contract because it cannot rewrite an arbitrary host's
provider request.
