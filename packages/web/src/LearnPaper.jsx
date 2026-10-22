import { usePerf } from './learn-perf.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, GripVertical, Highlighter, MessageSquarePlus, Minus, Plus, RotateCw, SquareDashed, SquarePlus, Trash2, X } from 'lucide-react';
import { wsHeaders } from './api.js';
import { Button } from './ui.jsx';
import { paperBytesUrl } from './pdf-source.js';
import { quoteFromRange, locateQuote, rangeFromOffsets, containsOffset, paintHighlights } from './learn-wiki-highlights.js';
import { EXCERPT_LIMIT, rectsFor, regionAnchor, splitText, textAnchor, toViewport } from './pdf-anchor.js';
import { deleteHighlight, getSource, listHighlights, newId, putHighlight } from './pdf-highlights.js';
import { EXCERPT_DRAG, EXCERPT_EVENT, excerptDraft, put, sendExcerpt } from './pdf-excerpt-drafts.js';
import { renderCrop } from './pdf-crop.js';
import { Boxes, ToolButton, placeNear } from './selection-toolbar.jsx';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pct = n => `${n * 100}%`;
const MenuItem = ({ icon: Icon, children, ...props }) => <button type="button" role="menuitem" className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-accent/35" {...props}><Icon size={14} className="shrink-0 text-ink-2" />{children}</button>;
const SPLIT_NOUN = { canvas: 'cards', chat: 'attachments', highlight: 'highlights' };
const arrows = event => { // Up/Down move between a menu's items
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')], at = items.indexOf(window.document.activeElement);
  items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
};

