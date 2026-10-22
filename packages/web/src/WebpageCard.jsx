import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Highlighter, Loader2, Lock, LockOpen, MessageSquarePlus, RotateCw, Trash2, X } from 'lucide-react';
import { Button } from './ui.jsx';
import { Boxes, ToolButton, placeNear } from './selection-toolbar.jsx';
import { EXCERPT_LIMIT, textAnchor, toViewport } from './pdf-anchor.js';
import { deleteHighlight, listHighlights, newId, putHighlight } from './pdf-highlights.js';
import { canWrite, fileScope } from './file-source-client.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { selectionRef } from './selection-ref.js';
import { capturePage, captureFile, readCapture, rescreen } from './webcard-api.js';
import { holdContentGestures, wheelPixels } from './content-gestures.js';
import { applyResult, askText, captureViewport, cardState, clampScroll, highlightBody, highlightSource, highlightView, keyScroll, lineageOf, magnifyAt, runStyle, runsByTile, startPending, wheelScroll } from './webcard.js';

// The webpage card (C:/s/spec/day-1021/webcard-brief.md, webcard-interface.md): a saved capture of a public page as image tiles,
// a transparent text layer over them (the PDF reader's .textLayer), the PDF reader's selection popover with Highlight, Copy and
// Ask about selection, one scroll lock and an explicit Refresh. The page scrolls by a CSS transform, not an inner scroller, so the
// canvas's region picture (html-to-image) shows what is on screen. Scrolling, locking, selecting, highlighting, Copy and Ask make
// no AI call: Ask only fills the Chat composer.

// The cards whose capture this page asked for (Add webpage card, Refresh, Retry). A reload empties it, and a card left capturing
// says so with Retry instead of capturing again by itself.
// `wanted` is the one-shot start, so a second mount (React's dev double effect) never sends a second capture.
const asked = new Set(), wanted = new Set();
export const askCapture = id => { asked.add(id); wanted.add(id); };

const POLL_MS = 3000, RELEASE_MS = 2000;
let measurer = null;
// A run's natural width at a font height, for its scaleX (the layer's font is sans-serif, as here).
const measure = (text, height) => {
  measurer ||= document.createElement('canvas').getContext('2d');
  measurer.font = `${height}px sans-serif`;
  return measurer.measureText(text).width;
};

// One tile: its picture loads while it is on screen (within the card's window and the browser's) and is released 2 s after it
// leaves, so a long page or many cards hold only what is visible. The placeholder keeps its height.
function Tile({ tile, page, onSeen }) {
  const box = useRef(null), [url, setUrl] = useState(null), [seen, setSeen] = useState(false);
  useEffect(() => {
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => { clearTimeout(timer); if (entry.isIntersecting) setSeen(true); else timer = setTimeout(() => setSeen(false), RELEASE_MS); }, { rootMargin: '200px' });
    observer.observe(box.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  useEffect(() => { onSeen(tile.index, seen); }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!seen) return undefined;
    const controller = new AbortController();
    let made = null;
    captureFile(tile.key, { as: 'blob', signal: controller.signal }).then(blob => { made = URL.createObjectURL(blob); setUrl(made); }, () => {});
    return () => { controller.abort(); if (made) URL.revokeObjectURL(made); setUrl(null); };
  }, [seen, tile.key]);
  return <div ref={box} data-webcard-tile={tile.index} data-loaded={url ? '' : undefined} className="absolute inset-x-0 bg-hover/40"
    style={{ top: `${tile.y / page.height * 100}%`, height: `${tile.h / page.height * 100}%` }}>
    {url && <img src={url} alt="" draggable={false} className="block h-full w-full select-none" />}
  </div>;
}

