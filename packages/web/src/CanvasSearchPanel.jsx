import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Box, ChevronDown, ChevronUp, Code, ExternalLink, FileText, Film, Image, Link2, MessageCircle, Search, Shapes } from 'lucide-react';
import { openInNewTab, plainClick } from './LinksPanel.jsx';
import { highlightCode } from './code-lang.js';
import { Button } from './ui.jsx';
import { SEARCH_DRAG, searchDrag, searchDragPayload } from './search-drag.js';
import { SEARCH_FILTERS, searchWindow, searchKeyIndex, searchEmptyMessage, searchLocation, searchRowHeight, markRuns, lineRuns } from './canvas-search-panel.js';

const button = 'rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40';
const labelOf = value => value.title || value.name || value.path || value.label || value.kind || 'Source';
const iconOf = result => result.kind === 'link' ? Link2 : result.kind === 'comment' ? MessageCircle : result.categories?.includes('code') ? Code : result.kind === 'shape' ? Shapes : FileText;
const PICTURE_ICONS = { Image, Video: Film, '3D model': Box, Canvas: Shapes };
// The match mark keeps dark text on its light violet in both themes (the theme's ink would be light on it in dark mode).
const markClass = 'rounded-sm bg-[#ddd6fe] text-[#37352f]';
// Only a picture the board already has: the card's own (blob, data, its https image), a stored same-origin thumbnail.
const SAFE_SRC = /^(blob:|data:image\/|https:\/\/|\/api\/learn\/)/;

