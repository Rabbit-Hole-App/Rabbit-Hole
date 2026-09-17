import { useEffect, useRef, useState } from 'react';

// Shared inline right panel. Overlay panels use SlidePanel's existing resizer.
export default function ResizableSidePanel({ defaultWidth = 400, resizeLabel = 'Resize panel', className = '', children, ...props }) {
  const panel = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(defaultWidth);
  const [available, setAvailable] = useState(1180);
  const max = Math.max(320, Math.min(800, available - 360));
  const visible = Math.max(320, Math.min(width, max));
  const resize = value => setWidth(Math.max(320, Math.min(value, max)));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(panel.current.parentElement);
    return () => observer.disconnect();
  }, []);
  return <aside {...props} ref={panel} style={{ '--side-panel-width': `${visible}px` }} className={`relative flex min-w-0 w-[var(--side-panel-width)] shrink-0 flex-col border-l border-line bg-white max-lg:h-[45%] max-lg:min-h-64 max-lg:w-full max-lg:border-t max-lg:border-l-0 ${className}`}>
    <div role="separator" aria-label={resizeLabel} aria-orientation="vertical" aria-valuemin={320} aria-valuemax={max} aria-valuenow={visible} tabIndex={0} title="Drag to resize · double-click to reset"
      className="absolute inset-y-0 -left-0.5 z-30 w-1.5 touch-none cursor-col-resize hover:bg-line-strong/70 focus-visible:bg-line max-lg:hidden"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, width: visible }; }}
      onPointerMove={e => { if (drag.current) resize(drag.current.width + drag.current.x - e.clientX); }}
      onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => resize(defaultWidth)}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); resize(visible + (e.key === 'ArrowLeft' ? 24 : -24)); } }} />
    {children}
  </aside>;
}
