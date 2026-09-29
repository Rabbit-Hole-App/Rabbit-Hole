import { usePerf } from './learn-perf.js';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Highlighter, Minus, Plus, Scan, X } from 'lucide-react';
import { wsHeaders } from './api.js';
import { quoteFromRange, locateQuote, rangeFromOffsets, containsOffset, paintHighlights } from './learn-wiki-highlights.js';

// `selectButton` off: a card owns its Ask selection pill above the card, so
// the reader's own button would be a second copy of the same control.
// Card-only, optional: `highlights` + `onHighlights` are the learner's yellow
// marks, quotes of the page's text stored with their page number, and
// `highlighting` is highlighter mode - the same model as the Wikipedia card.
export default function LearnPaper({ app, paper, onClose, onPage, onSelect, selectRequest = 0, selectButton = true,
  highlights = null, onHighlights = null, highlighting = false, onHighlighting = null, paintKey = null }) {
  const report = usePerf();
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selecting, setSelecting] = useState(false);
  const [rectangle, setRectangle] = useState(null);
  const [textDrawn, setTextDrawn] = useState(0);
  const drag = useRef(null);
  const canvas = useRef(null);
  const text = useRef(null);
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
    let active = true, render, words, resize;
    setError('');
    (async () => {
      const page = await document.getPage(paper.page);
      if (!active || !canvas.current) return;
      const viewport = page.getViewport({ scale: 1.5 * zoom });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      render = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
      await render.promise;
      report('content');
      // Selectable words over the image. Positions are percentages of the
      // page; the font scale follows the page's displayed width as the card
      // is resized. A scanned page simply has no words here.
      const layer = text.current;
      if (!active || !layer) return;
      layer.replaceChildren();
      const { TextLayer } = await import('./learn-paper-figures.js');
      if (!active) return;
      words = new TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
      layer.style.width = layer.style.height = ''; // `inset: 0` sizes it to the page
      const width = viewport.rawDims.pageWidth;
      resize = new ResizeObserver(() => layer.style.setProperty('--total-scale-factor', layer.clientWidth / width));
      resize.observe(layer);
      await words.render();
      const end = window.document.createElement('div'); end.className = 'endOfContent'; layer.append(end);
      if (active) { setTextDrawn(count => count + 1); report('interactive'); }
    })().catch(error => { if (active) setError(error.message); });
    return () => { active = false; render?.cancel(); words?.cancel(); resize?.disconnect(); };
  }, [document, paper.page, zoom]);

  // Highlights on this page, painted over the text layer once it is drawn.
  const mine = (highlights || []).filter(entry => entry.page === paper.page);
  const minesKey = JSON.stringify(mine);
  useEffect(() => {
    if (!paintKey) return;
    const root = text.current, content = root?.textContent || '';
    paintHighlights(paintKey, root ? mine.map(quote => { const span = locateQuote(content, quote); return span && rangeFromOffsets(root, span.start, span.end); }).filter(Boolean) : []);
    return () => paintHighlights(paintKey, []);
  }, [textDrawn, minesKey, paintKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlighter mode: a selection becomes a highlight; a click on one removes it.
  const highlightSelection = () => {
    const root = text.current;
    const selection = window.getSelection?.();
    if (!root || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      if (!root.contains(range.startContainer)) return;
      const before = window.document.createRange();
      before.setStart(root, 0); before.setEnd(range.startContainer, range.startOffset);
      const offset = before.toString().length, content = root.textContent;
      const hit = mine.find(quote => containsOffset(locateQuote(content, quote), offset));
      if (hit) onHighlights?.((highlights || []).filter(entry => entry !== hit));
      return;
    }
    const quote = quoteFromRange(root, range);
    if (!quote) return;
    selection.removeAllRanges();
    onHighlights?.([...(highlights || []), { page: paper.page, ...quote }]);
  };
  // pdf.js's own trick: while a drag selects, the sheet under the words
  // catches the gaps between them.
  const pressText = () => {
    const layer = text.current;
    layer?.classList.add('selecting');
    window.addEventListener('pointerup', () => { layer?.classList.remove('selecting'); if (highlighting) highlightSelection(); }, { once: true });
  };
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
      {document && onHighlighting && <button type="button" aria-label="Highlighter" aria-pressed={highlighting}
        title={highlighting ? 'Highlighter on - select text to highlight it, click a highlight to remove it' : 'Highlight text'}
        onClick={() => onHighlighting(!highlighting)}
        className={`relative rounded border p-1 ${highlighting ? 'border-yellow-400 bg-yellow-200 text-ink' : 'border-line hover:bg-hover'}`}>
        <Highlighter size={14} />
        {mine.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-3.5 rounded-full bg-yellow-400 px-1 text-[9px] leading-3.5 font-semibold text-ink">{mine.length}</span>}
      </button>}
      <a href={paper.pdfUrl ? `${paper.pdfUrl}#page=${paper.page}` : `/api/learn/paper?app=${encodeURIComponent(app)}&id=${encodeURIComponent(paper.id)}`} target="_blank" rel="noreferrer" title="Open original PDF" aria-label="Open original PDF" className="rounded border border-line p-1 hover:bg-hover"><ExternalLink size={14} /></a>
      {onClose && <button type="button" onClick={onClose} title="Close paper" aria-label="Close paper" className="rounded border border-line p-1 hover:bg-hover"><X size={14} /></button>}
    </header>
    {error && <p role="alert" className="p-3 text-sm">{error}</p>}
    {!document && !error && <p role="status" className="p-3 text-sm">Loading paper</p>}
    <div className="min-h-0 flex-1 overflow-auto bg-white"><div className="relative" style={{ width: `${zoom * 100}%` }}>
      <canvas ref={canvas} aria-label="Paper PDF page" className="h-auto w-full" />
      <div ref={text} aria-label="Paper page text" onPointerDown={event => { if (event.button === 0) pressText(); }} className="textLayer" />
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
