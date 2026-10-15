# PDF to canvas

Owner brief, 2026-10-14. Status: **shipped, and the lane is closed.** Production is main 019cc134, released 2026-10-14 at
6:43 PM PT (deploy-prod run 38667019637, build f3bbec635fd944a4, smoke passed). The open work is listed under Follow-ups
below.

## What it does

A PDF open in the right-side Sources panel gets an **Add to canvas** action beside its title. It opens a small dialog with
the file name and total pages, and two choices:

1. **PDF card**: the whole PDF as one scrollable card (the existing PDF card).
2. **Separate pages**: each chosen page as its own canvas block, drawn as a page image (the existing slides rendering).
   - **All pages**, or **Page range** From [n] to [n]: inclusive, 1-based PDF page positions.
   - The button says the count: "Add 5 pages" for pages 12-16.
   - Valid only when 1 ≤ From ≤ To ≤ total pages.

Cancel or Escape adds nothing, also while pages are drawing. While it works, the dialog shows progress and takes no
second press. The upload/drop dialog for a new PDF is the same dialog, with the same range option.

## Rules

- **One flow.** Upload/drop (`takePdf`) and Sources share the dialog, the drawing and the insertion (LearnPage
  `placePdf`). An upload is posted only after the choice. A PDF from Sources is never uploaded again: its stored bytes are
  read, and no new context document or paper is created.
- **Source identity.** A PDF's source key is held on the block: on a PDF card it is the `assetKey`; on a page it is `pdf`.
  `pdf-source.js` is the one place that tells the two kinds apart, and nothing else parses the prefix:
  - `pdf:<paper id>`: an uploaded paper. Its bytes come from `/api/learn/paper?id=`. A selected page asks with
    `paper_context { id, page }`. This is unchanged.
  - `doc:<context document id>`: a canvas context document. Its bytes come from `/api/learn/context/<id>`. A selected page
    asks with a doc ContextRef `{ sourceId: doc:<id>, kind: doc, range: { page } }` in `context_refs`. Add to chat on the page
    attaches that ref. A context-document id never reaches the paper route, and the reverse holds too.
- **Page numbers.** Each page block keeps its original page number (`number`), the file name (`label`) and the source key
  (`pdf`). Pages 12-16 stay 12-16 in:
  - the divider labels ("Page 13"), with a leading label when the set does not start at page 1;
  - the card title ("notes.pdf, page 12");
  - Open in reader (it opens at that page);
  - the AI context.
- **Canvas.** The set lands where the learner is looking (existing flow placement), in page order, at each page's own
  aspect ratio, as one undoable insert. Known defect: this can land between an existing page label and its page
  (Follow-up 4).
- **Auto routing (workaround).** A question about a selected PDF page always posts to `/api/learn/ask`, even in Auto mode on a
  canvas with an active journey Tutor (`chat-route.js` `tutorTurn`, `pageTurn`). Before this change the Tutor route
  (`/api/learn/tutor/plan`) silently dropped the page. Keeping the page is correct, but for these turns Auto now bypasses the
  journey Tutor (Follow-up 5).
- **Saving.** Page images and the PDF card's bytes are board assets: the browser cache plus the board's server copy, keyed by
  asset key. They survive a reload and open on another device. No blob URL is ever stored.
- **No side effects on the source.** Adding never attaches, detaches or deletes the context document. Deleting a page or card
  never deletes the document. Drawing pages calls no model.
- **Limits.** As today, an uploaded PDF over 100 pages is refused before upload, and context documents are capped at 100 at
  their own upload.

## Out of scope

- Editable PDF text. Pages stay images, as slides do today.
- arXiv papers in Sources: they were not uploaded.

## Known limitations (shipped in 019cc134)

- **Add to chat is page-aware only for context-document pages.** A context-document page attaches its doc ref at that page.
  A page of a directly uploaded PDF (`pdf:<paper id>`) still attaches a text-only card ref. Its selected-page path does send
  the page (`paper_context`), but only while the page stays selected (Follow-up 3).
- **Copied and shared canvases.** A PDF card or page made from a context document keeps the source canvas's `doc:<id>` key.
  On a copy, Open in reader gets 404 and a page question names no document. The page images still show (Follow-up 2).
- **Placement** can split an existing label/page pair (Follow-up 4).
- **Auto** bypasses the journey Tutor for page questions (Follow-up 5).

## Follow-ups

Use focused checks for each fix and release it through the existing release process. These stay separate from the CI
redesign, F1/F2 and Anatomy.

2. **PDF source access on copied or shared canvases.**
   - A visible PDF card or page keeps its authorized reader and AI context.
   - Resolve the source relationship for the destination canvas, keeping the original page number.
   - Respect permissions: never bypass document authorization, and never expose a whole private PDF because one page was
     shared.
   - Verify an authorized recipient or copy, and an unauthorized-access case.
3. **Add to chat for directly uploaded PDFs.**
   - Add to chat keeps the right PDF and its original page for both origins (`pdf:` and `doc:`).
   - Verify page 12 through both entry paths, including after the selection is cleared.
   - Until this is fixed, report it as a limitation. Never call Add to chat page-aware for every imported PDF.
4. **Insertion between an existing page label and its page.**
   - Treat each label/page pair as one placement boundary that is never split.
   - Insert the new set in available space without splitting existing pairs.
   - Keep page order, original numbering and one Undo for the new set.
   - Keep this a focused placement fix.
5. **Page context in the journey Tutor.**
   - Support the same page context (`paper_context`, or the doc ref at the page) on the Tutor route, so that Auto can route
     page questions to the journey Tutor again.
   - Tutor routing is restored only together with the page. Never restore it at the cost of silently dropping the page.

## Verification

`e2e/pdf-to-canvas-check.mjs` runs on the local stack and makes no model call:
- one PDF card;
- all pages, a middle range, and a single-page range;
- invalid ranges, Cancel and Escape (also while pages draw);
- Undo;
- the server copy, reload, and asset restoration from a fresh browser profile;
- a question about imported page 12, in Ask and in Auto, sends page 12 of the right source (doc ref, page 12), never page 1;
- Add to chat on a context-document page;
- the upload/drop road;
- the context document is left unchanged.

Release record:
- Result: 21 of 21 on 2026-10-14, about 6:33 PM PT. Evidence is in `C:/s/pdfc/evidence3` on the operator's machine.
- Application: 019cc134. The local build was made from the worktree at that application code. Every later commit on the
  branch changes only the check file.
- Check script: revision c63762a3, file blob 79ba09aa. It was committed after 019cc134, so it is not in the released
  application commit, and it goes out with the next release.
- The same 019cc134 also passed the release gate (run 38664766404), Linux verify and fast-e2e, and the preview deploy and
  smoke (deploy-dev run 38665869204).

Unit: `pdf-source.test.mjs`, `card-selection.test.mjs` and `chat-route.test.mjs`.
