import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { EXAMPLES, parseSlash, pickerSections } from './learn-slash.js';
import { descFor, toolOf, typedOf } from './agent/slash.js';
import { CommandMark } from './CommandTone.jsx';
import { filterSections } from './command-search.js';
import { Button, Input } from './ui.jsx';
import SlashCommandPreview from './SlashCommandPreview.jsx';
import { BRIEF_COMMANDS, SAMPLE_NOTE, previewOf } from './slash-sheet.js';

// View > Slash Commands (owner spec 2026-10-29 section 7): every command the picker offers, in the picker's own sections
// (learn-slash.js pickerSections, so the window and the picker never disagree), with its title, one-sentence description, example
// and one preview on the example's subject (slash-sheet.js). Use example closes the window and puts the example in the Chat
// composer as an editable draft - its command pill and its words - and never sends; a draft already written is kept (chat-draft.js
// prepare). A generator shows its finished result, and View brief switches the same stage to its brief. Below 900px the command
// column becomes a search and a selector above the preview. Esc clears a typed search, then closes; focus returns to where it was.
export const TITLE = 'Slash Commands';
export const SUBTITLE = 'Choose a command to see what it does and try an example.';
export const FIND = 'Find a command';

const NARROW = '(max-width: 899px)';
// The window's search field: focused when the window opens, an input so the canvas's shortcuts stand down while it is typed in.
const Find = ({ className = '', ...props }) => (
  <label className={`relative block ${className}`}>
    <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
    <Input type="search" autoFocus data-slash-search className="pl-8 text-sm max-sm:h-11" {...props} />
  </label>
);
function useNarrow() {
  const query = () => { try { return window.matchMedia(NARROW).matches; } catch { return false; } };
  const [narrow, setNarrow] = useState(query);
  useEffect(() => {
    let list;
    try { list = window.matchMedia(NARROW); } catch { return undefined; }
    const change = () => setNarrow(list.matches);
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, []);
  return narrow;
}

// onUseExample({ command, text }): the composer's draft becomes the example's command pill and words, to edit before sending.
export default function SlashCommandsSheet({ appName, onClose, onUseExample = null }) {
  const sections = pickerSections('/');
  const first = sections[0]?.items[0]?.name ?? null;
  const [name, setName] = useState(first);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('result');
  const narrow = useNarrow();
  const dialog = useRef(null);
  const shown = filterSections(sections, query);
  const choose = next => { setName(next); setView('result'); };
  // Focus goes back where it was when the window closes.
  useLayoutEffect(() => {
    const opener = document.activeElement;
    return () => { if (opener?.isConnected) opener.focus?.(); };
  }, []);
  // Esc clears a typed search before it closes the window; Tab stays inside it.
  const latest = useRef({ query, onClose });
  latest.current = { query, onClose };
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { if (latest.current.query) setQuery(''); else latest.current.onClose(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent !== null);
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement);
      if (event.shiftKey && at <= 0) { event.preventDefault(); stops.at(-1).focus(); }
      else if (!event.shiftKey && at === stops.length - 1) { event.preventDefault(); stops[0].focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const command = name ? toolOf(name) : null;
  const preview = name ? previewOf(name) : null;
  const example = name ? EXAMPLES[name] : '';
  const generator = BRIEF_COMMANDS.includes(name);
  // A generator with no matching saved result shows its brief, and says why.
  const resultless = generator && preview?.kind === 'none';
  const showing = generator && (view === 'brief' || resultless) ? 'brief' : 'result';
  const title = command ? descFor(command, 'learn') : '';
  const searchProps = { value: query, onChange: event => setQuery(event.target.value), placeholder: FIND, 'aria-label': FIND,
    onKeyDown: event => { if (event.key === 'Enter' && shown.length) { event.preventDefault(); choose(shown[0].items[0].name); } } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="slash-commands-title" aria-describedby="slash-commands-subtitle" data-slash-sheet
        className="flex h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))] flex-col rounded-2xl border border-line bg-surface p-4 shadow-pop max-sm:h-dvh max-sm:w-screen max-sm:rounded-none max-sm:border-0 max-sm:p-3">
        <header className="mb-3 flex shrink-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="slash-commands-title" className="text-[20px] leading-7 font-semibold text-ink">{TITLE}</h2>
            <p id="slash-commands-subtitle" className="text-[13px] leading-[18px] text-ink-2">{SUBTITLE}</p>
          </div>
          <button type="button" aria-label="Close Slash Commands" title="Close (Esc)" onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent max-sm:h-11 max-sm:w-11"><X size={16} aria-hidden="true" /></button>
        </header>
        <div className="flex min-h-0 flex-1 gap-4 max-[899px]:flex-col max-[899px]:gap-3">
          {narrow ? (
            <div data-slash-picker-compact className="flex shrink-0 gap-2 max-sm:flex-col">
              <Find className="min-w-0 flex-1" {...searchProps} />
              <select aria-label="Command" data-slash-select value={shown.some(section => section.items.some(item => item.name === name)) ? name : ''} onChange={event => choose(event.target.value)}
                className="h-8 min-w-0 flex-1 cursor-pointer rounded-sm border border-line bg-surface px-2 text-sm text-ink max-sm:h-11">
                {!shown.some(section => section.items.some(item => item.name === name)) && <option value="" disabled>{shown.length ? 'Choose a command' : 'No commands match'}</option>}
                {shown.map(section => (
                  <optgroup key={section.title} label={section.title}>
                    {section.items.map(item => <option key={item.name} value={item.name} data-slash-help={item.name}>{`${typedOf(item.name)} · ${item.desc}`}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex w-56 shrink-0 flex-col">
              <Find className="mb-2 shrink-0" {...searchProps} />
              <nav aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto pr-1">
                {shown.length ? shown.map(section => (
                  <section key={section.title} aria-label={section.title} className="mb-3">
                    <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</h3>
                    {section.items.map(item => (
                      <button key={item.name} type="button" data-slash-help={item.name} aria-current={item.name === name} onClick={() => choose(item.name)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm leading-5 focus-visible:outline-2 focus-visible:outline-accent ${item.name === name ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
                        <CommandMark name={item.name} className="text-[13px]" />
                        <span className="truncate">{item.desc}</span>
                      </button>
                    ))}
                  </section>
                )) : <p data-slash-none className="px-2 py-1 text-sm text-ink-3">No commands match</p>}
              </nav>
            </div>
          )}
          {command && preview && (
            <section aria-label={`${title} preview`} data-slash-pane={name} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-line bg-hover/40 p-3">
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                <CommandMark name={name} className="text-[13px]" />
                <h3 data-slash-label className="text-[18px] leading-6 font-semibold text-ink">{title}</h3>
              </div>
              <p data-slash-about className="mt-1 shrink-0 text-sm text-ink-2">{command.about}</p>
              <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
                {/* The example takes the row's free width beside its buttons (wrapping inside it), so the preview starts right below. */}
                <code data-slash-example className="min-w-0 flex-[1_1_16rem] font-mono text-[13px] leading-[18px] break-words text-ink-2">{example}</code>
                {generator && (
                  <Button type="button" variant="secondary" data-slash-view={showing === 'brief' ? 'result' : 'brief'} disabled={resultless}
                    onClick={() => setView(showing === 'brief' ? 'result' : 'brief')} className="max-sm:h-11">{showing === 'brief' ? 'View result' : 'View brief'}</Button>
                )}
                {onUseExample && example && (
                  <Button type="button" variant="primary" data-slash-use-example={name} title="Put this example in the composer to edit; it is not sent"
                    onClick={() => onUseExample({ command: name, text: parseSlash(example)?.args || '' })} className="max-sm:h-11">Use example</Button>
                )}
              </div>
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <SlashCommandPreview key={`${name}:${showing}`} name={name} preview={preview} view={showing} example={example} appName={appName} narrow={narrow} />
              </div>
              <p data-slash-sample className="mt-2 shrink-0 text-xs text-ink-3">{SAMPLE_NOTE}{resultless ? ` ${preview.reason}` : preview.note && showing === 'result' ? ` ${preview.note}` : ''}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
