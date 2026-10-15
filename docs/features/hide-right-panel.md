# Hide right panel and the Context tab

Owner, 2026-10-14: "Hide right panel" did nothing while Sources was showing. Also: replace the Chat | Sources switch with a
fifth navigation icon, Context.

## Cause, from the code (dc7f20e7)

- The right panel had two visibility states. `chat-panels.js:16` held `open` (the panel with Chat, Find, Contents, Comments,
  Files), and `chat-panels.js:17` held a separate `sourcesOpen` plus a `view` for the narrow Chat | Sources switch.
- The header toggle (`LearnPage.jsx:1688-1690`) flips only `open`: `setPanelOpen(previous => !previous)`.
- Sources was its own `ResizableSidePanel` beside the panel (`LearnPage.jsx:1743`). That panel collapsed only on
  `!panels.sourcesOpen`, so it ignored `open`. Hiding the panel slid Chat away but left Sources, its reader and Materials on
  screen.
- After switching to Chat the toggle seemed to work: in the switch layout the Chat | Sources switch had already hidden the
  Sources pane (`hidden={switched && panels.view !== 'sources'}`), so collapsing Chat emptied the side. With Sources picked,
  Chat was the hidden one and collapsing it changed nothing visible.
- A late completion had the same split. The upload road calls `openSource` once the pages are placed (`LearnPage.jsx:491`),
  and `openSources` set `sourcesOpen` true, so a dropped PDF finishing after a hide brought Sources back.

## Fix

- One visibility state. Context is a tab of the one panel (`tab === 'context'`). `sourcesOpen` is derived as
  `open && tab === 'context'`, so there is no second flag.
- `openSources()` opens the panel on Context. `openSources({ reveal: false })`, used by the late upload completion, never
  reopens a hidden panel. It switches to Context only while the panel is open.
- `closeSources()` goes back to Chat and never hides the panel. Hiding is the header toggle and the panel's own close.
- `SourcesPane` mounts in a Context tabpanel inside the panel. Like every tab it stays mounted while hidden, so the draft, the
  conversation and the reader's document, page and scroll survive a tab switch or a hide.
- The Chat | Sources switch (`PaneSwitch`) and the narrow `layoutFor` measure are gone, with their reserved space.
- The navigation row is Chat, Find, Contents, Comments, Context, plus repository Files where it applies. Context uses lucide
  `Files`, and so does the composer's Open Context button (`data-chat-sources`, "Context").
- An unpinned panel does not close on a canvas press while Context is showing. Sources never did, and pages are picked on
  the canvas beside it.

## Checks

- `e2e/hide-right-panel-check.mjs` covers:
  - the one navigation row;
  - hide and reopen from Chat (the draft is kept);
  - hide and reopen from Context with and without a PDF reader (the same reader node comes back);
  - keyboard reopen, tooltip and aria-pressed;
  - a held upload completing after a hide (the panel stays hidden);
  - repeated tab and hide cycles: the canvas width comes back, no handle or overlay is left, and saved cards are unmoved.
- `chat-panels.test.mjs` pins the single state.
