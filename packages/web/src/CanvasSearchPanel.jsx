import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Code, FileText, Link2, MessageCircle, Search, Shapes } from 'lucide-react';
import { SEARCH_FILTERS, searchWindow, searchKeyIndex, searchEmptyMessage, searchLocation } from './canvas-search-panel.js';

const button = 'rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40';
const labelOf = value => value.title || value.name || value.path || value.label || value.kind || 'Source';
const iconOf = result => result.kind === 'comment' ? MessageCircle : result.categories?.includes('code') ? Code : result.kind === 'shape' ? Shapes : FileText;

// Only a provider's already-cached image is displayed. Never load a source, render a live card,
// or own/revoke provider URLs. Each mounted virtual cell owns only its own Blob URL.
function Preview({ result, getPreview, canvasKey }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let cancelled = false, owned;
    setPreview(null);
    if (getPreview && result.previewKey) Promise.resolve().then(() => getPreview(result)).then(value => {
      if (cancelled || !value) return;
      const src = value instanceof Blob ? (owned = URL.createObjectURL(value)) : typeof value === 'string' ? value : value.src;
      // Prevent accidental network fetches from result metadata. Cached previews are local only.
      if (typeof src === 'string' && /^(blob:|data:image\/)/.test(src)) setPreview({ src, alt: value.alt || '' });
    }).catch(() => {});
    return () => { cancelled = true; if (owned) URL.revokeObjectURL(owned); };
  }, [canvasKey, result.previewKey, getPreview]);
  const Icon = iconOf(result);
  return <div className="flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-hover p-2" aria-hidden>
    {preview ? <img src={preview.src} alt="" className="h-full w-full object-contain" /> : <div className="flex min-w-0 flex-col items-center gap-2 text-ink-3"><Icon size={24} strokeWidth={1.4} /><span className="line-clamp-3 break-words text-center text-xs">{result.snippet?.hit || result.snippet?.after || result.title}</span></div>}
  </div>;
}

