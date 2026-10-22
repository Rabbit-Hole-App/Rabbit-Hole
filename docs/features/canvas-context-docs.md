# Canvas context documents

Status: owner request, 2026-09-30. Choices made by the owner: PDF plus .txt/.md; the list lives in the
backend per canvas; the documents reach chat answers, card generation and the Tutor planner.

## What the learner sees

- **Files > Upload Context** on a canvas uploads a PDF, .txt or .md file. It is stored in the backend
  and is never placed on the canvas.
- **The Files panel** lists the canvas's context documents, each with an on/off toggle and a delete.
- **The chat composer** has a Context button (with the number switched on) that opens the same list
  with the same toggles.
- A document that is switched on is read by the agent on every request from that canvas: the chat
  answer, a card made by a slash command, and the Tutor's planner. A switched-off document is not sent.

## Limits

| | Limit | Why |
|---|---|---|
| PDF | 25 MB, 2,000 pages, `%PDF-` bytes (PDF-02, 2026-10-22; was 5 MB, 100 pages) | stored and read by the reader whole; up to 5 MB and 100 pages it rides a request whole (the model reads at most 100 pages per request), past that only the relevant pages' text does (Long PDFs below) |
| Text (.txt, .md) | 1 MB, valid UTF-8 | sent as a text document |
| Documents per canvas | 20 | a list, not a library |
| Switched on at once | 10 (owner, 2026-10-08; was 3) | every switched-on document goes into every request (cost and latency). The header reads `Context · N of 10 on`; `packages/web/src/context-docs.test.mjs` pins the browser's limit to the server's |
| Switched-on budget | 15 MB in all, 2 MB of it text | the most three 5 MB PDFs could already send: 20 MB of base64 inside the API's 32 MB request (12 MB left for a chat attachment or a paper) and the 128 MB isolate. Text is denser in tokens (1 MB is about 300k), so 2 MB of text stays well inside a 1M-token window |

Switching on a document that would pass either budget is refused with one line that names the largest
switched-on documents to switch off, e.g. `notes.md would put 15.1 MB of documents on; the agent reads at
most 15.0 MB at once. Switch off c.pdf first.` An upload that would pass a budget (or the count) arrives
switched off. As a backstop, `contextDocumentBlocks` never sends past the count or the budget even if rows
were switched on around the route: it keeps the newest that fit, ends the blocks with a text note naming the
rest, and logs one `learn_context_skipped` line.

A long PDF (one that reads `pages`) counts toward the 15 MB at the 32,000 characters one question sends from it, not at
its file size.

## Long PDFs (PDF-02, owner brief 2026-10-22 section 5)

Any PDF up to 25 MB and 2,000 pages is accepted whole; no page is dropped. Contract for the Context panel:
C:/s/spec/pdfctx/contract-pdf-status.md.

- **Reading the pages.** Before uploading, the browser reads every page's text with pdf.js
  (`packages/web/src/context-doc-pages.js`): deterministic, no model call, one document at a time per tab, at most 120
  seconds, at most 20,000 characters per page (a longer page is cut and marked, never dropped), 8 MB of text in all. The
  upload carries it as the form field `pages` (one string per page). The server stores it beside the bytes:
  `<key>.pages` (the texts) and `<key>.meta` (`{ total, noText }`, or `{ total, error }` when the browser could not read
  them). No migration; the lists read each PDF's small `.meta`.
- **Every entry** carries `pages`, `status` (`ready` | `failed`), `reads` (`whole` up to 5 MB and 100 pages, else
  `pages`), `noText` (pages without a text layer: scanned, no OCR) and `error` (`{ code, message }` when failed:
  `pages_failed`, the browser's reason, or `pages_unread`, a long PDF stored without its text). While the browser reads,
  the hook `useContextProcessing(app)` lists it as processing with `done` of `total` pages.
- **Retry**: `PUT /api/learn/context/<id>/pages { app, pages }`, owner only; `retryContextDoc(app, id)` reads the stored
  PDF again in the browser and sends it.
- **A question** about a long PDF sends a text document of the pages it needs, within 32,000 characters
  (`pdf-pages.js selectPages`): the page a chip or the reader is on and its neighbours, pages the question names ("page
  250", "pp. 101-103"), then the pages whose words best match the question (tf-idf), then the first pages. Its header
  names the pages included and says the others were not sent, which pages have no text, and that figures are not
  included. The whole file is never sent. A failed one sends a line naming it as not read.
- **Uploaded papers** (PDF onto the canvas, `/api/learn/paper`) take the same `pages` field; `paper_context.page` and the
  Tutor's `page_context` accept pages up to 2,000. A paper past 100 pages or 5 MB whose pages the browser could not read
  is not uploaded (the dialog says why; add it again).
- **Reader, highlights and excerpts** are unchanged and have no page cap: every page opens, and a highlight or region
  anchor past page 100 keeps its exact page and rectangles (pdf-excerpts.md).
- The page text comes from the owner's own browser and reaches only the owner's own requests, like a pasted note; the
  server bounds its size, not its truth.
- Not done: OCR of scanned pages; the older one-shot chat attachment outside the Learn chat (ask.js, 4 MB) still sends a
  PDF whole.

## Storage (dev storage boundary, learn-cleanup.md C1)

- Bytes: `LEARN_MEDIA` at `learn-context/<sha256(org, canvas, email)>/<id>`; the key is derived from
  the session, never from the request.
- List and toggles: `LEARN_DB` table `canvas_context_documents` (learn-migrations/0003).
- Only the canvas owner lists, uploads, toggles or deletes (canvasAccess).

## Routes (dev worker, app origin)

| Route | Does |
|---|---|
| `GET /api/learn/context?app=` | the canvas's documents: id, name, kind, size, attached, created_at |
| `POST /api/learn/context` (multipart `app`, `file`) | stores one document, switched on if fewer than 10 are on and it fits the budget |
| `GET /api/learn/context/<id>?app=` | the document's bytes (PDF or UTF-8 text, `nosniff`, `Cache-Control: private`), owner only, else 404; the Chat's Sources reader |
| `PATCH /api/learn/context/<id>` `{ app, attached }` | toggles it; switching on an eleventh, or one past the budget, is refused (409) |
| `DELETE /api/learn/context/<id>?app=` | removes the row and the bytes |

## Where the documents go

- Chat (`/api/learn/ask` on a canvas): the switched-on documents join the request's extra blocks.
- Cards (`/api/learn/artifact`): the model message becomes the documents followed by the JSON text.
- Tutor (`/api/learn/tutor/plan`): the planner's user message carries the documents before the context.

Not in v1: Word files, per-question selection, search inside documents, cleanup of stored bytes.
