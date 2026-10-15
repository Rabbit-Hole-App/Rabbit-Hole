# Materials rows and Remove from Materials

The spec is C:/s/spec/pdf-materials-refinement.md, sections 1-5.

## Row actions (sections 1-4)
- Each row is `[data-material-row][data-source-id=<its ref sourceId>]`. The expander, file icon and truncated name (full name as
  tooltip) come first. The actions follow in this order, each acting on the row's own document:
  1. Canvas context: Paperclip, aria-pressed, "Attach/Detach <file> to/from canvas context". It toggles the canvas-level flag
     through `PATCH /api/learn/context/<id>` (context-docs.js toggleContextDoc). The document is marked offered first, so switching
     it on never also attaches it to a new chat.
  2. Add to canvas: SquarePlus, "Add <file> to canvas", PDFs only. It dispatches `small:pdf-to-canvas` with this row's
     sourceId. LearnPage opens the existing dialog from that id, and a second press while a job is open is ignored.
  3. This chat: MessageSquarePlus or MessageSquareCheck, aria-pressed, "Attach <file> to this chat" or
     "Remove <file> from this chat". It calls context.attach or context.detach.
  4. After a separator, Remove from Materials.
- Every action calls stopPropagation, so it never expands the row or switches the reader. A failed action stays on its row as
  role=alert.
- Narrower than 22rem, the actions move to a second line inside the row (a container query).
- The header keeps only the reader title, Back, All sources, Open externally and Close. It has no document action.
- Upload stays at the Materials level as a visible secondary button. Its border needs a local `border-[1px]`, because the shared
  variant's border loses to its base `border-0`.
- A pressed toggle carries its own class string. In dark mode, any class naming bg-accent re-pins --color-white, which would
  turn the resting buttons white.
- Note: a new chat already attaches the canvas's switched-on documents (chat-context.js, unchanged), so the chat toggle starts
  pressed for them.


Owner request, 2026-10-14: a trash icon on each file row in Materials (the Sources pane), beside Attach/Detach.

## The three actions
- Attach / Detach: whether this conversation sends the material (chat-context.js attached refs). Unchanged.
- Remove from Materials (trash icon, tooltip and accessible label "Remove <filename> from Materials"): the file leaves this
  canvas's Materials list and every future AI request. A confirmation comes first and says the scope: canvas cards and pages
  that use it keep working, earlier messages stay as they are, and the file is not deleted.
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
