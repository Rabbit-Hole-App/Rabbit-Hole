# Card editing and reversible Scrollable / Full content layouts

Shipped scope, exact release evidence and verification limits: [October 17 release receipt](../releases/2026-10-17-card-scroll.md). The brief below records requested behavior; the receipt states the supported card types and intentional restrictions.

Implement two independent features:

1. Ctrl+K → Edit can rewrite a selected card according to the user's instruction.
2. A card can switch between Scrollable and Full content layouts without changing its content.

Do not add collision detection, automatic repositioning or placement confirmation when changing layout. Users will move cards themselves.

## 1. Inspect and reuse existing functionality

Before changing code, inspect:
- supported card types and their content schemas;
- the existing Ctrl+K Edit pipeline, preview and Accept flow;
- card sizing, internal scrolling and resize handles;
- right-click menu conventions;
- board persistence and Undo/Redo;
- read-only/shared-canvas permissions.

Extend these mechanisms rather than creating another editor, card renderer or save path.

Report which card types support each feature. Do not expose a control that silently does nothing on an unsupported card.

## 2. Feature A: rewrite a card with Ctrl+K → Edit

### User flow

1. User selects a supported card.
2. User presses Ctrl+K or Cmd+K.
3. User chooses Edit.
4. User writes an instruction.
5. The existing inline editor shows a proposed revision.
6. Accept updates the original card.
7. Reject, Cancel or Escape leaves the original unchanged.

Examples of valid instructions:
- “Make this shorter.”
- “Explain this for a beginner.”
- “Keep the equations but remove repetition.”
- “Organize this into three sections.”
- “Turn this into a concise summary.”

These are examples, not trigger phrases. Use the existing model-based editing flow to interpret arbitrary supported instructions.

### What the model receives

Supply:
- the selected card's current editable content and structure;
- the user's instruction;
- relevant conversation and surrounding canvas context;
- applicable source references and existing context coverage information.

The selected card is the edit target. Surrounding context helps interpretation but does not authorize modifying other objects.

Do not send only the visible portion of a scrolled card. If its content exceeds the editing budget, handle that limitation explicitly. Never replace a whole card with a rewrite based on an undisclosed partial input.

### Preserve the card's identity

An accepted edit updates the existing card in place.

Preserve:
- card ID and type;
- position;
- connections and canvas references;
- source/provenance metadata where applicable;
- current layout mode;
- width and other user formatting unless the instruction legitimately changes supported formatting.

Do not create a duplicate card as the default result.

Preserve structured content such as headings, lists, equations and code through the card's existing schema. Do not flatten everything into one plain-text field.

Citations must remain correctly associated with the revised statements. Do not preserve a citation merely to make an unsupported rewritten claim look sourced.

### Preview, stale state and Undo

- Use the existing preview and Accept controls.
- Do not mutate the saved card while streaming a proposal.
- Before Accept, verify that the target still exists and that its editable content has not changed since the proposal was prepared.
- If it changed, require regeneration/reconciliation rather than overwriting newer work.
- Refine must revise the current proposal according to the new instruction.
- Accept is one Undo operation.
- Undo restores the previous content and associated size changes.
- Failed or cancelled edits preserve the original.

### Behaviour by layout

Scrollable:
- Preserve the card's existing outer dimensions.
- Let the revised content use its normal internal scrolling behaviour.
- Clamp the internal scroll position if the shortened content makes the previous position invalid.

Full content:
- Preserve its width.
- Recalculate its height to fit the revised content.
- Do not move the card or neighbouring objects.

### Supported scope

Enable this for cards with an existing safe, editable content representation.

Do not treat arbitrary embedded viewers, PDFs, videos or repository graphs as editable text cards.

For repository-backed or uploaded source snapshots, preserve the established read-only/source-version rules. Editing must not overwrite the repository or original uploaded file.

Unsupported cases need a clear explanation or disabled Edit option.

## 3. Feature B: reversible card layout

Add a submenu to the selected card's right-click menu:

Layout
- Scrollable
- Full content

Show the active option with the existing selected/checkmark treatment.

This is a presentation setting, not a card-type conversion.

