import { useMemo, useState } from 'react';

// Sub-lane A1 (layout) owns this file. Contract: chat-workspace-CONTRACT.md A5; brief section 2.
// The right panel is ONE visibility state: open / setOpen (the panel itself) and tab / setTab ('chat' | 'find' | 'toc' |
// 'comments' | 'context' | 'files'). Context is the Sources experience (Materials and the reader), a tab like the others
// (docs/features/hide-right-panel.md), so Hide right panel hides it with everything else and reopening restores the tab.
// Derived, for the rest of the workspace: chatOpen, sourcesOpen; openChat(), closeChat(), openSources(), closeSources().
export function useChatPanels() {
  // Brief section 2: the canvas and Chat show from the start.
  const [open, setOpen] = useState(true), [tab, setTab] = useState('chat');
  return useMemo(() => ({
    open, setOpen, tab, setTab, chatOpen: open && tab === 'chat', sourcesOpen: open && tab === 'context',
    openChat: () => { setOpen(true); setTab('chat'); }, closeChat: () => setOpen(false),
    // reveal false: a late completion (an upload placed after the learner hid the panel) never reopens it; it shows Context
    // only while the panel is open, and leaves the tab a hidden panel will reopen on as it was.
    openSources: ({ reveal = true } = {}) => { if (reveal) setOpen(true); if (reveal || open) setTab('context'); },
    // Closing Sources goes back to Chat; it never hides the panel (that is Hide right panel's job).
    closeSources: () => setTab('chat'),
  }), [open, tab]);
}
