import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { loadAsset } from './learn-board-assets.js';
import { cardGraph, cardLines, cardRequest, currentCardSource, failureStatus, rangeLines } from './card-source.js';

// The link a card is read through (follow-up R3 item 5): SharedBoardPage provides { token, viewer, version } for a share
// link or an Explore publication, so its repository cards read by the link and the card's id - signed out too, never
// sent to sign in - and its uploads by the link's own asset route. Elsewhere null: the owner's routes.
export const CardSourceScope = createContext(null);

// One read per file or snapshot however many cards show it; a failed read is forgotten, so Retry asks again. Keyed by the
// access scope as well as the source: a link's read (its token, who is viewing, the board version it was opened at) is
// never another scope's, so a signed-in or owner's read is never reused by a link viewer, nor one link's by another.
const reads = new Map();
const once = (key, load) => {
  if (!reads.has(key)) reads.set(key, load().catch(error => { reads.delete(key); throw error; }));
  return reads.get(key);
};
// An upload's text is its canvas asset: this browser's cache, then the board's server copy (learn-board-assets.js loadAsset,
// the path every dropped file's card uses). A missing asset is unavailable, like a 404.
export async function uploadText(assetKey, read = loadAsset) {
  const value = await read(assetKey);
  if (value == null) throw Object.assign(new Error('asset missing'), { status: 404 });
  return { content: typeof value === 'string' ? value : await value.text() };
}
const scopeKey = scope => (scope?.token ? `link:${scope.token}:${scope.viewer || ''}:${scope.version ?? ''}` : 'own');
// A link's reads: plain fetches, so a refusal is the card's own state and never the sign-in redirect api() makes on a 401.
// A repository card by the link and its id (learn-boards.js sharedCard): the server reads the card it saved, not this one.
// An upload card by the link's own asset route, the board's server copy (no owner's browser cache), so a 404 is unavailable
// and a dropped connection or a 5xx is a failure worth a Retry.
const linkRead = async (token, block) => {
  const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/cards/${encodeURIComponent(block.id)}/source`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Object.assign(new Error(data?.error || 'Card source unavailable'), { status: response.status });
  return data;
};
const linkUpload = async (token, assetKey) => {
  const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/assets/${encodeURIComponent(assetKey)}`);
  if (!response.ok) throw Object.assign(new Error('asset unavailable'), { status: response.status });
  return { content: await response.text() };
};
// What a link's answer depends on besides the link: the card's source, its stored range for code, its node set for a subgraph
// (as the server cuts them, repository-cards.js sharedCardSource). Cards with the same source share one read, by the first
// card's id: each read costs the server a snapshot parse and counts against the link's budget (security review finding 1).
const linkSource = (request, block) => (request.kind === 'file' ? `${request.key}:${block.source.start ?? ''}-${block.source.end ?? ''}`
  : request.kind === 'graph' ? `${request.key}|${block.scope === 'subgraph' && Array.isArray(block.nodeIds) ? `sub:${[...block.nodeIds].sort().join('\n')}` : 'whole'}` : request.key);
// The read a card needs, shared by every card of the same scope and source. Exported for its unit test.
export const readCardSource = (request, block, scope) => {
  const key = `${scopeKey(scope)}|${request.key}`;
  if (scope?.token) return request.kind === 'upload' ? once(key, () => linkUpload(scope.token, block.source.assetKey)) : once(`${scopeKey(scope)}|${linkSource(request, block)}`, () => linkRead(scope.token, block));
  // By repository and commit (control plane /api/repositories/card-source): the same read for the owner, a member and a fork.
  const at = `repo=${encodeURIComponent(request.repo)}&commit=${encodeURIComponent(request.commit)}`;
  if (request.kind === 'file') return once(key, () => api(`/api/repositories/card-source?${at}&path=${encodeURIComponent(request.path)}`));
  if (request.kind === 'graph') return once(key, () => api(`/api/repositories/card-source?${at}`));
  return once(key, () => uploadText(block.source.assetKey));
};

// useCardSource(block) -> { status: 'loading' | 'ready' | 'unavailable' | 'failed', text, lines, totalLines, graph, skipped, retry }.
// Code cards get text and numbered lines (their range, else the file); graph cards get their graph (the subgraph for
// nodeIds, else the whole). A redacted card, or one without a readable source, is unavailable at once.
export function useCardSource(block) {
  const scope = useContext(CardSourceScope);
  const request = cardRequest(block);
  const usable = !!request;
  const key = usable ? `${scopeKey(scope)}|${request.key}|${block.id}` : null;
  const [state, setState] = useState({ status: usable ? 'loading' : 'unavailable' });
  const [attempt, setAttempt] = useState(0);
  const start = block?.source?.start ?? null, end = block?.source?.end ?? null, nodes = (block?.nodeIds || []).join('\n');
  const identity = JSON.stringify([key, start, end, nodes]);
  useEffect(() => {
    if (!usable) { setState({ identity, status: 'unavailable' }); return undefined; }
    let active = true;
    setState({ identity, status: 'loading' });
    readCardSource(request, block, scope).then(data => {
      if (!active) return;
      if (request.kind === 'graph') setState({ identity, status: 'ready', graph: cardGraph(data.graph, nodes ? nodes.split('\n') : []), skipped: data.skipped || [] });
      // A link's read is already the card's stored range, numbered from its first line; any other read is the whole file.
      else if (Number.isInteger(data.start)) setState({ identity, status: 'ready', ...rangeLines(data.content, data.start) });
      else setState({ identity, status: 'ready', ...cardLines(data.content, start, end) });
    }, error => { if (active) setState({ identity, status: failureStatus(error) }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key names the request; start, end and nodes shape it.
  }, [key, start, end, nodes, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...currentCardSource(state, identity, usable), retry };
}