Switching modes:
- preserves the exact content;
- preserves the card ID, references and connections;
- makes no AI call;
- performs no upload or regeneration;
- remains reversible;
- is included in Undo/Redo.

Existing cards retain their current layout by default. Do not migrate every existing card into Full content.

## 4. Scrollable mode

Retain the existing card behaviour:
- bounded outer dimensions;
- existing width and height resizing;
- internal scrolling where needed.

When switching from Scrollable to Full content, retain the previous Scrollable dimensions.

When switching back:
- restore the last saved Scrollable dimensions;
- if none exist, use the existing card-type default size;
- preserve all content;
- ensure the internal scroll position is valid.

Do not reopen a previously long Full content card as an enormous Scrollable card.

## 5. Full content mode

Full content displays the card's complete supported content without internal horizontal or vertical scrollbars.

- Width is user-adjustable within minimum and maximum bounds.
- Height is automatic.
- Height grows or shrinks as content wraps.
- Do not apply a fixed maximum height that clips content.
- The user navigates long cards through the outer canvas.
- Keep the card header and normal controls usable.

Remove fixed-height content wrappers, line clamps and nested overflow regions that prevent the complete content from appearing.

Do not simply hide scrollbars while leaving content inaccessible.

A collapsed section is not the same as clipped overflow. Preserve intentional disclosure controls, and recalculate height when they open or close.

## 6. Initial width and width limits

Use shared constants for Full content width, not scattered magic numbers.

Initial values:
- Minimum width: 320 canvas units.
- Preferred initial width: 720 canvas units.
- Maximum width: 1200 canvas units.

These are world/canvas dimensions, approximately CSS pixels at 100% zoom. Zooming the canvas must not change the saved width or these limits.

On first conversion:
- use the card's current width if it is within the allowed range;
- clamp it to the minimum or maximum if necessary;
- use the preferred width only when there is no usable existing width.

If the user previously adjusted this card in Full content mode, restore its saved Full content width.

Reuse an existing equivalent sizing token if the app already has one. Keep the values centrally configurable.

A narrow browser viewport must not silently rewrite the saved world-space width.

## 7. Full content resize behaviour

Allow horizontal resizing only.

- Left and right resize handles adjust width.
- Disable top/bottom height handles and ordinary two-axis corner resizing for this mode.
- Recalculate height continuously during width adjustment.
- Preserve font size; reflow the content instead of scaling the whole card.
- Keep the card's top edge anchored while automatic height changes.
- Use the existing canvas resize conventions for left/right anchoring.
- Clamp drag and keyboard resizing to the same width limits.

One resize gesture is one Undo operation, not hundreds of history entries.

Moving the card still uses the existing drag behaviour.

For mixed multi-selections, do not let a group resize bypass the Full content sizing rules. Use the existing constraint system; disable an unsupported resize rather than corrupting the layout.

## 8. Content fitting rules

### Text, headings and lists

Wrap naturally within the card's content width.

Long URLs and unbroken strings must wrap without causing horizontal overflow.

### Code

Use visual soft wrapping in Full content mode.

Do not insert actual line breaks into the stored source. Copying code must return the original source text.

Account for line numbers and indentation in the available width.

### Images and diagrams

Fit within the card's content width while preserving aspect ratio.

Do not crop or stretch images to conceal overflow.

### Tables and equations

Use the existing responsive rendering where it can display the complete content legibly.

Do not force illegible shrinking, clip columns or hide part of an equation.

If a particular card renderer cannot meet the Full content contract, explicitly leave that card type unsupported for now and report why.

### Embedded viewers

Do not automatically apply this mode to interactive graphs, notebooks, PDF readers, videos or other viewers with their own navigation.

Support only card types for which complete content and automatic height have a defined meaning.

## 9. Automatic height measurement

Measure the actual rendered content, including:
- card header and controls;
- padding;
- markdown;
- rendered equations;
- code;
- images after loading;
- expanded sections.

Recalculate when content, width, fonts or loaded assets change.

Convert measurements correctly between screen coordinates and canvas coordinates. A zoom change must not cause the saved card height to multiply or shrink incorrectly.

Avoid ResizeObserver loops and unnecessary board saves.

Treat height as derived from content and width. If the canvas engine requires height in its shape record, update it without creating independent Undo entries for each measurement.

