# Learn mode (owner 2026-11-18 15:19 to 15:38, via the Reviewer)

The camera walk is dropped because the card was too small to read. The walk becomes a layout, built from parts that already exist: pinned Study's split and Focus, the right panel, the header's presenting switch, and the walk state.

```
┌──────────────────────────────────────────────────────────────────────┐
│        ‹ Prev   6 / 7 · section title   Next ›            Learn│Canvas │
├──────────────────────────┬───────────────────────────────────────────┤
│ 1.1 section title        │  Cards │ Canvas │ TOC │ Chat              │
│ lead text                │  the stop's card, pane-wide, in Focus     │
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
   - Leaving ends the Focus, which restores the camera and selection, then puts back the kept camera and the right panel.
2. **Top row** (`LearnPane.jsx`, `LEARN_TOP` 56 px). The walk pill is centred: Prev, n / N · section, Next, and the green bar. There is no Exit button.
   - `Learn | Canvas` is the Study toggle (`data-study-toggle`). It reads Learn on a canvas that has built sections, and the header shows the same toggle outside Learn mode.
3. **Left split, the guide.** It shows the section heading (its h2 text item), the stop's lead, a rule, then its follow.
   - Text is at body size, at most 720 px wide.
   - The split width is Study's (`studyLayout`, `study.state.split`).
   - The canvas frame only gets margins (StudyPane's way), so a notebook's iframe never reloads.
4. **Right split, tabs Cards | Canvas | TOC | Chat** (`learnView`).
   - **Cards:** the stop's card in Focus, alone on the surface (`cardOnly`, no Focus header). Prev and Next move Focus to the next card and scroll it to its top.
   - **Canvas:** the free canvas, with the stop selected and centred at zoom 1 (`walk.centre`).
   - **TOC and Chat:** the right panel's own tabs. The panel is widened to the split (ResizableSidePanel `fill`) and starts under the rows. In Chat the stop is the canvas selection, so it is the chat's selected context.
   - Shortcut: the composer is the canvas's own in Cards and Canvas. In TOC and Chat it is the panel's (the same chat), because the canvas strip only mounts while the panel is closed.
5. **Focus adapters** (`focus-adapter-learn.js`).
   - Code (`repo-code`, `snippet`), diagrams (`flow`, `mermaid`) and graphs (`graph`, `plot`) take the pane's width, up to 1200 px, at their own height. A card taller than the pane scrolls inside it.
   - Any other card, in Learn mode only (`ctx.learning`), is drawn at its natural size and centred, so a stop never shows nothing.
6. **Kept as built:** done marks, keys and the rollover into the next section. The fading of text items is dropped, and so is the camera fit (`walkCamera`).
7. **Tests:**
   - `learn-mode.test.mjs`: enter and leave restore, the tabs, and what each stop shows in each tab.
   - `focus-adapter-learn.test.mjs`: which card each adapter claims, and the box it draws.
   - `learn-walk.test.mjs`: the green bar.
