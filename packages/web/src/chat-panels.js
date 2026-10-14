import { useMemo, useState } from 'react';

// Sub-lane A1 (layout) owns this file. Contract: chat-workspace-CONTRACT.md A5; brief section 2.
// Shape every other sub-lane relies on:
//   { chatOpen, sourcesOpen, view: 'chat' | 'sources' (the narrow switch), openChat(), closeChat(), openSources(), closeSources(), setView(view) }
// STUB: A1 replaces the body (narrow detection, remembered state); keep the returned names.
export function useChatPanels() {
  const [chatOpen, setChatOpen] = useState(true), [sourcesOpen, setSourcesOpen] = useState(false), [view, setView] = useState('chat');
  return useMemo(() => ({
    chatOpen, sourcesOpen, view, setView,
    openChat: () => { setChatOpen(true); setView('chat'); }, closeChat: () => setChatOpen(false),
    openSources: () => { setSourcesOpen(true); setView('sources'); }, closeSources: () => { setSourcesOpen(false); setView('chat'); },
  }), [chatOpen, sourcesOpen, view]);
}
