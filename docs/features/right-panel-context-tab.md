# Right panel: Context tab and Hide right panel (owner briefs, 2026-10-14 evening)

Two owner briefs for the right panel, kept verbatim. The diagnosed cause and the fix are in hide-right-panel.md.

### Right panel: add Context as the fifth icon and remove “Chat | Sources”

This updates the previous right-panel brief.

### 1. One navigation row

Use this order:

1. Chat — existing chat icon.
2. Search — existing magnifying glass.
3. Contents — existing book icon.
4. Comments — existing speech-bubble icon.
5. Context — add a stacked-documents icon from our existing icon library.

Preserve existing conditional tools, such as repository Files; do not delete those to enforce a five-icon maximum.

Remove the separate “Chat | Sources” segmented control entirely, including its reserved space.

Do not remove the Chat icon or any Sources functionality. The existing Sources experience becomes the Context tab.

### 2. Appearance

- Match the existing icons’ size, spacing, button dimensions, and hover/focus states.
- Use the same purple active-tab treatment.
- Give every icon a tooltip and accessible name; the new one is “Context”.
- Keep this navigation row visible whichever tab is active.
- Keep panel hide/close and resize controls separate from the tab icons.
- At narrow widths, prevent overlap or scrambled wrapping.

### 3. Context contents

Clicking Context displays the existing Materials list and PDF/source reader.

Keep the previously requested controls:
- A clearly visible Upload button at Materials level.
- Per-PDF row actions: canvas Attach/Detach, Add to canvas, Attach to this chat, and Remove from Materials.
- Tooltips, accessible labels, and clear active attachment states.

Opening Context must not automatically attach a document to either the canvas context or the chat.

Update existing actions that open Sources—such as clicking a PDF reference—to activate Context and open the correct document.

### 4. State and behavior

- Use the existing panel navigation mechanism; do not keep a competing Chat/Sources switch behind it.
- Switching tabs preserves the chat draft, conversation, attachment state, and PDF page/reader position.
- Ordinary reopening restores the last active tab.
- An explicit action such as Add to chat can activate Chat, preserving the draft and without sending anything.
- “Hide right panel” must work from Context and every other tab. Reopening restores the previous tab and its state.
- Removing the old switch must not leave a blank header strip or incorrect canvas width.

### 5. Focused verification

Update the existing panel tests to cover:
- Exactly one navigation row; no “Chat | Sources” switch.
- Context opens Materials and the correct PDF.
- Chat ↔ Context preserves both surfaces’ state.
- PDF references open Context; Add to chat opens Chat.
- Hide/reopen works while Context is active.
- Tooltips, keyboard navigation, active styling, and narrow-panel layout work.

Keep this within the current panel/PDF work, not a separate redesign.

### Bug: “Hide right panel” does not work while Sources is selected

Reported behavior:
- Open the right panel and select Sources.
- Click the workspace’s “Hide right panel” control.
- The panel stays visible.
- Switch to Chat and the same control works.

Fix this as part of the current right-panel/PDF work.

### Expected behavior

1. “Hide right panel” collapses the entire right-panel workspace regardless of its active tab: Chat, Sources, or another supported tab.
2. If Sources includes a PDF reader and Materials section, both disappear together.
3. Do not require switching to Chat first, and do not implement an automatic switch to Chat as a workaround.
4. Distinguish the global panel toggle from a PDF reader’s close button. Closing a reader is not the same action as hiding the entire panel.

### Preserve state

Hiding is not deleting, detaching, resetting, or cancelling:
- Preserve the active tab.
- Preserve the open PDF, current page, and reader position.
- Preserve canvas attachments and chat-specific attachments.
- Preserve the active conversation, unsent draft, and pending work.

Reopening should restore Sources if Sources was active, with the same document and page. A late PDF load or chat response must not reopen a panel the user intentionally hid.

### Layout and controls

- After hiding, the canvas must reclaim the panel’s space.
- No blank reserved column, invisible overlay, or resize handle may remain blocking canvas interaction.
- Update the canvas viewport measurements correctly without changing saved card positions or sizes.
- Keep the show-panel control accessible.
- Update its tooltip, accessible name, and expanded state to match actual visibility.
- Support keyboard activation as well as clicking.

### Diagnose before fixing

Reproduce the failure and trace the global toggle through the Chat and Sources render paths. Identify which visibility state or handler actually controls each surface.

Report the cause from the code; do not assume it from the screenshot. Apply the smallest fix at the correct shared boundary, without introducing another competing visibility flag.

### Focused verification

Add a regression that fails before the fix and passes afterward. Cover:

1. Hide/reopen from Chat: conversation and draft remain.
2. Hide/reopen from Sources with a PDF open: Sources, document, and page remain.
3. Hide/reopen from Sources without an open reader.
4. Hide while a PDF is loading: completion does not reopen the panel.
5. Repeated tab switches and hide/show cycles: no stuck panel, leftover overlay, or incorrect canvas width.

Use state-based waits, not fixed sleeps. Reuse the existing panel tests and current release process; no paid AI calls or separate broad testing campaign is needed.

In the handoff, give the root cause, changed files, exact commit, and observed test results.
