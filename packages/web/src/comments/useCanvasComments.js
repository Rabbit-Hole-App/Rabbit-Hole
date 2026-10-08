import { useCallback, useEffect, useMemo, useState } from 'react';
import { commentsApi, displayName } from './comments-api.js';

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
  // Bumped after a pin's colour or delete, so the panel reloads its list (and with it the pins) from the server.
  const [stamp, setStamp] = useState(0);
  const active = !!enabled && !!base;
  const client = useMemo(() => (base ? commentsApi(base) : null), [base]);
  useEffect(() => { if (active && selected) openPanel(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const addComment = useCallback(anchor => { setSelected(null); setDraft(anchor); openPanel(); }, [openPanel]);
  const openPin = useCallback(id => { setDraft(null); setSelected(id); openPanel(); }, [openPanel]);
  // A picked pin's colour and Del (owner, 2026-10-08): the server decides; an answer other than ok comes back as the
  // line to show by the pin, and the list reloads either way.
  const refused = error => error?.data?.error || "Couldn't change this comment.";
  const colorPin = useCallback(async (id, color) => {
    setThreads(list => list.map(thread => (thread.id === id ? { ...thread, color } : thread)));
    try { await client.color(id, color); return null; } catch (error) { return refused(error); } finally { setStamp(n => n + 1); }
  }, [client]);
  const deletePin = useCallback(async id => {
    try { await client.removeThread(id); } catch (error) { setStamp(n => n + 1); return refused(error); }
    setThreads(list => list.filter(thread => thread.id !== id));
    setSelected(current => (current === id ? null : current));
    setStamp(n => n + 1);
    return null;
  }, [client]);
  // View → Show comments hides every pin (and the draft's ghost) until it is turned back on.
  const pins = useMemo(() => (active && showPins ? [
    ...threads.map(thread => ({ id: thread.id, anchor: thread.anchor, author: thread.author, unread: thread.unread, selected: thread.id === selected, label: displayName(thread.author),
      color: thread.color || null, can: thread.can || {}, comments: thread.comments ?? 1 })),
    ...(draft ? [{ id: 'draft', anchor: draft, ghost: true }] : []),
  ] : null), [active, showPins, threads, selected, draft]);
  return {
    active,
    unread: active ? threads.filter(thread => thread.unread).length : 0,
    showPins, togglePins: () => setShowPins(on => !on),
    openPin, addComment,
    canvasProps: active ? { onAddComment: canAdd ? addComment : null, commentPins: pins, onCommentPin: openPin, onPinColor: colorPin, onPinDelete: deletePin } : {},
    panelProps: active ? {
      base, draftAnchor: draft, selected, onSelect: setSelected, onThreads: setThreads, stamp,
      onDraftDone: id => { setDraft(null); if (id) setSelected(id); },
      threadLink: link ? id => `${window.location.origin}${link}?thread=${id}` : null,
      // ponytail: liveness reads the rendered canvas; a virtualized canvas would need the board model instead.
      objectLive: anchor => anchor?.kind !== 'object' || !!document.querySelector(['block-id', 'item-id', 'shape-id', 'group-box'].map(attr => `[data-${attr}="${CSS.escape(anchor.object_id)}"]`).join(',')),
      onFocusAnchor: anchor => { if (anchor?.kind === 'object') canvasApi.current?.focusObject?.(anchor.object_id); },
    } : null,
  };
}
