# Learn mode (owner 2026-11-18 15:19 to 15:38, via the Reviewer)

The camera walk is dropped because the card was too small to read. The walk becomes a layout, built from parts that already exist: pinned Study's split, the right panel, the header's presenting switch, and the walk state.

```
┌──────────────────────────────────────────────────────────────────────┐
│        ‹ Prev   6 / 7 · section title   Next ›            Learn│Canvas │
├──────────────────────────┬───────────────────────────────────────────┤
│ 1.1 section title        │  Cards │ Canvas │ TOC │ Chat              │
│ lead text                │  the stop's card component, pane-wide     │
│ ──────────────────────   │  (notebook / pdf / code / diagram …)      │
│ follow text              │                     scrolls inside        │
├──────────────────────────┴───────────────────────────────────────────┤
│ [+] [▮] [/] [?]  Ask about this canvas                          [↑]  │
└──────────────────────────────────────────────────────────────────────┘
```

1. **Mode.** Learn mode is on exactly while a walk runs (AdaptiveCanvas `walk`).
   - It starts from the contents' Start or Continue, or from the Learn side of the pill.
   - It ends from the Canvas side of the pill, Escape, or the walk ending.
   - Entering (LearnPage, `learn-mode.js learnEnter`) keeps the right panel's open state and tab, and the camera.
   - While it is on, the page header is hidden. The toolbar, both maps and the zoom controls are hidden too, through Study's repository rules (`widgetMode` and `studyRepository` follow the walk).
   - Leaving puts back the kept camera and the right panel.
2. **Top row** (`LearnPane.jsx`, `LEARN_TOP` 56 px). The walk pill is centred: Prev, n / N · section, Next, and the green bar. There is no Exit button.
   - `Learn | Canvas` is the Study toggle (`data-study-toggle`). It reads Learn on a canvas that has built sections, and the header shows the same toggle outside Learn mode.
3. **Left split, the guide.** It shows the section heading (its h2 text item), the stop's lead, a rule, then its follow.
   - Text is at body size, at most 720 px wide.
   - The split width is Study's (`studyLayout`, `study.state.split`).
   - The canvas frame only gets margins (StudyPane's way), so a notebook's iframe never reloads.
4. **Right split, tabs Cards | Canvas | TOC | Chat** (`learnView`).
   - **Cards:** the stop's own card component, drawn directly in the pane at its width (AdaptiveCanvas `learnTab`, `data-learn-card-view`), with no Focus (owner 2026-11-18 16:13).
     - It sits over the canvas surface and under the composer.
     - It is a second instance of the card: edits save through the canvas's `changeBlock`, and the canvas's copy never moves or resizes.
     - A text card runs to its full height and the pane scrolls. A framed card (notebook, PDF, video) keeps its own height.
     - Prev and Next show the next card from its top.
   - **Canvas:** the free canvas, with the stop selected and centred at zoom 1 (`walk.centre`).
   - **TOC and Chat:** the right panel's own tabs. The panel is widened to the split (ResizableSidePanel `fill`) and starts under the rows. In Chat the stop is the canvas selection, so it is the chat's selected context.
   - The divider between the guide and the tabs resizes (drag or arrow keys); the share is Study's split (owner 2026-11-18).
   - The Canvas tab shows the drawing toolbar as View > Toolbar says (never over Cards, TOC or Chat). The toolbar minimizes to one button anywhere, remembered in this browser (owner 2026-11-18).
5. **No Focus** (owner 2026-11-18 16:13). Every way into Focus from a card is removed: the pill's Focus button and the right-click Focus row (focus-study.md section 7). Learn mode uses none.
6. **One composer** (owner 2026-11-18). In Learn mode the chat composer sits where the canvas has it (bottom, centred on the column) in every tab (LearnPane's dock, the same composer moved once).
   - The Chat tab shows only the conversation; it has no composer of its own.
   - The table of contents' own conversation (Ask the Tutor about this outline) is removed everywhere; a contents row's Add to chat goes to the main chat.
7. **Kept as built:** done marks, keys and the rollover into the next section. The fading of text items is dropped, and so is the camera fit (`walkCamera`).
8. **Tests:**
   - `learn-mode.test.mjs`: enter and leave restore, the tabs, and what each stop shows in each tab (`learnView`).
   - `learn-walk.test.mjs`: the green bar.
