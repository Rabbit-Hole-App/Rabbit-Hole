# PDF to canvas

Owner brief, 2026-10-14. Status: **shipped** in main 019cc134, released 2026-10-14 at 6:43 PM PT (deploy-prod run
38667019637, build f3bbec635fd944a4, smoke passed). Follow-ups 2-5 are fixed on `fix/pdf-followups` (owner, 2026-10-14
evening) and go out with the next release; until then production has the limitations listed below.

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
    `paper_context { id, page }`. Add to chat on the page attaches the paper's ref at that page,
    `{ sourceId: paper:<id>, kind: web, range: { page } }`, and a question with that chip (selection cleared or not) sends the
    page as `paper_context` (`pdf-source.js` `turnPaper`; one paper page per turn: a selected page, then an open reader, then
    the first such chip).
  - `doc:<context document id>`: a canvas context document. Its bytes come from `/api/learn/context/<id>`. A selected page
    asks with a doc ContextRef `{ sourceId: doc:<id>, kind: doc, range: { page } }` in `context_refs`. Add to chat on the page
    attaches that ref. A context-document id never reaches the paper route, and the reverse holds too.
- **Home canvas and copies.** A PDF card or page also names `home`, the canvas its PDF is stored on (blocks made before this
  are stamped with the source canvas when a canvas is duplicated or forked, `learn-boards.js` `forkState`). On a copy (a
  Duplicate or a fork), the owner's reader and questions still read their own PDF: an upload is read from `home`
  (`?home=`, `paper_context.home`), and a context document by its id among the session user's own documents. Storage keys are
  always derived from the session's org and email (`paperIdentity`, `ownDocument`), so someone else's copy - a fork of a shared
  canvas - is refused with one message for "gone" and "not yours" ("This file is not available to you..."). Sharing a page shares
  its picture only; the whole PDF travels only on a PDF card its owner placed. A page this account cannot read never fails or
  silently drops a question: the model is told it has not seen that page.
- **Page numbers.** Each page block keeps its original page number (`number`), the file name (`label`) and the source key
  (`pdf`). Pages 12-16 stay 12-16 in:
  - the divider labels ("Page 13"), with a leading label when the set does not start at page 1;
  - the card title ("notes.pdf, page 12");
  - Open in reader (it opens at that page);
  - the AI context.
- **Canvas.** The set lands where the learner is looking (existing flow placement), in page order, at each page's own
  aspect ratio, as one undoable insert. A page label and its page are one placement boundary: an insert that would land
  between them lands before the label (`canvas-slots.js` `pairStart`, used by every insert at the view).
- **Auto routing.** A question about exactly one PDF page (the selected page or one page chip) keeps the journey Tutor in Auto:
  its plan request carries the page as `page_context` (`{ paper: { id, page, home? } }` or `{ doc: { id, page } }`), and the
  plan route reads that PDF beside the switched-on documents with a line naming the page (`learn-tutor-routes.js`). A question
  about several pages posts to `/api/learn/ask`, the route that sends them all (`chat-route.js` `pageTurn`). The Tutor route is
  never taken by dropping a page.
- **Saving.** Page images and the PDF card's bytes are board assets: the browser cache plus the board's server copy, keyed by
  asset key. They survive a reload and open on another device. No blob URL is ever stored.
- **No side effects on the source.** Adding never attaches, detaches or deletes the context document. Deleting a page or card
  never deletes the document. Drawing pages calls no model.
- **Limits.** As today, an uploaded PDF over 100 pages is refused before upload, and context documents are capped at 100 at
  their own upload.

## Out of scope

- Editable PDF text. Pages stay images, as slides do today.
- arXiv papers in Sources: they were not uploaded.

## Known limitations

In production (019cc134) until the next release:
- **Add to chat is page-aware only for context-document pages.** A page of a directly uploaded PDF attaches a text-only card
  ref (Follow-up 3).
