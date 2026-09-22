import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { wsHeaders } from './api.js';

// Finding a video to put on the canvas. Same type-ahead discipline as the
// Wikipedia picker: 250ms debounce, two-character minimum, the in-flight
// request aborted - the search behind this is a paid Exa call per query.
const DEBOUNCE = 250;
const MINIMUM = 2;

export default function VideoSearch({ app, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flight = useRef(null);

  useEffect(() => {
    const wanted = query.trim();
    if (wanted.length < MINIMUM) { setVideos(null); setError(''); setBusy(false); flight.current?.abort(); return; }
    const timer = setTimeout(async () => {
      flight.current?.abort();
      const controller = new AbortController();
      flight.current = controller;
      setBusy(true); setError('');
      try {
        const response = await fetch(`/api/learn/youtube?app=${encodeURIComponent(app)}&q=${encodeURIComponent(wanted)}`, { headers: wsHeaders(), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Search failed');
        setVideos(data.videos || []);
      } catch (problem) { if (problem.name !== 'AbortError') setError(problem.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, DEBOUNCE);
    return () => clearTimeout(timer);
  }, [query, app]);

  useEffect(() => () => flight.current?.abort(), []);

  return (
    <div role="dialog" aria-label="Add a YouTube video" className="absolute top-10 left-0 z-40 w-96 rounded-xl border border-line bg-white p-2 shadow-md">
      <div className="flex items-center gap-1">
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label="Search YouTube"
          placeholder="Describe what the video should explain"
          onKeyDown={event => { if (event.key === 'Escape') onClose(); }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm outline-none focus:border-ink-3" />
        <span className="flex h-8 w-8 items-center justify-center text-ink-3">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </span>
      </div>
      {error && <p className="px-2 pt-2 text-xs text-red-700">{error}</p>}
      {videos?.length === 0 && !busy && <p className="px-2 pt-2 text-xs text-ink-2">Nothing found. Describe the topic differently.</p>}
      {!!videos?.length && (
        <ul className="mt-1 max-h-72 overflow-y-auto">
          {videos.map(video => (
            <li key={video.videoId}>
              <button type="button" onClick={() => { onPick(video); onClose(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
                {/* YouTube serves every video's thumbnail at a fixed URL - the
                    one metadata Exa's find-only results do not need to carry. */}
                <img src={`https://i.ytimg.com/vi/${video.videoId}/default.jpg`} alt="" width={48} height={36}
                  loading="lazy" referrerPolicy="no-referrer" className="h-9 w-12 shrink-0 rounded object-cover" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{video.title}</span>
                  {video.channel && <span className="block truncate text-xs text-ink-3">{video.channel}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
