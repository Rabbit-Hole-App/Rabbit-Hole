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
| Switched on at once | 3 | every switched-on document goes into every request (cost and latency) |

## Storage (dev storage boundary, learn-cleanup.md C1)

- Bytes: `LEARN_MEDIA` at `learn-context/<sha256(org, canvas, email)>/<id>`; the key is derived from
  the session, never from the request.
- List and toggles: `LEARN_DB` table `canvas_context_documents` (learn-migrations/0003).
- Only the canvas owner lists, uploads, toggles or deletes (canvasAccess).

## Routes (dev worker, app origin)

| Route | Does |
|---|---|
| `GET /api/learn/context?app=` | the canvas's documents: id, name, kind, size, attached, created_at |
| `POST /api/learn/context` (multipart `app`, `file`) | stores one document, switched on if fewer than 3 are on |
| `PATCH /api/learn/context/<id>` `{ app, attached }` | toggles it; switching on a fourth is refused (409) |
| `DELETE /api/learn/context/<id>?app=` | removes the row and the bytes |

## Where the documents go

- Chat (`/api/learn/ask` on a canvas): the switched-on documents join the request's extra blocks.
- Cards (`/api/learn/artifact`): the model message becomes the documents followed by the JSON text.
- Tutor (`/api/learn/tutor/plan`): the planner's user message carries the documents before the context.

Not in v1: Word files, per-question selection, search inside documents, cleanup of stored bytes.
