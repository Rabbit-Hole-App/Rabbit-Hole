import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { wsHeaders } from './api.js';

// Finding an article to put on the canvas.
//
// Type-ahead rather than submit-on-Enter like the arXiv picker, because a
// prefix search is what makes "einst" offer Einstein. That is also the first
// thing in this product that could issue one upstream request per keystroke,
// so it waits 250ms and cancels whatever is still in flight: Wikimedia allows
// 200 requests a minute, and nothing here should spend them on prefixes the
// learner has already typed past.
const DEBOUNCE = 250;
const MINIMUM = 2;

export default function WikiSearch({ app, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flight = useRef(null);

  useEffect(() => {
    const wanted = query.trim();
    if (wanted.length < MINIMUM) { setPages(null); setError(''); setBusy(false); flight.current?.abort(); return; }
    const timer = setTimeout(async () => {
      flight.current?.abort();
      const controller = new AbortController();
      flight.current = controller;
      setBusy(true); setError('');
      try {
        const response = await fetch(`/api/learn/wiki/search?app=${encodeURIComponent(app)}&q=${encodeURIComponent(wanted)}`, { headers: wsHeaders(), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Search failed');
        setPages(data.pages || []);
      } catch (problem) { if (problem.name !== 'AbortError') setError(problem.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, DEBOUNCE);
    return () => clearTimeout(timer);
  }, [query, app]);

  useEffect(() => () => flight.current?.abort(), []);

  return (
    <div role="dialog" aria-label="Add a Wikipedia article" className="absolute top-10 left-0 z-40 w-96 rounded-xl border border-line bg-white p-2 shadow-md">
      <div className="flex items-center gap-1">
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label="Search Wikipedia"
          placeholder="An article title, or a wikipedia.org link"
          onKeyDown={event => { if (event.key === 'Escape') onClose(); }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm outline-none focus:border-ink-3" />
        <span className="flex h-8 w-8 items-center justify-center text-ink-3">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </span>
      </div>
      {error && <p className="px-2 pt-2 text-xs text-red-700">{error}</p>}
      {pages?.length === 0 && !busy && <p className="px-2 pt-2 text-xs text-ink-2">Nothing found. Try a different wording.</p>}
      {!!pages?.length && (
        <ul className="mt-1 max-h-72 overflow-y-auto">
          {pages.map(page => (
            <li key={page.title}>
              <button type="button" onClick={() => { onPick(page); onClose(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
                {/* Many articles have no lead image, so the row must read well
                    without one rather than leaving a gap where it would be. */}
                {page.thumbnail && <img src={page.thumbnail} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-cover" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{page.displayTitle}</span>
                  {page.description && <span className="block truncate text-xs text-ink-3">{page.description}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
