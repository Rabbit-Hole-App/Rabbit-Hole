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
| PDF | 5 MB, 100 pages, `%PDF-` bytes | the model reads at most 100 pages; the bytes are base64'd into each request inside a 128 MB isolate (same as learn-paper.js) |
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

Not bounded: PDF tokens follow pages, and the server does not store page counts (only the browser counts
them, at upload). Ten long PDFs under 15 MB can still pass the model's page or token limit; that ask fails
with the API's error. A pages column would bound it.

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
| `PATCH /api/learn/context/<id>` `{ app, attached }` | toggles it; switching on an eleventh, or one past the budget, is refused (409) |
| `DELETE /api/learn/context/<id>?app=` | removes the row and the bytes |

## Where the documents go

- Chat (`/api/learn/ask` on a canvas): the switched-on documents join the request's extra blocks.
- Cards (`/api/learn/artifact`): the model message becomes the documents followed by the JSON text.
- Tutor (`/api/learn/tutor/plan`): the planner's user message carries the documents before the context.

Not in v1: Word files, per-question selection, search inside documents, cleanup of stored bytes.
