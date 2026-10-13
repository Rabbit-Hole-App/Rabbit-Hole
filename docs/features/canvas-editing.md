# Canvas editing (Excalidraw-standard interactions)

Owner briefs, 2026-10-12, relayed by the r36 operator: brief 1, canvas editing to an Excalidraw-like standard, and brief 2,
six further changes. Brief 2 replaces brief 1 where they overlap, including the dropped custom Ctrl-click deselection rule.
This document records what is built on `feature/toolbar` and how it behaves. Excalidraw (MIT) was the interaction
reference only; no Excalidraw code is copied.

The canvas stays the plain React surface in `AdaptiveCanvas.jsx`. Cards, notebooks, equations, Tutor, Rabbit Holes,
comments, sharing and save/conflict handling are unchanged.

## Where the code is

| Concern | File |
|---|---|
| Formatted-text model: runs, validation, mixed values, reconciliation | `packages/web/src/learn-rich-text.js` (+ test) |
| The one canvas text editor (text boxes, notes, shape text, labels) | `packages/web/src/RichText.jsx` |
| Style panel | `packages/web/src/CanvasStylePanel.jsx` |
| What the panel shows; paint order steps; arrowheads; copy/paste style | `packages/web/src/learn-style-panel.js` (+ test) |
| Shift/Alt drawing and resize geometry | `packages/web/src/learn-draw-modifiers.js` (+ test) |
| Suggestion refresh | `packages/web/src/learn-next-steps.js` `nextStepsController().refresh()`, card in `ask.jsx` |
| Browser acceptance | `packages/web/e2e/canvas-editing-check.mjs` on `e2e/canvas-editing-harness.html` |

## 1. Text

- **One editor.** Standalone text, sticky notes, closed-shape text and connector/arrow labels all edit through `RichText`.
  React renders no children into it. Words are painted from runs and read back from the DOM, so re-renders, streaming
  answers and panel presses never move the caret or wipe what is typed.
- **Select, then edit.** A single click selects. Double-click edits, with the caret where you pressed. Enter on one
  selected text box, note, shape or line also edits it, unless the selection is a card that opens, which keeps Enter for
  opening.
- **While editing,** a click places the caret and a drag selects characters. Neither moves the object or pans the
  canvas. The text cursor shows.
- **Keys.** Enter inserts a line break. Esc or Ctrl/Cmd+Enter finishes and leaves the object selected. A press anywhere
  else also finishes. While an editor is open it owns every key: Backspace/Delete, arrows, Ctrl+A/C/X/V and Ctrl+Z/Y
  never reach the canvas (the canvas key handler returns early for `[data-rich-editor]`). Ctrl+B/I/U toggle formatting.
  Undo inside the editor is its own stack, with typing coalesced per pause. The finished edit is one canvas undo step,
  and an edit that changed nothing leaves no step.
- **IME.** Composition is never intercepted; Enter during composition is ignored by the editor. A pending caret format
  is applied to the composed text when it lands.
- **Paste** inserts `text/plain` only, with line breaks kept. HTML is never kept or drawn.
- **A new text box or note is selected** the moment it is placed, so the panel formats it while you type.
- **Text boxes** (brief 2 §1) sit directly on the canvas with a transparent background. A new text box has no width and
  grows with its words (`width: max-content`). Dragging its corner gives it a width to wrap at, and wrapping changes,
  never the font size. Boxes saved before this keep their saved width.
- **Notes** grow with their words instead of clipping them (their saved `h` is now a minimum height).
- **Shape text** never overflows silently. While you type, and after any change to the words or their formatting, a
  shape whose words need more height grows downward. Opening a board never resizes anything. Resizing a shape stops at
  the height its words need at that width (`resizeBox` floor via `measureHeight`), and the font size never shrinks.

## 2. Formatting

Six controls: font family (Sans = Inter, Serif = system Georgia/Cambria/Times, Mono = system monospace stack; no new
font files), font size (typed 8–160, half-point steps, presets 12–64 via −/+ and a list), bold, italic, underline and
text color (swatches, any color, hex). H1/H2/H3/H4/Text presets stay. A preset sets the level and drops a custom size
and bold (on the object and its characters). Left/center/right alignment applies to every text kind. Top/middle/bottom
applies to text inside closed shapes.

