# R7b receipt: PDF text and page references

Base: the R7a tip of `feat/tutor-r7a` (git ordering and the shared index tables only; R7b is independently enabled and tested, and nothing depends on it). R4 base `fe941068917184a183faa533344cde18524a0598` is untouched.
Branch `feat/tutor-r7b`. Off twice: `ROADMAP_ENABLED` and its own `ROADMAP_PDF_ENABLED` (`pdfPlanningEnabled` in `roadmap-source-pdf.js`). Off = the R4 reader answers `unsupported` for a context PDF exactly as before; no D1 statement, no media read, no new response field (tested).
No model, no OCR, no vision, no execution service (the adapter's import list is asserted). No migration: the R7a table already admits `kind = 'pdf'` (0043 unused).

## What it does
- **Reader** (`readPdfTextForActor`, the `readSourceForActor` contract): the learner's own context-document PDF (key `doc:ctx:<12 hex>`, the key R3 already uses), read through a new export beside `readOwnDocument` (`readOwnDocumentPages`: same ownership rule, same object key). The revision is the sha256 of the stored bytes,
  the value R3 stores, read from the `pdf_source_hashes` cache and falling back to hashing the bytes through R3's `sourceHash`. A foreign id, another learner and a removed document are all `missing`; a different revision is `changed`.
- **Page truth, not guesses**: the stored page array is re-validated server-side (`readPageTexts`: strings, 2,000 pages, 20,000 characters a page, 8 MB), and a page count that disagrees with the stored meta is a failed extraction. Each page is `readable`, `cut` (ends with the extraction cut marker; readable but flagged),
  or `unreadable` with a reason: `no_text_layer` (scanned or image page) or `damaged_text`. No stored page text is `pages_unread`; a browser extraction error is `extraction_failed`. None of these produces text.
- **Derivative text for R4**: each page behind a marker line (`--- Page N ---`), an unreadable page as one explicit "no readable text" line, with exact page block and body offsets. `origin: 'browser_pdfjs_text'` is recorded as a declared derivative, never as server extraction or visual verification.
  Page numbers are PDF order from 1; printed page labels are unknown (`printedLabel: null`, `pageLabelsKnown: false`).
- **Index** (`indexPdf`, kind `pdf` rows in the R7a tables): the index id binds the PDF revision AND the extracted page-text hash, so reading the pages again (a retry) is a new derivative, the older index of that PDF becomes `stale`, and its evidence is refused as `source_changed`.
  Delivered cards keep what they were minted against (R3 rows are other tables, untouched). Coverage is in the R7a shape plus the PDF facts: total pages, readable pages, cut pages, and unreadable page runs with reasons.
- **Retrieval** (`readPdfEvidence`, tool `read_pdf_page`): the requested page(s) (a single page also brings its neighbours), then stable tf-idf over the readable pages, bounded by `maxChars` in [200, 24,000]. Excerpts carry page, offsets inside that page's extracted text, a content hash, origin, and role. A requested scanned page is reported in
  `unavailable` with its reason, never returned as text; a scanned page is never ranked. What did not fit is in `omitted` and the status is `partial`. Pages with identical text or repeated running headers stay separate (distinct evidence ids; ties go to the earlier page). The tool replaces R4's disabled `read_pdf_page` entry only through `withPdfPages(caps, env)`;
  `CAPABILITIES` itself is unchanged.
- **R4 integration** (switch-gated, additive): `makeReadSource` accepts a `doc:ctx:` source. A small all-readable PDF is read whole. A PDF with unreadable pages is refused whole (`pdf_partial`) with those pages named; a PDF over the 40,000-character bound is refused with `source_too_large`; both carry `coverage` (including `pages`) and `choices`:
  runs of consecutive readable pages, each at most 36,000 characters of derivative text, tiling every readable page. A chosen range (`{ kind: 'section', locationId: 'pg<first page>' }`) is read through R4's unchanged passage path, so planning, per-step re-reads and checks work on it. A scanned page is never a choice. Not read or failed extraction says so and offers nothing.
  An R3 selected-excerpt scope on a PDF is refused (`invalid_request`): R3 passage navigation and whole-PDF planning stay separate. Request-less revalidation (`revalidateSourceAsJob`) has a D1-only PDF branch (owner row, cached revision); reference minting is skipped for non-file sources.
- **UI** (web, additive to R7a): coverage lines name unreadable pages in plain sentences ("Pages 5 to 7 have no readable text, so they cannot be explained yet."), say how many pages were cut, and say when all pages are readable; the choices are page ranges ("Pages 1 to 4"). Same Chat strip and same controller call as R7a.

## Tests (all run, all pass)
- `packages/control-plane`: `test/roadmap-source-pdf.test.js` 22; regression `node --test test/roadmap-*.test.js test/source-refs.test.js test/pdf-pages.test.js test/context-docs*.test.js` 273/273 (includes R7a's 39 and the R4 suites).
- `packages/web`: `src/roadmap-source-coverage.test.mjs` 7 (one new for pages); with the roadmap view, controller and client tests 57/57.
- `scripts/ci/check-map.test.mjs` 22/22 with the R7a and R7b check-map patches applied (and reverted).
- Not run: the full suites, `make test-unit`, `src/context-doc-pages.test.mjs` (R7b does not edit the browser extractor), any browser check.

## Acceptance (v1.4 3.8 R7b, checklist R7b.01 to R7b.03)
Covered: uploaded-PDF ownership (other learner, foreign id, removed document); mixed text and scans; first and last page; relevant page near the end of a long PDF (page 180 of 200 by term); multiple requested ranges exceeding the bound; empty requested page; cut page; duplicate headers and identical page text;
changed extraction (retry) and changed revision; corrupt text payload, page-count mismatch, oversize page text; unread and failed extraction; page and offset round trip on the stored text; instruction-like text flagged as data; impossible bounds refused; flag off; no vision, OCR or model import; scanned pages never routed anywhere.

NOT covered (state these plainly):
1. **No R3 `sourceRef` on cards made from a PDF range.** R3's PDF anchor needs viewer rectangles. R7b's page/offset references exist only on retrieved evidence. The checklist's "round-trip each returned reference through the existing viewer" is therefore tested as a text round trip (page + offsets reopen the same stored text), not in the viewer.
2. **No PDF invitation and no UI entry that sends a `doc:ctx:` source** (invitations are Markdown-only; the client sends the key it is given). The Chat strip handles the limitation and the page choices when the server returns them.
3. The checklist's "optional bounded summaries" for PDFs, and any whole-document multi-section plan over a PDF larger than one readable range, are not built (same boundary as R7a: R4's planner plans one readable scope and has no tool loop).
4. Uploaded papers (`pdf:upload:<id>`, stored beside their own page text) are not adapted; only context documents (`doc:ctx:<id>`). ponytail: same page-text format, add a key branch when wanted.
5. PDF page-range choices are not capped (R7a's list is bounded by construction; this one is not): a PDF with scans between nearly every page yields up to about 1,000 one-page choices. ponytail: cap with an explicit "more ranges" note if it ever shows up.
6. No `e2e/roadmap-pdf-check.mjs`, screenshots, or route traces (Claude does not run browsers; the changed web files select R4's `roadmap-command-check` and `roadmap-mvp-check` in CI, not run here). No check that the accepted-generation and index accounting stay separate beyond the fact that R7b makes no model call.
7. Reading a PDF with no cached hash reads its bytes (up to 25 MB) once to hash them, as R3 already does for the highlight routes.

## Learner strings for owner approval (all NEW, none approved)
- S48 "The pages of this PDF have not been read yet. Open it in the Context panel and retry reading its pages."
- S49 "This PDF could not be read as text, so it cannot be explained yet."
- S50 "That page range is not available as readable text. Choose another."
- S51 page-range choice labels: "Page 12", "Pages 12 to 20".
- S52 "Some pages of this PDF have no readable text, so the whole PDF cannot be explained. Choose pages to explain."
- S53 "Choose the pages to explain. Each range is read in full."
- S54 "Page 5 has no readable text, so it cannot be explained yet." / "Pages 5 to 7 have no readable text, so they cannot be explained yet."
- S55 "The text of 1 page was cut where it was read." / "The text of 3 pages were cut where it was read."
- S56 "All 40 pages have readable text."

No ellipsis, no price, no model name. (R7a strings S40 to S47 are unchanged.)

## Migration
None. `learn_source_indices.kind` already admits `'pdf'` (0042). 0043 remains unused. Nothing was applied to any database.

## Real-model qualification
None needed: R7b has no model role. (If optional PDF summaries are added later they reuse `roadmap_index` and R7a's estimate: at most about $0.04 a call, $0.47 for a 12-call index.)

## Unverified
Behavior against real R2 and D1 (the tests use node:sqlite and an in-memory object store); real pdf.js page text from scanned or damaged files (damage detection is a heuristic: more than 30 percent replacement or control characters); browser rendering of the new Chat lines; the viewer round trip; the ledger or usage effects of the first-time byte hash on a very large PDF.
