import { useEffect, useState } from 'react';
import { CircleAlert, Shapes, X } from 'lucide-react';
import { resolveCanvasRef } from './canvas-refs.js';
import { canvasBoardId } from './canvas-mention-ref.js';
import { refKey } from './chat-context.js';

// A mentioned canvas's pill in the Chat composer ("Mention a canvas", ContextChips.jsx). Its ref holds the board id only
// (canvas-mention-ref.js), so the title is read from the server under this viewer's access (GET /api/learn/canvas-ref/<id>):
// a canvas they can no longer read shows "Canvas unavailable", never its title. Pressing the pill does nothing: it never opens
// or navigates; x removes it from this chat, so the next request no longer sends it.
const UNAVAILABLE = 'unavailable';
const known = new Map(); // board id -> { title, path } | UNAVAILABLE, for this tab
export const rememberCanvas = canvas => known.set(canvas.id, { title: canvas.title, path: canvas.path ?? null });
// A send the server refused for an unreadable canvas (code canvas_unavailable): every pill reads its canvas again.
const RECHECK = 'small:canvas-mention-check';
export const recheckMentions = () => { known.clear(); window.dispatchEvent(new CustomEvent(RECHECK)); };

const CHIP = 'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border border-line bg-white text-xs text-ink';
const CHIP_ICON_BUTTON = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink';

export function CanvasMentionChip({ refItem, onRemove }) {
  const id = canvasBoardId(refItem.sourceId);
  const [seen, setSeen] = useState(() => (id ? known.get(id) ?? null : UNAVAILABLE));
  const [check, setCheck] = useState(0);
  useEffect(() => {
    const again = () => setCheck(n => n + 1);
    window.addEventListener(RECHECK, again);
    return () => window.removeEventListener(RECHECK, again);
  }, []);
  useEffect(() => {
    if (!id) return undefined;
    if (known.has(id)) { setSeen(known.get(id)); return undefined; }
    const control = new AbortController();
    resolveCanvasRef(id, control.signal)
      .then(canvas => { known.set(id, { title: canvas.title, path: canvas.path ?? null }); if (!control.signal.aborted) setSeen(known.get(id)); })
      // Only the server's "not readable" is unavailable; a network failure keeps the neutral label and tries again next time.
      .catch(error => { if (error?.status === 404) known.set(id, UNAVAILABLE); if (!control.signal.aborted) setSeen(error?.status === 404 ? UNAVAILABLE : null); });
    return () => control.abort();
  }, [id, check]);
  const gone = seen === UNAVAILABLE, title = gone ? null : seen?.title || null;
  return (
    <li data-context-chip="ready" data-canvas-mention={id || ''} data-ref-key={refKey(refItem)} data-unavailable={gone || undefined}
      title={gone ? 'This canvas is not available to you. Remove it to send.' : title ? `Canvas: ${title}${seen.path ? ` in ${seen.path}` : ''}` : 'Canvas'}
      className={`${CHIP} pr-0.5 ${gone ? 'border-red-300' : ''}`}>
      <span className="flex h-full min-w-0 items-center gap-1 pl-1.5">
        {gone ? <CircleAlert size={14} aria-hidden className="shrink-0 text-red-700" /> : <Shapes size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />}
        <span className={`max-w-40 truncate ${gone ? 'text-red-700' : ''}`}>{gone ? 'Canvas unavailable' : title || 'Canvas'}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${gone ? 'unavailable canvas' : title || 'canvas'} from this chat`} title="Remove from this chat" className={CHIP_ICON_BUTTON}><X size={12} aria-hidden /></button>
    </li>
  );
}
