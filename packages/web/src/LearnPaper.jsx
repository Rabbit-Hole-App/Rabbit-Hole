import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, Scan, X } from 'lucide-react';
import { wsHeaders } from './api.js';

// `selectButton` off: a card owns its Ask selection pill above the card, so
// the reader's own button would be a second copy of the same control.
export default function LearnPaper({ app, paper, onClose, onPage, onSelect, selectRequest = 0, selectButton = true }) {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selecting, setSelecting] = useState(false);
  const [rectangle, setRectangle] = useState(null);
  const drag = useRef(null);
  const canvas = useRef(null);
  // An upload has no public identity: no arXiv number and no public URL.
  const uploaded = String(paper.id).startsWith('upload:');
  useEffect(() => { setSelecting(false); setRectangle(null); drag.current = null; }, [paper.id, paper.page]);
  // An outside control (the canvas Select-region pill) can arm the picker.
  useEffect(() => { if (selectRequest) { setSelecting(true); setRectangle(null); } }, [selectRequest]);
  const point = event => { const bounds = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }; };
  const region = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const capture = area => {
    const page = canvas.current;
    const pad = 0.025;
    const x = Math.max(0, area.x - pad), y = Math.max(0, area.y - pad);
    const w = Math.min(1, area.x + area.w + pad) - x, h = Math.min(1, area.y + area.h + pad) - y;
    const scale = Math.min(1, 1000 / (w * page.width), 1000 / (h * page.height));
    const thumb = window.document.createElement('canvas'); thumb.width = Math.max(1, Math.round(w * page.width * scale)); thumb.height = Math.max(1, Math.round(h * page.height * scale));
    const ctx = thumb.getContext('2d');
    ctx.drawImage(page, x * page.width, y * page.height, w * page.width, h * page.height, 0, 0, thumb.width, thumb.height);
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 4;
    ctx.strokeRect((area.x - x) / w * thumb.width, (area.y - y) / h * thumb.height, area.w / w * thumb.width, area.h / h * thumb.height);
    onSelect?.({ region: area, preview: thumb.toDataURL('image/png') });
  };
  useEffect(() => {
    const controller = new AbortController();
    let task;
    setDocument(null); setError(''); setZoom(1);
    (async () => {
      const response = await fetch(`/api/learn/paper?app=${encodeURIComponent(app)}&id=${encodeURIComponent(paper.id)}`, { headers: wsHeaders(), signal: controller.signal });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not load this paper.');
      const data = new Uint8Array(await response.arrayBuffer());
      const { getDocument } = await import('./learn-paper-figures.js');
      if (controller.signal.aborted) return;
      task = getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: true });
      const pdf = await task.promise;
      if (!controller.signal.aborted) setDocument(pdf);
    })().catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); task?.destroy(); };
  }, [app, paper.id]);
  useEffect(() => {
    if (!document) return;
    let active = true, render;
    setError('');
    (async () => {
      const page = await document.getPage(paper.page);
      if (!active || !canvas.current) return;
      const viewport = page.getViewport({ scale: 1.5 * zoom });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      render = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
      await render.promise;
    })().catch(error => { if (active) setError(error.message); });
    return () => { active = false; render?.cancel(); };
  }, [document, paper.page, zoom]);
  return <section aria-label="Paper reader" className="flex min-h-0 flex-1 flex-col">
    {/* One control row: title, pages, zoom and the region picker together. */}
    <header className="flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs text-ink">
      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{paper.title}</h3><p className="truncate text-xs text-ink-2">{uploaded ? 'Your upload' : `arXiv:${paper.id}`}{document ? ` · page ${paper.page} of ${document.numPages}` : ''}</p></div>
      {document && <>
        <button type="button" aria-label="Previous paper page" title="Previous page" disabled={paper.page <= 1} onClick={() => onPage(paper.page - 1)} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><ChevronLeft size={14} /></button>
        <button type="button" aria-label="Next paper page" title="Next page" disabled={paper.page >= document.numPages} onClick={() => onPage(paper.page + 1)} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><ChevronRight size={14} /></button>
        <button type="button" aria-label="Zoom out paper" title="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><Minus size={14} /></button>
        <span aria-label="Paper zoom" className="min-w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in paper" title="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><Plus size={14} /></button>
        {selectButton && <button type="button" data-paper-select aria-label={paper.selection ? 'Clear paper selection' : 'Ask about paper selection'}
          title={paper.selection ? 'Clear the marked region (or press Esc)' : 'Select a region to ask about'} aria-pressed={selecting}
          onClick={() => (paper.selection ? (onSelect?.(null), setSelecting(false), setRectangle(null)) : (setSelecting(value => !value), setRectangle(null)))}
          className={`rounded border p-1 ${selecting || paper.selection ? 'border-red-600 bg-red-50 text-red-600' : 'border-line hover:bg-hover'}`}>{paper.selection ? <X size={14} /> : <Scan size={14} />}</button>}
      </>}
      <a href={paper.pdfUrl ? `${paper.pdfUrl}#page=${paper.page}` : `/api/learn/paper?app=${encodeURIComponent(app)}&id=${encodeURIComponent(paper.id)}`} target="_blank" rel="noreferrer" title="Open original PDF" aria-label="Open original PDF" className="rounded border border-line p-1 hover:bg-hover"><ExternalLink size={14} /></a>
      {onClose && <button type="button" onClick={onClose} title="Close paper" aria-label="Close paper" className="rounded border border-line p-1 hover:bg-hover"><X size={14} /></button>}
    </header>
    {error && <p role="alert" className="p-3 text-sm">{error}</p>}
    {!document && !error && <p role="status" className="p-3 text-sm">Loading paper...</p>}
    <div className="min-h-0 flex-1 overflow-auto bg-white"><div className="relative" style={{ width: `${zoom * 100}%` }}>
      <canvas ref={canvas} aria-label="Paper PDF page" className="h-auto w-full" />
      {(selecting || paper.selection) && <svg aria-label="Select paper region" viewBox="0 0 1 1" preserveAspectRatio="none" className={`absolute inset-0 h-full w-full ${selecting ? 'touch-none' : 'pointer-events-none'}`} style={{ cursor: selecting ? 'crosshair' : undefined }}
        onPointerDown={event => { if (!selecting || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = point(event); setRectangle(null); }}
        onPointerMove={event => { if (drag.current) setRectangle(region(drag.current, point(event))); }}
        onPointerUp={event => { if (!drag.current) return; const area = region(drag.current, point(event)); drag.current = null; if (area.w < 0.01 || area.h < 0.01) { setRectangle(null); return; } capture(area); setSelecting(false); setRectangle(null); }}
        onPointerCancel={() => { drag.current = null; setRectangle(null); }}>
        {(rectangle || paper.selection?.region) && <rect {...(rectangle || paper.selection.region)} width={(rectangle || paper.selection.region).w} height={(rectangle || paper.selection.region).h} fill="none" stroke="#dc2626" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
      </svg>}
    </div></div>
  </section>;
}