Use the same renderer and typography when measuring and displaying the card.

## 10. No automatic repositioning

Switching to Full content or editing its text may make a card overlap other objects.

That is acceptable for this feature.

- Do not detect collisions.
- Do not prompt the user to move the card.
- Do not automatically move the card.
- Do not move neighbouring objects.
- Do not change the canvas camera just because height changes.

The user controls placement.

## 11. Scrolling and interaction

Scrollable mode retains existing internal scrolling.

Full content mode has no card-body scrolling:
- wheel/trackpad input over ordinary content follows the existing outer-canvas navigation rules;
- text selection and copying still work;
- links, menus and other controls remain interactive;
- interacting with controls must not accidentally drag the card.

Test this at different canvas zoom levels and with the right-side panels open.

## 12. Persistence and permissions

Save layout mode and user-chosen size preferences with the existing card data.

Preserve them across:
- reload;
- returning to the canvas;
- duplicate/fork;
- trash/restore;
- Undo/Redo.

Reuse existing board version-conflict handling. A layout save must not overwrite newer card content, and a content save must not restore an older layout.

Read-only users may view both layouts but cannot persist layout changes, resize cards or edit content.

Do not introduce a new storage system solely for these settings.

## 13. Performance

- Keep width dragging responsive.
- Batch height updates where appropriate.
- Avoid rerendering every card when one card changes size.
- Do not save on every measurement frame.
- Preserve off-screen rendering optimizations without losing the card's correct canvas bounds.
- Do not silently truncate a long card to improve performance.

If extremely large content exceeds a genuine renderer limit, expose that limitation explicitly rather than claiming Full content while hiding part of it.

## 14. Focused verification

Extend existing inline-editor and canvas-card checks.

### Editing

Verify:
- multiple differently worded instructions, not one hardcoded phrase;
- original card identity and references preserved;
- content beyond the current scroll viewport included;
- preview cancellation leaves the card unchanged;
- stale Accept cannot overwrite newer edits;
- one Undo restores the original;
- Full content height updates after shortening or expanding;
- Scrollable outer dimensions remain stable.

### Layout

Verify:
- Scrollable → Full content → Scrollable;
- exact content preserved through switching;
- width minimum and maximum enforced;
- width-only resizing in Full content;
- automatic height at different canvas zoom levels;
- long text, code, loaded images, equations and supported tables;
- no inaccessible content or internal scrollbars in supported Full content cards;
- Copy returns unchanged code despite visual wrapping;
- previous Scrollable size and Full content width restored;
- mode, sizes and content survive reload;
- neighbouring objects and camera remain unchanged;
- read-only restrictions;
- Undo/Redo.

Use deterministic checks for layout and persistence. Any real-model edit verification requires an explicitly authorized budget.

## Deliverable

Report:
- supported card types for Edit and Full content;
- exact implementation commit;
- screenshots of both modes and narrow/wide Full content cards;
- verified behaviour versus untested paths;
- any renderer limitations.

Do not add automatic rearrangement or change the underlying content merely to make Full content fit.

## Correction: content-aware minimum width

Compute the Full content card's minimum width from its rendered content, including padding and controls.

- Text: allow natural wrapping, with a baseline width for readability.
- Images: scale proportionally. Their original pixel width must not become the minimum; use a sensible display minimum.
- Tables: account for columns and readable cell widths. Wrap cell text where appropriate without clipping or collapsing columns into unreadable widths.
- Code: soft-wrap visually, preserving the underlying source.
- Equations and labelled diagrams: respect their readable minimum width; do not shrink them until labels become illegible.

For mixed content, the most restrictive supported element determines the card's minimum width.

Keep minimum width distinct from preferred initial width. A card should initially open at a comfortable width, not necessarily its narrowest allowed width.

The proposed 1200-unit maximum is a default, not a reason to clip content. If a supported element genuinely needs more space, raise the effective maximum to accommodate its minimum.

Recalculate constraints when content changes or assets load. Preserve the user's chosen width whenever it remains valid; otherwise adjust only enough to satisfy the new minimum.

Resizing narrower stops at that minimum. Height remains automatic, with no internal scrollbars.

Do not move the card or its neighbours.