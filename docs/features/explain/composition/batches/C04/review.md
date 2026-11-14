# C04 independent review — PASS

Reviewed candidate **a5b26e2d5ba2d89b99f30484baf52898c4abceef** against canonical C03 **b6346aacfa85dc789f1e31f3ecc4336d892791b9**. No Important or Critical defect found in the authorized C04 scope. This is a source/data/author-reachability review, not a release or deployment approval.

Read repository AGENTS.md, CLAUDE.md and UI.md; the candidate C04 content specifications; authoritative queue entries and all eight exact Illustrated BERT brief headings; complete existing BERT references/data; new data/specs/manifest/overlays/tests; native selection and schema-bundle code; and the coordinator's existing validation receipts. All candidate content reads used git show or were checked byte-for-byte against the fixed SHA before executing read-only assertions.

## Inspected evidence

| Requirement | Evidence and result |
|---|---|
| Content first; approved scope | Candidate history is C03 → eb50caf23 content specifications → 54b3a1b6f connected-graph content revision → a5b26e2d5 data/specs. The diff adds three NEW references and four prompt/keyword-only REUSE mappings, with no renderer/schema/selector/tooling/author-prompt change. |
| Exact source identity and lessons | Independent assertions compared `topic-bert-sources.json` to the candidate queue: all seven queued ids, eight headings, verbatim summaries, primary source fields and aliases match. Representative Figure09 has lesson01, Figure10 alias has03, and only the catalog family has01/03. The transfer-learning point retains its own topic and01/08. |
| Message/class supervision | `topic-bert-data.js:2` declares four stable message ids and supplied Request/Notice targets. Reordered rows are looked up by id; groups derive members from those same rows. `composition-bert-references.js:6` renders each message and its target together, with the Deep sample-set retaining the same ids/classes. Captions identify supplied targets rather than predictions. No split or invented accuracy is added. |
| Computed CLS extraction and head | `topic-bert-data.js:15` computes each class score from the selected `[CLS]` row and the declared row-major weights/bias. Hand-check: `(1,2) × ((1,-1),(0,1)) + (0,1) = (1,2)` in Notice/Request order. `composition-bert-references.js:12` retains all four token rows, marks both CLS cells in Standard, and slices feature columns only in Overview. Deep uses magnitude bars and visibly includes h, W, b and z=hW+b; it calls the results raw logits. |
| Conditional probe, not input-word invariance | `topic-bert-data.js:21` changes only already-encoded non-CLS rows. CLS, head and recomputed scores stay fixed. The shared range derives from both arrays (0–3). `composition-bert-references.js:27` explicitly limits the probe to changes after encoding and states that input-word changes need not preserve CLS. |
| Separate modality feature spaces and heads | `composition-transfer-learning-references.js:8` has a two-row input/extractor/vector/classifier matrix. Deep and its detail use separate text/image block-stacks, each with its own extractor, structural vector width and task head. Feature counts derive from two text slots versus three image slots; tensor values are absent. Captions state symbolic slots and separate coordinates/parameter sets. No invented fusion edge, shared decoder or learned-activation claim is present. |
| Frozen native schema and depth reachability | Read `explanation-references.js` depth resolution, selection, detail handling and `diagramBundle`/`bundledAuthorSchema`, plus the actual preparation path. Inspected `c04-author-schema-smoke.mjs` and completed `c04-actual-author-schemas.txt`: 324 primary and84 detail specs passed actual prepared-schema AJV validation across six bundles, all attached prompts, three depths, normal/fast adapters and planned/unplanned routes. Deep kind steering is expected and present. |
| Token/hash receipts | Independently executed canonical `countSpecTokens` and SHA-256 assertions over all12 NEW specs/details. Every stored hash and count matches; maximum164≤300. Counts are in the table below. |
| Legacy content and pair preservation | Independent serialized assertions against `c04-baseline.json` passed for all471 prior reference objects, allowing only the four declared additive prompt/keyword overlays. All44 prior single objects match exactly. Git-object byte comparisons passed for old `bert-figure-references.js`, `bert-figure-data.js`, `reference-single-variants.js` and `set3-token-budgets.json`. Native NEW Standards create no eligible composition parent or new single/pair obligation. |
| Existing route regression evidence | Read coordinator receipts: `c04-selector-replay.json` reports3135 prior cases with zero moved picks,24/24 source/depth hits, zero collisions and24 actual planned-schema checks. `c04-paraphrase-replay.json` reports45/45 NEW paraphrase hits. `c04-full-green.txt` ends with1371 passed,0 failed,0 skipped. These are inspected coordinator results, not rerun by this reviewer. |

## Independently verified per-view receipts

| NEW point | Overview | Standard | Deep | Deep detail |
|---|---:|---:|---:|---:|
| Supplied message/class pairs |79|108|112|147|
| Computed summary-token readout |128|164|95|149|
| Modality feature/classifier analogy |82|97|102|102|

The supported native depth split faithfully implements the accepted content revision. The disconnected relationship graph was correctly abandoned without adding a false connection. Existing BERT lineage, mask, next-sentence and task-head references preserve their actual depth behavior, including NSP separators/summary readout in the existing Deep caption.

No repository file was changed and no broad suite, browser, network, install, provider, release or deployment action was run by this review. The only output written is this report. Final preview/contact-sheet acceptance and publication remain coordinator-owned.
