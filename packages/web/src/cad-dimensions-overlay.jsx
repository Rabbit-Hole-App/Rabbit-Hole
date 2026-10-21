// Show dimensions (cad-controls brief section 3): sparse labels on the model and a small legend, from trusted measurements of
// the displayed revision only (cad-dimensions.js dimensionLabels). Each label follows its anchor every frame the renderer
// draws (orbit, zoom, expanded view) without a React render. Measured, Requested and Assumed stay apart; a draft that is not
// built says these are the displayed model's measurements; anything else says "Not measured."
import { useEffect, useMemo, useRef } from 'react';
import { dimensionLabels } from './cad-dimensions.js';
import { formatValue, PROVENANCE } from './cad-quick-edit.jsx';

const short = id => String(id || '').replace(/^cr_/, '').slice(0, 8);
// engine: the viewer's renderer ref; frame: the ref the renderer calls after each draw; live: the 3D view is drawn (not the
// poster); highlight: the parameter in focus in Quick edit, whose label is marked when a check maps it.
export function CadDimensionsOverlay({ manifest, engine, frame, live, draftPending = false, highlight = null }) {
  const data = useMemo(() => dimensionLabels(manifest), [manifest]);
  const labels = useRef(new Map());
  const drawn = live ? data.items.filter(item => item.point && item.measured != null) : [];
  useEffect(() => {
    if (!live) return undefined;
    frame.current = () => {
      const at = engine.current?.project?.(drawn.map(item => item.point)) || [];
      drawn.forEach((item, i) => {
        const el = labels.current.get(item.key), p = at[i];
        if (!el || !p) return;
        el.style.visibility = p.visible ? 'visible' : 'hidden';
        el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
      });
    };
    engine.current?.redraw?.();
    return () => { frame.current = null; };
  }, [data, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div data-cad-dimensions-overlay={data.available ? data.revisionId : 'none'} className="pointer-events-none absolute inset-0 overflow-hidden">
    {drawn.map(item => <span key={item.key} ref={el => { if (el) labels.current.set(item.key, el); else labels.current.delete(item.key); }} data-cad-dimension={item.key}
      data-highlight={item.input && item.input.id === highlight ? 'true' : undefined} style={{ visibility: 'hidden' }}
      className={`absolute left-0 top-0 rounded border bg-white/90 px-1 text-[11px] leading-4 whitespace-nowrap text-ink tabular-nums shadow-sm ${item.input && item.input.id === highlight ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
      {item.name} {formatValue(item.measured, 'mm')}</span>)}
    <div data-cad-dimensions-legend className="absolute top-2 right-2 max-h-[calc(100%-1rem)] max-w-[65%] overflow-hidden rounded-md border border-line bg-white/95 px-2 py-1 text-[11px] leading-4 text-ink-2 shadow-sm">
      {!data.available ? <p>Dimensions: Not measured.</p> : <>
        <p className="font-medium text-ink">Measured on revision {short(data.revisionId)}</p>
        {draftPending && <p data-cad-dimensions-stale className="text-accent">Your draft is not built: these measure the displayed model.</p>}
        {data.items.map(item => <p key={item.key} data-cad-dimension-row={item.key} data-highlight={item.input && item.input.id === highlight ? 'true' : undefined} className={item.input && item.input.id === highlight ? 'text-ink' : ''}>
          <span className="text-ink">{item.name === '⌀' ? `⌀ ${item.input?.label || 'Diameter'}` : item.name}</span>: {item.measured != null ? `${PROVENANCE.measured.label} ${formatValue(item.measured, 'mm')}` : 'Not measured'}
          {item.input && <span className={item.input.kind === 'assumed' ? 'text-warn' : ''}> · {PROVENANCE[item.input.kind].label} {formatValue(item.input.value, item.input.unit)}{item.name !== '⌀' ? ` (${item.input.label})` : ''}</span>}
        </p>)}
        <p className="text-ink-3">Other features: Not measured.</p>
      </>}
    </div>
  </div>;
}