- With a character range selected in the editor, the range takes the format. With a caret and no range, the format
  waits for the next typing and is dropped when the caret moves. With a selected object (not editing), the whole object
  takes it, and its characters let go of that key.
- The panel shows the selection's real value, or **Mixed** (pressed controls show `aria-pressed="mixed"`, a dashed
  outline and a Mixed tag). It never shows one object's value as everyone's.
- Shape and line text color (`textColor`) is independent of outline and fill. A shape or label whose words used to
  follow the stroke color takes that color as its `textColor` the moment the stroke changes, so old boards look the same
  and the words keep their color. A text box's text color is its `color`, as before.

### Stored shape (backward compatible)

```
text: 'plain words\nwith breaks'    // unchanged; the only thing Tutor, search, copy, shared ask and a11y read
runs?: [{ t, b?, i?, u?, c?, f?, s? }]  // only when something is formatted; t's join to exactly `text`
font? fontSize? bold? italic? underline? textColor? align? valign? mode?: 'code'
```

`runsOf()` draws saved runs only when they still spell `text`, and draws the plain text otherwise. Every value is
validated before it is drawn: hex colors, known font keys, clamped sizes, booleans. Old objects have no `runs` and load
as before. The fields are plain JSON on items, shapes and links, so they survive undo/redo, duplicate, copy/paste, the
server save, reload and forks (the board state is stored verbatim). Connector and arrow labels keep `label` as their
plain text and use the same `runs`.

## 3. Text / Code

A visible Text | Code switch sits on a selected standalone text box and in the panel. It sits beside the box's H1–Text ladder.
When Ask in chat shares the ladder's row, the switch moves to a line of its own above it, so the pill stays at the box's
right edge. Code
shows the same object, words, line breaks and indentation in monospace with `white-space: pre`, on a light code tint,
and Tab inserts two spaces. Nothing is executed, no model is called, and no notebook is made. Text formatting is kept
aside while in Code mode. Words edited in Code mode are saved, and `reconcileRuns()` carries the old formatting over to
the unchanged parts, with replaced words looking like what they replaced. Switching back therefore restores the
formatting without restoring stale words. The switch is one undo step and persists as `mode: 'code'`. Notebook and
imported-code cards are untouched.

