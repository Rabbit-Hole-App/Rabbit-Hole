import { useEffect, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { api, navigate } from './api.js';
import { AskPanel } from './ask.jsx';
import { cn, KindIcon } from './ui.jsx';

// Plain text out of a BlockNote JSON string — no parse, just the "text" values.
const runbookText = (rb) => [...rb.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(' ');

// ⌘K search modal. Self-contained: opens on Ctrl/⌘K or a 'small:search' event.
export default function SearchModal() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('search'); // 'search' | 'ask' — org-scope Ask lives here
  const [data, setData] = useState(null); // { org, apps } — fetched once, on first open
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('small:search', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('small:search', onOpen); };
  }, []);

  useEffect(() => {
    if (open && !data) api('/api/apps').then(setData).catch(() => setData({ apps: [] }));
  }, [open]);

  const close = () => { setOpen(false); setQ(''); setHi(0); };

  if (!open) return null;

  const apps = data?.apps || [];
  const org = data?.org || 'small';
  const needle = q.trim().toLowerCase();
  const recent = JSON.parse(localStorage.getItem('small.recent') || '[]');
  const rank = (a) => { const i = recent.indexOf(a.name); return i === -1 ? recent.length : i; };
  const appHits = apps.filter((a) => a.name.toLowerCase().includes(needle)).slice().sort((a, b) => rank(a) - rank(b));
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
      <span className="truncate">{a.name}</span>
      <span className="ml-auto shrink-0 text-xs text-ink-3">{org} / Apps</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={close} />
      <div className="relative mx-auto mt-[20vh] w-[640px] max-w-[90vw] rounded-md bg-white text-ink shadow-pop">
        <div className="flex items-center gap-4 border-b border-line px-4 pt-2">
          {[['search', 'Search', Search], ['ask', 'Ask', Sparkles]].map(([m, label, Icon]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                '-mb-px flex h-8 cursor-pointer items-center gap-1.5 border-b-2 border-transparent text-sm text-ink-2 hover:text-ink',
                mode === m && 'border-ink font-medium text-ink',
              )}
            >
              <Icon size={14} strokeWidth={1.5} /> {label}
            </button>
          ))}
        </div>
        {mode === 'ask' ? (
          <div className="flex h-96 flex-col p-4">
            <AskPanel scope={{}} placeholder="Ask about your workspace…" autoFocus />
          </div>
        ) : (
        <>
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
          <Search size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search apps and runbooks…"
            className="w-full border-0 bg-transparent text-base outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 && <div className="flex h-9 items-center px-3 text-sm text-ink-3">No results</div>}
          {appHits.length > 0 && <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">Apps</div>}
          {appHits.map((a, i) => row(a, i))}
          {bookHits.length > 0 && <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">Runbooks</div>}
          {bookHits.map((a, i) => row(a, appHits.length + i))}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
