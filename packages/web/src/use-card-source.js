import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { cardGraph, cardLines, cardRequest, failureStatus } from './card-source.js';

// One read per file or snapshot however many cards show it; a failed read is forgotten, so Retry asks again.
const reads = new Map();
const once = (key, load) => {
  if (!reads.has(key)) reads.set(key, load().catch(error => { reads.delete(key); throw error; }));
  return reads.get(key);
};
const load = (request, assetUrl) => {
  // By repository and commit (control plane /api/repositories/card-source): the same read for the owner, a share viewer and a fork.
  const at = `repo=${encodeURIComponent(request.repo)}&commit=${encodeURIComponent(request.commit)}`;
  if (request.kind === 'file') return once(request.key, () => api(`/api/repositories/card-source?${at}&path=${encodeURIComponent(request.path)}`));
  if (request.kind === 'graph') return once(request.key, () => api(`/api/repositories/card-source?${at}`));
  // An upload's text is its canvas asset; the caller knows the board, so it passes the asset's URL.
  return once(`${request.key}:${assetUrl}`, async () => {
    const response = await fetch(assetUrl, { credentials: 'same-origin' });
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return { content: await response.text() };
  });
};

// useCardSource(block, { assetUrl }) -> { status: 'loading' | 'ready' | 'unavailable' | 'failed', text, lines, totalLines,
// graph, retry }. Code cards get text and numbered lines (their range, else the file); graph cards get their graph (the
// subgraph for nodeIds, else the whole). A redacted card, or one without a readable source, is unavailable at once.
export function useCardSource(block, { assetUrl = null } = {}) {
  const request = cardRequest(block);
  const usable = request && (request.kind !== 'upload' || assetUrl);
  const key = usable ? `${request.key}:${assetUrl || ''}` : null;
  const [state, setState] = useState({ status: usable ? 'loading' : 'unavailable' });
  const [attempt, setAttempt] = useState(0);
  const start = block?.source?.start ?? null, end = block?.source?.end ?? null, nodes = (block?.nodeIds || []).join('\n');
  useEffect(() => {
    if (!usable) { setState({ status: 'unavailable' }); return undefined; }
    let active = true;
    setState({ status: 'loading' });
    load(request, assetUrl).then(data => {
      if (!active) return;
      if (request.kind === 'graph') setState({ status: 'ready', graph: cardGraph(data.graph, nodes ? nodes.split('\n') : []) });
      else setState({ status: 'ready', ...cardLines(data.content, start, end) });
    }, error => { if (active) setState({ status: failureStatus(error) }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key names the request; start, end and nodes shape it.
  }, [key, start, end, nodes, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, retry };
}
