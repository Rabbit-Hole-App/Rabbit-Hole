import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from './ui.jsx';
import { isMac, shortcutSections } from './shortcuts.js';
import { chatSendKey } from './ui-prefs.js';

// View > Shortcuts, also ?, (owner brief 2026-11-02): every shortcut from shortcuts.js in its seven sections, with a search and a
// Windows / Mac choice that starts on this computer's platform. It is a modal window: focus moves into the search, Tab and
// Shift+Tab stay inside, nothing behind it takes a key while it is open (AdaptiveCanvas, LearnPage, Shell and shortcut-owner.js
// stand down for an aria-modal dialog), Esc closes it once, and focus goes back to what opened it or, when that is gone (a menu
// row), to the canvas (the page body). The header, search and platform choice stay put while the list scrolls.
export const TITLE = 'Shortcuts';
export const FIND = 'Find a shortcut';
const PLATFORMS = [['win', 'Windows'], ['mac', 'Mac']];
const STOPS = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A shared canvas has no Slash Commands and no right panel, so its window leaves out their keys.
export const SHARED_OMIT = ['slash-commands', 'right-panel'];

// omit: shortcut ids this page does not have.
export default function ShortcutsSheet({ onClose, omit = [] }) {
  const [mac, setMac] = useState(isMac);
  const [query, setQuery] = useState('');
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
  // Capture, so Esc closes this window and reaches nothing behind it (a selection, an open menu); Tab wraps inside it.
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); latest.current(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll(STOPS)].filter(node => node.offsetParent !== null);
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement);
      if (event.shiftKey && at <= 0) { event.preventDefault(); stops.at(-1).focus(); }
      else if (!event.shiftKey && (at === -1 || at === stops.length - 1)) { event.preventDefault(); stops[0].focus(); }
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
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] max-sm:pt-0" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" data-shortcuts-sheet tabIndex={-1}
        className="flex max-h-[84vh] w-[52rem] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop outline-none max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:w-screen max-sm:rounded-none max-sm:border-0">
        <header className="shrink-0 border-b border-line px-5 pt-4 pb-3 max-sm:px-3">
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
        </header>
        <div data-shortcuts-list className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-sm:px-3">
          {sections.length ? (
            <div className="gap-x-8 sm:columns-2">
              {sections.map(section => (
                <section key={section.title} aria-label={section.title} data-shortcuts-section={section.title} className="mb-5 break-inside-avoid">
                  <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</h3>
                  {section.note && <p className="mb-1.5 text-xs text-ink-3">{section.note}</p>}
                  <ul>
                    {section.rows.map((row, index) => (
                      <li key={row.id} data-shortcut={row.id}>
                        {row.sub && row.sub !== section.rows[index - 1]?.sub && <h4 className="mt-2 mb-1 text-xs font-semibold text-ink-2">{row.sub}</h4>}
                        <div className="flex items-start justify-between gap-3 py-1 text-sm text-ink">
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
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : <p data-shortcuts-none className="text-sm text-ink-3">No shortcuts match</p>}
        </div>
      </div>
    </div>
  );
}
