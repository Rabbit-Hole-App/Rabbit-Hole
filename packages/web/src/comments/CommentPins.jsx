import { Plus } from 'lucide-react';
import { CommentAvatar } from './CommentsPanel.jsx';
import { pinPoint } from './anchors.js';

// Comment pins (docs/features/canvas-comments.md section 5): the author's avatar in a speech bubble whose tail is the
// anchor, at a constant screen size over the canvas. Unread: an accent ring. Selected: filled. The draft's ghost pin
// is dashed until Send. A detached thread (its card deleted) has no pin. Hidden while presenting (the caller).
const SIZE = 30;
export default function CommentPins({ pins, view, board, onPin }) {
  return (
    <div data-comment-pins aria-label="Comments on this canvas" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {pins.map(pin => {
        const at = pinPoint(pin.anchor, board);
        if (!at) return null;
        const left = at.x * view.z + view.x, top = at.y * view.z + view.y - SIZE;
        const tone = pin.ghost ? 'border-dashed border-accent bg-white text-accent' : pin.selected ? 'border-accent bg-accent' : `border-line-strong bg-white ${pin.unread ? 'ring-2 ring-accent' : ''}`;
        return (
          <button key={pin.id} type="button" data-comment-pin={pin.id} aria-label={pin.ghost ? 'New comment' : `Comment by ${pin.label}`} aria-pressed={!!pin.selected}
            style={{ left, top, width: SIZE, height: SIZE }} onPointerDown={event => event.stopPropagation()} onClick={() => !pin.ghost && onPin?.(pin.id)}
            className={`pointer-events-auto absolute flex items-center justify-center rounded-full rounded-bl-none border shadow-md ${tone}`}>
            {pin.ghost ? <Plus size={15} aria-hidden /> : <CommentAvatar author={pin.author} size="h-6 w-6" />}
          </button>
        );
      })}
    </div>
  );
}
