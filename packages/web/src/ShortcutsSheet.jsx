import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input, Tabs, TabsList, TabsTrigger } from './ui.jsx';
import { SECTIONS, TAB_LABELS, isMac, shortcutSections } from './shortcuts.js';
import { chatSendKey } from './ui-prefs.js';

// View > Shortcuts, also ?, (owner brief 2026-11-02): every shortcut from shortcuts.js, one section per tab (Essentials first and
// open), with a search across them all and a Windows / Mac choice that starts on this computer's platform. It is a modal window: focus moves into the search, Tab and
// Shift+Tab stay inside, nothing behind it takes a key while it is open (AdaptiveCanvas, LearnPage, Shell and shortcut-owner.js
// stand down for an aria-modal dialog), Esc closes it once, and focus goes back to what opened it or, when that is gone (a menu
// row), to the canvas (the page body). The header, search and platform choice stay put while the list scrolls.
export const TITLE = 'Shortcuts';
export const FIND = 'Find a shortcut';
const PLATFORMS = [['win', 'Windows'], ['mac', 'Mac']];
const STOPS = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
// Creator Analytics' touch height for its tabs.
const COARSE = '[@media(pointer:coarse)]:min-h-11';

// A shared canvas has no Slash Commands and no right panel, so its window leaves out their keys.
export const SHARED_OMIT = ['slash-commands', 'right-panel'];

// omit: shortcut ids this page does not have.
export default function ShortcutsSheet({ onClose, omit = [] }) {
  const [mac, setMac] = useState(isMac);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(SECTIONS[0]);
  const searching = query.trim() !== '';
  const dialog = useRef(null);
  const sections = shortcutSections({ query, mac, sendKey: chatSendKey(), omit });
  useLayoutEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener?.isConnected && opener !== document.body) opener.focus?.({ preventScroll: true });
      else if (dialog.current?.contains(document.activeElement) || document.activeElement === document.body) document.activeElement?.blur?.();
    };
  }, []);
  const latest = useRef(onClose);
  latest.current = onClose;
  const searchingNow = useRef(false);
  searchingNow.current = searching;
  // Capture, so Esc closes this window and reaches nothing behind it (a selection, an open menu); Tab wraps inside it.
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); latest.current(); return; }
      // Backspace outside the search must not do anything behind the window (an engine that goes Back on it leaves the canvas).
      if (event.key === 'Backspace' && !event.target?.closest?.('input')) { event.preventDefault(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      // The tab row is one stop, its selected tab; the arrows move inside it (Radix Tabs). While a search shows every section no tab
      // is selected and the row is skipped (focusing a tab would select it and clear the search).
      const list = dialog.current.querySelector('[role="tablist"]');
      const stops = [...dialog.current.querySelectorAll(STOPS)].filter(node => node.offsetParent !== null && !list?.contains(node));
      const tabStop = searchingNow.current ? null : list?.querySelector('[role="tab"][aria-selected="true"]');
      if (tabStop) stops.splice(stops.findIndex(node => node.matches('[data-shortcuts-list]')), 0, tabStop);
      if (!stops.length) return;
      // Every Tab is moved here, so the order is the same in every browser (Safari's default Tab skips buttons and would leave).
      event.preventDefault();
      const at = tabStop && list.contains(document.activeElement) ? stops.indexOf(tabStop) : stops.indexOf(document.activeElement);
      stops[(at + (event.shiftKey ? -1 : 1) + stops.length + (at === -1 && event.shiftKey ? 1 : 0)) % stops.length].focus();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  // The platform choice is a radio group: the arrows move between Windows and Mac.
  const arrows = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = !mac;
    setMac(next);
    dialog.current?.querySelector(`[data-shortcuts-platform="${next ? 'mac' : 'win'}"]`)?.focus();
  };
  const rows = section => (
    <ul className="gap-x-8 sm:columns-2">
      {section.rows.map(row => (
        <li key={row.id} data-shortcut={row.id} className="flex break-inside-avoid items-start justify-between gap-3 py-1 text-sm text-ink">
          <span className="min-w-0">
            <span data-shortcut-label>{row.label}</span>
            {row.note && <span className="block text-xs text-ink-3">{row.note}</span>}
          </span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {row.text
              ? <span className="text-xs text-ink-2">{row.text}</span>
              : row.labels.map((label, n) => (
                <span key={label} className="flex items-center gap-1">
                  {n > 0 && <span aria-hidden="true" className="text-xs text-ink-3">/</span>}
                  <kbd data-shortcut-key className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-xs whitespace-nowrap text-ink">{label}</kbd>
                </span>
              ))}
          </span>
        </li>
      ))}
    </ul>
  );
  const shown = searching ? sections : sections.filter(section => section.title === tab);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] max-sm:pt-0" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" data-shortcuts-sheet tabIndex={-1}
        className="flex h-[min(84vh,640px)] w-[52rem] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop outline-none max-sm:h-dvh max-sm:max-w-none max-sm:w-screen max-sm:rounded-none max-sm:border-0">
        <header className="shrink-0 px-5 pt-4 max-sm:px-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="shortcuts-title" className="text-[20px] leading-7 font-semibold text-ink">{TITLE}</h2>
            <button type="button" aria-label="Close Shortcuts" title="Close (Esc)" onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent max-sm:h-11 max-sm:w-11"><X size={16} aria-hidden="true" /></button>
          </div>
          <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
            <label className="relative block min-w-0 flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
              <Input type="search" autoFocus data-shortcuts-search value={query} onChange={event => setQuery(event.target.value)} placeholder={FIND} aria-label={FIND} className="pl-8 text-sm max-sm:h-11" />
            </label>
            <div role="radiogroup" aria-label="Keys for" onKeyDown={arrows} className="flex shrink-0 rounded-lg border border-line p-0.5">
              {PLATFORMS.map(([id, label]) => {
                const on = (id === 'mac') === mac;
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-shortcuts-platform={id} onClick={() => setMac(id === 'mac')}
                    className={`h-7 flex-1 rounded-md px-3 text-sm focus-visible:outline-2 focus-visible:outline-accent max-sm:h-10 ${on ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
                );
              })}
            </div>
          </div>
          {/* The sections as tabs: the house Tabs (ui.jsx, Radix), styled as Creator Analytics' views. While the search has text no tab
              is selected and every match shows under its section's name; picking a tab clears the search. On a phone the row scrolls
              sideways inside the window. */}
          <Tabs value={searching ? '' : tab} onValueChange={next => { setQuery(''); setTab(next); }} className="mt-3">
            <TabsList aria-label="Shortcut sections" data-shortcuts-tabs className="-mx-5 gap-5.5 overflow-x-auto px-5 [scrollbar-width:none] max-sm:-mx-3 max-sm:px-3">
              {SECTIONS.map(title => (
                <TabsTrigger key={title} value={title} data-shortcuts-tab={title} className={`h-10 shrink-0 text-[13px] whitespace-nowrap ${COARSE}`}>{TAB_LABELS[title]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </header>
        <div data-shortcuts-list role={searching ? 'region' : 'tabpanel'} aria-label={searching ? 'Matching shortcuts' : tab} tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset max-sm:px-3">
          {shown.length ? shown.map(section => (
            <section key={section.title} aria-label={section.title} data-shortcuts-section={section.title} className="mb-5">
              <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</h3>
              {section.note && <p className="mb-1.5 text-xs text-ink-3">{section.note}</p>}
              {rows(section)}
            </section>
          )) : <p data-shortcuts-none className="text-sm text-ink-3">No shortcuts match</p>}
        </div>
      </div>
    </div>
  );
}