- **Copied and shared canvases.** On a copy, Open in reader gets 404 and a page question names no document (Follow-up 2).
- **Placement** can split an existing label/page pair (Follow-up 4).
- **Auto** bypasses the journey Tutor for page questions (Follow-up 5).

After the follow-ups, still:
- One uploaded PDF is read per turn (`paper_context`, as the reader holds one paper): the selected page's, else the open
  reader's, else the first uploaded-page chip's. Every other uploaded-PDF page chip in the same question is a label only: the
  composer marks it "label only" (its tooltip says why), and the model is told its content was not included and it has not
  seen it (`chat-modes.js` `chatContext`). The read PDF's own page refs say its PDF is included. Context-document pages all
  ride. Reading several uploaded PDFs in one question is not supported.
- A Tutor turn carries one page; a question about two or more pages is answered by `/api/learn/ask`, not the journey Tutor.
- Someone else's copy of a page (a fork of a shared canvas) shows the page picture, but a question about it is told the PDF
  cannot be read: the picture itself is not sent to the model.
- A copy of a copy made before this release keeps its uploads unreachable (its blocks had no home to stamp).
- A copy in another workspace does not find a context document of the first workspace.

## Follow-ups

Fixed on `fix/pdf-followups` (2026-10-14 evening), verified as listed under Verification, released with the next release.
They stay separate from the CI redesign, F1/F2 and Anatomy.

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
- a question about imported page 12 in Ask sends page 12 of the right source (doc ref, page 12), never page 1; in Auto the
  canvas's journey Tutor answers and its plan request carries `page_context { doc: { id, page: 12 } }` (follow-up 5);
- Add to chat on a context-document page;
- the upload/drop road;
- follow-up 3: Add to chat on the uploaded-PDF page 12 attaches `paper:<id>` at page 12 (no card ref), and with the selection
  cleared the question sends `paper_context { id, page: 12 }`; with a document page 12 also selected, Auto falls back to
  `/api/learn/ask` and both pages ride;
- follow-up 4: a set added with the view centre between the "Page 15" label and page 15 lands before the label, every page
  keeps its label right above it, and one Undo removes only the new set;
- follow-up 2, authorized copy: the owner's Duplicate reads both PDFs (the document by its id, the upload from its home),
  Open in reader on the copy draws page 12, and page 12 there asks with `paper_context { id, page: 12, home }`;
- follow-up 2, unauthorized: another person's fork of the shared canvas holds the page pictures but no whole PDF a page
  brought, and its document and upload requests are refused (404, "not available to you"); the owner's canvas itself is 403;
- the context document is left unchanged.

Release record:
- Result: 21 of 21 on 2026-10-14, about 6:33 PM PT. Evidence is in `C:/s/pdfc/evidence3` on the operator's machine.
- Application: 019cc134. The local build was made from the worktree at that application code. Every later commit on the
  branch changes only the check file.
- Check script: revision c63762a3, file blob 79ba09aa. It was committed after 019cc134, so it is not in the released
  application commit, and it goes out with the next release.
- The same 019cc134 also passed the release gate (run 38664766404), Linux verify and fast-e2e, and the preview deploy and
  smoke (deploy-dev run 38665869204).

Unit: `pdf-source.test.mjs`, `card-selection.test.mjs`, `chat-route.test.mjs`, `canvas-slots.test.mjs` (pairs),
`learn-tutor-page-context.test.mjs`; server `learn-context-docs.test.js` (a copy reads its owner's document, never another
person's), `learn-chat.test.js` (`paper_context.home`), `learn-tutor.test.js` (`page_context`), `canvas-forking.test.js`
(legacy blocks stamped), `repositories.test.js` (an unreadable upload is named, not a failed question).

Follow-ups record (2026-10-14 evening, branch `fix/pdf-followups`): the check, now 26 cases, passed 26 of 26 on the local
stack (evidence `C:/s/pdfc/evidence7` on the operator's machine) against the follow-ups' application code; no model call.
