# Selection action bar: Add to chat (Ctrl/Cmd+L), Quick Edit (Ctrl/Cmd+K)

Owner brief, 2026-10-13 (verbatim in `agent-coordination/tasks/2026-10-13-selection-action-bar-OWNER.md`): "rename Ask in chat to Add to
chat (ctrl + L) or Quick Edit (ctrl + k) so clicking on a card/group/ etc.. should have these two options", and "Edit or explain" became
"Quick Edit" the same evening. Search moved to Ctrl/Cmd+Shift+F so Ctrl/Cmd+K could be the canvas's.

## What it is

A compact bar with two clickable actions, each with its shortcut in a small muted badge: **Add to chat** `Ctrl+L` and **Quick Edit**
`Ctrl+K` (`Cmd+L` / `Cmd+K` on a Mac; `isMac` in `shortcut-owner.js`). It shows for a selected card, chat card, slide, image, shape, text
object, sticky note, equation, a group, or several objects, and for nothing else. It is one component file, `SelectionActions.jsx`;
`AdaptiveCanvas.jsx` only mounts it and supplies the two actions.

- **One bar per selection.** Where an object already has a row of controls above it - a card's pills (Open, Open in notebook, Ask
  selection), a chat card's (Explain in canvas, Continue convo), a slide, an image, a text box's ladder (H1 to text, Text | Code), a
  note, an equation's size ladder, a text shape's ladder - the two actions join that row as its **trailing segment** (a thin rule
  before it where other controls come first): `SelectionActionsHost`. Everything else (a shape without text, a group, several objects, a
  card with no such row) gets the **floating bar** anchored just above the selection, right-aligned to it, with a small gap
  (`placeBar` in `selection-bar-place.js`): below when there is no room above, kept inside the view, never over the selection. A whole group's selection is its outline with its name chip, so the bar
  sits above the chip, never over it (the chip keeps its rename and its right-click Add comment), and the group's comment pins share
  the bar's row (r38 comments-check 16). A host
  registers itself, and the floating bar stands down while any host shows, so two bars are never drawn. The style island at the left
  is a side panel, not a bar over the selection; nothing is added to it.
- **Hidden** while the inline editor is open, while presenting, on a view-only board, with nothing selected (and for a lone empty text
  box), during a drag, resize, marquee or pan (a press on a card's own button is a click, not a gesture), and while text is typed.
- **Pointer, touch and keyboard.** The buttons are real buttons (tab order, focus ring, press feedback), each with an accessible name,
  a tooltip carrying the shortcut and `aria-keyshortcuts`. Pressing one never moves the focus or clears the selection.
- The per-object **Ask in chat pills are gone** (slide, image, text box, note, card, group); the canvas menu's "Ask about this" and an
  equation's "Ask in chat" are **Add to chat** with the same behaviour as the bar and a `Ctrl L` hint.

## Add to chat

The selection becomes the composer's **context chip** (the same target `armTarget` always armed). One object is its card chip, asked:
its answer lands as a card linked to it. A dropped image is also shown to the tutor (`image-attach`). A group is ONE chip,
`Group: <name>`; several objects, or a shape, are ONE chip named by their count (`2 items`), with a rendered snapshot of their area as
the question's image context (`groupShot`). The chip holds the ids and its text is a getter, read when the question is sent. The
chip is removable with its ×. The composer's draft is **never rewritten** (Ask in chat used to prefill a ready question; that is
gone), **nothing is sent**, the selection stays, and a hidden composer comes back (`small:ask-focus`) and takes the focus.

## Quick Edit

Opens the existing inline editor (`openInline`) on the selection with **Edit selection** active, focus in its prompt, the target
kept, nothing generated until it is submitted; Explain selection stays in its mode dropdown. It calls the same function the Ctrl+K
chord does, with a third argument, `openInline(opened, fromKey, 'edit')` (and `canvasApi.inlineAi('edit')` from the Edit menu). **That
argument is taken by the inline editor branch (feature/inline-context); on this branch it is ignored and the editor opens in its old
default.** `e2e/selection-bar-check.mjs` runs the Edit-mode assertion with `MERGED=1`.

## Shortcuts, owned in one place

`shortcut-owner.js` decides who takes each chord; one capture listener offers a chord to its claimants in priority order and the first
that takes it ends the event, so one key can never open two interfaces. Inside a text input, a code editor or a dialog a chord keeps
its normal meaning unless the claimant owns that field (the canvas's open text editor, the inline editor).

| Chord | Owner |
| --- | --- |
| Ctrl/Cmd+K | the canvas's Quick Edit wherever the canvas has the focus, with a selection or without (nothing eligible: it stays on the canvas and shows the "Select something" hint, never Search); Dive, on a canvas without the inline editor |
| Ctrl/Cmd+L | the canvas, only with a selection, no Shift, the focus not in a text field, the editor closed, not presenting, not view-only; `preventDefault` only then, so the browser's Ctrl+L stays everywhere else |
| Ctrl/Cmd+Shift+F | Search (`Search.jsx`), not inside a text field, code editor or dialog |

Plain L is still the laser and Ctrl+Shift+L still locks. The docs site's own Ctrl+K search (`landing/docs.jsx`) is a separate page and
is unchanged. The `?` sheet lists the three chords; the Search icon's tooltip says Ctrl + Shift + F.

## Verification

- `src/shortcut-owner.test.mjs` (the chords, labels, scoping, one owner per key), `src/selection-bar-place.test.mjs` (placement),
  `src/card-selection.test.mjs`, `src/canvas-equation.test.mjs`, `src/learn-ask-target.test.mjs`, `src/shortcuts-sheet.test.mjs` (the
  wiring).
- `e2e/selection-bar-check.mjs` (the inline harness): one bar for a card, an image, a shape, a text object, a note, a group and
  several objects, above or below and never over the selection; Ctrl and Cmd labels; the actions keep the selection; Quick Edit opens the
  editor and hides the bar; hidden while dragging, typing and with nothing selected; Ctrl+L and Ctrl+K scoping.
- `e2e/add-to-chat-check.mjs` (a local stack): the real composer's chip, the draft kept, nothing sent, the selection kept, the composer
  focused and revealed, a group and a several-object chip, Ctrl+L, and Ctrl+L inside the composer doing nothing.
- `e2e/canvas-shell-check.mjs` (a local stack): Ctrl+K with nothing selected does not open Search, Ctrl+Shift+F does, and Search stays
  clickable on Home.