export default function CanvasSearchPanel({ canvasKey, hidden, inputRef, query = '', onQueryChange, filter = 'all', onFilterChange,
  includeResolved = false, onIncludeResolvedChange, results = [], counts = {}, status = {}, onRetry,
  activeId, onActiveIdChange, onActivate, onOpenAction, canGoBack, onGoBack, getPreview }) {
  const scroller = useRef(null), positions = useRef(new Map()), pendingFocus = useRef(null);
  const [viewport, setViewport] = useState({ width: 320, height: 400, scrollTop: 0 });
  const rows = filter === 'comments' || filter === 'text';
  const layout = searchWindow({ count: results.length, ...viewport, rows });
  const current = results.findIndex(result => result.id === activeId);
  const state = status.state || status.status || 'ready';
  const session = `${canvasKey}\u0000${filter}\u0000${query}\u0000${includeResolved}`;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || hidden) return;
    element.scrollTop = positions.current.get(session) || 0;
    const measure = () => setViewport({ width: element.clientWidth || 320, height: element.clientHeight || 400, scrollTop: element.scrollTop });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => { positions.current.set(session, element.scrollTop); observer.disconnect(); };
  }, [session, hidden]);
  useLayoutEffect(() => {
    if (pendingFocus.current == null) return;
    scroller.current?.querySelector(`[data-search-index="${pendingFocus.current}"]`)?.focus({ preventScroll: true });
    pendingFocus.current = null;
  });
  const reveal = (index, focus = false) => {
    const element = scroller.current;
    if (!element) return;
    const top = Math.floor(index / layout.columns) * layout.rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + layout.rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = top + layout.rowHeight - element.clientHeight;
    if (focus) pendingFocus.current = index;
    setViewport(previous => ({ ...previous, scrollTop: element.scrollTop }));
  };
  const activate = index => { if (results[index]) { onActiveIdChange?.(results[index].id); reveal(index); onActivate?.(results[index]); } };
  const go = step => { if (results.length) activate(current < 0 ? (step > 0 ? 0 : results.length - 1) : (current + step + results.length) % results.length); };
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
      {SEARCH_FILTERS.map(([id, label]) => <button key={id} type="button" data-search-filter={id} aria-pressed={filter === id} onClick={() => onFilterChange(id)} className={`${button} flex items-center gap-1 px-2 py-1 text-xs ${filter === id ? 'bg-(--nav-selected-bg) text-(--nav-selected-fg)' : 'text-ink-2 hover:bg-hover'}`}>{label}<span className="tabular-nums opacity-70">{counts[id] ?? 0}</span></button>)}
    </div>
    {filter === 'comments' && <label className="mb-2 flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={includeResolved} onChange={event => onIncludeResolvedChange?.(event.target.checked)} />Include resolved</label>}
    {canGoBack && <button type="button" onClick={onGoBack} className={`${button} mb-2 flex items-center gap-1 self-start px-1 py-1 text-xs text-ink-2 hover:bg-hover`}><ArrowLeft size={13} aria-hidden />Back to previous view</button>}
    {(state !== 'ready' || status.message) && <div role="status" className="mb-2 text-xs text-ink-2">{status.message || (state === 'loading' ? 'Loading searchable content…' : state === 'error' ? 'Some content could not be loaded.' : 'Some content is not available to Search.')}{onRetry && (state === 'error' || state === 'partial') && <button type="button" onClick={onRetry} className={`${button} ml-2 underline`}>Retry</button>}</div>}
    {!results.length && <p className="py-4 text-sm text-ink-2">{searchEmptyMessage(state, query, filter)}</p>}
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" data-search-scroll onScroll={event => { positions.current.set(session, event.currentTarget.scrollTop); setViewport(previous => ({ ...previous, scrollTop: event.currentTarget.scrollTop })); }}>
      <ol aria-label="Search results" className="relative m-0 list-none p-0" style={{ height: layout.totalHeight }}>
        {results.slice(layout.start, layout.end).map((result, offset) => {
          const index = layout.start + offset, selected = result.id === activeId, snippet = result.snippet || {}, location = searchLocation(result.location);
          const refs = result.references || [], children = result.rabbitHoles || [];
          return <li key={result.id} aria-posinset={index + 1} aria-setsize={results.length} data-search-result={result.id} className="absolute overflow-hidden pb-2" style={{ top: Math.floor(index / layout.columns) * layout.rowHeight, left: `calc(${index % layout.columns} * (100% + 8px) / ${layout.columns})`, width: `calc((100% - ${(layout.columns - 1) * 8}px) / ${layout.columns})`, height: layout.rowHeight }}>
            <div className={`flex h-full flex-col rounded-lg border p-2 ${selected ? 'border-ink-3 bg-hover' : 'border-line'}`}>
              <button type="button" data-find-match={result.objectId} data-search-index={index} aria-current={selected ? 'true' : undefined} className={`${button} flex min-h-0 flex-1 flex-col items-stretch justify-start text-left`} onClick={() => activate(index)} onKeyDown={event => {
                const next = searchKeyIndex(event.key, index, results.length, layout.columns);
                if (next !== null) { event.preventDefault(); event.stopPropagation(); if (next >= 0) { onActiveIdChange?.(results[next].id); reveal(next, true); } }
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
              }}>
                {!rows && <Preview key={`${canvasKey}:${result.previewKey || result.id}`} result={result} getPreview={getPreview} canvasKey={canvasKey} />}
                <span className="mt-1 block shrink-0 truncate text-sm font-medium text-ink" title={result.title}>{result.title || 'Untitled object'}</span>
                <span className="block shrink-0 truncate text-[10px] leading-3 text-ink-3">{result.match?.kind === 'source' ? 'Source text ? ' : ''}{location || result.kind}{refs.length ? ` · ${refs.length} ${[...new Set(refs.map(ref => ref.kind || 'source'))].join('/')} reference${refs.length === 1 ? '' : 's'}` : ''}{result.occurrenceCount > 1 ? ` · ${result.occurrenceCount} matches` : ''}</span>
                <span className="line-clamp-2 shrink-0 break-words text-xs text-ink-2">{snippet.before}{snippet.hit && <mark className="rounded-sm bg-[#ddd6fe] text-ink">{snippet.hit}</mark>}{snippet.after}</span>
                {result.availability?.status !== 'ready' && result.availability?.message && <span className="block shrink-0 truncate text-[10px] leading-3 text-ink-3" title={result.availability.message}>{result.availability.message}</span>}
              </button>
              {(refs.length > 0 || children.length > 0) && <div className="mt-1 flex max-h-10 shrink-0 gap-1 overflow-x-auto border-t border-line pt-1">
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
