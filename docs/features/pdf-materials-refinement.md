# PDF Materials controls, chat-context duplication, and panel clipping
n(Owner brief, 2026-10-14 about 8:35 PM PT, verbatim. It supersedes the earlier scattered PDF row-action requests.)

Implement these as a coordinated refinement of the existing PDF flow.
This supersedes the earlier scattered instructions about PDF row actions.

Do not expand this into new PDF generation, multi-page model support,
or a general canvas redesign.

## 1. Put document-specific actions on each PDF row

Each row in Materials must provide four distinct actions:

| Action | Scope and behaviour |
|---|---|
| Attach/Detach context | Toggle this PDF’s existing canvas-level context setting |
| Add to canvas | Open the existing import dialog for this specific PDF |
| Attach to this chat | Attach this PDF specifically to the active conversation |
| Remove from Materials | Remove this PDF’s Materials/context entry, with confirmation |

These actions must use the PDF ID belonging to that row.

Do not resolve the target from whichever PDF is open in the reader,
the most recently uploaded file, or the first item in the list.

Operating on PDF A must not change PDF B.

### Distinguish the two attachment scopes

Canvas-level Attach/Detach and Attach to this chat are separate:

- Canvas-level attachment follows the existing canvas context behaviour.
- Chat attachment belongs to a particular conversation.
- Changing one must not silently toggle the other.
- If both provide the same document/page to a request, deduplicate the
  actual content while retaining the correct attachment states.

Use tooltips that explicitly name the scope. Do not show two ambiguous
paperclip buttons labelled only “Attach”.

## 2. Clean row layout with icons and tooltips

Use a consistent row structure:

- Expand/collapse control and file icon on the left.
- Filename in the flexible middle area.
- A compact, consistently aligned action group on the right.

Action order:

1. Canvas context Attach/Detach.
2. Add to canvas.
3. Attach to this chat.
4. Remove from Materials.

Keep the destructive remove action visually separated from the others.

Suggested icon meanings, using the existing icon library:

- Paperclip: canvas context.
- Square-plus or equivalent: Add to canvas.
- Chat-plus or equivalent: Attach to this chat.
- Trash: Remove from Materials.

Requirements:

- Icons must be visible before hover.
- Give the controls a subtle visible button surface or border.
- Hover strengthens their appearance; it does not reveal the controls.
- Use consistent sizing, spacing, and click targets.
- Every icon has a tooltip and an accessible name.
- Toggle actions expose their active state, not just a color change.
- Keep the filename readable; truncate it with a full-name tooltip.
- Prevent actions from overlapping or being squeezed out by long names.
- At narrow widths, use a deliberate second action row if necessary.
  Do not allow random wrapping or horizontal clipping.
- Support keyboard focus and touch; do not depend on hover.

Example tooltips:

- “Attach [filename] to canvas context”
- “Detach [filename] from canvas context”
- “Add [filename] to canvas”
- “Attach [filename] to this chat”
- “Remove [filename] from this chat”
- “Remove [filename] from Materials”

Clicking an action must not also expand the row, switch the reader,
or activate another action through event bubbling.

## 3. Simplify the header and keep Upload obvious

Move the document-specific Add to canvas and Attach to this chat actions
into the PDF rows. Do not retain ambiguous header actions that appear
to apply to all Materials.

Preserve the reader title, actual reader controls, and Close button.

Upload remains a Materials-level action because it adds a new file:

- Use an always-visible icon-and-label button.
- Give it a visible background or border in its normal state.
- Keep it readable in light and dark themes.

For the row-level Add to canvas action, use the compact icon button with
its clear tooltip described above. This replaces the earlier instruction
to make the header’s Add to canvas a large primary button.

Do not remove native PDF reader controls such as download or print as
part of this cleanup.

## 4. Preserve the existing per-PDF Add to canvas flow

Clicking a row’s Add to canvas must open the existing dialog with that
row’s correct filename and page count.

Preserve:

- Whole PDF as one card.
- Separate pages.
- All pages or an inclusive From/To range.
- Validation and the correct number of pages in the confirmation label.
- Original page numbers and page-specific context.
- Cancel/Escape adding nothing.
- One Undo for the insertion operation.
- Reusing the stored PDF rather than uploading it again.

Prevent double-clicks while an insertion is already being submitted.

Test with one PDF open in the reader while invoking Add to canvas on
a different row. The clicked row must win.

## 5. Remove from Materials without breaking canvas cards

The trash control means “Remove from Materials”, not “delete this file
everywhere”.

Confirm the action and explain its scope.

On successful removal:

- Remove the Materials entry and its canvas-level context attachment.
- Remove corresponding pending chat attachment references.
- Ensure restoring a chat does not silently resurrect a removed Materials
  attachment.
- Persist the change across reload.
- Do not rewrite previously sent messages or answers.

Existing PDF cards/pages on the canvas must keep working:

- Do not delete them.
- Do not break their reader.
- Do not break explicitly requested page-specific AI access.
- Preserve the underlying file while those references still require it.

Selecting or explicitly attaching a retained canvas card later is a new
user action; it is different from silently restoring the removed
Materials attachment.

Only authorized editors can remove Materials. On failure, show an error
and retain the entry for retry.

Do not add permanent asset deletion or a garbage-collection project here.

## 6. One chat-context representation, not duplicate PDF pills

The reported UI shows the PDF as a selected-context pill above the
composer and again as an attachment inside the composer.

For the same underlying PDF and page scope, show one context entry.

Use the composer’s context area as the single presentation location for
that PDF reference.

Keep “This canvas” as its separate existing board-context chip.