export default function WebpageCard({ block, appName, selected, zoom = 1, readOnly = false, onChange, onChangeQuiet, onRemove }) {
  const latest = useRef(block);
  latest.current = block;
  const save = next => { latest.current = next; onChangeQuiet(next); };
  const owner = !readOnly && canWrite();
  const scope = fileScope();
  const { shown, notice, waiting, truncated } = cardState(block, { asked: asked.has(block.id) });
  const [manifest, setManifest] = useState(null), [runs, setRuns] = useState([]), [error, setError] = useState('');
  const [width, setWidth] = useState(0), [viewHeight, setViewHeight] = useState(0);
  const [top, setTop] = useState(block.scrollTop || 0);
  // Content zoom (1 = the card's width) and the sideways offset it opens: this viewer's view only, never saved or fetched.
  const [magnify, setMagnify] = useState(1), [left, setLeft] = useState(0);
  // A new version on show (Refresh) opens where applyResult put it (the top), not at the old version's offset.
  useEffect(() => { setTop(latest.current.scrollTop || 0); setLeft(0); setMagnify(1); }, [shown?.manifestId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [visible, setVisible] = useState(() => new Set());
  const [answer, setAnswer] = useState(null), [reload, setReload] = useState(0);
  const [bar, setBar] = useState(null), [menu, setMenu] = useState(null), [message, setMessage] = useState(null);
  const frame = useRef(null), column = useRef(null), layer = useRef(null), body = useRef(null), barEl = useRef(null), menuEl = useRef(null);
  const pressing = useRef(false);
  const chat = useChatWorkspace();
  // scrollLocked, not locked: block.locked is the canvas's own card lock (Arrange > Lock), which makes the card read-only.
  const locked = !!block.scrollLocked;

  // ---- capture requests: the one Add webpage card asked for, Refresh, Retry, and the status poll while screening.
  const request = async (run, next) => {
    asked.add(block.id);
    if (next) save(next);
    const reply = await run();
    asked.delete(block.id);
    save(applyResult(latest.current, reply));
  };
  const capture = () => request(() => capturePage({ app: appName, board: scope?.board || 'main', url: latest.current.url, lineage: lineageOf(latest.current) }), startPending(latest.current));
  useEffect(() => { if (wanted.delete(block.id) && block.pending?.status === 'capturing' && !block.pending.manifestId) capture(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const manifestId = block.pending?.manifestId;
  useEffect(() => {
    if (!owner || block.pending?.status !== 'screening' || !manifestId) return undefined;
    const timer = setInterval(() => readCapture(manifestId, { app: appName, board: scope?.board || 'main' }).then(reply => {
      if (latest.current.pending?.manifestId === manifestId) save(applyResult(latest.current, reply));
    }), POLL_MS);
    return () => clearInterval(timer);
  }, [owner, block.pending?.status, manifestId]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = () => (block.pending?.manifestId && block.pending.status !== 'capturing'
    ? request(() => rescreen(block.pending.manifestId, { app: appName, board: scope?.board || 'main' }), { ...latest.current, pending: { ...latest.current.pending, status: 'screening' } })
    : capture());
  const dismiss = () => onChange({ ...latest.current, pending: null, failure: null });

  // ---- the approved capture's manifest and text runs (file sources, refused until screening passed).
  const sourceId = block.fileRef?.source?.id || null;
  useEffect(() => {
    if (!shown || !sourceId) { setManifest(null); setRuns([]); return undefined; }
    const controller = new AbortController();
    setError('');
    captureFile(sourceId, { signal: controller.signal }).then(async found => {
      setManifest(found);
      const text = found.text?.key ? await captureFile(found.text.key, { signal: controller.signal }).catch(() => ({ runs: [] })) : { runs: [] };
      if (!controller.signal.aborted) setRuns(text.runs || []);
    }, problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [sourceId, shown?.sha256]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- highlights: the author's, on this capture version only (pdf_highlights under web:<lineage>); others are counted.
  const source = owner ? highlightSource(appName, shown) : null;
  useEffect(() => {
    if (!source) { setAnswer(null); return undefined; }
    const controller = new AbortController();
    listHighlights(source, controller.signal).then(setAnswer, () => setAnswer(null));
    return () => controller.abort();
  }, [source?.key, source?.manifest, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const { current: highlights, earlier } = highlightView(answer, shown?.sha256);

  // ---- geometry: card pixels per capture pixel (the card scale, times the content zoom for the drawn page), the visible size in
  // capture pixels, the page's own size.
  const page = { width: shown?.width || manifest?.width || 1280, height: shown?.height || manifest?.height || 1 };
  const scale = width / page.width || 1, drawn = scale * magnify, windowHeight = viewHeight / drawn, windowWidth = width / drawn;
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    const fit = () => { setWidth(el.clientWidth); setViewHeight(el.clientHeight); };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [!!shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const offset = clampScroll(top, page.height, windowHeight), offsetX = clampScroll(left, page.width, windowWidth);
  // The scroll position is the card's, saved quietly once the wheel rests (client state; nothing is fetched).
  useEffect(() => {
    if (Math.round(offset) === Math.round(latest.current.scrollTop || 0)) return undefined;
    const timer = setTimeout(() => save({ ...latest.current, scrollTop: Math.round(offset) }), 400);
    return () => clearTimeout(timer);
  }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useRef(null);
  live.current = { locked, offset, offsetX, scale, magnify, zoom, page, width, viewHeight };
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    // The content under the cursor owns the wheel and the pinch (owner, 2026-10-22; content-gestures.js). Unlocked, a wheel
    // scrolls the page and Ctrl/Cmd+wheel or a pinch zooms it, at the cursor; neither moves the canvas or zooms the browser, and
    // at a limit the gesture stops here. Locked, a plain wheel goes on to the canvas (it pans) and a zoom gesture is held:
    // nothing zooms. The card's place and size never change; nothing is fetched.
    const magnifyBy = (factor, clientX, clientY) => {
      const now = live.current, box = el.getBoundingClientRect(), z = now.zoom || 1;
      if (now.locked) return;
      const next = magnifyAt({ magnify: now.magnify, factor, at: [(clientX - box.left) / z, (clientY - box.top) / z], top: now.offset, left: now.offsetX, scale: now.scale, page: now.page, view: [now.width, now.viewHeight] });
      setMagnify(next.magnify); setTop(next.top); setLeft(next.left);
    };
    return holdContentGestures(el, {
      wheel: event => {
        const now = live.current, zooming = event.ctrlKey || event.metaKey;
        if (now.locked) return zooming ? undefined : false;
        if (zooming) { magnifyBy(Math.exp(-wheelPixels(event) * 0.002), event.clientX, event.clientY); return undefined; }
        const d = now.scale * now.magnify;
        const next = wheelScroll({ top: now.offset, left: now.offsetX, deltaX: event.deltaX, deltaY: event.deltaY, zoom: now.zoom, scale: d, pageWidth: now.page.width, pageHeight: now.page.height, viewWidth: now.width / d, viewHeight: now.viewHeight / d });
        setTop(next.top); setLeft(next.left);
        return undefined;
      },
      scale: magnifyBy,
    });
  }, [!!shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = event => {
    if (locked || event.target !== frame.current) return;
    const next = keyScroll(event.key, offset, windowHeight, page.height);
    if (next == null) return;
    event.preventDefault(); event.stopPropagation();
    setTop(next);
  };

  // ---- the selection popover (LearnPaper's companion toolbar): Highlight, Copy, Ask about selection.
  const tiles = manifest?.tiles || [];
  const byTile = runsByTile(runs, tiles);
  const viewport = captureViewport(page);
  const evaluate = () => {
    const root = layer.current, selection = window.getSelection?.();
    const range = root && selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range || !(root.contains(range.startContainer) && root.contains(range.endContainer))) { setBar(null); return; }
    const found = textAnchor(range, root, viewport, column.current);
    setBar(found.error ? null : { range: range.cloneRange(), anchor: found });
  };
  const reposition = () => {
    if (bar) placeNear(barEl.current, bar.range.getBoundingClientRect(), frame.current, body.current);
    if (menu) placeNear(menuEl.current, menu.el.getBoundingClientRect(), frame.current, body.current);
  };
  const live2 = useRef(null);
  live2.current = { evaluate, reposition };
  useLayoutEffect(() => { reposition(); });
  useEffect(() => {
    let raf = 0;
    const change = () => { if (pressing.current) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => live2.current.evaluate()); };
    document.addEventListener('selectionchange', change);
    return () => { document.removeEventListener('selectionchange', change); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { setBar(null); setMenu(null); }, [shown?.sha256]);
  useEffect(() => {
    if (!(bar || menu)) return undefined;
    const escape = event => { if (event.key !== 'Escape') return; event.stopPropagation(); if (menu) setMenu(null); else { window.getSelection?.()?.removeAllRanges(); setBar(null); } };
    const away = event => {
      if (bar && !barEl.current?.contains(event.target) && !layer.current?.contains(event.target)) setBar(null);
      if (menu && !menuEl.current?.contains(event.target) && !menu.el.contains(event.target)) setMenu(null);
    };
    window.addEventListener('keydown', escape, true); window.addEventListener('pointerdown', away, true);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('pointerdown', away, true); };
  }, [bar, menu]);
  const pressText = () => {
    const root = layer.current;
    root?.classList.add('selecting'); pressing.current = true;
    window.addEventListener('pointerup', () => { root?.classList.remove('selecting'); pressing.current = false; live2.current.evaluate(); }, { once: true });
  };
  const done = () => { window.getSelection?.()?.removeAllRanges(); setBar(null); };
  const highlight = async anchor => {
    if (anchor.exact.length > EXCERPT_LIMIT) { setMessage({ text: `Select up to ${EXCERPT_LIMIT.toLocaleString('en-US')} characters to highlight.` }); return; }
    const id = newId('pdfh'), sent = highlightBody(source, shown, { rects: anchor.rects, quote: anchor.quote });
    done();
    const put = async () => {
      setMessage({ text: 'Saving highlight' });
      try {
        const saved = await putHighlight(id, sent);
        setAnswer(previous => ({ ...(previous || { sha256: shown.sha256, changed: 0 }), highlights: [...(previous?.highlights || []).filter(h => h.id !== id), saved?.highlight || { id, ...sent }] }));
        setMessage(null);
      } catch (problem) {
        setMessage(problem.status === 409 ? { text: 'This page was refreshed since you selected this.' } : { text: `Couldn’t save the highlight. ${problem.message}`, retry: put });
      }
    };
    put();
  };
  const copy = anchor => {
    navigator.clipboard?.writeText(anchor.exact).then(() => setMessage({ text: 'Copied' }), () => setMessage({ text: 'Couldn’t copy. Press Ctrl C instead.' }));
    done();
  };
  // Ask about selection: Chat opens in Ask with the passage, title, URL and capture as one card ref in its composer. Nothing is sent.
  const ask = anchor => {
    const text = askText(block, anchor.exact);
    chat.addToChat(selectionRef({ ids: [block.id], kind: 'card', name: block.title || block.url, content: text, quote: anchor.exact, text: () => text }));
    done();
  };
  const removeHighlight = async h => {
    setMenu(null);
    try { await deleteHighlight(h.id, source); setAnswer(previous => previous && { ...previous, highlights: previous.highlights.filter(entry => entry.id !== h.id) }); setMessage(null); }
    catch (problem) { setMessage({ text: `Couldn’t remove the highlight. ${problem.message}`, retry: () => removeHighlight(h) }); }
  };

  const seen = (index, on) => setVisible(previous => { if (previous.has(index) === on) return previous; const next = new Set(previous); if (on) next.add(index); else next.delete(index); return next; });
  let host = block.url;
  try { host = new URL(block.url).hostname; } catch { /* the guard normalised it; show it as pasted */ }
  const title = block.title || host;
  const statusLine = notice && <div data-webcard-status={notice.status} role={notice.retry ? 'alert' : 'status'} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-ink-2">
    {/* Capturing and checking show a spinner (a still one under reduced motion); it goes with the state on success, failure or a stop. */}
    {waiting && <Loader2 size={13} aria-hidden="true" data-webcard-spinner className="shrink-0 animate-spin text-ink-3 motion-reduce:animate-none" />}
    <span className="min-w-0 flex-1">{notice.refresh && notice.status !== 'capturing' && notice.status !== 'screening' ? 'Refresh: ' : ''}{notice.text}{notice.reason ? `. ${notice.reason}` : ''}</span>
    {owner && notice.retry && <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>}
    {owner && notice.remove && onRemove && <Button size="sm" variant="secondary" onClick={() => onRemove(block.id)}><Trash2 size={13} />Remove</Button>}
    {owner && notice.dismiss && <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded p-1 hover:bg-hover"><X size={13} /></button>}
  </div>;

  return <section aria-label="Webpage" data-webcard data-webcard-locked={locked ? '' : undefined} className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 pb-2 text-xs text-ink" onPointerDown={event => { if (event.target.closest('button, a')) event.stopPropagation(); }}>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium" title={title}>{title}</h3>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
          <a data-webcard-source href={block.url} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-2 hover:underline">{host}</a>
          {truncated && <span data-webcard-truncated className="shrink-0 rounded border border-line px-1 text-[10px] text-ink-2">Truncated</span>}
        </p>
      </div>
      <button type="button" data-webcard-lock aria-label={locked ? 'Unlock scrolling' : 'Lock scrolling'} aria-pressed={locked} disabled={readOnly}
        title={locked ? 'Scrolling locked - the wheel moves the canvas. Click to unlock.' : 'Lock scrolling so the wheel moves the canvas'}
        onClick={() => onChange({ ...latest.current, scrollLocked: !locked })}
        className={`rounded border p-1 disabled:opacity-40 ${locked ? 'border-ink bg-ink text-white' : 'border-line hover:bg-hover'}`}>{locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
      {owner && <button type="button" data-webcard-refresh aria-label="Refresh" title="Refresh" disabled={waiting} onClick={capture}
        className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><RotateCw size={14} /></button>}
      <a href={block.url} target="_blank" rel="noopener noreferrer" aria-label="Open the page in a new tab" title="Open the page in a new tab" className="rounded border border-line p-1 hover:bg-hover"><ExternalLink size={14} /></a>
    </header>
    {statusLine}
    {earlier > 0 && <p data-webcard-earlier role="status" className="shrink-0 border-b border-line px-3 py-1.5 text-xs text-ink-2">From an earlier version: {earlier} {earlier === 1 ? 'highlight' : 'highlights'}, not shown on this capture.</p>}
    {message && <div data-webcard-notice role={message.retry ? 'alert' : 'status'} className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-ink-2">
      <span className="min-w-0 flex-1">{message.text}</span>
      {message.retry && <Button size="sm" variant="secondary" onClick={message.retry}>Retry</Button>}
      <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)} className="rounded p-1 hover:bg-hover"><X size={13} /></button>
    </div>}
    {error && <p role="alert" className="px-3 py-2 text-sm">{error}</p>}
    {shown ? <div ref={body} data-pointer-body className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl bg-white"
      // Selected, the card keeps the pointer for the text (as the Wikipedia card); locked, a press off the text is the canvas's.
      onPointerDown={event => { if (event.button === 0 && selected && (!locked || event.target.closest('.textLayer span'))) event.stopPropagation(); }}>
      <div ref={frame} data-webcard-frame data-scroll={locked ? undefined : ''} tabIndex={0} role="group" aria-label={`${title}, captured page`} onKeyDown={keys}
        className="absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40">
        <div ref={column} data-webcard-column className="relative" style={{ width: page.width * drawn, height: page.height * drawn, transform: `translateX(${-offsetX * drawn}px) translateY(${-offset * drawn}px)` }}>
          {tiles.map(tile => <Tile key={tile.key} tile={tile} page={page} onSeen={seen} />)}
          {highlights.length > 0 && <div className="pointer-events-none absolute inset-0 z-[2]">
            {highlights.map(h => <Boxes key={h.id} as="button" type="button" data-webcard-highlight data-highlight-id={h.id} parts={toViewport(h, viewport)}
              aria-label={`Highlight: ${(h.quote?.exact || '').slice(0, 60)}`} aria-haspopup="menu" aria-expanded={menu?.h.id === h.id}
              onClick={event => setMenu(menu?.h.id === h.id ? null : { h, el: event.currentTarget })}
              className="pointer-events-none rounded-sm focus-visible:outline-2 focus-visible:outline-accent" boxClassName="pointer-events-auto cursor-pointer bg-yellow-300/40" />)}
          </div>}
          <div ref={layer} aria-label="Page text" onPointerDown={event => { if (event.button === 0) pressText(); }} className="textLayer" style={{ '--total-scale-factor': drawn, fontFamily: 'sans-serif' }}>
            {tiles.filter(tile => visible.has(tile.index)).flatMap(tile => (byTile[tiles.indexOf(tile)] || []).map((run, i) => {
              const style = runStyle(run, measure);
              return [<span key={`${tile.index}:${i}`} style={{ left: style.left * drawn, top: style.top * drawn, '--font-height': `${style.fontHeight}px`, '--scale-x': style.scaleX }}>{run.text}</span>, '\n'];
            }))}
            <div className="endOfContent" />
          </div>
        </div>
      </div>
      {bar && <div ref={barEl} data-webcard-selection-toolbar role="toolbar" aria-label="Selected text" className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
        {source && <ToolButton label="Highlight" icon={Highlighter} onClick={() => highlight(bar.anchor)} />}
        <ToolButton label="Copy" icon={Copy} onClick={() => copy(bar.anchor)} />
        {chat && !readOnly && <ToolButton label="Ask about selection" icon={MessageSquarePlus} onClick={() => ask(bar.anchor)} />}
      </div>}
      {menu && <div ref={menuEl} data-webcard-highlight-menu role="menu" aria-label="Highlight" className="absolute z-30 flex w-44 flex-col rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
        <button type="button" role="menuitem" autoFocus onClick={() => removeHighlight(menu.h)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><Trash2 size={14} className="shrink-0 text-ink-2" />Remove highlight</button>
      </div>}
    </div> : waiting ? <div aria-hidden="true" data-webcard-skeleton className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 py-3">
      {['w-2/3', 'w-full', 'w-5/6', 'w-full', 'w-1/2'].map((size, i) => <div key={i} className={`h-2.5 ${size} rounded bg-hover motion-safe:animate-pulse`} />)}
    </div> : !notice && <p role="status" className="px-3 py-3 text-sm text-ink-2">No capture yet</p>}
  </section>;
}
