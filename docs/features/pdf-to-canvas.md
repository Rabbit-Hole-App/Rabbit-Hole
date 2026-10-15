# PDF to canvas

Owner brief, 2026-10-15. Status: in development on `feature/pdf-to-canvas`.

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
  aspect ratio, as one undoable insert.
- **Saving.** Page images and the PDF card's bytes are board assets: the browser cache plus the board's server copy, keyed by
  asset key. They survive a reload and open on another device. No blob URL is ever stored.
- **No side effects on the source.** Adding never attaches, detaches or deletes the context document. Deleting a page or card
  never deletes the document. Drawing pages calls no model.
- **Limits.** As today, an uploaded PDF over 100 pages is refused before upload, and context documents are capped at 100 at
  their own upload.

## Out of scope

- Editable PDF text. Pages stay images, as slides do today.
- arXiv papers in Sources: they were not uploaded.
- ponytail: Add to chat on a page of an *uploaded paper* still attaches a card ref (text only), as before. Its selected-card
  path does send the page (`paper_context`). Give it a paper ref when the Chat server reads paper refs.

## Verification

`e2e/pdf-to-canvas-check.mjs` runs on the local stack and makes no model call:
- one PDF card;
- all pages, a middle range, and a single-page range;
- invalid ranges, Cancel and Escape;
- Undo;
- reload and asset restoration, from a fresh browser profile;
- a question about imported page 12, which sends page 12 of the right source (doc ref, page 12), never page 1.

Unit: `pdf-source.test.mjs` and `card-selection.test.mjs`.
