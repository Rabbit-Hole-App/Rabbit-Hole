import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerDownLeft, Loader2, Search, X } from 'lucide-react';
import { wsHeaders } from './api.js';

// The canvas search bar. One plain-English query, one source at a time, the
// five best results - each with a line on why it fits. Exa does the finding
// (learn-search.js), so "I want to understand backpropagation" works as well
// as an exact title like "Attention Is All You Need". A pasted id or link
// resolves to exactly that item.
//
// Search runs on Enter, not per keystroke: every search is a paid call.
// Esc, the X, or a click outside closes it; nothing is added until a result
// is chosen.
export const SOURCES = [
  { id: 'youtube', label: 'YouTube', noun: 'videos', placeholder: 'Describe what you want explained - e.g. I want to understand backpropagation', examples: ['I want to understand backpropagation', 'how transformers pay attention', 'gradient descent visually'] },
  { id: 'arxiv', label: 'arXiv', noun: 'papers', placeholder: 'A topic, an exact title, or an arXiv ID or link', examples: ['Attention is all you need', 'why does batch normalization help', '1706.03762'] },
  { id: 'wikipedia', label: 'Wikipedia', noun: 'articles', placeholder: 'A topic, an article name, or a wikipedia.org link', examples: ['how gradients flow backwards', 'Backpropagation', 'softmax function'] },
];
const REMEMBER = 'small.learn.search-source';

export default function SearchBar({ app, initialSource = null, onPick, onClose }) {
  const [source, setSource] = useState(() => {
    if (initialSource) return initialSource;
    try { return SOURCES.some(entry => entry.id === localStorage.getItem(REMEMBER)) ? localStorage.getItem(REMEMBER) : 'youtube'; } catch { return 'youtube'; }
  });
  const [query, setQuery] = useState('');
  // What the results on screen answer - so Enter on an unchanged query picks,
  // and on a changed one searches again.
  const [answered, setAnswered] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const flight = useRef(null);
  const meta = SOURCES.find(entry => entry.id === source);

  useEffect(() => { try { localStorage.setItem(REMEMBER, source); } catch { /* remembering is a nicety */ } }, [source]);
  useEffect(() => () => flight.current?.abort(), []);
  // Esc closes from anywhere while the bar is open.
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const run = async (text = query, from = source) => {
    const wanted = text.trim();
    if (!wanted) return;
    flight.current?.abort();
    const controller = new AbortController();
    flight.current = controller;
    setBusy(true); setError(''); setResults(null); setActive(0);
    try {
      const response = await fetch(`/api/learn/search?app=${encodeURIComponent(app)}&source=${from}&q=${encodeURIComponent(wanted)}`, { headers: wsHeaders(), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Search failed. Try again.');
      setResults(data.results || []);
      setAnswered(`${from}:${wanted}`);
    } catch (problem) { if (problem.name !== 'AbortError') setError(problem.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const choose = result => { onPick(source, result.item); onClose(); };
  const switchTo = next => {
    setSource(next);
    setResults(null); setError(''); setAnswered(null);
    if (query.trim()) run(query, next);
    input.current?.focus();
  };
  const current = answered === `${source}:${query.trim()}`;

  return (
    <div className="fixed inset-0 z-50" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div role="dialog" aria-label="Search" aria-modal="true"
        className="absolute top-[18vh] left-1/2 w-[40rem] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
        <form className="flex items-center gap-2 border-b border-line px-3 py-2.5" onSubmit={event => {
          event.preventDefault();
          if (current && results?.length) choose(results[active] || results[0]);
          else run();
        }}>
          <Search size={16} className="shrink-0 text-ink-3" />
          {/* The source is a native select - accessible, keyboard-reachable,
              and one control, not a second menu to dismiss. */}
          <label className="relative shrink-0">
            <span className="sr-only">Search in</span>
            <select aria-label="Search in" value={source} onChange={event => switchTo(event.target.value)}
              className="h-8 cursor-pointer appearance-none rounded-lg border border-line bg-hover py-0 pr-7 pl-2.5 text-sm font-medium text-ink outline-none focus:border-ink-3">
              {SOURCES.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-3" />
          </label>
          <input ref={input} autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label={`Search ${meta.label}`}
            placeholder={meta.placeholder}
            onKeyDown={event => {
              if (!results?.length || !current) return;
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive(at => Math.min(results.length - 1, at + 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive(at => Math.max(0, at - 1)); }
            }}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
          {busy
            ? <Loader2 size={16} className="shrink-0 animate-spin text-ink-3" aria-label="Searching" />
            : query.trim() && !current && <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3"><CornerDownLeft size={12} />to search</span>}
          <button type="button" aria-label="Close search" title="Close (Esc)" onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
        </form>

        <div className="max-h-[56vh] overflow-y-auto p-2">
          {busy && (
            <p className="px-2 py-3 text-sm text-ink-2">Finding the best {meta.label} {meta.noun} for that</p>
          )}
          {!busy && error && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-hover px-3 py-2.5">
              <p className="text-sm text-ink">{error}</p>
              <button type="button" onClick={() => run()} className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-hover">Retry</button>
            </div>
          )}
          {!busy && !error && results === null && (
            <div className="px-2 py-2">
              <p className="text-xs text-ink-3">Ask in plain words, name something exactly, or paste a link. Try</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meta.examples.map(example => (
                  <button key={example} type="button" onClick={() => { setQuery(example); run(example); }}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-hover hover:text-ink">{example}</button>
                ))}
              </div>
            </div>
          )}
          {!busy && !error && results?.length === 0 && (
            <div className="px-2 py-2">
              <p className="text-sm text-ink">No {meta.label} {meta.noun} matched that.</p>
              <p className="mt-0.5 text-xs text-ink-3">Try fewer words, or the same words somewhere else</p>
              <div className="mt-2 flex gap-1.5">
                {SOURCES.filter(entry => entry.id !== source).map(entry => (
                  <button key={entry.id} type="button" onClick={() => switchTo(entry.id)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-hover hover:text-ink">Search {entry.label}</button>
                ))}
              </div>
            </div>
          )}
          {!busy && !error && !!results?.length && (
            <ul role="listbox" aria-label={`${meta.label} results`}>
              {results.map((result, index) => (
                <li key={result.key} role="option" aria-selected={index === active}>
                  <button type="button" onClick={() => choose(result)} onPointerEnter={() => setActive(index)}
                    className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left ${index === active ? 'bg-hover' : ''}`}>
                    {result.thumbnail
                      ? <img src={result.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="mt-0.5 h-12 w-20 shrink-0 rounded-md bg-hover object-cover" />
                      : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{result.title}</span>
                        {result.exact && <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Exact match</span>}
                      </span>
                      {result.subtitle && <span className="block truncate text-xs text-ink-3">{result.subtitle}</span>}
                      {result.why && <span className="mt-0.5 line-clamp-2 text-xs text-ink-2">{result.why}</span>}
                    </span>
                    {index === active && <span className="mt-1 hidden shrink-0 items-center gap-1 text-[11px] text-ink-3 sm:flex"><CornerDownLeft size={12} />add</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
