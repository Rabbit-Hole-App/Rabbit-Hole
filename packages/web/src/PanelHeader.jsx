import { useState } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, Files, FolderTree, Link2, MessageCircle, MessageSquareText, Network, PanelLeft, Pin, Search, X } from 'lucide-react';
import { findMatches } from './canvas-find.js';

// The canvas's right panel header (owner, 2026-10-07; docs/features/panel-header.md): icon tabs grouped left in one
// rounded control - Chat (permanent and first, owner brief 2026-10-13 section 3), Find, Table of contents, Comments - then
// Pin and Close on the right. Icons only:
// the label is the tooltip and the accessible name. Comments (docs/features/canvas-comments.md) selects on a saved
// top-level canvas (commentsOn); anywhere else its slot never selects (aria-disabled, skipped by the arrow keys).
// Navigation styling (owner brief 2026-10-16 item 3; the approved toc-upload-context mockup): 30 x 32 icon buttons 2px apart,
// no enclosing box; the active tab is a rounded soft purple (--nav-selected-bg) with a purple icon (--nav-selected-fg), both
// flipped in .dark; inactive icons are a muted neutral, and hover is the neutral --color-hover, never the selected purple.
export const PANEL_TABS = [
  { id: 'chat', label: 'Chat', Icon: MessageSquareText },
  { id: 'find', label: 'Find text on canvas', Icon: Search },
  { id: 'toc', label: 'Table of contents', Icon: BookOpen },
  { id: 'comments', label: 'Comments', Icon: MessageCircle },
  // Links (canvas references, owner 2026-10-14 Q3): fifth - links from this canvas and its backlinks.
  { id: 'links', label: 'Links', Icon: Link2 },
];
// The companion column's viewers (owner decision 1A, 2026-10-15): Context (Materials and the reader) always, the repository's
// Files and Graph where the canvas has them. They left Chat's tabs, so Chat stays visible beside any of them.
export const COMPANION_VIEWS = [
  { id: 'context', label: 'Context', Icon: Files },
  { id: 'files', label: 'Files', Icon: FolderTree },
  { id: 'graph', label: 'Graph', Icon: Network },
];
const OFF_TITLE = 'Comments are on saved canvases';

