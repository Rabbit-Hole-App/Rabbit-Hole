# PDF highlights and excerpts

Owner brief, 2026-10-19 (C:/s/spec/pdf-excerpts/brief.md on the operator's machine). Lane contract:
C:/s/spec/pdf-excerpts/contract.md. Status: implemented on `feature/pdf-excerpts`, not released. Production needs the
owner's GO for migration 0024 and the release.

## What it does

In the companion reader (Context tab, `SourceReader` -> `LearnPaper`), for both PDF origins: canvas context documents
(`doc:ctx:<id>`) and uploaded papers (`pdf:upload:<id>`).

- **Text.** Selecting words on the page shows a small toolbar: Highlight, Add to canvas, Add to chat, and a "Drag to
  canvas" handle. Selecting alone saves nothing and calls nothing; Escape or a click elsewhere dismisses it; copying
  works as before.
- **Region.** "Select region" in the reader header: draw a box on the page, adjust its corners, then Highlight region,
  Add to canvas, Add to chat or Cancel (Escape cancels). One page at a time; the box is clamped to the page.
- **Highlights** are the reader's own marks, private to their author, saved on the server (`pdf_highlights`) for the
  exact document version, and shown wherever that author opens that document. Clicking one offers Add to canvas, Add to
  chat and Delete highlight. The paper card's older highlights (`block.highlights`) are unchanged: they are part of the
  canvas and visible to whoever sees the canvas.
- **Text excerpt card.** An explanation card with the verbatim selection (paragraphs kept), a separate note, and a
  footer with the document title, the printed page label and Open source. No model writes its title.
- **Region excerpt card.** An image file card of a crop rendered from the PDF page itself (no outline, padding or
  overlays), stored as an image file source, so it survives reload and other browsers and follows the canvas's sharing.
- **Open source** opens the PDF in the companion reader at the excerpt's page, scrolls the passage or region into view
  and emphasizes it for a moment. The canvas and its camera stay where they are.
- **Limit.** A text card holds at most 8,000 characters. A longer selection opens a dialog before anything is inserted:
  Shorten selection, Split into N cards (each part whole, in order, one Undo) or Cancel. Nothing is cut silently, on
  the card or on the way to a model.

## Identity, anchors and coordinates

- The document version is the sha256 of its stored bytes, computed by the server (`GET /api/learn/pdf-source`) and
  cached in `pdf_source_hashes`. Context documents have no revision field; their bytes are never replaced in place.
- An anchor (`block.excerpt`, contract "Excerpt") keeps: source key, sha256, document title at capture, home canvas,
  page index and printed label, page rotation and page box, rectangles in PDF user space (points, as pdf.js
  `convertToPdfPoint` gives them), and for text the verbatim quote with a little surrounding text.
  These do not change with zoom, panel width or rotation.
- If the opened document's sha256 differs from the anchor's, the reader says the source changed and does not
  emphasize anything; it never moves the anchor onto other text. If the bytes are refused, the card says the source
  is not available and keeps its notes.

## Access

Every highlight and crop route re-reads the source the way its bytes route does (`readOwnDocument`, `paperIdentity`
with its home) on every call, so a known id or hash never bypasses access or revocation; every refusal is one 404.
A crop is stored only for the board's owner, on a saved board. Viewing a crop follows the canvas
(`authorizeFileSource`: owner, share link, or the board's own file references; a fork inherits them). Opening the
original PDF still needs access to the PDF itself: a fork or share viewer sees the excerpt, and Open source says the
source is not available. Highlights are never shared with the canvas.

## Chat, Ctrl+K and Rabbit Hole

- A text excerpt rides as one `excerpt` context ref: "Verbatim excerpt from <document>, page <n>" plus the quote and
  the learner's note, with up to 12,000 characters per ref. The model is told only this excerpt of the document is
  included. A selected card added with Ctrl+L is the same ref, so it rides once; two excerpts stay two.
- A region excerpt rides as its crop's image file ref, sent to the model as an image (`file-context.js`, coverage
  "image included"). This reaches Ask, Tutor mode and Auto (a file ref sends Auto to `/api/learn/ask`).
- Ctrl+K on an excerpt card is Explain only; a region card's crop is the image Explain reads. The explanation is the
  existing separate note shape, never written into the excerpt.
- Start Rabbit Hole on an excerpt card seeds the child canvas with a copy of the excerpt card (no PDF bytes, no new
  access). From a shared canvas, the child's first card carries the verbatim quote and its source line.
- No model call happens when highlighting, cropping, inserting, opening the source or attaching to chat.

## Storage

Learn migration `0024-pdf-highlights.sql`: `pdf_source_hashes` and `pdf_highlights` (additive). Applied locally and to
`rabbit-hole-learn-dev` (2026-10-19 16:58 PT). Not applied to production. Region crops reuse `file_sources` (0023).

## Known limitations

- One page per selection. A selection that leaves the page is refused with a message.
- Scanned pages have no text layer: the reader says so and offers region selection. No OCR.
- Every highlight or crop call reads the whole stored PDF as its access check (up to the PDF limit).
- Unused crops stay as `file_sources` rows under the existing lifecycle (no cleanup is built for file sources yet).
- Ctrl+K editing of excerpt cards is not offered (Explain only).
- Mocked model responses prove wiring only. Whether a model understands a figure crop is not verified; no paid call
  was made.
