import { useEffect, useRef } from 'react';
import { Minimize } from 'lucide-react';
import { FOCUS_BAR } from './focus-adapters.js';

// Focus's header (docs/features/focus-study.md): the content's title on the left, Back to canvas on the right, in the row just
// above the working frame (frame: surface px, from the focus state). It covers only that row, never the world layer where the
// focused host sits. Existing tokens, no animation. A keyboard user whose focus went with the Focus button lands on Back to canvas.
// tools: the content's own controls that its hidden card row carried (a CAD model's Interact, Fit view and Show dimensions), beside
// Back to canvas: the container's Focus and the model's 3D Fit view stay two separate controls.
export default function FocusFrame({ id, kind, frame, title, tools = null, onBack }) {
  const back = useRef(null);
  useEffect(() => {
    const held = document.activeElement;
    if (!held || held === document.body) back.current?.focus({ preventScroll: true });
  }, [id]);
  if (!frame) return null;
  return (
    <div data-focus-frame={id} data-focus-kind={kind} data-thumbnail-hide onPointerDown={event => event.stopPropagation()}
      style={{ left: frame.left, top: frame.top - FOCUS_BAR, width: frame.width, height: FOCUS_BAR - 8 }}
      className="absolute z-40 flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 shadow-md dark:bg-side">
      <span data-focus-title title={title} className="min-w-0 truncate px-1 text-sm font-medium text-ink">{title}</span>
      <div className="flex shrink-0 items-center gap-2">{tools}
      <button ref={back} type="button" data-focus-back onClick={onBack}
        className="relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap text-ink after:absolute after:-inset-1 hover:bg-hover focus-visible:ring-2 focus-visible:ring-[#2383e2]/40 focus-visible:outline-none">
        <Minimize size={16} strokeWidth={1.8} aria-hidden="true" />Back to canvas
      </button></div>
    </div>
  );
}
