# Image interpretation backend checkpoint

Implementation commits: `e533ab3b` (authorized image read receipts), `5e5d2fd6` (equation/native-diagram interpretation envelope), `c49c0eef` (existing artifact handlers, including tables/code).

The server records the image it actually read: immutable file-source ID/revision, or a digest of legacy image bytes. Receipts identify whole-image coverage without exposing storage locators. Unavailable images have no read receipt.

Image-grounded structured output uses the existing content validators, plus at most eight bounded recognition-uncertainty entries. An exclusive clarification can ask about unreadable input without inventing a diagram. Source receipts come from the reader, never model output. Existing artifact output and paid proposals retain the metadata; paid proposals do not execute generation. The public artifact endpoint does not forward caller-supplied receipt fields.

The existing generation request carries the image and envelope. Image-grounded card validation failures do not trigger the artifact handler's automatic repair request. Ordinary non-image handlers retain their existing behavior.

## Verification

- Read receipt assertions initially: **5 passed / 2 failed**, then **23 passed / 0 failed** across reader and inline suites. After the explicit awaited-return refinement, reader checks **7/7**.
- Envelope helper initially: **1 passed / 1 failed** because the test incorrectly treated literal angle-bracket text as unsafe LaTeX. The assertion was corrected to the existing renderer's prohibited `htmlClass` command; no renderer behavior was weakened.
- Equation/native wire: **27 passed / 0 failed** after adding the diagram clarification path identified in review.
- Final reader/envelope/artifact/inline tests: **29 passed / 0 failed / 0 skipped / 0 interrupted**. Model transport is a deterministic fixture; **zero provider requests**.
- Disk exhaustion interrupted an uncommitted artifact-file write. It was reconstructed from the committed base plus the recorded patch; independent review confirmed base authorization, public-input filtering and accounting remained intact. All 29 focused tests passed again before committing `c49c0eef`.

Command: `node --test --test-isolation=none packages/control-plane/src/learn-artifact-image.test.mjs packages/control-plane/src/inline-image-extraction.test.mjs packages/control-plane/src/learn-image-file-context.test.mjs packages/control-plane/test/learn-inline.test.js`.

## Card-session handoff

Commit `6020049e` preserves extraction metadata on both artifact and paid-proposal responses through preview validation and cached reuse. Two regressions failed before the fix (**0 passed / 2 failed**); the complete focused session suite then passed **19 passed / 0 failed / 0 skipped / 0 interrupted**. Command: `node --test --test-isolation=none packages/web/src/inline-ai-session.test.mjs`. These are deterministic transport fixtures, with zero provider requests. Independent review found no session regression. The receiving UI must validate property presence, including malformed/null receipts, rather than silently dropping or ignoring them. This commit alone does not expose the card/table extraction path.

## Not yet established

This is a backend checkpoint, separate from deployed `4341f4ad` and draft PR #4's stable checkpoint. Frontend uncertainty display, receipt persistence, stale-source rejection, original retention and affected browser verification must land atomically before exposure. Real-model recognition accuracy is unverified. Empty uncertainty arrays do not certify correctness; visual interpretation does not establish an original chart dataset. File-range extraction and explicit source replacement are outside this intermediate slice and remain unfinished in the full brief.
