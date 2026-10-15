# Remove from canvas context (Materials)

Owner request, 2026-10-14: a trash icon on each file row in Materials (the Sources pane), beside Attach/Detach.

## The three actions
- Attach / Detach: whether this conversation sends the material (chat-context.js attached refs). Unchanged.
- Remove from canvas context (trash icon, tooltip and accessible label "Remove from canvas context"): the file leaves this
  canvas's Materials list and every future AI request. A confirmation comes first.
- The panel's top-right × only closes the panel. Unchanged.

## Design (no D1 migration)
- A removed context document keeps its row and its bytes. `DELETE /api/learn/context/<id>` sets `attached = -1` (the column
  is an INTEGER with no CHECK). The list, the count of 20, the on/off budget and the switched-on documents read only rows with
  `attached >= 0`. GET of the list also returns `removed: [ids]`.
- PDF cards and pages already on a canvas name the document by id (`doc:ctx:...`). Reading them goes through ownDocument,
  which still finds a removed row, so the card, its reader and page-specific AI access keep working. A Chat turn's doc ref at
  a page (`range.page`) and a Tutor turn's `page_context` doc still send that document. A whole-document ref (no page) to a
  removed document is not sent.
- Stale chips: the browser drops every whole-document ref to a removed id from the open conversation's attachments.
  This covers the conversation open at removal and any conversation restored later. Earlier chat messages are not rewritten.
- Permission: the context routes already admit only the canvas owner (canvasAccess, owner-only). The trash icon shows only
  on rows that come from that owner's server list. Anyone else is refused by the server.
- Failure: the row stays, an inline error names the reason, and the trash icon stays available to retry.
- ponytail: the bytes of a removed document are never reclaimed, because nothing counts references to them across canvases
  and copies. Add a sweep when storage matters: a removed row that no board block names.

## Checks
- control-plane/test/learn-context-docs.test.js covers removal, the owner-only refusal, kept bytes, page refs still sending
  and whole refs not sending.
- web/src/chat-context.test.mjs covers the stale-chip rule.
- web/e2e/materials-remove-check.mjs, on the local stack, covers the trash icon, Cancel, confirm, reload, page blocks,
  the reader, a page question and a failed removal.
