# Rabbit Hole — BlockNote-on-Canvas MVP

(Owner brief, received 2026-10-14 about 9:45 PM PT, verbatim. QUEUED: start only after the PDF refinement release is pushed and cleared in production. Then build with subagents, the toolbar session and Home, push and clear, then the owner's second task.)

This replaces the earlier BlockNote brief.

Build one standard BlockNote document within each canvas’s workspace.
The document appears as a portrait-shaped writing surface surrounded by
the existing canvas.

This remains a focused writing MVP—not a Notion clone, a second canvas
engine, or a custom AI editor.

## 1. The central experience

The existing canvas fills the workspace.

In Editor view, a tall document appears within that canvas. Users can
write in it while keeping cards, diagrams, and shapes beside it.

Do not:

- Divide the workspace into separate editor and canvas panes.
- Open the document as a modal.
- Put the document in the right sidebar.
- Replace or remove the existing canvas.
- Add an internal document-tab system.

The existing navigation, drawing toolbar, Rabbit Hole map, Curious widget,
and Chat panel retain their normal locations and behaviour.

Use the existing app, not a separate demo page.

## 2. One document per canvas

Each canvas has one independent BlockNote document.

- Opening Editor again returns to that document.
- Switching between canvases must not mix their documents.
- Creating a new canvas starts with an empty document.
- Entering a child Rabbit Hole does not automatically copy the parent’s
  document.
- Returning to the parent restores its own document.

Use stable canvas/document identifiers, not canvas titles.

The canvas title must not restrict what users can write. Do not insert
topic-specific content or automatically overwrite their first heading.

Multiple documents, document folders, and nested document pages are
outside this MVP.

## 3. View menu and hiding behaviour

Add these choices to the existing View menu:

- Canvas.
- Editor.

Canvas is the default for a canvas where the user has not chosen a mode.

Remember an explicit view choice per user and canvas; it must not change
another viewer’s mode.

### Switching from Editor to Canvas

- Hide the whole document surface, including its text and editor menus.
- Do not delete, clear, flatten, or convert its contents.
- Keep surrounding cards and shapes unchanged.
- Do not leave an invisible layer intercepting canvas input.
- Do not put the visibility toggle into the document’s undo history.

### Switching back to Editor

- Restore the same document and content.
- Preserve the in-session editing position where practical.
- Do not create another editor document or seed it with demo content.
- Do not repeatedly recenter the canvas merely because the mode changed.

Switching modes must not interrupt or lose pending saves.

If the document is off-screen after the user pans elsewhere, provide
“Go to document start” in View. This enables Editor if necessary and
frames the document’s beginning.

## 4. Appearance and first placement

The document should resemble a sheet of paper on a large drawing board.

At normal zoom:

- Target approximately 700–800 pixels of document width.
- Use comfortable desktop padding, approximately 48–64 pixels.
- Start with a minimum height around the visible writing area.
- Grow downward as the content grows.
- Use an opaque surface so canvas dots do not show through.
- Light theme: white page.
- Dark theme: a subtle dark surface distinguishable from the canvas.
- Use a thin border and restrained shadow.

Keep generous visible canvas space around it on desktop.

On first opening:

1. Choose a sensible unoccupied world position where possible.
2. Center the document horizontally within the available canvas viewport,
   accounting for the open Chat panel and existing controls.
3. Show the document’s top edge and first editable block, not its midpoint.
4. Save its world position.

Do not move existing canvas objects to make room.

Once positioned, the document moves and scales with the canvas camera.
It must not remain pinned to the screen or recenter on every render.

Opening or resizing a sidebar must not change the document’s stored
world position.

Handle narrower windows responsively without clipping editor controls.
Do not persist a different shared document layout simply because one
viewer resized their browser.

No document dragging, resize handles, rotation, or free-transform controls
in this MVP.

## 5. A definite start and a continuous document

The document has:

- A clear top boundary.
- Top padding.
- A first editable block.
- A final block followed by comfortable bottom padding.

An empty document begins near the top with BlockNote’s normal writing
placeholder.

It is a continuous document, not an infinite blank sheet:

- Its height follows its content, subject to the minimum page height.
- Adding blocks extends it downward.
- Removing blocks can reduce its height.
- The top position remains stable.
- There are no page numbers, page breaks, or separate page navigation.

“Go to document start” frames the top at a readable zoom. It must not
zoom out to fit a very long document’s entire height.

Do not add a separate mandatory title field or large document header.
Users can create their own heading using BlockNote.

## 6. Scrolling, panning, and zooming

Use one coherent spatial model.

The document grows in canvas coordinates. Reading down it should move
the viewport over that document, keeping nearby canvas objects spatially
consistent.

Do not combine a growing canvas document with an independently scrolling,
fixed-height editor box.

Requirements:

- Wheel/trackpad movement over the writing surface must allow reading
  down and back up the document.
- Integrate this with the canvas camera instead of scrolling the whole
  application shell.
- Preserve existing canvas pan/zoom controls outside the editor.
- Prevent the same gesture from moving both the browser page and canvas.
- Scrollable editor menus consume their own scrolling.
- Wide code/table content may use its own necessary horizontal overflow.
- Typing near the visible bottom must keep the caret visible.
- Keyboard navigation to the document’s start/end must reveal the caret.

The page, text, and surrounding objects scale together under canvas zoom.

BlockNote menus, toolbars, drag handles, and drop indicators must remain
correctly positioned and usable at different zoom levels.

Do not solve menu positioning by rendering controls behind the paper,
under the Chat panel, or outside the visible viewport.

## 7. Relationship between cards and the document

Rabbit Hole cards remain canvas objects.

Users can position them beside the document, but this MVP does not embed
them into BlockNote or make text wrap around them.

Distinguish these operations:

- Moving a Rabbit Hole card: changes its canvas position.
- Moving a BlockNote block: changes its position in the document flow.

Do not interpret dropping a Rabbit Hole card onto the writing surface as:

- Inserting a custom block.
- Copying its content.
- Creating a reference.
- Deleting it from the canvas.

Cards always render and take input above the paper (layers follow-up,
2026-10-15): the paper is the world layer's first child with no z-index,
so a card dropped on the page stays where it was dropped, above the text,
and Send to back never moves a card behind the paper. The drop is not
refused.

A card can pass across the page during a drag to another canvas position.

BlockNote’s native block dragging should work inside the document.
Dragging an editor block outside it must not silently delete it or create
a canvas card.

The paper is an overlay in canvas space, not an automatic layout manager.
Document growth must not move surrounding objects. Objects it later
covers stay above it, intact and accessible in both views.

In Editor view the minimap draws the page's footprint (saved x/y/w plus
the measured height, at least the empty-page height) as a light sheet
under the card markers, and counts it in the minimap's extent. The same
box feeds the chat canvas context.