// commentsUnread: threads with news for you; the Comments tab carries a dot while there are any.
// tocPending: Tutor proposals waiting for Apply or Discard (R4); the Table of contents tab carries a dot and says how many.
// companion (owner brief 2026-10-16 items 3-4): the ONE control that opens and closes the Context / Files / Graph column
// beside Chat - { views (the labels it opens), open, onToggle }; a pressed toggle at the utilities' end, never a tab.
export const companionLabel = views => (views.length > 1 ? `${views.slice(0, -1).map(view => view.label).join(', ')} and ${views.at(-1).label}` : views[0]?.label || 'Context');
export default function PanelHeader({ tab, onTab, pinned, onPin, onClose, commentsOn = false, commentsUnread = 0, tocPending = 0, companion = null }) {
  const off = id => id === 'comments' && !commentsOn;
  const ENABLED = PANEL_TABS.filter(entry => !off(entry.id)).map(entry => entry.id);
  // Arrow keys move between the enabled tabs and select as they go (the WAI-ARIA tabs pattern).
  const arrow = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = ENABLED[(ENABLED.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : ENABLED.length - 1)) % ENABLED.length];
    onTab(next);
    event.currentTarget.querySelector(`[data-panel-tab="${next}"]`)?.focus();
  };
  return (
    <div data-panel-header className="-mx-5 mb-3 flex shrink-0 items-center justify-between gap-2 border-b border-line px-5 pb-2.5">
      {/* Too many tabs for a narrow panel: the row scrolls sideways (no bar; a focused tab scrolls into view), never squeezed. */}
      <div role="tablist" aria-label="Panel views" onKeyDown={arrow} className="flex min-w-0 items-center gap-0.5 overflow-x-auto p-0.5 [scrollbar-width:none]">
        {PANEL_TABS.map(({ id, label, Icon }) => { const disabled = off(id), title = disabled ? OFF_TITLE : label, pending = id === 'toc' && tocPending > 0; return (
          <button key={id} type="button" role="tab" data-panel-tab={id} aria-label={pending ? `${label}, ${tocPending} proposal${tocPending === 1 ? '' : 's'} to review` : label} title={title}
            aria-selected={tab === id} aria-disabled={disabled || undefined} tabIndex={tab === id ? 0 : -1}
            onClick={disabled ? undefined : () => onTab(id, true)}
            className={`relative flex h-8 w-[30px] shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${tab === id ? 'bg-(--nav-selected-bg) text-(--nav-selected-fg)' : disabled ? 'cursor-default text-ink-3 opacity-60' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
            {id === 'comments' && commentsOn && commentsUnread > 0 && <span data-unread-dot aria-hidden className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent ring-1 ring-white" />}
            {pending && <span data-toc-pending aria-hidden className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent ring-1 ring-white" />}
            <Icon size={16} strokeWidth={1.8} aria-hidden />
          </button>
        ); })}
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-0.5">
        {companion && (() => { const name = companionLabel(companion.views); return (
          <button type="button" data-panel-companion aria-label={name} title={name} aria-pressed={companion.open} onClick={companion.onToggle}
            className={`flex h-8 w-[30px] items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${companion.open ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}><PanelLeft size={16} strokeWidth={1.8} aria-hidden /></button>
        ); })()}
        <button type="button" data-panel-pin aria-label="Keep sidebar open" title="Keep sidebar open" aria-pressed={pinned} onClick={() => onPin(!pinned)}
          className={`flex h-8 w-[30px] items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${pinned ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
          <Pin size={16} strokeWidth={1.8} fill={pinned ? 'currentColor' : 'none'} aria-hidden /></button>
        <button type="button" data-panel-close aria-label="Close sidebar" title="Close sidebar" onClick={onClose}
          className="flex h-8 w-[30px] items-center justify-center rounded-md text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"><X size={16} strokeWidth={1.8} aria-hidden /></button>
      </div>
    </div>
  );
}

// The companion column's header: its viewers as labelled tabs, then Close (the column only; Chat stays). Below lg the column
// shows in Chat's place, so Back to chat stands in for Close there.
export function CompanionHeader({ views, view, onView, onClose }) {
  // A view switch (pressed buttons), not a second tablist: Chat's tabs stay the page's one tablist.
  return (
    <div data-companion-header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
      <button type="button" data-companion-back onClick={onClose} aria-label="Back to chat" title="Back to chat"
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink lg:hidden"><ArrowLeft size={15} strokeWidth={1.8} aria-hidden />Chat</button>
      <div role="group" aria-label="Viewer" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {views.map(({ id, label, Icon }) => (
          <button key={id} type="button" data-companion-view={id} aria-pressed={view === id} onClick={() => onView(id)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm ${view === id ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
            <Icon size={15} strokeWidth={1.8} aria-hidden />{label}
          </button>
        ))}
      </div>
      <button type="button" data-companion-close onClick={onClose} aria-label="Close viewer" title="Close viewer"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink max-lg:hidden"><X size={15} strokeWidth={1.8} aria-hidden /></button>
    </div>
  );
}

// Find: matches as you type, one per card; Enter, the arrows or a row frames the card and selects it - the same
// select-and-frame the Files panel uses (focusBlock). Nothing leaves the browser.
// cards() is read on each render, so an edit made while the tab is open counts from the next keystroke.
export function CanvasFind({ cards, onFocus, inputRef, hidden }) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(-1);
  const matches = findMatches(cards(), query);
  const current = at < matches.length ? at : -1;
  const go = step => {
    if (!matches.length) return;
    const next = current < 0 ? (step > 0 ? 0 : matches.length - 1) : (current + step + matches.length) % matches.length;
    setAt(next);
    onFocus(matches[next].id);
  };
  const pick = index => { setAt(index); onFocus(matches[index].id); };
  return (
    <div role="tabpanel" aria-label="Find text on canvas" data-canvas-find className={`${hidden ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
      <div className="flex items-center gap-1">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line px-2 focus-within:border-ink-3">
          <Search size={14} aria-hidden className="shrink-0 text-ink-3" />
          <input ref={inputRef} type="text" aria-label="Find text on canvas" placeholder="Find on this canvas" value={query}
            onChange={event => { setQuery(event.target.value); setAt(-1); }}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); go(event.shiftKey ? -1 : 1); }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setQuery(''); setAt(-1); }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
        </label>
        <span data-find-count aria-live="polite" className="min-w-14 text-center text-xs tabular-nums text-ink-2">
          {query.trim() ? (current >= 0 ? `${current + 1} of ${matches.length}` : `${matches.length} found`) : ''}
        </span>
        <button type="button" aria-label="Previous match" title="Previous match (Shift Enter)" disabled={!matches.length} onClick={() => go(-1)}
          className="flex h-8 w-7 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40"><ChevronUp size={15} aria-hidden /></button>
        <button type="button" aria-label="Next match" title="Next match (Enter)" disabled={!matches.length} onClick={() => go(1)}
          className="flex h-8 w-7 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40"><ChevronDown size={15} aria-hidden /></button>
      </div>
      {query.trim() && !matches.length && <p className="mt-3 text-sm text-ink-2">No matches.</p>}
      <ol className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {matches.map((match, index) => (
          <li key={match.id}>
            <button type="button" data-find-match={match.id} aria-current={index === current ? 'true' : undefined} onClick={() => pick(index)}
              className={`w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover ${index === current ? 'bg-hover' : ''}`}>
              <span className="block truncate text-sm font-medium text-ink">{match.label}</span>
              <span className="line-clamp-2 text-xs text-ink-2">{match.before}<mark className="rounded-sm bg-[#ddd6fe] px-0.5 text-ink">{match.hit}</mark>{match.after}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export { default as CanvasSearchPanel } from './CanvasSearchPanel.jsx';
