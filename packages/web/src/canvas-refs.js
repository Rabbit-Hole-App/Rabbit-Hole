// Canvas references (C:/s/spec/references-plan.md): the picker's search and a canvas's links and backlinks, read from the
// server, which applies every permission (control-plane/src/canvas-refs.js). Titles and paths are resolved per viewer;
// a target this viewer cannot read comes back { unavailable: true } with no title.
import { api } from './api.js';

// { canvases: [{ id, title, path, href }], more }: the viewer's own and member canvases matching q, never `exclude`.
export const pickCanvases = (q, exclude, signal) =>
  api(`/api/learn/canvas-picker?${new URLSearchParams({ q: q || '', exclude: exclude || '', limit: '20' })}`, { signal });

// { board, from: [{ target, title, path, href, unavailable, refs }], to: [{ source, title, path, href, refs }] }.
export const loadLinks = (boardId, signal) => api(`/api/learn/links/${encodeURIComponent(boardId)}`, { signal });

// A canvas URL that reveals one card on load (LearnPage and MemberBoardPage read `card`).
export function refHref(href, objectId) {
  const url = new URL(href, 'https://x.invalid');
  url.searchParams.set('card', objectId);
  return `${url.pathname}${url.search}${url.hash}`;
}
