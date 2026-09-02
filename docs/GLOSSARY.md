# Glossary

Terms used across `README.md`, `THESIS.md`, `SOUL.md`, `docs/ARCHITECTURE.md`,
`docs/EVALUATION.md`, the ADRs, and the Public Change Records. Each entry names
the file that defines the behaviour so the definition can be checked against
code. When a term here disagrees with the code, the code is wrong or this file
is; open a PCR either way.

## Units and identity

- **Unit** — the thing FreshCtx tracks: a whole file, a line region, or a
  symbol inside one file under the workspace root. Created by
  `engine.trackRead()` (`src/registry.mjs`).
- **Scope** — `file`, `region`, or `symbol`. Region units carry `startLine` and
  `endLine`; symbol units carry a `selector` (declared name) and, after an
  Isolated Semantic Engine parse, a `qualifiedSelector` (structural path such as
  `class Alpha::method render`).
- **Unit id** — `sha256` over path, scope, and selector or line span
  (`src/hash.mjs`). Stable across content changes; this is what historical
  markers cite.
- **Revision** — `sha256:<hex>` of the unit's current bytes. Changes whenever the
  content changes. Printed in the projection, never in historical markers.
- **Observation** — the bytes a host tool returned to the model for a read; the
  first revision of a unit.
- **Archive** — the in-memory map of revisions per unit that makes every
  earlier observation exactly recoverable (`unit.versions`).

## Resolution

- **Refresh** — `engine.refresh(source)` re-reads every tracked path and
  relocates each unit in the current bytes.
- **Resolved / unresolved** — `unit.state`. Resolved units may be projected;
  unresolved units are omitted and counted in the envelope. An unresolved
  unit keeps its previous `content` in memory for recovery, but that content
  must never be rendered as current.
- **Resolution method** (`unit.resolutionMethod`, projected as
  `resolution="..."`) — how the current span was found. Success labels:
  `observed` (first capture), `whole-file`, `exact`, `boundary-anchors`,
  `stored-line-span`, `isolated-semantic-engine`. Failure labels:
  `source-missing`, `source-error`, `anchors-not-found`,
  `missing-boundary-anchor`, `ambiguous-boundary-anchors`,
  `displaced-shrunk-boundary-anchors`, `isolated-semantic-engine-missing`,
  `-error`, `-unresolved`, `-ambiguous` (`src/registry.mjs`, `src/anchors.mjs`).
- **Anchors** — normalised boundary lines used to relocate a region when its
  exact bytes moved (`src/anchors.mjs`). Ambiguous anchor matches fail closed.
- **Isolated Semantic Engine (ISE)** — the out-of-process Tree-sitter parser
  under `ise/treesitter/`, invoked with `{ path, bytes }` on stdin and
  answering `{ units, error }` on stdout (ADR 0004). `src/` never imports it;
  the engine receives an injected **runner** (`semanticEngineRunner`).
- **Fail closed (freshness)** — when current bytes cannot be resolved with
  confidence, omit the unit and report it; never inject last-known bytes.
- **Fail open (host boundary)** — when the adapter transformation cannot
  complete, return the original host request unchanged so the host keeps its
  normal behaviour. Both rules are listed in `SOUL.md` and in the ARCHITECTURE
  failure matrix.

## Projection

- **Projection** — the single bounded block of current bytes appended to a
  request copy: a `<freshctx turn=".." selected=".." unresolved=".."
  budget-omitted="..">` **envelope** wrapping zero or more
  `<freshctx-unit ...>` elements (`src/projector.mjs`). Units are framed by
  `content-bytes`, not by delimiter search, so source that contains the closing
  tag still decodes exactly.
- **Selection order vs render order** — selection chooses which units fit the
  budget (utility under `budgetChars`); rendering orders the chosen units for a
  stable request prefix. The two orders are separate concepts by rule.
- **Budget-omitted** — a resolved unit that did not fit the budget this turn.
  Counted in the envelope; its read slot carries an `omitted-read` marker.
- **Working set** — the selected units for one request.
- **Skip-eligible selection** — a selected unit whose revision was already
  injected in an earlier request of the same session; when every selection is
  skip-eligible and no ISE symbol resolved this turn, the projection collapses
  to a marker (PCR 0099/0100, `shouldCollapseCurrentProjection`).
- **Quoteability** — whether the current tail carries any unit body the model
  could quote. When it does not, a previously budget-omitted read may be
  inlined at its read slot (PCR 0108). Plan 003 ties this to
  `unit.state === "resolved"`.

