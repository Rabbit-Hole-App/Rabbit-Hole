import { useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import { minimapLayout, minimapToView } from './learn-minimap.js';

const SIZE = { w: 184, h: 124 };

// Bottom-right overview of the canvas. Press or drag inside it to send the
// camera there; the button in its corner frames everything at once, which is the
// way back when you have panned into empty space and lost the column.
export default function CanvasMinimap({ boxes, view, surface, onView, onFit }) {
  const frame = useRef(null);
  const layout = minimapLayout(boxes, view, surface, SIZE);
  if (!layout) return null;
  const goTo = event => {
    const box = frame.current.getBoundingClientRect();
    onView(minimapToView({ x: event.clientX - box.left, y: event.clientY - box.top }, layout, surface, view.z));
  };
  const drag = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    goTo(event);
  };
  return (
    <div style={{ width: SIZE.w, height: SIZE.h }}
      className="absolute right-3 bottom-3 z-20 overflow-hidden rounded-xl border border-line bg-white/90 shadow-md backdrop-blur-sm">
      <svg ref={frame} role="img" aria-label="Canvas overview" width={SIZE.w} height={SIZE.h} className="block cursor-pointer touch-none"
        onPointerDown={drag} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) goTo(event); }}>
        {layout.boxes.map((box, index) => (
          // Hairlines round to nothing at this scale, so every block keeps a
          // minimum mark - an empty minimap would be worse than a rough one.
          <rect key={index} x={box.x} y={box.y} width={Math.max(2, box.w)} height={Math.max(2, box.h)} rx={1} className="fill-ink-3/35" />
        ))}
        <rect x={layout.view.x} y={layout.view.y} width={Math.max(4, layout.view.w)} height={Math.max(4, layout.view.h)}
          rx={2} fill="none" stroke="#2383e2" strokeWidth={1.5} />
      </svg>
      <button type="button" title="Back to content" aria-label="Back to content"
        onPointerDown={event => event.stopPropagation()} onClick={onFit}
        className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-lg bg-white/80 text-ink-2 hover:bg-hover hover:text-ink">
        <LocateFixed size={13} strokeWidth={1.8} />
      </button>
    </div>
  );
}