**Language and colors** (owner, 2026-10-13: "does it show the code in colors based on the language? should be have a
dropdown so that we can select the languages when selecting Code?"):

- In Code mode a language dropdown sits beside the Text | Code switch, on the box and in the panel: Python (the
  default), JavaScript, TypeScript, JSON, Bash, SQL, HTML, CSS, C, C++, Java, Go, Rust, Markdown, Plain text. The
  choice persists as `lang` on the item (`python`, `javascript`, `typescript`, `json`, `bash`, `sql`, `html`, `css`,
  `c`, `cpp`, `java`, `go`, `rust`, `markdown`, `text`); a box with no `lang`, or one not in the list, is Python.
  Changing it is one undo step. Switching back to Text keeps `lang` for the next switch to Code.
- A Code box that is not being edited is drawn with syntax colors from shiki (already a dependency, as in
  MermaidDiagram.jsx), loaded by dynamic import the first time a board draws a Code box, so the canvas chunk does not
  carry it. Until it loads, and for Plain text, the box is drawn plain, as before.
- Colors only: a token's color changes, never its font, size, weight or style, so the highlighted box has exactly the
  size and line wraps of the plain one. Words in the theme's plain color keep the box's own text color. Light uses
  github-light; the dark theme uses github-dark, by a CSS variable on each token, so switching theme needs no
  re-highlight.
- While the editor is open the box is plain monospace, as before, so typing, the caret, IME and paste are untouched.
  Leaving the editor draws the colors again.
- Thumbnails and canvas captures copy the drawn box, so they show the colors (thumbnails in the light theme).

## 4. Drawing modifiers

These run through the shared drawing gesture used by the canvas and by Explain Back sketches.

- Shift: rectangle → square, ellipse → circle, lines and arrows at 45° steps. Alt/Option: draw from the centre. Both
  combine.
- Pressing or releasing a modifier mid-drag redraws the preview at once, and the saved shape is the preview's,
  including drags left or up and across the start (`drawGeometry`). Everything is in world units, so zoom never enters.
- Resize handles: Shift keeps the original proportions of closed shapes (and snaps a line end to 45°); Alt keeps the
  centre (for a line, mirrors both ends about the middle).
- Esc cancels an unfinished stroke, shape, resize or move. A cancelled resize drops its undo step. A completed gesture is
  one undo step. While a gesture runs the canvas's own Esc handling stands down.

## 5. Object controls

- **Lock / Unlock** (panel Object row, right-click menu, Edit menu, Ctrl+Shift+L) for cards, shapes, text, notes and
  equations, and whole groups by selecting them. This is separate from Keep tool active. A locked object can be selected
  but is never moved (drag, nudge, align, group drag), resized, edited, restyled or deleted. It shows a small lock badge,
  and the panel says "Locked · Unlock". Connectors follow their ends and have no lock.
- **Nudge** with the arrow keys: 1 world unit, or 10 with Shift. Only while no editor, input, dialog, menu or embedded
  widget owns the keyboard. A run of presses is one undo step.
- **Cut** (Ctrl+X) copies through the existing machinery and deletes only when the copy succeeded. The clipboard keeps
  copies of the cut objects, so pasting after a cut works.
- **Copy/paste/duplicate keep references:** a link between two copied objects is copied with them, and a whole group
  copied becomes a new group of the copies with the same label. A copy never joins the original group, and a copy is
  never locked.
- **Alt/Option-drag** from an object body drags a copy (and the rest of its selection or group); the originals stay. It
  is one undo step. Alt on a resize handle stays centre-resize. Copies are not alignment-snapped while Alt-dragging
  (`ponytail:` note).
- **Paint order:** Bring forward / Send backward (one step, `reorderStep`) beside Bring to front / Send to back, in the
  panel, the right-click menu and the Arrange menu (Ctrl+] / Ctrl+[, with Shift for all the way). They work within the
  shapes layer and the notes layer.
- **Copy style / Paste style** (Ctrl+Alt+C / V, panel, menus) move only appearance a target can show (`styleKeysFor`).
  Words, identity and position never move, and nothing pastes onto a locked object.

## 6. Style panel

The panel stays a compact contextual island, now one column (244 px) of labelled rows: Stroke (or Note paper), Fill
with an adjustable fill opacity (default 25%, which was fixed before), Stroke width and dash, Start/End arrowhead (none,
arrow, triangle, dot, bar; for lines, arrows and connectors), Line route, the Text section, Opacity (the old presets plus
a 0–100% slider), Corners, Layers, Arrange (align, distribute, group and ungroup when two or more pieces are selected),
and Object (lock, copy style, paste style). Every color row has swatches, a picker for any color and a hex field. A
slider drag or a native picker choice is one undo step.

The panel is `data-keep-focus` and swallows pointerdown, so a press there formats the open text without losing its
caret or selection. Its fields (hex, size) take focus briefly and hand it back to the editor, or to the canvas when no
text is open, so the next shortcut reaches the canvas. As with stroke colour, and as in Excalidraw, a value set in the
panel is also armed for the next new object. On a phone (≤ 640 px of
canvas) the panel sits in the tools strip above the canvas and scrolls, so it never covers the text being edited.

Arrowheads are stored as `startHead` / `endHead` on shapes and links. Without them, a drawn arrow, curve, elbow or
diagram connector ends in the open arrow it always had.

## 7. Selection, panning and shortcuts (brief 2 §2, §4)

- Select is the default tool and shows the normal arrow cursor. Objects show a move cursor once selected; card drag
  strips keep their grab handle.
- A plain drag on empty canvas draws a selection rectangle (Shift adds to the selection). It never pans and needs no
  Ctrl. Ctrl-drag still works.
- Panning: the Hand tool (open-hand / grabbing cursor), Space+drag while the canvas owns the keyboard (never a space
  typed into text, the composer, a notebook or a keyboard-focused button; Space still selects a focused card), the
  middle button, and two-finger trackpad scroll (wheel) while Select stays armed. Pinch (Ctrl+wheel) zooms. Scrollable
  card bodies keep their own scrolling.
- Excalidraw selection rules: Shift+click adds an object (its whole group) or takes it out. Ctrl/Cmd+click picks one
  member inside a saved group without ungrouping. Selection never rewrites `groupId`. Esc clears the selection when the
  canvas owns the keyboard. An open editor, dialog or menu gets Esc first (the canvas menu closes on its own; a modal
  dialog keeps the canvas selection).
- Tool keys: V select, H hand, R rectangle, O ellipse, A arrow, L line, P pen, T text, E eraser, N sticky note. They
  stand down while typing, in the composer, notebooks, equations, dialogs and menus, while presenting (L stays the
  laser), and on view-only boards. C stays Comment, and Ctrl/Cmd+K belongs to the inline AI editor lane. Tooltips name
  the keys, and the shortcut sheet lists them all. A pointer press no longer leaves a tool button focused, so Space after
  a click pans.
- Picking a drawing tool (pen, highlighter, eraser, text, equation, sticky note or any shape), by its button or its key,
  clears the selection, as in Excalidraw (owner, 2026-10-13). Select, the Hand, Ask about selection and Space-pan keep it.

## 8. Composer hide (brief 2 §5)

A small chevron on the composer's top edge ("Hide chat composer") takes the composer out of view without unmounting it,
so the draft, attachments, the selected card's context and any running answer all carry on. A compact "Chat" pill
("Show chat composer") brings it back and focuses it. While hidden, the strip reserves only the pill: fit, focus and a
new card's reveal stop above what is actually there (`chromeTop` measures the visible controls). Viewport and selection
are untouched. The right-side node panel is never auto-hidden.

## 9. "Curious where this goes?" (brief 2 §6)

The card's header has Refresh and Minimize. Minimize folds it to a small chip with a Restore button, which frees its
room. Restore shows the same suggestions and makes no request. Refresh calls `nextStepsController().refresh()`, which
uses the same `post` (the same authorization, model, spend limits and tab ceiling). It runs one request at a time, keeps
the current hooks until a usable set lands, keeps them on a failure with "Try again" (a ceiling hit says so, with no
retry), and drops a reply for a basis the canvas has left. It never sends a chat message, navigates, adds a card or
starts a Rabbit Hole. The hook view gains `refresh_state` / `refresh_reason`; the hooks return `refresh()` beside
`select()` (professor-next-steps.md §1.3). Composer visibility and this card's minimized state are independent.

## Verification

- `node --test src/learn-rich-text.test.mjs src/learn-draw-modifiers.test.mjs src/learn-style-panel.test.mjs
  src/learn-next-steps.test.mjs src/next-steps-wiring-ui.test.mjs` (pure logic), plus the full `npm run test:unit`.
- `e2e/canvas-editing-stack-check.mjs` on the keyless local stack (`e2e/journey-local-stack.md`; no model key, nothing
  deployed): formatting, shape text and lock made with real input on the real Learn page, then the server copy, a reload
  in a fresh browser (no localStorage), the view-only share link (no editor, no lock badges) and a viewer's fork carrying
  every field. 11/11.
- `e2e/canvas-editing-check.mjs`: 158 real mouse and keyboard checks against the real `AdaptiveCanvas` in a Vite
  harness. They cover caret and drag selection, multiline persistence, range and caret formatting through panel
  presses and fields, IME (CDP composition), paste, editor undo, Text/Code round trips, shape text color, size and
  growth, labels, every drawing modifier pressed and released mid-drag at 100% and 200% zoom, resize modifiers and Esc,
  lock, nudge, cut/paste with links and groups, Alt-drag, layers, copy/paste style, selection rules, marquee versus Hand,
  Space-pan, wheel pan and pinch, tool keys, Esc with dialogs and menus, old boards, view-only boards, composer hide,
  suggestion minimize/refresh/failure/stale, the phone layout, the Explain Back sketch path, text box auto-width, note
  growth, card lock, panel focus, and a regression check for each finding of the independent review. Trackpad and pinch are synthetic wheel events (CDP), not hardware.