### Selection versus explicit attachment

These are different states of the same reference:

- Selecting a PDF/card provides temporary selection context.
- Add to chat pins that reference to the active conversation.
- Pinning upgrades the existing context entry; it does not create a
  second PDF pill.
- Clearing selection removes a temporary-only reference.
- An explicitly attached reference remains after deselection.

The canvas selection toolbar can retain Add to chat because it performs
the useful action of keeping the reference in the conversation.

Once that exact reference is attached, show an “Added to chat” state
rather than letting repeated clicks create duplicates.

### Identity and page scope

Deduplicate by canonical document identity and original page/range,
not filename or canvas card title.

Requirements:

- Selection and explicit attachment of the same PDF/page share one entry.
- Two different PDFs with identical filenames remain distinct.
- Different pages of the same PDF must not silently overwrite each other.
- Clearly label page-scoped entries with their original page numbers.
- Pin the actual scope when Add to chat is clicked; changing the reader’s
  page afterward must not silently rewrite an existing pinned attachment.
- Deduplicate the request content too—not just the visible chips.

If grouping several pages into one PDF chip, preserve the individual
page references underneath and make the scope inspectable.

Do not claim that several pages were read when the current backend
includes only one. Preserve accurate included-versus-label-only coverage.

### Removing context

Give every chat-context entry a working remove control.

- For a temporary selection reference, use the existing clear-selection
  behaviour.
- For an explicit attachment, remove that attachment and reconcile any
  matching selection-derived entry so the same pill does not immediately
  reappear unchanged.
- Preserve unrelated attachments.
- Never delete the PDF or canvas card.

Canvas-wide attachment remains a separate setting. Its continued
contribution must remain accurately represented in the canvas-context
coverage; removing a chat attachment is not a promise to detach the file
from every other context source.

### Conversation isolation

- Use the active canvas/thread identity captured when the action starts.
- Switching chats updates the row-level chat attachment state.
- Attachments restore with their own conversation.
- New chats do not inherit another thread’s explicit attachments.
- Late saves must not attach files to a newly opened conversation.
- Add to chat may open/focus the existing composer, but must preserve its
  draft and must not send a message or start generation.

## 7. Investigate and fix the right-side clipping

Reported symptom:

A selected PDF card/document is cut off on its right side while the
right-side panel is open. There is also apparently unused workspace
between the visible document edge and the panel.

Do not assume from the screenshot that this is only a z-index issue.

Before choosing a fix:

1. Reproduce with the panel closed, opened, and resized.
2. Record the actual bounds of:
   - The available canvas container.
   - The canvas rendering/clipping surface.
   - The selected card.
   - Its PDF reader/iframe/content viewport.
   - The right-side panel or panels.
3. Inspect the relevant clipping/overflow ancestors and camera transform.
4. Identify which bounds or sizing assumptions disagree.
5. Add a regression check for that specific failure.

Use non-sensitive PDF fixtures for screenshots and CI evidence.

### Required outcome

- The canvas uses its actual available container size.
- Open side panels and their combined widths are accounted for.
- A card inside the visible canvas region must not be cut off by an
  incorrect intermediate clipping boundary.
- PDF content must fit or scroll correctly inside its own reader viewport.
- Selection outlines, resize handles, and floating card actions remain
  correctly aligned.
- Opening or resizing the panel must not permanently change saved card
  positions or dimensions.

For an action that opens Chat or focuses a card, reveal the relevant card
within the available viewport using the existing camera/focus behaviour
after layout has updated.

Do not continuously recenter the board while the user types or pans.

Ordinary clipping at the real edge of an infinite canvas viewport is
expected. The bug is premature clipping or incorrect layout—not that
every object must always fit on-screen.

Do not “fix” this by:

- Drawing cards over the Chat panel.
- Disabling overflow everywhere.
- Shrinking all cards permanently.
- Moving saved objects whenever a panel opens.
- Adding arbitrary fixed offsets or delays.
- Masking a PDF reader sizing bug with unrelated canvas changes.

## 8. Focused verification

Cover these scenarios with the existing application and persistence:

1. Two PDFs: every row action affects only the clicked PDF.
2. Reader displays PDF A while actions are invoked on PDF B.
3. Identical filenames with different document IDs.
4. Canvas context and chat attachment toggles remain independent.
5. Selecting a PDF, then Add to chat, produces one canonical context entry
   and no duplicate document/page content in the request.
6. Deselecting retains a pinned reference but removes temporary-only
   selection context.
7. Removing a reference does not immediately recreate it.
8. Different page references remain accurate and coverage is honest.
9. Chat switching and reload restore only the correct attachments.
10. Materials removal does not break existing PDF cards/pages.
11. Long filenames, narrow panels, keyboard navigation, and both themes.
12. Panel open/close/resize, Add to chat opening a hidden composer, and
    multiple canvas zoom levels do not reproduce the clipping.
13. A representative non-PDF card still lays out and behaves correctly.

These UI, persistence, and request-construction checks need no paid
model calls. Do not expand the separate PDF Tutor verification budget.

Update affected existing tests and the CI map in the same candidate.
Follow the current release requirements without repeatedly running full
gates during development.

## 9. Handoff

Provide:

- The confirmed cause of the clipping, not just the CSS change.
- Screenshots showing the normal, non-hovered Materials row controls.
- Before/after evidence of the duplicate PDF context issue.
- Panel-open and panel-resized screenshots showing the complete card.
- Request evidence showing correct identity, page scope, and deduplication.
- Exact commits, focused test results, and any unverified behaviour.
- Preview/release status.

Keep BlockNote and bidirectional links separate from this refinement.
