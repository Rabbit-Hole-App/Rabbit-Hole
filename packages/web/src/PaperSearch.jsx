import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { wsHeaders } from './api.js';

// Finding a paper to put on the canvas. Until now the only way to open one was
// to click a link that already happened to be in an answer - you could read a
// paper the tutor mentioned, but not add one you had in mind.
//
// A pasted id or arxiv.org URL is answered as that paper rather than searched
// for, so both habits land in the same place.
export default function PaperSearch({ app, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async event => {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true); setError(''); setPapers(null);
    try {
      const response = await fetch(`/api/learn/arxiv?app=${encodeURIComponent(app)}&q=${encodeURIComponent(query.trim())}`, { headers: wsHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Search failed');
      setPapers(data.papers || []);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  return (
    <div role="dialog" aria-label="Add an arXiv paper" className="absolute top-10 left-0 z-40 w-96 rounded-xl border border-line bg-white p-2 shadow-md">
      <form onSubmit={run} className="flex items-center gap-1">
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label="Search arXiv"
          placeholder="Title, topic, or an arXiv link"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm outline-none focus:border-ink-3" />
        <button type="submit" disabled={busy || !query.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </button>
      </form>
      {error && <p className="px-2 pt-2 text-xs text-red-700">{error}</p>}
      {papers?.length === 0 && <p className="px-2 pt-2 text-xs text-ink-2">Nothing found. Try the title, or paste an arXiv link.</p>}
      {!!papers?.length && (
        <ul className="mt-1 max-h-72 overflow-y-auto">
          {papers.map(paper => (
            <li key={paper.id}>
              <button type="button" onClick={() => { onPick(paper); onClose(); }}
                className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
                <span className="block text-sm text-ink">{paper.title}</span>
                <span className="block truncate text-xs text-ink-3">{paper.authors?.slice(0, 3).join(', ')}{paper.authors?.length > 3 ? ' et al.' : ''} · arXiv:{paper.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
