import { useMemo, useRef, useState } from 'react';

// Sub-lane A1 (layout) owns this file. Contract: chat-workspace-CONTRACT.md A5; brief section 2.
// Shape every other sub-lane relies on:
//   { chatOpen, sourcesOpen, view: 'chat' | 'sources' (the narrow switch), openChat(), closeChat(), openSources(), closeSources(), setView(view) }
// A1 adds, for LearnPage's right panel: open / setOpen (the panel holding Chat and the other tabs), tab / setTab
// ('chat' | 'find' | 'toc' | 'comments' | 'files'), layout ('both' | 'switch') and measure.chat / measure.sources (each panel's onWidth).

// Canvas, Sources and Chat sit side by side only while the canvas keeps at least canvasMin px; otherwise one pane shows
// with a Chat/Sources switch. Below lg a panel reports available 0, so the stacked phone layout always switches.
export const CANVAS_MIN = 480;
export const layoutFor = ({ available, chat, sources, canvasMin = CANVAS_MIN }) => (available - chat - sources >= canvasMin ? 'both' : 'switch');

export function useChatPanels() {
  // Brief section 2: the canvas and Chat show from the start.
  const [open, setOpen] = useState(true), [tab, setTab] = useState('chat');
  const [sourcesOpen, setSourcesOpen] = useState(false), [view, setView] = useState('chat');
  // Each ResizableSidePanel reports its width and its parent's room (onWidth). The sizes live in a ref and only the
  // decision is state, so dragging a divider re-renders the page only when the layout flips.
  const size = useRef({ available: 0, chat: 420, sources: 400 }), [fit, setFit] = useState('both');
  const measure = useMemo(() => Object.fromEntries(['chat', 'sources'].map(pane => [pane, (width, available) => { size.current = { ...size.current, [pane]: width, available }; setFit(layoutFor(size.current)); }])), []);
  const layout = open && sourcesOpen ? fit : 'both';
  return useMemo(() => ({
    open, setOpen, tab, setTab, chatOpen: open && tab === 'chat', sourcesOpen, view, setView, layout, measure,
    openChat: () => { setOpen(true); setTab('chat'); setView('chat'); }, closeChat: () => setOpen(false),
    openSources: () => { setSourcesOpen(true); setView('sources'); }, closeSources: () => { setSourcesOpen(false); setView('chat'); },
  }), [open, tab, sourcesOpen, view, layout, measure]);
}
