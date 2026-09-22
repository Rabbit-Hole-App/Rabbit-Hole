import { useEffect, useRef, useState } from 'react';

// Shared inline right panel. Overlay panels use SlidePanel's existing resizer.
// Pass `collapsed` to retract it; the caller owns that state, the hide
// control, and whatever it shows in the panel's place.
//
// Retracting slides, the way the left sidebar does: the aside animates its
// width to zero while the content keeps its true width inside, so text never
// reflows mid-slide. Children stay mounted through the slide - on the wide
// layout a hidden panel therefore keeps running; the stacked (max-lg) layout
// keeps the old unmount, where there is no slide to animate.
export default function ResizableSidePanel({ defaultWidth = 400, resizeLabel = 'Resize panel', collapsed = false, className = '', children, ...props }) {
  const panel = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(defaultWidth);
  const [available, setAvailable] = useState(1180);
  const [resizing, setResizing] = useState(false); // drag-resize must not fight the slide
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 64rem)').matches);
  const max = Math.max(320, Math.min(800, available - 360));
  const visible = Math.max(320, Math.min(width, max));
  const resize = value => setWidth(Math.max(320, Math.min(value, max)));
  useEffect(() => {
    const media = window.matchMedia('(min-width: 64rem)');
    const onChange = () => setWide(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(panel.current.parentElement);
    return () => observer.disconnect();
  }, [wide, collapsed]);
  if (!wide && collapsed) return null;
  return <aside {...props} ref={panel}
    style={wide ? { width: collapsed ? 0 : visible, transition: resizing ? 'none' : 'width 200ms cubic-bezier(0.25,1,0.35,1)' } : undefined}
    className={`relative flex min-w-0 shrink-0 flex-col overflow-hidden bg-white ${collapsed ? '' : 'border-l border-line'} max-lg:h-[45%] max-lg:min-h-64 max-lg:w-full max-lg:border-t max-lg:border-l-0`}>
    {!collapsed && <div role="separator" aria-label={resizeLabel} aria-orientation="vertical" aria-valuemin={320} aria-valuemax={max} aria-valuenow={visible} tabIndex={0} title="Drag to resize · double-click to reset"
      className="absolute inset-y-0 -left-0.5 z-30 w-1.5 touch-none cursor-col-resize hover:bg-line-strong/70 focus-visible:bg-line max-lg:hidden"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, width: visible }; setResizing(true); }}
      onPointerMove={e => { if (drag.current) resize(drag.current.width + drag.current.x - e.clientX); }}
      onPointerUp={e => { drag.current = null; setResizing(false); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; setResizing(false); }} onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onDoubleClick={() => resize(defaultWidth)}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); resize(visible + (e.key === 'ArrowLeft' ? 24 : -24)); } }} />}
    <div style={{ '--side-panel-width': `${visible}px`, ...(wide ? { width: visible } : {}) } } className={`flex min-h-0 flex-1 flex-col max-lg:w-full ${className}`}>
      {children}
    </div>
  </aside>;
}
