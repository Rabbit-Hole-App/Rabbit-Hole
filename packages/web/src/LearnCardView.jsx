// Learn mode's Cards tab (learn-mode-spec.md section 4, owner 2026-11-18): the stop's own card component, shown whole. It is drawn at its canvas size and scaled
// down to fit the pane (never up past 100 %); the zoom buttons go in and out from there, and Fit returns to the whole card. The scale is a transform inside a box
// of the scaled size, so the pane scrolls exactly over what is drawn. A new stop (LearnCardView is keyed by the card) opens fitted again.
import { useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { CARD_ROOM, ZOOM_STEPS as STEPS, fitScale, zoomStep } from './learn-mode.js';

const { side: SIDE, top: TOP, dock: DOCK } = CARD_ROOM;

export default function LearnCardView({ id, children }) {
  const pane = useRef(null), body = useRef(null);
  const [size, setSize] = useState(null); // the card's own size, unscaled
  const [fit, setFit] = useState(1), [zoom, setZoom] = useState(null); // zoom null: fitted
  useLayoutEffect(() => {
    const measure = () => {
      const card = { w: body.current?.offsetWidth || 0, h: body.current?.offsetHeight || 0 }, room = { w: pane.current?.clientWidth || 0, h: pane.current?.clientHeight || 0 };
      setSize(previous => (previous && previous.w === card.w && previous.h === card.h ? previous : card));
      setFit(fitScale(card, room));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane.current); observer.observe(body.current);
    return () => observer.disconnect();
  }, []);
  const scale = zoom ?? fit;
  const button = 'flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
  return <div data-learn-card-view={id} className="absolute inset-0 z-[25] bg-white">
    <div ref={pane} className="absolute inset-0 overflow-auto overscroll-contain">
      <div className="flex min-w-full justify-center" style={{ padding: `${TOP}px ${SIDE}px ${DOCK}px` }}>
        <div style={size ? { width: size.w * scale, height: size.h * scale } : undefined} className="relative shrink-0">
          <div ref={body} data-learn-card-body className="absolute top-0 left-0 w-max" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
        </div>
      </div>
    </div>
    <div data-learn-zoom role="group" aria-label="Zoom" className="absolute right-4 bottom-5 z-10 flex items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 text-xs shadow-sm">
      <button type="button" aria-label="Zoom out" title="Zoom out" className={button} disabled={scale <= STEPS[0]} onClick={() => setZoom(zoomStep(scale, -1))}><ZoomOut size={15} aria-hidden /></button>
      <button type="button" data-learn-zoom-fit title="Show the whole card" onClick={() => setZoom(null)} className="h-7 min-w-14 rounded-md px-1.5 text-ink tabular-nums hover:bg-hover">{Math.round(scale * 100)}%</button>
      <button type="button" aria-label="Zoom in" title="Zoom in" className={button} disabled={scale >= STEPS.at(-1)} onClick={() => setZoom(zoomStep(scale, 1))}><ZoomIn size={15} aria-hidden /></button>
    </div>
  </div>;
}
