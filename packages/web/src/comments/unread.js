import { useEffect, useState } from 'react';
import { wsHeaders } from '../api.js';

// Comment news for the Library (docs/features/canvas-comments.md section 5, Q16): fetched on load, on focus or when the tab
// shows again, and every 60 s while it is visible; polling pauses while hidden. Returning from a canvas remounts the
// Library, so a thread read there clears its line. Never a sign-in redirect: no session simply shows nothing.
export function useCommentUnread() {
  const [counts, setCounts] = useState({ owned: {}, shared: {} });
  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/learn/comments/unread', { headers: wsHeaders() }).then(response => (response.ok ? response.json() : null)).then(data => { if (live && data) setCounts(data); }, () => {});
    };
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, []);
  return counts;
}

export const newComments = n => (n ? `${n} new comment${n === 1 ? '' : 's'}` : null);
