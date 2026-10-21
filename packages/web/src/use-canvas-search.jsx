import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createSearchIndex, updateSearchIndex, querySearchIndex } from './canvas-search-index.js';
import { createSearchContentRegistry } from './canvas-search-content.js';
import { readSearchComments } from './canvas-search-comments.js';
import { commentsApi } from './comments/comments-api.js';
import { cachedAsset } from './learn-asset-cache.js';
import { loadAsset } from './learn-board-assets.js';
import { apiFetch } from './api.js';
import { cadReadUrl } from './CadCard.jsx';
import { ownThumbnail } from './card-thumbnail.js';
import { linkCardFor } from './search-drag.js';

const EMPTY = { revision: 0, board: {} };
const EMPTY_COMMENTS = [];
const initial = () => ({ query: '', filter: 'all', includeResolved: false, activeId: null, back: null, scrollPositions: new Map() });
// Session-only preferences; no result/source content is retained between canvases.
const sessions = new Map();
// linkResults (LearnPage only, where the Links tab was): the board's links and backlinks are Search results under Links;
// onOpenLink(href) opens a canvas (the page's go, which saves first). A shared view keeps links to its cards' chips.
// canInsert: this viewer may add cards here (a link result's Add to canvas, UI-13); a view-only page leaves it off.
export function useCanvasSearch({ scopeKey, canvasApi, epoch, shown, commentsBase, links, linkResults = false, onOpenLink, children, onComment, revealDocument, canInsert = false }) {
  const [session, setSession] = useState(() => ({ scopeKey, ...sessions.get(scopeKey) || initial() }));
  const current = session.scopeKey === scopeKey ? session : { scopeKey, ...sessions.get(scopeKey) || initial() };
  const patch = useCallback(change => setSession(previous => {
    const next = { ...(previous.scopeKey === scopeKey ? previous : { scopeKey, ...sessions.get(scopeKey) || initial() }), ...change };
    const { back: _back, ...preferences } = next;
    sessions.set(scopeKey, preferences); return next;
  }), [scopeKey]);
  useEffect(() => { patch({ back: null }); }, [scopeKey, epoch, patch]);
  const registry = useMemo(() => createSearchContentRegistry(scopeKey), [scopeKey]);
  const loadedContent = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const [snapshotState, setSnapshot] = useState({ scopeKey, value: EMPTY });
  const snapshot = snapshotState.scopeKey === scopeKey ? snapshotState.value : EMPTY;
  useEffect(() => {
    let frame, stop, disposed = false;
    const bind = () => {
      const api = canvasApi.current;
      if (!api?.subscribeSearch) { frame = requestAnimationFrame(bind); return; }
      const update = () => { if (!disposed) setSnapshot(previous => {
        const value = api.getSearchSnapshot();
        return previous.scopeKey === scopeKey && previous.value === value ? previous : { scopeKey, value };
      }); };
      stop = api.subscribeSearch(update); update();
    };
    bind();
    return () => { disposed = true; cancelAnimationFrame(frame); stop?.(); };
  }, [canvasApi, scopeKey, epoch]);
  const [commentState, setCommentState] = useState({ scopeKey, base: commentsBase, comments: EMPTY_COMMENTS, state: commentsBase ? 'loading' : 'ready' });
  const [retry, setRetry] = useState(0);
  const commentCurrent = !commentsBase ? { comments: EMPTY_COMMENTS, state: 'ready' } : commentState.scopeKey === scopeKey && commentState.base === commentsBase ? commentState : { comments: EMPTY_COMMENTS, state: 'loading' };
  useEffect(() => {
    if (!shown || !commentsBase) return;
    const control = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || control.signal.aborted) return;
      pending = true;
      setCommentState(previous => ({ scopeKey, base: commentsBase, comments: previous.scopeKey === scopeKey && previous.base === commentsBase ? previous.comments : EMPTY_COMMENTS, state: 'loading' }));
      try {
        const result = await readSearchComments(commentsApi(commentsBase), { signal: control.signal, onProgress: value => {
          if (!control.signal.aborted) setCommentState({ scopeKey, base: commentsBase, ...value, state: 'loading' });
        } });
        if (!control.signal.aborted) setCommentState({ scopeKey, base: commentsBase, ...result, state: result.errors.length ? 'partial' : 'ready' });
      } catch (error) { if (!control.signal.aborted) setCommentState({ scopeKey, base: commentsBase, comments: EMPTY_COMMENTS, state: 'error', error: 'Comments could not be loaded. Retry to search them.' }); }
      finally { pending = false; }
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('rh:comments-changed', refresh);
    return () => { control.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('rh:comments-changed', refresh); };
  }, [scopeKey, commentsBase, shown, retry]);
  const referenceCache = useRef(new Map());
  const references = useMemo(() => {
    const result = new Map();
    for (const object of [...snapshot.board.blocks || [], ...snapshot.board.items || [], ...snapshot.board.exchanges || []]) {
      const refs = object.refs || [];
      if (refs.length) {
        const resolvedRefs = refs.map(ref => {
        const resolved = links?.resolve?.(ref.target);
        return resolved && !resolved.unavailable ? { ...ref, ...resolved, kind: 'canvas' } : { id: ref.id, target: ref.target, kind: 'canvas', unavailable: true };
        });
        const signature = JSON.stringify(resolvedRefs), previous = referenceCache.current.get(object.id);
        result.set(object.id, previous?.signature === signature ? previous.refs : resolvedRefs);
        referenceCache.current.set(object.id, { signature, refs: result.get(object.id) });
      }
    }
    for (const id of referenceCache.current.keys()) if (!result.has(id)) referenceCache.current.delete(id);
    return result;
  }, [snapshot, links?.resolve]);
  const previousIndex = useRef(createSearchIndex());
  const linkFrom = linkResults && links?.status === 'ready' ? links.from : null, linkTo = linkFrom && links.to;
  const index = useMemo(() => {
    const next = updateSearchIndex(previousIndex.current, { scopeKey, revision: snapshot.revision, board: snapshot.board, references, children, comments: commentCurrent.comments, loadedContent, links: linkFrom && { from: linkFrom, to: linkTo } });
    previousIndex.current = next; return next;
  }, [scopeKey, snapshot, references, children, commentCurrent.comments, loadedContent, linkFrom, linkTo]);
  // Query only when the query/index/filter changes; never display a prior query's results under the new input.
  const query = current.query;
  const found = useMemo(() => querySearchIndex(index, { query, filter: current.filter, includeResolved: current.includeResolved }), [index, query, current.filter, current.includeResolved]);
  const [notice, setNotice] = useState(null);
  const activation = useRef({ scopeKey, epoch, generation: 0 });
  if (activation.current.scopeKey !== scopeKey || activation.current.epoch !== epoch) activation.current = { scopeKey, epoch, generation: activation.current.generation + 1 };
  useEffect(() => () => { activation.current.generation++; }, [scopeKey, epoch]);
  const activate = async result => {
    if (!index.entries.has(result.id)) { setNotice({ scopeKey, deletedId: result.id, message: 'This result is no longer on the canvas.' }); return; }
    if (result.kind === 'link') { if (result.link.href) onOpenLink?.(result.link.href); else setNotice({ scopeKey, message: 'This canvas is unavailable.' }); return; }
    const generation = ++activation.current.generation;
    const alive = () => activation.current.scopeKey === scopeKey && activation.current.generation === generation;
    const api = canvasApi.current;
    if (!current.back) patch({ back: api?.captureNavigation?.() || null });
    patch({ activeId: result.id });
    if (result.kind === 'document') revealDocument?.();
    let outcome;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (!alive()) return;
      outcome = await canvasApi.current?.focusSearchTarget?.(result.target);
      if (!alive()) return;
      if (!['document-hidden', 'document-loading'].includes(outcome?.reason)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!alive()) return;
    if (result.kind === 'comment') onComment?.(result);
    setNotice(!outcome?.found && result.kind !== 'comment' ? { scopeKey, message: outcome?.reason === 'missing-target' ? 'This result is no longer on the canvas.' : 'The matching content is not currently visible in this object.' } : null);
  };
  const goBack = () => { activation.current.generation++; if (current.back) canvasApi.current?.restoreNavigation?.(current.back); patch({ back: null }); setNotice(null); };
  // A picture result's thumbnail (UI-12, canvas-search-index.js searchPreviewOf): the picture its card already shows (an
  // image's own src or asset, a video's YouTube still), a CAD card's stored thumbnail read as the card reads it, a linked
  // canvas's own card thumbnail (the server serves only its owner), or a cached poster. Never a renderer, a model or
  // private source bytes; anything that fails leaves the row's compact fallback.
  const getPreview = useCallback(async result => {
    const entry = index.entries.get(result.id);
    if (!entry || entry.availability?.status === 'unavailable') return null;
    const preview = entry.preview || {};
    if (preview.src) return preview.src;
    if (preview.asset) return loadAsset(preview.asset);
    if (preview.path) { const response = await apiFetch(cadReadUrl(preview.path)); return response.ok ? response.blob() : null; }
    if (preview.canvas) return ownThumbnail(preview.canvas);
    return result.objectId ? cachedAsset(`poster:${preview.poster || result.objectId}`) : null;
  }, [index]);
  // Add to canvas on a link result (UI-13, the keyboard and touch way to place it): the canvas's link card where the learner
  // looks, as Link to canvas... adds one; a link card already here is shown instead, never added twice.
  const addToCanvas = result => {
    const api = canvasApi.current, existing = linkCardFor(api?.blocks?.(), result.target?.id);
    if (existing) { api.focusBlock(existing.id); setNotice({ scopeKey, message: 'A link card to this canvas is already here.' }); return; }
    setNotice(api?.insertRefCard?.(result.target?.id) ? null : { scopeKey, message: 'This canvas cannot take a link card.' });
  };
  const status = commentCurrent.state === 'loading' || links?.status === 'loading' ? { state: 'loading', message: 'Searching available content. Comments or references are still loading.' }
    : commentCurrent.state === 'error' ? { state: 'error', error: commentCurrent.error }
    : commentCurrent.state === 'partial' || links?.status === 'error' ? { state: 'partial', message: 'Some comments or references are unavailable. Retry to refresh them.' }
    : linkResults && links?.status === 'none' && current.filter === 'links' ? { state: 'ready', message: 'Links appear once this canvas is saved.' }
    : found.availability.status !== 'ready' ? { state: found.availability.status, message: 'Some sources are only partially searchable. Result badges describe the available content.' }
    : { state: 'ready' };
  return { registry, scopeKey, panel: { canvasKey: scopeKey, showLinks: linkResults, scrollPositions: current.scrollPositions, query: current.query, onQueryChange: query => patch({ query, activeId: null }), filter: current.filter, onFilterChange: filter => patch({ filter, activeId: null }), includeResolved: current.includeResolved, onIncludeResolvedChange: includeResolved => patch({ includeResolved }), results: found.results, counts: found.counts, status: notice?.scopeKey === scopeKey ? { ...status, ...notice } : status, onRetry: () => { setRetry(value => value + 1); links?.refresh?.(); for (const entry of loadedContent.values()) entry.retry?.(); }, activeId: current.activeId, onActiveIdChange: activeId => patch({ activeId }), onActivate: activate, canGoBack: !!current.back, onGoBack: goBack, getPreview,
    onAddToCanvas: canInsert ? addToCanvas : null, onDropNotice: message => setNotice({ scopeKey, message }) } };
}
