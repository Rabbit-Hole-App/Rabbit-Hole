import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, navigate } from './api.js';
import { kindLabel, titleOf } from './agent/catalog.js';
import { loadApps } from './app-data.js';
import { aiFindAllowed, learnPreview } from './flags.js';
import { cn, KindIcon } from './ui.jsx';

// Plain text out of a BlockNote JSON string - no parse, just the "text" values.
const runbookText = (rb) => [...rb.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(' ');

// Rabbit Hole names a row by its title and type, never its slug or workspace (owner, 2026-10-08: no "canvas-5325210d",
// no "gmail-com / Apps"); the classic app keeps name and org.
const label = (a) => (learnPreview ? titleOf(a) : a.name);

// ⌘K search modal. Self-contained: opens on Ctrl/⌘K or a 'small:search' event.
export default function SearchModal() {
  const [open, setOpen] = useState(false);
  // the sidebar's search icon highlights while the modal is up
  useEffect(() => { window.dispatchEvent(new CustomEvent('small:search-state', { detail: { open } })); }, [open]);
  const [data, setData] = useState(null); // { org, apps } - fetched once, on first open
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        // The preview's Mothership replaces New chat, so the shortcut focuses it (AgentBar.jsx).
        if (learnPreview) window.dispatchEvent(new CustomEvent('small:ask-focus'));
        else navigate('/chat'); // org chat is a page now
      }
      if (e.key === 'Escape') close();
    };
    const onOpen = () => setOpen(true);
    const onClose = () => close(); // the notifications bell closes us (one surface at a time)
    window.addEventListener('keydown', onKey);
    window.addEventListener('small:search', onOpen);
    window.addEventListener('small:search-close', onClose);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('small:search', onOpen); window.removeEventListener('small:search-close', onClose); };
  }, []);

  useEffect(() => {
    if (open && !data) loadApps().then(setData).catch(() => setData({ apps: [] }));
  }, [open]);

  const close = () => { setOpen(false); setQ(''); setHi(0); setAi(null); };

  // sentence-length queries also go to the model, which picks apps by description
  const [ai, setAi] = useState(null); // null | 'loading' | { apps: string[], note: string }
  useEffect(() => {
    if (!open || !aiFindAllowed() || q.trim().split(/\s+/).length < 4) { setAi(null); return; }
    setAi('loading');
    const t = setTimeout(() => {
      api('/api/apps/find', { method: 'POST', body: JSON.stringify({ q }) })
        .then((d) => setAi({ apps: d.apps || [], note: d.note || '' }))
        .catch(() => setAi(null));
    }, 600);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;

  const apps = data?.apps || [];
  const org = data?.org || 'small';
  const needle = q.trim().toLowerCase();
  const recent = JSON.parse(localStorage.getItem('small.recent') || '[]');
  const rank = (a) => { const i = recent.indexOf(a.name); return i === -1 ? recent.length : i; };
  const appHits = apps.filter((a) => [a.name, label(a) || ''].some((t) => t.toLowerCase().includes(needle))).slice().sort((a, b) => rank(a) - rank(b));
  const bookHits = needle ? apps.filter((a) => a.runbook && runbookText(a.runbook).toLowerCase().includes(needle)) : [];
  const results = [...appHits, ...bookHits]; // flat list for arrow keys
  const hiIdx = Math.min(hi, results.length - 1);

  const go = (name) => {
    localStorage.setItem('small.recent', JSON.stringify([name, ...recent.filter((n) => n !== name)].slice(0, 5)));
    navigate(`/apps/${name}`);
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hiIdx + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hiIdx - 1, 0)); }
    if (e.key === 'Enter' && results[hiIdx]) go(results[hiIdx].name);
  };

  const row = (a, i) => (
    <button
      key={`${i < appHits.length ? 'a' : 'r'}-${a.name}`}
      onClick={() => go(a.name)}
      className={cn('flex h-9 w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm hover:bg-hover', i === hiIdx && 'bg-hover')}
    >
      <KindIcon kind={a.kind} schedule={a.schedule} />
      <span className="truncate">{label(a)}</span>
      <span className="ml-auto shrink-0 text-xs text-ink-3">{learnPreview ? kindLabel(a.kind) : `${org} / Apps`}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={close} />
      <div className="relative mx-auto mt-[20vh] w-[640px] max-w-[90vw] rounded-2xl bg-white text-ink shadow-pop">
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={onKeyDown}
            placeholder="Describe what you are looking for"
            className="w-full border-0 bg-transparent text-base outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {ai === 'loading' && <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3"><span className="shimmer">Thinking…</span></div>}
          {ai?.apps?.length > 0 && (
            <>
              <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">Recommended</div>
              {ai.apps.map((n) => apps.find((a) => a.name === n)).filter(Boolean).map((a) => (
                <button
                  key={`ai-${a.name}`}
                  onClick={() => go(a.name)}
                  className="flex h-9 w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm hover:bg-hover"
                >
                  <KindIcon kind={a.kind} schedule={a.schedule} />
                  <span className="truncate">{label(a)}</span>
                  {a.description && <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{a.description.split('\n')[0]}</span>}
                </button>
              ))}
            </>
          )}
          {/* the agent answers in one line when nothing fits - never a bare "No results" for sentence queries */}
          {ai?.apps?.length === 0 && (
            <div className="px-3 py-2 text-sm text-ink-2">{ai.note || 'Nothing here does that yet.'}</div>
          )}
          {q.trim() && results.length === 0 && ai === null && <div className="flex h-9 items-center px-3 text-sm text-ink-3">No results</div>}
          {appHits.length > 0 && <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">{learnPreview ? 'Library' : 'Apps'}</div>}
          {appHits.map((a, i) => row(a, i))}
          {bookHits.length > 0 && <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">Runbooks</div>}
          {bookHits.map((a, i) => row(a, appHits.length + i))}
        </div>
      </div>
    </div>
  );
}
