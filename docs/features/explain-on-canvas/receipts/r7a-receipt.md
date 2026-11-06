# R7a receipt: long Markdown indexing and explicit coverage

Base: `fe941068917184a183faa533344cde18524a0598` (frozen R4 release tip, `feat/tutor-r4-release-3`, untouched). Branch `feat/tutor-r7a`. Independently releasable; nothing depends on it. Off twice: `ROADMAP_ENABLED` and its own
`ROADMAP_LONG_MARKDOWN_ENABLED` (`longMarkdownEnabled` in `roadmap-source-index.js`). Unset = no D1 statement, no model call, no new response field (tested).

## What it does
- **Deterministic index** (`roadmap-source-index.js`, pure `buildIndex`): ATX headings outside fenced code start sections; each section is tiled by chunks of at most 6,000 characters (paragraph, then line, then hard cut that never splits a surrogate pair).
  Sections and chunks tile the text with no gap or overlap (offsets are UTF-16 code units, the R3/R4 unit). Repeated headings have distinct ids (`s<ordinal>`) and a `dup` count; headingless text and one enormous section are split without loss.
  More than 2,000 headings keeps the extra headings inside the last section and says so (`headings_capped`).
- **Access-scoped, versioned, stored once** (`indexSource`, migration 0042): the index id hashes org, owner, source key, source revision, extractor and chunker versions. The owner-only reader is called on every use, so a cached index is never a credential.
  Another learner or a foreign id gets the same answer as an unknown id. A new revision marks older indices `stale`; reverting to the same bytes revives the same deterministic index. Over-read-limit sources persist as `unreadable` coverage with the reason.
- **Retrieval of original evidence** (`readSourceEvidence`): exact anchor (`chunkId`, `sectionId`, `offset`), then previous/next neighbours, then stable tf-idf (ties by position) over caller terms, bounded by `maxChars` in [200, 24,000]. Excerpts are slices of the live
  authorized source with range, section path and a content hash. Nothing that did not fit is hidden: `omitted` lists it with the reason and `status` is `partial`. An impossible bound, empty query, bad terms or bad anchor is refused, never adjusted.
  Summaries are never returned as evidence. The model-facing tool `read_source_evidence` is added only through `withSourceEvidence(caps, env)` (R4's `CAPABILITIES` is unchanged), with a handler closed over one index id.
- **Summary batches** (`roadmap-source-summary.js`, `agents/roadmap-index.js`, role `roadmap_index`): bounded batches (8 chunks, 36,000 characters), at most 12 calls, 480,000 characters, 3 attempts per batch and 240 s per index (real per-index totals persisted in the batch rows). Each batch row is reserved in D1 before the call; completed batches replay without a call;
  a crashed or unknown outcome is marked `unknown` and never retried blind; an invalid answer, a failure after earlier success, quota exhaustion and each budget ceiling stop the run with a specific reason and keep earlier results. Summaries are navigation only.
  Tested with an injected double; no provider was called.
- **R4 integration** (`roadmap-source-read.js`, additive, only with the switch): an over-bound or over-read-limit whole-source request still returns R4's `source_too_large` refusal, now with `coverage` and `choices`. A choice (`{ kind: 'section', locationId, part }`) resolves server-side
  to an offset range of at most 36,000 characters and is read through R4's unchanged passage path, so the stored scope is an ordinary R4 `passage` scope, the fingerprint and the later planning re-read are unchanged. Choices tile the whole text (units are sections at the deepest level giving at most 40 units, small neighbours packed,
  large units split into parts), so a late chapter, a headingless tail and an enormous single section are all reachable; the list is bounded by construction (about 4 x chars / 36,000, at most 240; tested at the 2 MiB limit).
- **UI limitation handling** (web): `roadmap-source-coverage.js` plus small edits to `roadmap-client.js`, `roadmap-controller.js`, `RoadmapInvitation.jsx`, `RoadmapSurfaces.jsx`. The refused create keeps the server limitation; the Chat strip shows the coverage sentences and one button per part; choosing a part sends the section scope once.
  With no `choices` (switch off) the R4 notice is all there is.

## Tests (all run, all pass)
- `packages/control-plane`: `test/roadmap-source-index.test.js` 12, `test/roadmap-source-retrieval.test.js` 16, `test/roadmap-source-version.test.js` 11; regression `node --test test/roadmap-*.test.js test/source-refs.test.js` 240/240 (before the new files were added).
- `packages/web`: `src/roadmap-source-coverage.test.mjs` 6; with `roadmap-view`, `roadmap-controller`, `roadmap-client` tests 55/55.
- `scripts/ci/check-map.test.mjs` 22/22 with the lead check-map patch applied (and reverted), 21/22 without it.
- Not run: the full control-plane and web suites, `make test-unit`, any browser check.

## Acceptance (v1.4 3.8 R7a, checklist R7a.01 to R7a.03)
Covered: identical bytes give identical chunks; late section beyond the 40,000 bound explained (version test: the last chapter starts after 40,000 and is read as an R4 passage); headingless and enormous single sections; repeated headings; huge fenced block; Unicode offsets;
source replacement (old revision answers `source_changed`, new revision indexed separately, R3 reference rows byte-identical and still naming the old revision); unauthorized cached reads (another learner, foreign id, owner after revocation); versioned caches (extractor version simulated by editing the stored row);
same-version reuse; bounded work (calls, characters, time) with specific reasons; summary failure after earlier success; exhausted budget visible as `summaryGaps` and `summarizedChars` in the limitation; instruction-like source text flagged as data; impossible bounds refused; flag-off no work.
Complete range accounting is in the coverage manifest (`outlined`, `summarized`, `summaryGaps` with reasons, `unreadable`); see `coverageOf`.

