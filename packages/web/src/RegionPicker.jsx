import { useEffect, useRef, useState } from 'react';
import { ellipsePoints, regionTargets } from './region-targets.js';

export default function RegionPicker({ editor, lesson, onSelect, onCancel }) {
  const [points, setPoints] = useState([]);
  const [result, setResult] = useState(null);
  const stroke = useRef(null);
  const pageId = useRef(editor.getCurrentPageId());
  useEffect(() => {
    const escape = e => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', escape);
    const unlisten = editor.store.listen(() => { if (editor.getCurrentPageId() !== pageId.current) onCancel(); });
    return () => { window.removeEventListener('keydown', escape); unlisten(); editor.setHintingShapes([]); };
  }, [editor, onCancel]);
  const hint = candidate => editor.setHintingShapes(candidate?.shapeIds || []);
  const localPoint = (e, el) => { const b = el.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const dragPoints = (e, s) => ellipsePoints(s.start, localPoint(e, e.currentTarget));
  return <div className="absolute inset-0 z-50" aria-label="Circle a lesson object">
    <svg aria-label="Drag selection ellipse" className="h-full w-full touch-none" style={{ cursor: 'crosshair' }}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        stroke.current = { id: e.pointerId, start: localPoint(e, e.currentTarget) };
        hint(null); setResult(null); setPoints([]);
      }}
      onPointerMove={e => {
        const s = stroke.current;
        if (!s || s.id !== e.pointerId) return;
        setPoints(dragPoints(e, s));
      }}
      onPointerUp={e => {
        const s = stroke.current;
        if (!s || s.id !== e.pointerId) return;
        stroke.current = null;
        const local = dragPoints(e, s), b = e.currentTarget.getBoundingClientRect();
        const page = local.map(p => editor.screenToPage({ x: p.x + b.left, y: p.y + b.top }));
        setPoints(local);
        const found = regionTargets(editor, lesson, page);
        // One gesture: the best match is selected immediately; only failures
        // (no object, loop too small) keep the hint panel open for a retry.
        if (found.candidates?.length) { onSelect(found.candidates[0].shapeIds, page); return; }
        setResult({ ...found, region: page });
      }}
      onPointerCancel={() => { stroke.current = null; setPoints([]); }}>
      <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#dc2626" strokeWidth="3" />
    </svg>
    <div className="absolute left-3 top-3 max-w-[calc(100%-24px)] rounded-lg border border-line bg-white p-3 shadow-sm" role="status">
      <div className="flex items-center gap-4"><span className="text-sm">Drag an ellipse around an object.</span><button className="text-xs underline" onClick={onCancel}>Cancel</button></div>
      {result?.error && <p className="mt-2 text-xs text-ink-2">{result.error} Try again.</p>}
      {result?.candidates?.length === 0 && <p className="mt-2 text-xs text-ink-2">No lesson object found. Try another loop.</p>}
    </div>
  </div>;
}
