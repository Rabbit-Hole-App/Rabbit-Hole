import { Fragment } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui.jsx';
import { pinCount, pinPoint } from './anchors.js';

// Comment pins (docs/features/canvas-comments.md section 5): a speech bubble whose tail is the anchor, at a constant
// screen size over the canvas, showing how many live comments its thread has (owner, 2026-10-08). Unread: an accent ring. Open in the panel: an ink ring. The draft's
// pin carries a + until Send. A detached thread (its card deleted) has no pin. Hidden while presenting (the caller).
// Every pin is filled with its colour, outlined solid in it, orange by default (owner, 2026-10-08); the + and the count
// are text-white, a token that is white in light mode and the dark surface in dark mode.
// A pin is a canvas object too (owner, 2026-10-08): a click picks it - the selection ring and the keyboard focus, so Del
// deletes it and Esc lets go - and opens its thread in the Comments panel, which leaves the focus on the pin. `ask` is
// the line by the picked pin: a delete to confirm ({ replies }) or a note ({ note }).
const SIZE = 30;
export const PIN_DEFAULT = '#f59e0b'; // the canvas palette's orange
// slotOf(object id): that object's pin slot in world units ({ right, top, height }), or null when it is gone. An object's
// pins line up leftwards from `right`, centred on the row, at the pins' constant screen size, so they never cover its pills
// at any zoom; the stored offset is not used. A pin on a bare canvas point stays where it was placed.
const GAP = 4;
export default function CommentPins({ pins, view, board, slotOf = null, onPin, picked = null, onPick = null, ask = null, onConfirm, onCancel }) {
  const taken = {};
  return (
    <div data-comment-pins aria-label="Comments on this canvas" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {pins.map(pin => {
        let left, top;
        if (pin.anchor?.kind === 'object' && slotOf) {
          const slot = slotOf(pin.anchor.object_id);
          if (!slot) return null;
          const index = taken[pin.anchor.object_id] = (taken[pin.anchor.object_id] ?? -1) + 1;
          left = slot.right * view.z + view.x - (index + 1) * (SIZE + GAP);
          top = (slot.top + slot.height / 2) * view.z + view.y - SIZE / 2;
        } else {
          const at = pinPoint(pin.anchor, board);
          if (!at) return null;
          left = at.x * view.z + view.x; top = at.y * view.z + view.y - SIZE;
        }
        const color = (!pin.ghost && pin.color) || PIN_DEFAULT;
        const ring = picked === pin.id ? 'ring-2 ring-[#2383e2] ring-offset-2' : pin.selected ? 'ring-2 ring-ink ring-offset-1' : pin.unread ? 'ring-2 ring-accent' : '';
        return (
          <Fragment key={pin.id}>
            <button type="button" data-comment-pin={pin.id} data-picked={picked === pin.id ? '' : undefined} aria-label={pin.ghost ? 'New comment' : `${pin.comments} ${pin.comments === 1 ? 'comment' : 'comments'}`} aria-pressed={!!pin.selected}
              style={{ left, top, width: SIZE, height: SIZE, background: color, borderColor: color }}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                if (pin.ghost) return;
                event.currentTarget.focus();
                onPick?.(pin.id);
                onPin?.(pin.id);
              }}
              className={`pointer-events-auto absolute flex items-center justify-center rounded-full rounded-bl-none border border-solid text-white shadow-md ${ring}`}>
              {pin.ghost ? <Plus size={15} aria-hidden /> : <span data-pin-count aria-hidden="true" className="text-[11px] leading-none font-semibold">{pinCount(pin.comments)}</span>}
            </button>
            {picked === pin.id && ask && (
              <div role={ask.note ? 'status' : 'dialog'} aria-label="Delete comment thread" data-pin-ask style={{ left: left + SIZE + 10, top }}
                onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel?.(); } }}
                className="pointer-events-auto absolute w-60 rounded-lg border border-line bg-white p-2.5 text-xs text-ink shadow-pop">
                {ask.note || (
                  <>
                    <p>Delete the thread and its {ask.replies} {ask.replies === 1 ? 'reply' : 'replies'}?</p>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <Button size="sm" onClick={onCancel}>Cancel</Button>
                      <Button size="sm" variant="danger" autoFocus onClick={onConfirm}>Delete</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