Cards do not automatically stay attached to particular paragraphs as
text is inserted above them. Paragraph anchoring is deferred.

## 8. Native editing features

Use BlockNote’s built-in editor, menus, and supported text features.

For the installed version, verify the normal functionality of:

- Paragraphs.
- Headings.
- Bulleted and numbered lists.
- Checklists.
- Quotes and dividers where supported.
- Basic tables.
- Code blocks.
- Bold, italic, underline, strikethrough, and inline code.
- Text/background formatting offered by the default editor.
- Ordinary hyperlinks.
- Native block insertion, reordering, nesting, and deletion.
- Copy/paste.
- Undo/Redo.
- The default slash menu, formatting toolbar, and block side menu.

Do not rebuild these controls.

Code blocks display code. They do not execute it or create notebooks.
Do not promise advanced syntax highlighting unless it is configured and
verified in the installed version.

Pin compatible BlockNote package versions and record the exact native
features enabled.

### Media scope

This is a text-first MVP.

Do not add a new document media-upload, PDF-embedding, notebook-embedding,
audio, or video pipeline.

Do not expose unsupported upload/embed actions as if they work. Configure
them out of this MVP and document that scope explicitly.

Existing uploads, PDFs, and media on the surrounding canvas continue to
work unchanged.

Never persist temporary blob URLs or base64 demo uploads as a substitute
for real durable media storage.

