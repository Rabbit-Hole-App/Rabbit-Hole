import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { ago } from '../api.js';
import { CARD_GRID } from '../home/LearningCard.jsx';
import { CommentAvatar } from './CommentsPanel.jsx';
import { displayName } from './comments-api.js';
import { newComments } from './unread.js';

// Library → Shared with you (docs/features/canvas-comments.md section 5, board 13): canvases where you are an active
// member, with their owner, your role, news and the last change. Each opens the member page (/c/<board id>).
export default function SharedWithYou({ unread = {} }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/learn/c/shared-with-me').then(response => (response.ok ? response.json() : null)).then(data => { if (live) setList(data?.canvases || []); }, () => { if (live) setList([]); });
    return () => { live = false; };
  }, []);
  if (!list?.length) return null;
  return (
    <section aria-label="Shared with you" data-shared-with-you className="mt-10">
      <div className="flex h-8 items-center pb-1"><h2 className="text-sm font-medium">Shared with you <span className="font-normal text-ink-3">{list.length}</span></h2></div>
      <ul className={CARD_GRID}>
        {list.map(canvas => {
          const news = newComments(unread[canvas.board_id] ?? canvas.unread);
          return (
            <li key={canvas.board_id}>
              <a href={`/c/${canvas.board_id}`} data-shared-canvas className="flex h-full flex-col gap-2 rounded-xl border border-line bg-white p-4 no-underline hover:border-line-strong hover:shadow-sm">
                <span className="line-clamp-2 text-sm font-semibold text-ink">{canvas.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-2"><CommentAvatar author={canvas.owner} size="h-5 w-5" />Shared by {displayName(canvas.owner)}</span>
                <span className="mt-auto flex items-center gap-2 text-xs text-ink-3"><Users size={12} aria-hidden />View and comment · Updated {ago(canvas.updated_at)}</span>
                {news && <span data-comment-news className="text-xs font-medium text-accent">{news}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
