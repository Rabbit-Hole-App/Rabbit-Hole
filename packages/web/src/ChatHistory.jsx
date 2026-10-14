import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { ago, api } from './api.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { threadsUrl } from './chat-threads.js';
import { cn, Input } from './ui.jsx';

// Sub-lane A2 owns this file: the searchable History list inside the Chat pane (brief section 3), reading
// useChatWorkspace().thread. A1 mounts it in place of the transcript while thread.historyOpen. This canvas's conversations
// only (contract A3), newest activity first, from the server: each row shows the title, a short preview and the last
// activity. Enter or a click opens a row (thread.open restores its messages, mode, attachments and draft); Escape closes.
export default function ChatHistory() {
  const chat = useChatWorkspace(), canvas = chat?.canvas;
  const [q, setQ] = useState(''), [rows, setRows] = useState(null), [error, setError] = useState(null), [opening, setOpening] = useState(null);
  useEffect(() => {
    if (!canvas) return undefined;
    let live = true;
    const timer = setTimeout(() => api(threadsUrl(canvas, q))
      .then(d => { if (live) { setRows(d.threads || []); setError(null); } })
      .catch(e => { if (live) setError(e.message || 'Could not load your chats'); }), q.trim() ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [canvas, q]);
  if (!chat) return null;
  const { thread } = chat;
  const pick = async id => {
    setOpening(id); setError(null);
    try { await thread.open(id); } catch (e) { setError(e.message || 'Could not open this chat'); } finally { setOpening(null); }
  };
  return (
    <div data-chat-history className="flex min-h-0 flex-1 flex-col" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); thread.setHistoryOpen(false); } }}>
      <label className="relative mb-2 block shrink-0">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
        <Input type="search" autoFocus data-chat-history-search aria-label="Search chats on this canvas" placeholder="Search chats" value={q} onChange={event => setQ(event.target.value)} className="pl-8" />
      </label>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {error && <p role="alert" className="px-2 py-2 text-sm text-fail">{error}</p>}
        {rows === null ? (!error && <p role="status" className="flex items-center gap-2 px-2 py-3 text-sm text-ink-3"><Loader2 size={14} aria-hidden="true" className="animate-spin" />Loading chats…</p>)
          : rows.length === 0 ? <p className="px-2 py-3 text-sm text-ink-3">{q.trim() ? 'No chats match this search.' : 'No past chats on this canvas yet.'}</p>
          : (
            <ul aria-label="Chats on this canvas" className="flex flex-col">
              {rows.map(row => (
                <li key={row.id}>
                  <button type="button" data-chat-history-row={row.id} aria-current={row.id === thread.id || undefined} aria-busy={opening === row.id || undefined} disabled={!!opening} onClick={() => pick(row.id)}
                    className={cn('flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-hover active:bg-active disabled:cursor-default', row.id === thread.id && 'bg-hover')}>
                    <span className="flex w-full items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{row.title || 'Untitled chat'}</span>
                      {opening === row.id ? <Loader2 size={12} aria-hidden="true" className="shrink-0 animate-spin text-ink-3" /> : <span className="shrink-0 text-xs text-ink-3">{ago(row.lastActivityAt || row.created_at)}</span>}
                    </span>
                    {row.preview && <span className="line-clamp-2 text-xs text-ink-2">{row.preview}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}
