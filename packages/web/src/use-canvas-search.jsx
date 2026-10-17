import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createSearchIndex, updateSearchIndex, querySearchIndex } from './canvas-search-index.js';
import { createSearchContentRegistry } from './canvas-search-content.js';
import { readSearchComments } from './canvas-search-comments.js';
import { commentsApi } from './comments/comments-api.js';
import { cachedAsset } from './learn-asset-cache.js';

const EMPTY = { revision: 0, board: {} };
const EMPTY_COMMENTS = [];
const initial = () => ({ query: '', filter: 'all', includeResolved: false, activeId: null, back: null });
// Session-only preferences; no result/source content is retained between canvases.
const sessions = new Map();
export function useCanvasSearch({ scopeKey, canvasApi, epoch, shown, commentsBase, links, children, onComment, revealDocument }) {
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
  const index = useMemo(() => {
    const next = updateSearchIndex(previousIndex.current, { scopeKey, revision: snapshot.revision, board: snapshot.board, references, children, comments: commentCurrent.comments, loadedContent });
    previousIndex.current = next; return next;
  }, [scopeKey, snapshot, references, children, commentCurrent.comments, loadedContent]);
  // Query only when the query/index/filter changes; never display a prior query's results under the new input.
  const query = current.query;
  const found = useMemo(() => querySearchIndex(index, { query, filter: current.filter, includeResolved: current.includeResolved }), [index, query, current.filter, current.includeResolved]);
  const [notice, setNotice] = useState(null);
  const activation = useRef({ scopeKey, epoch, generation: 0 });
  if (activation.current.scopeKey !== scopeKey || activation.current.epoch !== epoch) activation.current = { scopeKey, epoch, generation: activation.current.generation + 1 };
  useEffect(() => () => { activation.current.generation++; }, [scopeKey, epoch]);
  const activate = async result => {
    if (!index.entries.has(result.id)) { setNotice({ scopeKey, deletedId: result.id, message: 'This result is no longer on the canvas.' }); return; }
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
  const getPreview = useCallback(async result => {
    const entry = index.entries.get(result.id);
    if (!entry || entry.availability?.status === 'unavailable') return null;
    // Cached posters only. Never mount a renderer or fetch private source bytes for a tile.
    return cachedAsset(`poster:${result.objectId}`);
  }, [index]);
  const status = commentCurrent.state === 'loading' || links?.status === 'loading' ? { state: 'loading', message: 'Searching available content. Comments or references are still loading.' }
    : commentCurrent.state === 'error' ? { state: 'error', error: commentCurrent.error }
    : commentCurrent.state === 'partial' || links?.status === 'error' ? { state: 'partial', message: 'Some comments or references are unavailable. Retry to refresh them.' }
    : found.availability.status !== 'ready' ? { state: found.availability.status, message: 'Some sources are only partially searchable. Result badges describe the available content.' }
    : { state: 'ready' };
  return { registry, scopeKey, panel: { canvasKey: scopeKey, query: current.query, onQueryChange: query => patch({ query, activeId: null }), filter: current.filter, onFilterChange: filter => patch({ filter, activeId: null }), includeResolved: current.includeResolved, onIncludeResolvedChange: includeResolved => patch({ includeResolved }), results: found.results, counts: found.counts, status: notice?.scopeKey === scopeKey ? { ...status, ...notice } : status, onRetry: () => { setRetry(value => value + 1); links?.refresh?.(); for (const entry of loadedContent.values()) entry.retry?.(); }, activeId: current.activeId, onActiveIdChange: activeId => patch({ activeId }), onActivate: activate, canGoBack: !!current.back, onGoBack: goBack, getPreview } };
}