// A picture result's thumbnail slot (UI-12): what getPreview resolves from the result's preview - never a source read, a
// renderer or a model - or the kind's icon and name when none is available or it fails to load. Each mounted virtual
// cell owns only its own Blob URL.
function Thumb({ result, getPreview, canvasKey }) {
  const [src, setSrc] = useState(null), [loaded, setLoaded] = useState(false);
  const key = JSON.stringify(result.preview);
  useEffect(() => {
    let cancelled = false, owned;
    setSrc(null); setLoaded(false);
    if (getPreview) Promise.resolve().then(() => getPreview(result)).then(value => {
      if (cancelled || !value) return;
      const next = value instanceof Blob ? (owned = URL.createObjectURL(value)) : typeof value === 'string' ? value : value.src;
      if (typeof next === 'string' && SAFE_SRC.test(next)) setSrc(next);
    }).catch(() => {});
    return () => { cancelled = true; if (owned) URL.revokeObjectURL(owned); };
  }, [canvasKey, result.id, key, getPreview]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = result.preview?.label || 'Preview', Icon = PICTURE_ICONS[label] || FileText;
  // The fallback stays until the picture has loaded, so a slow or empty answer (204: no thumbnail) never shows a blank box.
  return <span aria-hidden data-search-preview={src && loaded ? 'picture' : 'fallback'} className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-hover">
    {src && <img src={src} alt="" draggable={false} onLoad={() => setLoaded(true)} onError={() => setSrc(null)} className={loaded ? 'h-full w-full object-cover' : 'hidden'} />}
    {!(src && loaded) && <span className="flex flex-col items-center gap-0.5 text-ink-3"><Icon size={18} strokeWidth={1.5} /><span className="text-[9px] leading-3">{label}</span></span>}
  </span>;
}

// A code result's excerpt (UI-12): its matched lines (or first, browsing) with their stored numbers, in the code card's
// shiki colours - dark mode through the shared data-code-colors rule (index.css) - and the match marked.
function CodeExcerpt({ preview, hit }) {
  const lines = preview.lines, text = lines.map(line => line.text).join('\n');
  const [runs, setRuns] = useState(null);
  useEffect(() => {
    let live = true;
    setRuns(null);
    highlightCode(text, preview.language || 'text').then(next => { if (live) setRuns(lineRuns(next)); });
    return () => { live = false; };
  }, [text, preview.language]);
  return <pre data-search-code data-code-colors className="mt-1 shrink-0 overflow-hidden rounded-md border border-line py-1 font-mono text-[11px] leading-4 text-ink">
    {lines.map((line, i) => <span key={line.n} data-search-code-line={line.n} className="flex">
      <span aria-hidden className="w-9 shrink-0 pr-2 text-right text-ink-3 select-none">{line.n}</span>
      <span className="min-w-0 flex-1 truncate whitespace-pre">{markRuns(runs?.[i] || [{ t: line.text }], hit).map((run, j) => {
        const style = run.color ? { color: run.color, '--shiki-dark': run.dark || run.color } : undefined;
        return run.hit ? <mark key={j} className={markClass}>{run.t}</mark> : <span key={j} style={style}>{run.t}</span>;
      })}</span>
    </span>)}
  </pre>;
}

// A link result's own controls (the former Links tab): Open in a new tab for its canvas; its cards - on this canvas, Show
// frames the origin card; on another canvas (a backlink), a link that opens that canvas at the card, with its own new tab.
// A plain click stays in this tab through onOpenAction (the page saves first); modifier and middle clicks stay native.
const chip = `${button} flex max-w-full shrink-0 items-center gap-1 bg-hover px-1.5 py-1 text-[10px] leading-3 text-ink-2 hover:text-ink`;
function NewTab({ href, name }) {
  return <button type="button" aria-label={`Open ${name} in new tab`} title={`Open ${name} in new tab`} onClick={() => openInNewTab(href)} className={`${button} flex h-6 w-6 shrink-0 items-center justify-center text-ink-3 hover:bg-hover hover:text-ink`}><ExternalLink size={12} strokeWidth={1.8} aria-hidden /></button>;
}
function LinkActions({ result, onOpenAction }) {
  const { direction, href, cards } = result.link;
  return <>
    {href && <NewTab href={href} name={result.title} />}
    {cards.map(card => direction === 'from'
      ? <button key={card.id} type="button" data-links-origin={card.object} title={`Show ${card.title} on this canvas`} onClick={() => onOpenAction?.(result, { kind: 'link-card', objectId: card.object })} className={chip}><Shapes size={11} aria-hidden /><span className="max-w-28 truncate">{card.title}</span></button>
      : card.href && <span key={card.id} className="flex shrink-0 items-center">
        <a href={card.href} data-links-backlink={card.object} title={`Open ${card.title} in ${result.title}`} onClick={event => { if (plainClick(event)) { event.preventDefault(); onOpenAction?.(result, { kind: 'link-open', href: card.href }); } }} className={chip}><Shapes size={11} aria-hidden /><span className="max-w-28 truncate">{card.title}</span></a>
        <NewTab href={card.href} name={card.title} /></span>)}
  </>;
}

export default function CanvasSearchPanel({ canvasKey, hidden, showLinks = false, inputRef, scrollPositions, query = '', onQueryChange, filter = 'all', onFilterChange,
  includeResolved = false, onIncludeResolvedChange, results = [], counts = {}, status = {}, onRetry,
  activeId, onActiveIdChange, onActivate, onOpenAction, canGoBack, onGoBack, getPreview, onAddToCanvas, onDropNotice }) {
  const scroller = useRef(null), fallbackPositions = useRef(new Map()), pendingFocus = useRef(null);
  const positions = scrollPositions || fallbackPositions.current;
  const [viewport, setViewport] = useState({ width: 320, height: 400, scrollTop: 0 });
  const heights = useMemo(() => results.map(searchRowHeight), [results]);
  const layout = searchWindow({ heights, ...viewport });
  const current = results.findIndex(result => result.id === activeId);
  const state = status.state || status.status || 'ready';
  const session = `${canvasKey}\u0000${filter}\u0000${query}\u0000${includeResolved}`;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || hidden) return;
    element.scrollTop = positions.get(session) || 0;
    const measure = () => setViewport({ width: element.clientWidth || 320, height: element.clientHeight || 400, scrollTop: element.scrollTop });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => { positions.set(session, element.scrollTop); observer.disconnect(); };
  }, [session, hidden, positions]);
  useLayoutEffect(() => {
    if (pendingFocus.current == null) return;
    scroller.current?.querySelector(`[data-search-index="${pendingFocus.current}"]`)?.focus({ preventScroll: true });
    pendingFocus.current = null;
  });
  const reveal = (index, focus = false) => {
    const element = scroller.current;
    if (!element) return;
    const top = layout.offsets[index], height = heights[index];
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + height > element.scrollTop + element.clientHeight) element.scrollTop = top + height - element.clientHeight;
    if (focus) pendingFocus.current = index;
    setViewport(previous => ({ ...previous, scrollTop: element.scrollTop }));
  };
  // open false (Enter and the arrows in the field step through results): a link result is only highlighted, never opened.
  const activate = (index, open = true) => { const result = results[index]; if (result) { onActiveIdChange?.(result.id); reveal(index); if (open || result.kind !== 'link') onActivate?.(result); } };
  // Drag a result onto the canvas (UI-13, search-drag.js): the canvas plans, outlines and does the drop; what it reports - or
  // why it refused, when the drop ended on it with nothing done - shows in this panel's status line. A click still reveals.
  const dragStart = (event, payload) => {
    searchDrag.start(payload);
    event.dataTransfer.setData(SEARCH_DRAG, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', payload.title || '');
    event.dataTransfer.effectAllowed = 'copyMove';
  };
  const dragEnd = event => {
    const drag = searchDrag.end(), onCanvas = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-canvas-surface]');
    const message = drag?.outcome ? drag.outcome.message : event.dataTransfer.dropEffect === 'none' && onCanvas ? drag?.refusal : null;
    if (message) onDropNotice?.(message);
  };
  const go = step => { if (results.length) activate(current < 0 ? (step > 0 ? 0 : results.length - 1) : (current + step + results.length) % results.length, false); };
  return <div role="tabpanel" aria-label="Find text on canvas" data-canvas-find data-canvas-search className={`${hidden ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
    <div className="flex items-center gap-1">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-2 focus-within:border-ink-3"><Search size={15} className="shrink-0 text-ink-3" aria-hidden />
        <input ref={inputRef} aria-label="Find text on canvas" placeholder="Search this canvas" value={query} onChange={event => onQueryChange(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); go(event.shiftKey ? -1 : 1); } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onQueryChange(''); } if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); onActiveIdChange?.(results[0].id); reveal(0, true); } }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
      </label>
      <button type="button" aria-label="Previous match" disabled={!results.length} onClick={() => go(-1)} className={`${button} p-1.5 hover:bg-hover`}><ChevronUp size={16} aria-hidden /></button>
      <button type="button" aria-label="Next match" disabled={!results.length} onClick={() => go(1)} className={`${button} p-1.5 hover:bg-hover`}><ChevronDown size={16} aria-hidden /></button>
    </div>
    <div className="my-2 flex items-center justify-between gap-2 text-xs text-ink-3"><span>This canvas</span><span data-find-count aria-live="polite">{current >= 0 ? `${current + 1} of ${results.length}` : `${results.length} result${results.length === 1 ? '' : 's'}`}</span></div>
    <div role="group" aria-label="Search filters" className="mb-2 flex flex-wrap gap-1">
      {SEARCH_FILTERS.filter(([id]) => showLinks || id !== 'links').map(([id, label]) => <button key={id} type="button" data-search-filter={id} aria-pressed={filter === id} onClick={() => onFilterChange(id)} className={`${button} flex items-center gap-1 px-2 py-1 text-xs ${filter === id ? 'bg-(--nav-selected-bg) text-(--nav-selected-fg)' : 'text-ink-2 hover:bg-hover'}`}>{label}<span className="tabular-nums opacity-70">{counts[id] ?? 0}</span></button>)}
    </div>
    {filter === 'comments' && <label className="mb-2 flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={includeResolved} onChange={event => onIncludeResolvedChange?.(event.target.checked)} />Include resolved</label>}
    {canGoBack && <button type="button" onClick={onGoBack} className={`${button} mb-2 flex items-center gap-1 self-start px-1 py-1 text-xs text-ink-2 hover:bg-hover`}><ArrowLeft size={13} aria-hidden />Back to previous view</button>}
    {(state !== 'ready' || status.message) && <div role="status" className="mb-2 text-xs text-ink-2">{status.message || (state === 'loading' ? 'Loading searchable content…' : state === 'error' ? 'Some content could not be loaded.' : 'Some content is not available to Search.')}{onRetry && (state === 'error' || state === 'partial') && <button type="button" onClick={onRetry} className={`${button} ml-2 underline`}>Retry</button>}</div>}
    {!results.length && <p className="py-4 text-sm text-ink-2">{searchEmptyMessage(state, query, filter)}</p>}
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" data-search-scroll onScroll={event => { const scrollTop = event.currentTarget.scrollTop; positions.set(session, scrollTop); setViewport(previous => ({ ...previous, scrollTop })); }}>
      <ol aria-label="Search results" className="relative m-0 list-none p-0" style={{ height: layout.totalHeight }}>
        {results.slice(layout.start, layout.end).map((result, offset) => {
          const index = layout.start + offset, selected = result.id === activeId, snippet = result.snippet || {}, location = searchLocation(result.location);
          const refs = result.references || [], children = result.rabbitHoles || [], link = result.link, preview = result.preview || {};
          const lines = preview.kind === 'code' ? preview.lines || [] : [], Icon = iconOf(result), payload = searchDragPayload(result);
          return <li key={result.id} aria-posinset={index + 1} aria-setsize={results.length} data-search-result={result.id} data-links-direction={link?.direction} data-unavailable={link?.unavailable || undefined} data-search-layout={lines.length ? 'code' : preview.kind === 'picture' ? 'picture' : 'text'} className="absolute inset-x-0 overflow-hidden pb-2" style={{ top: layout.offsets[index], height: heights[index] }}>
            <div className={`flex h-full flex-col rounded-lg border p-2 ${selected ? 'border-ink-3 bg-hover' : 'border-line'}`}>
              <button type="button" data-find-match={result.objectId} data-search-index={index} aria-current={selected ? 'true' : undefined} draggable={!!payload} data-search-drag={payload?.kind}
                onDragStart={payload ? event => dragStart(event, payload) : undefined} onDragEnd={payload ? dragEnd : undefined} className={`${button} flex min-h-0 flex-1 items-start gap-2 text-left`} onClick={() => activate(index)} onKeyDown={event => {
                const next = searchKeyIndex(event.key, index, results.length);
                if (next !== null) { event.preventDefault(); event.stopPropagation(); if (next >= 0) { onActiveIdChange?.(results[next].id); reveal(next, true); } }
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
              }}>
                {preview.kind === 'picture' && <Thumb key={`${canvasKey}:${result.id}`} result={result} getPreview={getPreview} canvasKey={canvasKey} />}
                <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex h-5 min-w-0 shrink-0 items-center gap-1 text-sm font-medium text-ink" title={result.title}>{preview.kind !== 'picture' && <Icon size={13} className="shrink-0 text-ink-3" aria-hidden />}<span className="truncate">{result.title || 'Untitled object'}</span></span>
                <span className="block shrink-0 truncate text-[10px] leading-3 text-ink-3">{result.match?.kind === 'source' ? 'Source text ? ' : ''}{location || preview.relation || (lines.length ? `${preview.path ? `${preview.path} · ` : ''}Line${lines.length > 1 ? `s ${lines[0].n}–${lines.at(-1).n}` : ` ${lines[0].n}`}` : result.kind)}{refs.length ? ` · ${refs.length} ${[...new Set(refs.map(ref => ref.kind || 'source'))].join('/')} reference${refs.length === 1 ? '' : 's'}` : ''}{link ? ` · ${link.cards.length} reference${link.cards.length === 1 ? '' : 's'}` : ''}{result.occurrenceCount > 1 ? ` · ${result.occurrenceCount} matches` : ''}</span>
                {lines.length ? <CodeExcerpt preview={preview} hit={snippet.hit} />
                  : <span data-search-excerpt className="mt-0.5 line-clamp-2 h-8 shrink-0 break-words text-xs text-ink-2">{snippet.before}{snippet.hit && <mark className={markClass}>{snippet.hit}</mark>}{snippet.after}</span>}
                {result.availability?.status !== 'ready' && result.availability?.message && <span className="block shrink-0 truncate text-[10px] leading-3 text-ink-3" title={result.availability.message}>{result.availability.message}</span>}
                </span>
              </button>
              {(refs.length > 0 || children.length > 0 || link) && <div className="mt-1 flex max-h-10 shrink-0 gap-1 overflow-x-auto border-t border-line pt-1">
                {link && <LinkActions result={result} onOpenAction={onOpenAction} />}
                {payload?.kind === 'link' && onAddToCanvas && <Button variant="inverse" size="sm" data-search-add title={`Add a link card to ${result.title} on this canvas`} onClick={() => onAddToCanvas(result)} className="ml-auto shrink-0">Add to canvas</Button>}
                {refs.map((reference, at) => <button key={`ref:${reference.id || at}`} type="button" disabled={reference.unavailable} title={reference.unavailable ? 'Source unavailable' : `Open ${labelOf(reference)}`} onClick={() => onOpenAction?.(result, { kind: 'reference', reference })} className={`${button} flex max-w-full shrink-0 items-center gap-1 bg-hover px-1.5 py-1 text-[10px] leading-3 text-ink-2`}><Link2 size={11} aria-hidden /><span className="max-w-24 truncate">{reference.unavailable ? 'Unavailable' : `Open ${labelOf(reference)}`}</span></button>)}
                {children.map((rabbitHole, at) => <button key={`child:${rabbitHole.name || at}`} type="button" title={rabbitHole.title || rabbitHole.name} onClick={() => onOpenAction?.(result, { kind: 'rabbit-hole', rabbitHole })} className={`${button} shrink-0 bg-hover px-1.5 py-1 text-[10px] leading-3 text-ink-2`}>Open Rabbit Hole</button>)}
              </div>}
            </div>
          </li>;
        })}
      </ol>
    </div>
  </div>;
}