NOT covered (state these plainly):
1. **Whole-document planning over a long source is not built.** R4's planner still plans one readable scope (at most 40,000 characters). R7a lets the learner narrow to a part that is read in full. The outline, summaries and `read_source_evidence` exist and are tested, but R4's planner has no tool loop and is not wired to use them.
2. The checklist's selection-replace/detach mutation with its outbox event and "invalidate affected unaccepted proposal/check bindings" (R7a.03) are not built: R4 already stops unaccepted work through `revalidateSourceAsJob`; R7a only marks indices stale. `roadmap-store.js` is untouched.
3. No `e2e/roadmap-source-check.mjs`, no historical-reference screenshot, no navigation-to-exact-passage browser check (Claude does not run browsers; the changed web files select R4's `roadmap-command-check` and `roadmap-mvp-check` in CI, which were not run here).
4. Immutable derivatives are D1 descriptors only (offsets, no source text). No R2 object store (ponytail: recomputable and small).
5. Setext headings (a title over a line of `=`) are not section boundaries; their text stays inside the section above (ponytail: ATX only).
6. No summary trigger is mounted (see `lead-patches/r7a-lead-patches.md`).

## Learner strings for owner approval (all NEW, none approved)
- S40 note, shown only past 2,000 headings: "Only the first 2000 headings are used as section boundaries; the rest of the text stays addressable by part."
- S41 "This file is too large to index (over 2 MB)."
- S42 scope-choice labels: a heading path, "Text before the first heading", "The text", "(repeat 2)", ", part 2 of 3", "A to B" for packed neighbours.
- S43 "That part of the source is not in the current outline. Choose again."
- S44 "This source is longer than one explanation plan can read. Choose a part to explain. Each part is read in full."
- S45 "The outline covers all 900,000 characters of the source."
- S46 "Short summaries exist for 300,000 of 900,000 characters. The rest is outlined only."
- S47 "This file is too large to read, so no part of it can be explained." and "Part of this source could not be read."

No ellipsis, no price, no model name.

## Migration
`learn-migrations/0042-roadmap-source-index.sql` (reserved number): additive `CREATE ... IF NOT EXISTS` for `learn_source_indices` and `learn_source_index_batches`. Not applied to any database. `kind` already admits `'pdf'`, so R7b needs no migration (no 0043).
Schema file append is a Lead patch (`apply-r7a-schema.mjs`).

## Real-model qualification (not run; needs the owner)
Needs: the `roadmap_index` row (lead patch) in the target environment; `makeIndexCallModel(env)` as the transport; a corpus (one long chaptered Markdown around 300,000 characters, one headingless, one with instruction-like text); a reviewer pass on summary fidelity and on
"instruction-like text is summarized, not obeyed"; confirmation of how the usage ledger records platform-funded index calls without a roadmap operation id (unverified).
Cost estimate from `MODEL_PRICES['claude-sonnet-5-5']` ($2 input, $10 output per million tokens) at 4 characters per token: a 36,000-character batch is about 9,600 input tokens ($0.019) plus at most 2,000 output tokens ($0.020), so at most $0.04 a call and $0.47 for a 12-call index.
Three corpus documents at the ceiling: about $1.4 worst case, about $0.9 typical; replays and a second pass over the same revision cost nothing. A cap of $2 would cover one full qualification. This is an estimate, not an approval.

## Unverified
Real provider behavior and ledger accounting for index calls; the browser rendering of the new Chat lines and buttons (unit-rendered with react-dom/server only); D1 (as opposed to node:sqlite) execution of the migration and statements; behavior when the Lead mounts a summary trigger.

## R7a minimum: long Markdown planned across the whole document (branch `feat/tutor-r7a-min`)
What it is: with `ROADMAP_ENABLED` and `ROADMAP_LONG_MARKDOWN_ENABLED` both `true`, the first part offered after an over-bound request is "The whole document" (`locationId: 'long'`, an ordinary part, so the client needs no new call). It creates a roadmap with scope kind `long` (fingerprint over revision and length). Planning (`roadmap-planning.js`) then gives R4's own planner (`roadmap-plan.js`) the document outline (sections as contiguous units that tile the text, at most 150 lines) and the `read_source_evidence` tool instead of the text: at most 4 model turns (each one counted `plan` call through `platformCallModel`, platform-funded), at most 8 reads, at most 60,000 characters of evidence, and the last turn offers `submit_roadmap` only. Step passages are offsets of the live source, so generation, grounding and R3 references are the R4 code on a long source. The server writes the coverage limit as the first assumption ("Coverage: ...", rendered by the existing plan card) and as `plan.sourceCoverage` (planned characters, parts not covered, what was read); coverage gaps are not model-declared in this mode (`ctx.longScope`).
Fallback to "choose a section": switch off after creation, index or outline unavailable, or the model unavailable after the loop spent a call (a retry would pay again). Unavailable before any call stays the R4 retry. Quota, ledger, unknown-outcome and held handling are the R4 code, unchanged.
Also fixed: CRLF fence lines (`buildIndex`), the over-2-MiB learner message and empty offers, summary budget totals 12 calls / 480,000 characters / 240 s (reservation by compare-and-set, per index, persisted attempt cap: commit 45eb81faa).
Not run: a real model. Paid qualification needs the owner: a planning turn carries up to about 90,000 characters (outline plus evidence), so a plan is at most about 4 Opus turns of roughly 25,000 input tokens.
