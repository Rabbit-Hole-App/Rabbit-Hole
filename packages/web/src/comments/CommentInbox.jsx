import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { ago, wsHeaders } from '../api.js';
import { newComments } from './unread.js';

// Library → Comment inbox (docs/features/canvas-comments.md section 15, owner decision D4: in-app first, no email): the threads
// with news for you across canvases - where you were mentioned, replies to threads you started or posted in, threads you follow,
// and news on your own canvases. The server answers only what you can read now and never a thread you muted. Opening one marks
// it read there. A signed-out visitor, or no news, shows nothing.
export const REASONS = { mention: 'Mentioned you', reply: 'Replies to you', follow: 'Following', canvas: 'On your canvas' };
export default function CommentInbox() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/learn/comments/inbox', { headers: wsHeaders() }).then(response => (response.ok ? response.json() : null)).then(data => { if (live) setItems(data?.items || []); }, () => { if (live) setItems([]); });
    return () => { live = false; };
  }, []);
  if (!items?.length) return null;
  return (
    <section aria-label="Comment inbox" data-comment-inbox className="mt-10">
      <div className="flex h-8 items-center pb-1"><h2 className="text-sm font-medium">Comment inbox <span className="font-normal text-ink-3">{items.length}</span></h2></div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {items.map(item => (
          <li key={item.thread_id}>
            <a href={item.link} data-inbox-item={item.thread_id} data-inbox-reason={item.reason} className="flex items-start gap-3 px-4 py-3 no-underline hover:bg-hover/60">
              <Bell size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{item.preview || 'A comment was deleted'}</span>
                <span className="block truncate text-xs text-ink-3">{item.canvas} · {item.audience === 'public' ? 'Public' : 'Members only'} · {ago(item.last_activity_at)}</span>
              </span>
              <span className="shrink-0 text-xs"><span className="font-medium text-accent">{REASONS[item.reason]}</span><span className="block text-right text-ink-3">{newComments(item.news)}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