## 9. Keyboard focus and event isolation

When the document is being edited:

- Typing edits the document.
- Space inserts a space rather than activating canvas panning.
- Ctrl/Cmd+A selects editor content, not all canvas objects.
- Delete/Backspace edits text, not a previously selected canvas card.
- Ctrl/Cmd+Z and Redo operate on editor history.
- Formatting shortcuts belong to the editor.
- Single-letter canvas tool shortcuts must not fire while typing.
- Clipboard actions must not accidentally operate on canvas objects.

Inside the editor, preserve BlockNote’s native link-shortcut behaviour
where supported. Do not let Ctrl/Cmd+K also invoke Rabbit Hole inline AI.

Outside the editor, existing Rabbit Hole shortcuts continue unchanged.

Escape closes the nearest editor menu first. It must not delete content
or unexpectedly switch off Editor view.

Preserve IME composition and normal text selection.

When the user explicitly selects the canvas Hand tool, pan behaviour
should be clear and consistent. Return to normal text interaction when
the normal selection tool is active.

The document is not an ordinary canvas object that can accidentally be
deleted by a canvas-wide selection and Delete command.

## 10. Saving and restoration are required

Remove the earlier clause making reload persistence optional.

The document must survive:

- Canvas / Editor toggles.
- Navigation to another canvas and back.
- Parent/child Rabbit Hole navigation.
- Page reload.
- Opening the same canvas from another authenticated browser/device
  after a successful save.

Store the native BlockNote document JSON with its IDs, nesting, and
formatting. Do not use plain text, Markdown, or HTML as the authoritative
saved representation.

Reuse the application’s existing persistence patterns where suitable.

Requirements:

- Debounced autosave.
- A small Saving / Saved / Couldn’t save — Retry status, using the
  existing save-status UI where possible.
- Do not claim Saved before server acknowledgement.
- Keep unsaved edits recoverable when a request fails.
- Reuse existing local draft recovery where available.
- Flush pending changes through the normal save path before in-app
  navigation; do not rely only on a browser-unload request.
- Bind every save to its originating canvas/document.
- A late save from canvas A must never update canvas B.
- Prevent older save responses from replacing newer edits.

Load saved content before initializing the editable document. Do not
mount an empty document and autosave it over data still loading.

On load failure, show Retry and preserve the saved document. Do not
silently substitute a new blank document.

Do not silently overwrite conflicting changes from another tab/device.
Use the existing revision/conflict mechanism, or report the gap before
implementation. A new real-time collaboration system is not required.

## 11. Permissions, copying, and document lifecycle

Enforce document read/write permissions on the server.

- Editable canvas: document editable.
- View-only canvas: document readable but not editable.
- Unauthorized canvas: no document data exposure.

A duplicated canvas should receive an independent copy of its document,
not another view into the same mutable document.

Do not lose the document during existing copy, trash, restore, or save
operations.

Hiding Editor is not deletion.

Users may clear document contents through normal editor actions and Undo.
A separate destructive “Delete document” command is unnecessary for this
one-document-per-canvas MVP.

If a schema migration is needed, identify it early and prepare it through
the existing process. Production application requires its own approval.

## 12. Existing chat context

No custom AI controls or Rabbit Hole slash commands inside BlockNote.

However, the writing is part of the canvas, so include it in the existing
whole-canvas context package for ordinary Chat.

Requirements:

- Include current unsaved text when constructing the next request.
- Represent the document clearly as document content.
- Reuse existing context budgets and coverage reporting.
- Include bounded passages when the document is too large.
- Do not label partial inclusion as complete.
- Do not let a long document consume the reserved inventory/context
  budget for the rest of the canvas.