## Historical markers

- **Stable read marker** — `[freshctx:<unit id> path=<path>] Current content is
  supplied in the live projection.` replaces a historical read body. It never
  contains a revision, so it is byte-identical across turns
  (`src/transcript.mjs`).
- **Omitted-read marker** — `[freshctx:omitted-read path=..]` for a read whose
  unit was budget-omitted or unresolved this turn (`adapters/request-prune.mjs`).
- **Stale-dump marker** — `[freshctx:stale-dump ...]` replacing a shell command
  output that dumped one or more tracked files.
- **Historical projection marker** — the collapsed form of an earlier turn's
  envelope kept in the request copy.

## Adapters

- **Adapter** — host-specific translation under `adapters/`: **Pi**
  (`adapters/pi/extension.ts` live, `adapters/pi/replay.mjs` model-free mirror)
  and **Hermes** (`adapters/hermes/__init__.py` plugin calling
  `adapters/hermes/bridge.mjs` over stdin/stdout JSON).
- **Request copy vs persisted transcript** — adapters rewrite only the copy of
  the messages that goes to the provider; the host's stored history is never
  modified.
- **Tool pairing** — every assistant tool call keeps its tool result in the
  request copy; pruning removes pairs, never one side.
- **Shell read** — a `cat`, `head`, `tail`, `sed -n`, or `nl` command on one
  workspace file, recognised by `adapters/shell-read.mjs` and tracked like an
  official read tool.
- **`applied`** — Hermes bridge result flag: `true` only when at least one unit
  was tracked and the messages were transformed.

## Evaluation

- **CtxBench** — the deterministic, model-free benchmark protocol in
  `docs/EVALUATION.md`. Measures the provider payload, not agent behaviour.
- **Trace** — a scripted sequence of reads and workspace mutations replayed
  against the engine or an adapter.
- **Pack** — a frozen set of traces plus expected results under
  `bench/packs/<id>/` with a manifest and hashes.
- **Oracle / gold units** — the byte-exact set of units the model must see
  after each mutation, produced by a second program
  (`bench/gold-extract.mjs`), never by the candidate resolver.
- **Required recall** — fraction of gold units whose current bytes appear in
  the final payload. A gate: anything below 1.0 is `FAIL`.
- **Whole-file baseline (`corvus-file`)** — the comparison system in
  `bench/corvus.mjs` that re-injects whole files; see `docs/CORVUS_MAPPING.md`.
- **Payload bytes** — UTF-8 bytes of the provider request content. The primary
  efficiency metric.
- **Empirical verdict** — the boolean `EVALUATE_VERDICT=PASS|FAIL` printed by
  `npm run evaluate` (`autoresearch/CONTRACT.md`). `PASS` requires every hard
  gate and a payload below the whole-file baseline.
- **Hard gates** — `fail-open`, `missing-engine`, `gold-absent`,
  `required-recall` (evaluate), plus the invariants in `SOUL.md`.
- **Holdout classifications** — `unsealed-regression` (v0.1 legacy),
  `locally-frozen` (frozen on a laptop, includes `holdout-v0.3-apex`),
  `sealed` and `remotely-attested` (require a production GitHub Actions freeze
  attestation). See `docs/decisions/holdout-protocol-threat-model.md`.
- **Result labels** — every PCR labels its numbers `synthetic` (fixtures),
  `replay` (recorded traces), `public-repo` (locked external repository),
  `adapter-only`, or `measurement`; only public-repo results feed public
  claims.
- **Claim ladder** — Levels 1–4 in `THESIS.md` §9. Level 4 is the only level
  that permits "state of the art" wording and is not authorised by anything in
  this repository today.

## Records

- **PCR (Public Change Record)** — one Markdown file per experiment or change
  under `docs/lab/pcr/NNNN-slug.md`, from `docs/lab/TEMPLATE.md`; indexed in
  `docs/lab/INDEX.md`, with metric rows in `docs/lab/METRICS.md`.
- **ADR** — architectural decision record under `docs/decisions/`.
- **Living docs** — the facts in `README.md`, `docs/ARCHITECTURE.md`, and
  `docs/ROADMAP.md` that `test/living-docs.test.mjs` checks against the tree.
- **Plan** — an audit-derived implementation plan under `plans/`, with a
  status index in `plans/README.md`. Plans are not source code and are not
  behaviour until an executor lands them with tests.
