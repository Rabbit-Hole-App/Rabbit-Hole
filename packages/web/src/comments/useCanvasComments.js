import { useCallback, useEffect, useMemo, useState } from 'react';
import { displayName } from './comments-api.js';

// A page's comments state (docs/features/canvas-comments.md section 5), kept out of the pages: the open draft (an anchor
// from Add comment), the selected thread, and the pins the canvas draws. `base` is the route family: your canvas's main
// board once it is saved (member family), or a publication (public family); null means no comments here (Q5).
// `link`: the page a thread link opens (/c/<board id> or /e/<token>), with ?thread=<id>; a link to this page opens the thread.
const THREAD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function useCanvasComments({ base, enabled = true, canAdd = true, openPanel, canvasApi, link = null }) {
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('thread');
    return THREAD.test(asked || '') ? asked : null;
  });
  const [threads, setThreads] = useState([]);
  const [showPins, setShowPins] = useState(true);
  const active = !!enabled && !!base;
  useEffect(() => { if (active && selected) openPanel(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const addComment = useCallback(anchor => { setSelected(null); setDraft(anchor); openPanel(); }, [openPanel]);
  const openPin = useCallback(id => { setDraft(null); setSelected(id); openPanel(); }, [openPanel]);
  // View → Show comments hides every pin (and the draft's ghost) until it is turned back on.
  const pins = useMemo(() => (active && showPins ? [
    ...threads.map(thread => ({ id: thread.id, anchor: thread.anchor, author: thread.author, unread: thread.unread, selected: thread.id === selected, label: displayName(thread.author) })),
    ...(draft ? [{ id: 'draft', anchor: draft, ghost: true }] : []),
  ] : null), [active, showPins, threads, selected, draft]);
  return {
    active,
    unread: active ? threads.filter(thread => thread.unread).length : 0,
    showPins, togglePins: () => setShowPins(on => !on),
    openPin, addComment,
    canvasProps: active ? { onAddComment: canAdd ? addComment : null, commentPins: pins, onCommentPin: openPin } : {},
    panelProps: active ? {
      base, draftAnchor: draft, selected, onSelect: setSelected, onThreads: setThreads,
      onDraftDone: id => { setDraft(null); if (id) setSelected(id); },
      threadLink: link ? id => `${window.location.origin}${link}?thread=${id}` : null,
      // ponytail: liveness reads the rendered canvas; a virtualized canvas would need the board model instead.
      objectLive: anchor => anchor?.kind !== 'object' || !!document.querySelector(['block-id', 'item-id', 'shape-id', 'group-box'].map(attr => `[data-${attr}="${CSS.escape(anchor.object_id)}"]`).join(',')),
      onFocusAnchor: anchor => { if (anchor?.kind === 'object') canvasApi.current?.focusObject?.(anchor.object_id); },
    } : null,
  };
}