- Hiding Editor changes visibility, not whether its content exists.
- Do not automatically attach unrelated PDFs or linked canvases.

This is context plumbing, not a new agent or model call.

Typing, scrolling, toggling Editor, or opening its menus must trigger
zero AI requests.

Do not implement Ctrl+K AI editing of document text in this MVP.

## 13. Performance and integration

- Lazy-load editor dependencies when practical so ordinary Canvas view
  does not pay the full editor startup cost.
- Keep the editor instance stable during typing, pan/zoom, theme changes,
  and ordinary parent component renders.
- Do not reconstruct it on each keystroke.
- Do not save solely because the camera moved.
- Avoid rendering the entire canvas again for every text change.
- Scope editor styles so they do not alter existing app controls.
- Preserve block IDs across normal edits and saves.
- Record a document schema/version for safe future loading.
- Never silently discard unsupported saved content during an upgrade.

Check a reasonably long fixture, such as 200 mixed text blocks, for typing,
scrolling, selection, and save responsiveness.

Report actual observations; do not claim performance targets were met
without measurement.

## 14. Explicitly deferred

Do not add:

- Rabbit Hole cards embedded inside the document.
- Free-positioned objects within document text.
- Text wrapping around canvas objects.
- Paragraph-anchored canvas cards.
- Custom Rabbit Hole slash commands.
- Inline AI editing or generation inside BlockNote.
- Bidirectional document mentions.
- Multiple documents per canvas.
- Paginated print layouts or PDF export.
- New media-upload or embed systems.
- Real-time collaborative editing.
- A new workspace tab manager.
- Document dragging/resizing controls.

Ordinary text hyperlinks are not the upcoming bidirectional-links feature.

## 15. Focused acceptance checks

Verify the following integrated user scenarios:

1. First opening shows the document’s beginning, centered in the available
   workspace, with surrounding canvas visible.
2. Type and format content, hide Editor, manipulate a nearby card, and
   reopen Editor without losing either set of changes.
3. Reload and reopen from another authenticated browser after saving.
4. Switch between two canvases and a child Rabbit Hole; documents and late
   save responses remain correctly scoped.
5. Write enough content to extend beyond the viewport; scroll to the end
   and return to the beginning.
6. Open slash/formatting/block menus at multiple canvas zoom levels and
   near viewport edges.
7. Reorder native blocks, use Undo/Redo, select all text, paste text, and
   use Delete without affecting canvas objects.
8. Move surrounding cards and attempt an unsupported card-to-document
   drop without losing or duplicating content.
9. Open/resize/close Chat and change themes without resetting the editor.
10. Exercise loading failure, save failure, and the supported recovery path.
11. Verify read-only access and independent document copies.
12. Inspect ordinary chat requests to confirm current document text and
    honest coverage are included without extra AI calls.

Update the existing affected tests in the same commit. Register focused
checks correctly before pushing.

Run required cheap checks before a release gate on the exact candidate.
Do not run repeated full gates while the implementation is still changing.

## 16. Delivery

Provide a working integrated preview containing:

- A first heading.
- Several paragraphs.
- A list and checklist.
- A basic table.
- A code block.
- Enough content to demonstrate scrolling.
- A couple of canvas shapes/cards beside the document.

Seed this only in a test/demo canvas—not into users’ real documents.

Show:

- Canvas view with the document hidden.
- Editor view at its beginning.
- A scrolled position farther down.
- An editor menu at non-default canvas zoom.
- Chat open beside it.
- Light and dark themes.

Report:

1. Exact implementation commit and deployed preview.
2. Native features enabled and deliberate exclusions.
3. Persistence, copy, and permission behaviour.
4. Gesture, keyboard, and scrolling behaviour.
5. Existing chat-context integration and its coverage.
6. Tests actually run, observed results, and remaining limitations.
7. Any migration or release approval still required.

Do not call it complete based only on a screenshot or a successful build.

## Owner decisions, 2026-10-14 about 9:55 PM PT (verbatim)

