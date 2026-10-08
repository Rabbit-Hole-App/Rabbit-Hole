import { useCallback, useMemo, useState } from 'react';
import { displayName } from './comments-api.js';

// A page's comments state (docs/features/canvas-comments.md section 5), kept out of the pages: the open draft (an anchor
// from Add comment), the selected thread, and the pins the canvas draws. `base` is the route family: your canvas's main
// board once it is saved (member family), or a publication (public family); null means no comments here (Q5).
export function useCanvasComments({ base, enabled = true, canAdd = true, openPanel, canvasApi }) {
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [threads, setThreads] = useState([]);
  const active = !!enabled && !!base;
  const addComment = useCallback(anchor => { setSelected(null); setDraft(anchor); openPanel(); }, [openPanel]);
  const openPin = useCallback(id => { setDraft(null); setSelected(id); openPanel(); }, [openPanel]);
  const pins = useMemo(() => (active ? [
    ...threads.map(thread => ({ id: thread.id, anchor: thread.anchor, author: thread.author, unread: thread.unread, selected: thread.id === selected, label: displayName(thread.author) })),
    ...(draft ? [{ id: 'draft', anchor: draft, ghost: true }] : []),
  ] : null), [active, threads, selected, draft]);
  return {
    active,
    openPin, addComment,
    canvasProps: active ? { onAddComment: canAdd ? addComment : null, commentPins: pins, onCommentPin: openPin } : {},
    panelProps: active ? {
      base, draftAnchor: draft, selected, onSelect: setSelected, onThreads: setThreads,
      onDraftDone: id => { setDraft(null); if (id) setSelected(id); },
      // ponytail: liveness reads the rendered canvas; a virtualized canvas would need the board model instead.
      objectLive: anchor => anchor?.kind !== 'object' || !!document.querySelector(['block', 'item', 'shape'].map(kind => `[data-${kind}-id="${CSS.escape(anchor.object_id)}"]`).join(',')),
      onFocusAnchor: anchor => { if (anchor?.kind === 'object') canvasApi.current?.focusBlock?.(anchor.object_id); },
    } : null,
  };
}
