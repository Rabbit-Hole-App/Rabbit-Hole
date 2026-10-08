import { createPortal } from 'react-dom';
import { BLANK } from './shared-rabbit-hole.js';
import { ConfirmDialog } from './ui.jsx';

// Start Rabbit Hole on someone else's canvas asks first (owner, 2026-10-08; docs/features/shared-canvas-rabbit-hole.md):
// From this canvas - today's private Rabbit Hole, from the selected card or the canvas - or Blank, a new empty private
// canvas of yours titled after this one and linked back to it, with nothing copied. Cancel or Escape does nothing.
// `onPick(origin)`: the card id (null for the canvas itself) or BLANK. Portaled: a hovered card's lift never traps it.
export default function RabbitHoleChoice({ title, card = null, onPick, onCancel }) {
  return createPortal(
    <div data-rabbit-choice>
      <ConfirmDialog title="Start a Rabbit Hole" confirmLabel="From this canvas" confirmVariant="primary" altLabel="Blank"
        onConfirm={() => onPick(card?.id || null)} onAlt={() => onPick(BLANK)} onCancel={onCancel}
        body={<span className="block space-y-1.5">
          <span className="block"><span className="font-medium text-ink">From this canvas:</span> your own private Rabbit Hole, starting from {card ? `"${card.title}"` : `"${title}"`}. This canvas stays as it is.</span>
          <span className="block"><span className="font-medium text-ink">Blank:</span> a new empty canvas of yours, "{title} notes", linked back to this one. Nothing is copied.</span>
        </span>} />
    </div>,
    document.body,
  );
}
