import { useMemo, useState } from 'react';

// Sub-lane A1 (layout) owns this file. Contract: chat-workspace-CONTRACT.md A5; brief section 2.
// The right side is ONE visibility state, open / setOpen, shared by Chat's panel and the companion column: Hide right panel
// hides both and reopening restores both. tab / setTab is Chat's panel tab ('chat' | 'find' | 'toc' | 'comments' | 'links').
// companion (owner decision 1A, 2026-10-15; repo-graph-plan.md Interface 1): the column LEFT of Chat for the viewers - view
// 'context' (Sources: Materials and the reader), 'files' (the repository's code) or 'graph' (its graph). show(view) opens
// it on that view; close() shuts the column and leaves Chat open; toggle() is the header control's press (owner brief
// 2026-10-16 item 4): it opens the column on its last view, or closes it. Its labelled tabs move between the views (no Back).
// Derived, for the rest of the workspace: chatOpen, sourcesOpen; openChat(), closeChat(), openSources(), closeSources().
const wide = () => globalThis.matchMedia?.('(min-width: 64rem)').matches ?? true;
export function useChatPanels() {
  // Brief section 2: the canvas and Chat show from the start.
  const [open, setOpen] = useState(true), [tab, setTab] = useState('chat');
  const [companionOpen, setCompanionOpen] = useState(false), [view, setView] = useState('context');
  return useMemo(() => {
    // reveal false: a late completion (an upload placed after the learner hid the panel) never reopens it; it switches the
    // viewer only while the right side is open, and leaves what a hidden right side reopens on as it was.
    const show = (next, { reveal = true } = {}) => {
      if (reveal) setOpen(true);
      if (!reveal && !open) return;
      setView(next); setCompanionOpen(true);
    };
    const close = () => setCompanionOpen(false);
    const toggle = () => (open && companionOpen ? close() : show(view));
    return {
      open, setOpen, tab, setTab, chatOpen: open && tab === 'chat', sourcesOpen: open && companionOpen && view === 'context',
      companion: { open: companionOpen, view, show, close, toggle },
      // Below lg one column shows at a time, so asking for Chat there puts the viewer away (its state is kept).
      openChat: () => { setOpen(true); setTab('chat'); if (!wide()) close(); }, closeChat: () => setOpen(false),
      openSources: options => show('context', options),
      // Closing Sources closes the companion; Chat stays, and the right side never hides (that is Hide right panel's job).
      closeSources: close,
    };
  }, [open, tab, companionOpen, view]);
}
