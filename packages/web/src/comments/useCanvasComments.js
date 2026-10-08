import { useCallback, useMemo, useState } from 'react';
import { displayName, memberBase } from './comments-api.js';

// The owner page's comments state (docs/features/canvas-comments.md section 5), kept out of LearnPage: the open draft
// (an anchor from Add comment), the selected thread, and the pins the canvas draws. Comments exist on a top-level
// canvas's main board once it is saved (boardId), never on a project board or a nested Rabbit Hole (Q5).
export function useCanvasComments({ boardId, enabled, openPanel, canvasApi }) {
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [threads, setThreads] = useState([]);
  const active = !!enabled && !!boardId;
  const addComment = useCallback(anchor => { setSelected(null); setDraft(anchor); openPanel(); }, [openPanel]);
  const openPin = useCallback(id => { setDraft(null); setSelected(id); openPanel(); }, [openPanel]);
  const pins = useMemo(() => (active ? [
    ...threads.map(thread => ({ id: thread.id, anchor: thread.anchor, author: thread.author, unread: thread.unread, selected: thread.id === selected, label: displayName(thread.author) })),
    ...(draft ? [{ id: 'draft', anchor: draft, ghost: true }] : []),
  ] : null), [active, threads, selected, draft]);
  return {
    active,
    canvasProps: active ? { onAddComment: addComment, commentPins: pins, onCommentPin: openPin } : {},
    panelProps: active ? {
      base: memberBase(boardId), draftAnchor: draft, selected, onSelect: setSelected, onThreads: setThreads,
      onDraftDone: id => { setDraft(null); if (id) setSelected(id); },
      // ponytail: liveness reads the rendered canvas; a virtualized canvas would need the board model instead.
      objectLive: anchor => anchor?.kind !== 'object' || !!document.querySelector(['block', 'item', 'shape'].map(kind => `[data-${kind}-id="${CSS.escape(anchor.object_id)}"]`).join(',')),
      onFocusAnchor: anchor => { if (anchor?.kind === 'object') canvasApi.current?.focusBlock?.(anchor.object_id); },
    } : null,
  };
}