// Asking about a region of the page goes through the canvas toolbar's Ask about selection (EXP-T28); a saved region
// (paper.selection) is still drawn. The companion reader's Select region is the excerpt tool, unrelated.
// Card-only, optional: `highlights` + `onHighlights` are the learner's yellow
// marks, quotes of the page's text stored with their page number, and
// `highlighting` is highlighter mode - the same model as the Wikipedia card.
// `src`: the PDF's own URL, for a file that is not a paper (a canvas context document in the Chat's Sources pane).
// `companion` (the Chat companion reader only, pdf-excerpts contract): { key, home, anchor, plainChat }. `key` is the PDF's
// source key (doc:ctx:... / pdf:upload:...), or null for a paper with no stored bytes (arXiv); `home` the canvas its bytes
// are stored on; `anchor` an excerpt to return to; `plainChat(text)` attaches a passage as a quote when there is no excerpt
// identity, returning an error message or null. With it come the selection toolbar, Select region, the author's saved
// highlights, Rotate page and page labels; without it (the canvas paper card) the reader is unchanged.
// `zoomStart` / `onZoom`, `rotationStart` / `onRotation`: the zoom and Rotate page turn to open at, and a report of each change
// (SourceReader keeps both across Open source).
export default function LearnPaper({ app, paper, onClose, onPage, zoomStart = 1, onZoom = null, rotationStart = 0, onRotation = null,
  highlights = null, onHighlights = null, highlighting = false, onHighlighting = null, paintKey = null, src = null, companion = null }) {
  const report = usePerf();
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(zoomStart);
  useEffect(() => { onZoom?.(zoom); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const [textDrawn, setTextDrawn] = useState(0);
  const canvas = useRef(null);
  const text = useRef(null);
  // Companion reader state: the drawn page and viewport, the server identity and the author's highlights, the selection
  // toolbar, the region tool, a highlight's menu, the oversize dialog and one notice line.
  const pdfPage = useRef(null), lastRender = useRef(null), scroller = useRef(null), pageBox = useRef(null), sectionEl = useRef(null);
  const barEl = useRef(null), regionEl = useRef(null), regionBarEl = useRef(null), menuEl = useRef(null), emphasisEl = useRef(null);
  const [view, setView] = useState(null);
  const [rotation, setRotation] = useState(rotationStart);
  useEffect(() => { onRotation?.(rotation); }, [rotation]); // eslint-disable-line react-hooks/exhaustive-deps
  const [labels, setLabels] = useState(null);
  const [refused, setRefused] = useState(false);
  const [noText, setNoText] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [saved, setSaved] = useState([]);
  const [reload, setReload] = useState(0);
  const [bar, setBar] = useState(null);
  const [area, setArea] = useState(null); // null: region tool off; { box: null | { x, y, w, h } } in page fractions
  const [menu, setMenu] = useState(null);
  const [limit, setLimit] = useState(null);
  const [notice, setNotice] = useState(null);
  const [emphasis, setEmphasis] = useState(false);
  const pressing = useRef(false), handle = useRef(null), emphasized = useRef(false);
  // An upload has no public identity: no arXiv number and no public URL.
  const uploaded = String(paper.id).startsWith('upload:') || !!src;
  const region = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  useEffect(() => {
    const controller = new AbortController();
    let task;
    setDocument(null); setError(''); setZoom(zoomStart); setRefused(false); setLabels(null);
    (async () => {
      // paper.home: a copied page's own canvas (pdf-to-canvas.md), read as this learner only.
      const response = await fetch(src || paperBytesUrl(app, paper.id, paper.home), { headers: wsHeaders(), signal: controller.signal });
      if (!response.ok) { setRefused(true); throw new Error((await response.json().catch(() => null))?.error || 'Could not load this paper.'); }
      const data = new Uint8Array(await response.arrayBuffer());
      const { getDocument } = await import('./learn-paper-figures.js');
      if (controller.signal.aborted) return;
      task = getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: true });
      const pdf = await task.promise;
      const pageLabels = companion ? await pdf.getPageLabels().catch(() => null) : null;
      if (!controller.signal.aborted) { setLabels(pageLabels); setDocument(pdf); }
    })().catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); task?.destroy(); };
  }, [app, paper.id, paper.home, src]);
  useEffect(() => {
    if (!document) return;
    let active = true, render, words, resize;
    setError('');
    (async () => {
      // Never the last page's words under this page's number; and pdf.js refuses a second render on one canvas, so the
      // cancelled one must settle first (a quick page turn otherwise failed and left the old text layer up).
      text.current?.replaceChildren();
      // Bounded: a render of a destroyed document may never settle.
      if (lastRender.current) await Promise.race([lastRender.current.catch(() => {}), new Promise(done => setTimeout(done, 1000))]);
      const page = await document.getPage(paper.page);
      if (!active || !canvas.current) return;
      // The page's own /Rotate, plus the companion's Rotate page.
      const viewport = page.getViewport({ scale: 1.5 * zoom, rotation: (page.rotate + rotation) % 360 });
      pdfPage.current = page;
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      render = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
      lastRender.current = render.promise;
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
      // `inset: 0` sizes it to the page; a quarter-turned page lays its words out unrotated (width and height swapped) and
      // the layer turns with data-main-rotation (index.css), as pdf.js's viewer does.
      const width = viewport.rawDims.pageWidth, swap = viewport.rotation % 180 !== 0, sheet = canvas.current;
      const fit = () => {
        const w = sheet.clientWidth, h = sheet.clientHeight;
        layer.style.width = swap ? `${h}px` : ''; layer.style.height = swap ? `${w}px` : '';
        layer.style.setProperty('--total-scale-factor', (swap ? h : w) / width);
      };
      fit();
      resize = new ResizeObserver(fit);
      resize.observe(sheet);
      await words.render();
      const end = window.document.createElement('div'); end.className = 'endOfContent'; layer.append(end);
      if (active) { setView(viewport); setNoText(!layer.textContent.trim()); setTextDrawn(count => count + 1); report('interactive'); }
    })().catch(error => { if (active && error?.name !== 'RenderingCancelledException') setError(error.message); });
    return () => { active = false; render?.cancel(); words?.cancel(); resize?.disconnect(); };
  }, [document, paper.page, zoom, rotation]);

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
  // catches the gaps between them. data-pressing lets the drag pass over saved highlights.
  const pressText = () => {
    const layer = text.current;
    layer?.classList.add('selecting');
    pressing.current = true; pageBox.current?.setAttribute('data-pressing', '');
    window.addEventListener('pointerup', () => {
      layer?.classList.remove('selecting');
      pressing.current = false; pageBox.current?.removeAttribute('data-pressing');
      if (highlighting) highlightSelection(); else live.current.evaluate();
    }, { once: true });
  };

  // ---- The companion reader's excerpts (pdf-excerpts contract). Selecting alone saves and sends nothing. ----
  const key = companion?.key || null, home = companion?.home ?? null;
  const ready = !!(key && identity?.sha256), plain = !!companion && (!key || !!identity?.error);
  const at = () => ({ app, key, home });
  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    Promise.allSettled([getSource(at(), controller.signal), listHighlights(at(), controller.signal)]).then(([source, list]) => {
      if (controller.signal.aborted) return;
      setIdentity(source.status === 'fulfilled' ? { sha256: source.value.sha256, name: source.value.name } : { error: source.reason });
      setSaved(source.status === 'fulfilled' && list.status === 'fulfilled' && list.value?.sha256 === source.value.sha256 ? list.value.highlights || [] : []);
    });
    return () => controller.abort();
  }, [app, key, home, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  // Another part of the app saved a highlight of this PDF (Add to canvas creates one): list them again.
  useEffect(() => {
    if (!key) return undefined;
    const refresh = event => { if (!event.detail?.key || event.detail.key === key) setReload(n => n + 1); };
    window.addEventListener('small:pdf-highlights', refresh);
    return () => window.removeEventListener('small:pdf-highlights', refresh);
  }, [key]);
  useEffect(() => { setBar(null); setMenu(null); setLimit(null); }, [paper.page, zoom, rotation]); // the text layer is redrawn
  useEffect(() => { setArea(value => value && { box: null }); }, [paper.page, rotation]); // a region box survives zoom only

  const evaluate = () => {
    if (!companion || area) return;
    const layer = text.current, selection = window.getSelection?.();
    const range = layer && view && selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range || !(layer.contains(range.startContainer) || layer.contains(range.endContainer))) { setBar(null); return; }
    const found = textAnchor(range, layer, view, canvas.current);
    // One page per selection: never cut a selection that leaves the page down to the part on it.
    if (found.error === 'page') { setBar(null); setNotice({ text: 'Select text within this page. A selection can’t run past the page.' }); return; }
    setBar(found.error ? null : { range: range.cloneRange(), anchor: found });
  };
  const reposition = () => {
    const frame = scroller.current, origin = pageBox.current;
    if (bar) placeNear(barEl.current, bar.range.getBoundingClientRect(), frame, origin);
    if (area?.box) placeNear(regionBarEl.current, regionEl.current?.getBoundingClientRect(), frame, origin);
    if (menu) placeNear(menuEl.current, menu.el.getBoundingClientRect(), frame, origin);
  };
  const live = useRef(null);
  live.current = { evaluate, reposition };
  useLayoutEffect(() => { if (companion) reposition(); });
  useEffect(() => {
    if (!companion) return undefined;
    let frame = 0;
    const change = () => { if (pressing.current) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(() => live.current.evaluate()); };
    const observer = new ResizeObserver(() => live.current.reposition());
    if (scroller.current) observer.observe(scroller.current);
    window.document.addEventListener('selectionchange', change);
    return () => { window.document.removeEventListener('selectionchange', change); cancelAnimationFrame(frame); observer.disconnect(); };
  }, [!!companion]); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape closes the topmost: the dialog, a highlight's menu, the region tool, then the toolbar. A click elsewhere dismisses.
  const limitEl = useRef(null);
  useEffect(() => {
    if (!(bar || area || menu || limit)) return undefined;
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (limit) setLimit(null); else if (menu) { menu.el?.focus(); setMenu(null); } else if (area) setArea(null); else setBar(null);
    };
    const away = event => {
      if (bar && !barEl.current?.contains(event.target) && !limitEl.current?.contains(event.target)) setBar(null);
      if (menu && !menuEl.current?.contains(event.target) && !menu.el.contains(event.target)) setMenu(null);
    };
    window.addEventListener('keydown', escape, true); window.addEventListener('pointerdown', away, true);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('pointerdown', away, true); };
  }, [bar, area, menu, limit]);
  // Closing the reader unmounts it; switching panels hides it - either way the region tool ends.
  useEffect(() => {
    if (!area || !sectionEl.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setArea(null); });
    observer.observe(sectionEl.current);
    return () => observer.disconnect();
  }, [!!area]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageInfo = () => ({ index: paper.page, label: labels?.[paper.page - 1] ?? null });
  const sourceOf = () => ({ key, sha256: identity.sha256, name: identity.name || paper.title || 'Document', home });
  const draftOf = (kind, rects, quote, extra = {}) => excerptDraft({ id: newId('pdfx'), kind, source: sourceOf(), page: pageInfo(), rotate: pdfPage.current.rotate, view: pdfPage.current.view, rects, quote, ...extra });
  const highlightBody = (kind, rects, quote) => ({ ...at(), sha256: identity.sha256, kind, page: pageInfo(), rects, rotate: pdfPage.current.rotate, view: [...pdfPage.current.view], quote });
  // An oversize selection's parts (each <= 8,000 characters, every character kept), each with only its own lines' boxes.
  const textParts = anchor => {
    const cuts = splitText(anchor.exact);
    if (cuts.length === 1) return [{ rects: anchor.rects, quote: anchor.quote, part: null }];
    return cuts.map(([start, end], i) => ({ rects: rectsFor(anchor.lines, start, end), part: { index: i + 1, of: cuts.length },
      quote: { exact: anchor.exact.slice(start, end), prefix: start ? anchor.exact.slice(Math.max(0, start - 32), start) : anchor.quote.prefix, suffix: end < anchor.exact.length ? anchor.exact.slice(end, end + 32) : anchor.quote.suffix } }));
  };
  // Each entry keeps its id and body, so Retry resends exactly the same request (the route is retry-safe).
  const saveHighlights = async entries => {
    setNotice({ text: 'Saving highlight' });
    const failed = [];
    for (const entry of entries) {
      try { const result = await putHighlight(entry.id, entry.body); const next = result?.highlight || { id: entry.id, ...entry.body }; setSaved(list => [...list.filter(h => h.id !== next.id), next]); }
      catch (error) { failed.push({ entry, error }); }
    }
    if (!failed.length) { setNotice(null); return; }
    const { error } = failed[0];
    setNotice(error.status === 409 ? { text: 'This document changed since you selected this. Reopen it to highlight the current version.' }
      : { text: `Couldn’t save the highlight. ${error.message}`, retry: () => saveHighlights(failed.map(f => f.entry)) });
  };
  const done = () => { window.getSelection?.()?.removeAllRanges(); setBar(null); };
  const textAction = (action, anchor, split = false) => {
    if (plain) { const problem = companion.plainChat?.(anchor.exact); setNotice(problem ? { text: problem } : null); if (!problem) done(); return; }
    if (!ready) return;
    const parts = textParts(anchor);
    if (parts.length > 1 && !split) { setLimit({ action, anchor, count: parts.length, size: anchor.exact.length }); return; }
    if (action === 'highlight') saveHighlights(parts.map(part => ({ id: newId('pdfh'), body: highlightBody('text', part.rects, part.quote) })));
    else {
      const ids = parts.map(part => put(draftOf('text', part.rects, part.quote, { part: part.part })));
      sendExcerpt(action, ids.length > 1 ? ids : ids[0]);
    }
    done();
  };
  const busy = useRef(false);
  const regionRects = () => { const b = area.box; return regionAnchor([b.x * view.width, b.y * view.height, (b.x + b.w) * view.width, (b.y + b.h) * view.height], view).rects; };
  const regionAction = async action => {
    if (busy.current || !area?.box || !ready) return;
    const rects = regionRects();
    if (action === 'highlight') { setArea(null); saveHighlights([{ id: newId('pdfh'), body: highlightBody('region', rects, null) }]); return; }
    busy.current = true; setNotice({ text: 'Preparing the region' });
    try { const crop = await renderCrop(pdfPage.current, { rects }); setNotice(null); setArea(null); sendExcerpt(action, put(draftOf('region', rects, null), crop)); }
    catch (error) { setNotice({ text: error.message }); }
    finally { busy.current = false; }
  };
  const pageOf = h => (h.page && typeof h.page === 'object' ? h.page : { index: h.page, label: null });
  const highlightAction = async (action, h) => {
    setMenu(null);
    if (action === 'delete') {
      try { await deleteHighlight(h.id, at()); setSaved(list => list.filter(entry => entry.id !== h.id)); setNotice(null); }
      catch (error) { setNotice({ text: `Couldn’t delete the highlight. ${error.message}`, retry: () => highlightAction('delete', h) }); }
      return;
    }
    const page = pageOf(h);
    const draft = excerptDraft({ id: newId('pdfx'), kind: h.kind, source: sourceOf(), page: { index: page.index, label: page.label ?? labels?.[page.index - 1] ?? null }, rotate: h.rotate, view: h.view, rects: h.rects, quote: h.quote, highlightId: h.id });
    try { sendExcerpt(action, put(draft, h.kind === 'region' ? await renderCrop(pdfPage.current, h) : null)); }
    catch (error) { setNotice({ text: error.message }); }
  };
  // Drag onto the canvas (as CodeReader does): the drag carries only the draft's id. A region's picture is drawn meanwhile.
  const dragged = useRef(null);
  const startDrag = (event, id) => { dragged.current = id; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(EXCERPT_DRAG, id); };
  // The canvas took the drop (its event names this drag's draft): the selection or the region is done, as after Add to canvas.
  // Read from the drop, not dragend's dropEffect, so the reader never stays in region mode with nothing to show for it.
  useEffect(() => {
    if (!companion) return undefined;
    const dropped = event => { if (!dragged.current || event.detail?.draftId !== dragged.current) return; dragged.current = null; setArea(null); done(); };
    window.addEventListener(EXCERPT_EVENT, dropped);
    return () => window.removeEventListener(EXCERPT_EVENT, dropped);
  }, [!!companion]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragText = event => {
    if (!bar || !ready) return;
    const parts = textParts(bar.anchor);
    if (parts.length > 1) { event.preventDefault(); setLimit({ action: 'canvas', anchor: bar.anchor, count: parts.length, size: bar.anchor.exact.length }); return; }
    startDrag(event, put(draftOf('text', parts[0].rects, parts[0].quote)));
  };
  const dragRegion = event => {
    if (!area?.box || !ready) { event.preventDefault(); return; }
    const rects = regionRects(), crop = renderCrop(pdfPage.current, { rects });
    crop.catch(() => {}); // the drop's consumer reports a failed picture
    startDrag(event, put(draftOf('region', rects, null), crop));
  };
  // Keyboard: arrows move the region, Shift and arrows resize it.
  const nudge = event => {
    const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[event.key];
    if (!d || !area?.box) return;
    event.preventDefault();
    const b = area.box;
    setArea({ box: event.shiftKey ? { ...b, w: clamp(b.w + d[0], 0.02, 1 - b.x), h: clamp(b.h + d[1], 0.02, 1 - b.y) } : { ...b, x: clamp(b.x + d[0], 0, 1 - b.w), y: clamp(b.y + d[1], 0, 1 - b.h) } });
  };
  const pagePoint = event => { const b = pageBox.current.getBoundingClientRect(); return { x: clamp((event.clientX - b.left) / b.width, 0, 1), y: clamp((event.clientY - b.top) / b.height, 0, 1) }; };
  // Started from the keyboard (no pointer), the tool offers a box to move and resize.
  const startArea = keyboard => { done(); setMenu(null); setArea({ box: keyboard ? { x: 0.2, y: 0.3, w: 0.6, h: 0.25 } : null, focus: keyboard }); };
  useEffect(() => { if (area?.focus) regionEl.current?.focus(); }, [area?.focus]);

  // Return to the excerpt: its page opens (SourceReader), its boxes are emphasized for 2.5 s. A changed document shows that
  // instead, never another passage.
  const anchor = companion?.anchor || null;
  const changed = !!(anchor && identity?.sha256 && anchor.source?.sha256 !== identity.sha256);
  const showable = !!(anchor && identity?.sha256 && !changed && anchor.page?.index === paper.page && view);
  useEffect(() => { if (showable && !emphasized.current) { emphasized.current = true; setEmphasis(true); } }, [showable]);
  useEffect(() => {
    if (!emphasis) return undefined;
    const el = emphasisEl.current, frame = scroller.current;
    if (el && frame) {
      const r = el.getBoundingClientRect(), f = frame.getBoundingClientRect();
      frame.scrollTop += r.top - f.top - Math.max(8, (f.height - r.height) / 2);
      frame.scrollLeft += r.left - f.left - Math.max(8, (f.width - r.width) / 2);
    }
    const timer = setTimeout(() => setEmphasis(false), 2500);
    return () => clearTimeout(timer);
  }, [emphasis]);

  const label = labels?.[paper.page - 1];
  const where = !document ? '' : label && label !== String(paper.page) ? ` · page ${label} (${paper.page} of ${document.numPages})` : ` · page ${paper.page} of ${document.numPages}`;
  const regionTool = !!companion && !plain;
  const box = area?.box;
  const pageHighlights = saved.filter(h => pageOf(h).index === paper.page);
  const dragHandle = onDragStart => <button type="button" draggable aria-label="Drag to canvas" title="Drag onto the canvas" onDragStart={onDragStart}
    className="flex h-8 min-w-6 cursor-grab items-center justify-center rounded-lg text-ink-3 select-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent/35"><GripVertical size={15} /></button>;
  return <section ref={sectionEl} aria-label="Paper reader" className="relative flex min-h-0 flex-1 flex-col">
    {/* One control row: title, pages, zoom and the region picker together. In the companion (the Context reader) the title
        is the Context header's, shown once (UI-26); pages and zoom are each one group. */}
    <header className={`flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs text-ink ${companion ? 'flex-wrap' : ''}`}>
      <div className="min-w-0 flex-1">{!companion && <h3 className="truncate text-sm font-medium">{paper.title}</h3>}<p className="truncate text-xs text-ink-2">{uploaded ? 'Your upload' : `arXiv:${paper.id}`}{companion ? where : document ? ` · page ${paper.page} of ${document.numPages}` : ''}</p></div>
      {document && <>
        <div role="group" aria-label="Pages" className="flex items-center gap-0.5">
          <button type="button" aria-label="Previous paper page" title="Previous page" disabled={paper.page <= 1} onClick={() => onPage(paper.page - 1)} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><ChevronLeft size={14} /></button>
          <button type="button" aria-label="Next paper page" title="Next page" disabled={paper.page >= document.numPages} onClick={() => onPage(paper.page + 1)} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
        <div role="group" aria-label="Zoom" className="flex items-center gap-0.5">
          <button type="button" aria-label="Zoom out paper" title="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><Minus size={14} /></button>
          <span aria-label="Paper zoom" className="min-w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in paper" title="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><Plus size={14} /></button>
        </div>
        {companion && <button type="button" aria-label="Rotate page" title="Rotate page" onClick={() => setRotation(r => (r + 90) % 360)} className="rounded border border-line p-1 hover:bg-hover"><RotateCw size={14} /></button>}
        {regionTool && <button type="button" aria-label="Select region" aria-pressed={!!area} disabled={!ready} title={area ? 'Stop selecting a region (Esc)' : 'Select a region of the page'}
          onClick={event => (area ? setArea(null) : startArea(event.detail === 0))}
          className={`rounded border p-1 disabled:opacity-40 ${area ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-line hover:bg-hover'}`}><SquareDashed size={14} /></button>}
      </>}
      {document && onHighlighting && <button type="button" aria-label="Highlighter" aria-pressed={highlighting}
        title={highlighting ? 'Highlighter on - select text to highlight it, click a highlight to remove it' : 'Highlight text'}
        onClick={() => onHighlighting(!highlighting)}
        className={`relative rounded border p-1 ${highlighting ? 'border-yellow-400 bg-yellow-200 text-ink' : 'border-line hover:bg-hover'}`}>
        <Highlighter size={14} />
        {mine.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-3.5 rounded-full bg-yellow-400 px-1 text-[9px] leading-3.5 font-semibold text-ink">{mine.length}</span>}
      </button>}
      <a href={src ? `${src}#page=${paper.page}` : paper.pdfUrl ? `${paper.pdfUrl}#page=${paper.page}` : paperBytesUrl(app, paper.id, paper.home)} target="_blank" rel="noreferrer" title="Open original PDF" aria-label="Open original PDF" className="rounded border border-line p-1 hover:bg-hover"><ExternalLink size={14} /></a>
      {onClose && <button type="button" onClick={onClose} title="Close paper" aria-label="Close paper" className="rounded border border-line p-1 hover:bg-hover"><X size={14} /></button>}
    </header>
    {notice && <div data-pdf-notice role={notice.retry ? 'alert' : 'status'} className="flex shrink-0 items-center gap-2 border-b border-line py-1.5 text-xs text-ink-2">
      <span className="min-w-0 flex-1">{notice.text}</span>
      {notice.retry && <Button size="sm" variant="secondary" onClick={notice.retry}>Retry</Button>}
      <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-hover"><X size={13} /></button>
    </div>}
    {companion && changed && <p data-pdf-source-changed role="status" className="shrink-0 border-b border-line py-1.5 text-xs text-ink-2">This document changed after the excerpt was taken, so the excerpt can{'’'}t be shown on it.</p>}
    {companion && noText && view && !error && <div data-pdf-no-text role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line py-1.5 text-xs text-ink-2">
      <span>This page has no selectable text.</span>
      {regionTool && ready && !area && <Button size="sm" variant="secondary" onClick={event => startArea(event.detail === 0)}>Select a region instead</Button>}
    </div>}
    {error && <p role="alert" data-pdf-source-unavailable={companion && refused ? '' : undefined} className="p-3 text-sm">{error}</p>}
    {!document && !error && <p role="status" className="p-3 text-sm">Loading paper</p>}
    <div ref={scroller} onScroll={companion ? () => live.current.reposition() : undefined} className="min-h-0 flex-1 overflow-auto bg-white"><div ref={pageBox} data-pdf-region-mode={area ? '' : undefined} className="group/page relative" style={{ width: `${zoom * 100}%`, cursor: area ? 'crosshair' : undefined }}>
      <canvas ref={canvas} aria-label="Paper PDF page" className="block h-auto w-full" />
      {companion && view && pageHighlights.length > 0 && <div className="pointer-events-none absolute inset-0 z-[2]">
        {pageHighlights.map(h => <Boxes key={h.id} as="button" type="button" data-pdf-highlight data-highlight-id={h.id} parts={toViewport(h, view)}
          aria-label={h.kind === 'region' ? 'Highlighted region' : `Highlight: ${(h.quote?.exact || '').slice(0, 60)}`} aria-haspopup="menu" aria-expanded={menu?.h.id === h.id}
          onClick={event => setMenu(menu?.h.id === h.id ? null : { h, el: event.currentTarget })}
          className="pointer-events-none rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
          boxClassName="pointer-events-auto cursor-pointer bg-yellow-300/40 group-data-[pressing]/page:pointer-events-none" />)}
      </div>}
      {emphasis && view && <Boxes ref={emphasisEl} data-pdf-emphasis aria-hidden="true" parts={toViewport(anchor, view)} className="pointer-events-none z-[3]"
        boxClassName="bg-orange-300/35 ring-2 ring-orange-500 motion-safe:animate-pulse" />}
      <div ref={text} aria-label="Paper page text" onPointerDown={event => { if (event.button === 0) pressText(); }} onDragStart={companion ? dragText : undefined} className="textLayer" />
      {bar && <div ref={barEl} data-pdf-selection-toolbar role="toolbar" aria-label="Selected text" className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
        {plain ? <ToolButton label="Add to chat" icon={MessageSquarePlus} onClick={() => textAction('chat', bar.anchor)} /> : <>
          <ToolButton label="Highlight" icon={Highlighter} disabled={!ready} onClick={() => textAction('highlight', bar.anchor)} />
          <ToolButton label="Add to canvas" icon={SquarePlus} disabled={!ready} onClick={() => textAction('canvas', bar.anchor)} />
          <ToolButton label="Add to chat" icon={MessageSquarePlus} disabled={!ready} onClick={() => textAction('chat', bar.anchor)} />
          {ready && dragHandle(dragText)}
        </>}
      </div>}
      {area && <div aria-hidden="true" className="absolute inset-0 z-20 touch-none select-none"
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const p = pagePoint(event); handle.current = p; setArea({ box: { ...p, w: 0, h: 0 } }); }}
        onPointerMove={event => { if (handle.current) setArea({ box: region(handle.current, pagePoint(event)) }); }}
        onPointerUp={() => { handle.current = null; setArea(value => (value?.box && (value.box.w < 0.01 || value.box.h < 0.01) ? { box: null } : value)); }}
        onPointerCancel={() => { handle.current = null; }} />}
      {box && <div ref={regionEl} data-pdf-region tabIndex={0} role="group" aria-label="Selected region. Arrow keys move it; Shift and arrow keys resize it." onKeyDown={nudge}
        className="pointer-events-none absolute z-[21] border-2 border-blue-600 bg-blue-500/10 outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}>
        {[['nw', 0, 0], ['ne', 1, 0], ['sw', 0, 1], ['se', 1, 1]].map(([corner, cx, cy]) => <span key={corner} data-pdf-region-handle={corner}
          className="pointer-events-auto absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center" style={{ left: pct(cx), top: pct(cy), cursor: cx === cy ? 'nwse-resize' : 'nesw-resize' }}
          onPointerDown={event => { if (event.button !== 0) return; event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); handle.current = { x: cx ? box.x : box.x + box.w, y: cy ? box.y : box.y + box.h }; }}
          onPointerMove={event => { if (handle.current) setArea({ box: region(handle.current, pagePoint(event)) }); }}
          onPointerUp={() => { handle.current = null; }}><span className="block h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white" /></span>)}
      </div>}
      {box && box.w >= 0.01 && box.h >= 0.01 && <div ref={regionBarEl} data-pdf-region-toolbar role="toolbar" aria-label="Selected region" className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
        <ToolButton label="Highlight region" icon={Highlighter} onClick={() => regionAction('highlight')} />
        <ToolButton label="Add to canvas" icon={SquarePlus} onClick={() => regionAction('canvas')} />
        <ToolButton label="Add to chat" icon={MessageSquarePlus} onClick={() => regionAction('chat')} />
        {dragHandle(dragRegion)}
        <ToolButton label="Cancel" icon={X} onClick={() => setArea(null)} />
      </div>}
      {menu && <div ref={menuEl} data-pdf-highlight-menu role="menu" aria-label="Highlight" onKeyDown={arrows} className="absolute z-30 flex w-44 max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
        <MenuItem icon={SquarePlus} autoFocus onClick={() => highlightAction('canvas', menu.h)}>Add to canvas</MenuItem>
        <MenuItem icon={MessageSquarePlus} onClick={() => highlightAction('chat', menu.h)}>Add to chat</MenuItem>
        <MenuItem icon={Trash2} onClick={() => highlightAction('delete', menu.h)}>Delete highlight</MenuItem>
      </div>}
      {paper.selection?.region && <svg aria-label="Selected paper region" viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <rect {...paper.selection.region} width={paper.selection.region.w} height={paper.selection.region.h} fill="none" stroke="#dc2626" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>}
    </div></div>
    {limit && <div ref={limitEl} data-pdf-excerpt-limit role="dialog" aria-label="Selection too long" onMouseDown={event => { if (event.target.tagName !== 'BUTTON') event.preventDefault(); }}
      className="absolute inset-x-2 top-12 z-40 rounded-lg border border-line bg-white p-3 text-sm shadow-pop">
      <p className="text-ink">This selection is {limit.size.toLocaleString('en-US')} characters. {limit.action === 'chat' ? 'An attachment' : limit.action === 'highlight' ? 'A highlight' : 'A card'} holds up to {EXCERPT_LIMIT.toLocaleString('en-US')}, so nothing was added.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" autoFocus onMouseDown={event => event.preventDefault()} onClick={() => { setLimit(null); setNotice({ text: `Select a shorter passage, up to ${EXCERPT_LIMIT.toLocaleString('en-US')} characters.` }); }}>Shorten selection</Button>
        <Button variant="action" onMouseDown={event => event.preventDefault()} onClick={() => { const { action, anchor: selected } = limit; setLimit(null); textAction(action, selected, true); }}>Split into {limit.count} {SPLIT_NOUN[limit.action]}</Button>
        <Button onMouseDown={event => event.preventDefault()} onClick={() => setLimit(null)}>Cancel</Button>
      </div>
    </div>}
  </section>;
}