### A. Store the document inside the existing saved board — A1

Reuse the board’s existing version and 409 conflict mechanism. No new document table or migration.

Requirements:
- Keep the document in a clearly versioned field within the board data.
- Canvas edits and document edits must update the same current board state. Neither save path may overwrite the other with an older snapshot.
- Switching to Canvas hides the document; it must not clear its contents or cancel an unsaved edit.
- Older boards without a document must continue loading normally.
- Confirm that board serialization preserves the document. Do not assume that adding a field automatically makes duplicate, fork, trash and restore work.
- A 409 must preserve the user's unsaved work and use the existing conflict-resolution flow. Never silently overwrite another tab or discard the local document.
- Measure the complete serialized board against the existing size limit. Warn before the limit is reached; a rejected save must retain the unsaved content and clearly show that it has not been saved. Never truncate content automatically.

### B. Remember the view locally — B1

Store Canvas/Editor preference in the browser, scoped to both user and canvas.

- Default to Canvas when no preference exists.
- Restore the preference on reload and when returning to that canvas.
- One user's preference must not affect another user's session.
- This preference does not sync across devices in this MVP.
- Document content remains server-persisted regardless of the local view choice.
- Switching views must not rearrange existing canvas objects.

### C. Home session — C1, with a bounded assignment

You may start Home for one independent slice, such as document appearance and interaction verification.

Keep one owner for board persistence and shared canvas integration. Avoid overlapping edits and additional coordination layers. Do not launch more helpers unless there is a concrete independent task.

### D. Next task

Bidirectional links for cards referencing canvases remains queued after BlockNote. Do not implement it during this MVP.

### Dependencies and verification

- Reuse the installed BlockNote packages.
- Keep the related BlockNote packages on compatible, matching versions. Pin 0.54.0 if that is the existing version; avoid unrelated dependency changes.
- Demo content belongs only in a dedicated preview test canvas.
- No paid model calls.

Use focused checks covering:
1. Write → hide → reopen → reload: document preserved.
2. Alternate canvas and document edits: both preserved.
3. Two-tab conflict: no silent loss.
4. Duplicate/fork and trash/restore: document preserved.
5. Board size-limit rejection: unsaved content retained with a visible error.
6. Read-only access: document visible but not editable.

Reuse existing checks where possible. Report implementation and verification separately, including any remaining limitations.

## Known limitations (release, 2026-10-15)

- **Side menu on hover at the paper's clipped right edge.** BlockNote 0.54's side menu probes the hovered block a second
  time at `elementsFromPoint(block.right - 10, y)` (SideMenu.ts:113-122). When the paper's right edge is clipped by the
  canvas surface (overflow hidden) or sits under the Chat panel - at high zoom, or after panning right - that probe misses,
  so the side menu (drag handle and +) does not appear on hover. The slash menu and keyboard block moves (Shift+Ctrl+Arrow)
  still work. Follow-up, not in this release: a one-line upstream fix (`?? referenceBlock`) through patch-package or a
  BlockNote PR, or a ~20-line CanvasDoc wrapper over `SideMenuView.updateStateFromMousePos`, which relies on ProseMirror's
  private `pluginViews`. Shipped documented: the fix uses internal APIs and needs its own verification (owner ruling,
  lead 2026-10-15 1:25 AM PT).
- **The drag handle's menu opens on press.** BlockNote's shadcn drag handle is a Radix menu that opens on pointerdown, also
  when a block drag follows; while it is open it takes the keys (Ctrl+Z goes to the menu). Escape closes it. Upstream
  behaviour, left as is.
- **Ctrl+Shift+End / Ctrl+Shift+Home** extend the selection with the browser's own move; only Ctrl+End / Ctrl+Home are the
  editor's (CanvasDoc).
- **Synthetic keys faster than the browser's selectionchange** (an End and an Enter in the same task) can act on
  ProseMirror's previous selection. A person cannot type that fast; checks wait for ProseMirror's selection after End.
