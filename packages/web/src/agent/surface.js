import { useSyncExternalStore } from 'react';

// Where the user is (T02 §6). main.jsx Root sets the route baseline, the page refines it,
// and Shell publishes who is looking. Every command ctx is built from it (commands.js ctxOf).
const PAGE = { place: 'home', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} };
let surface = { org: '', email: '', orgName: '', catalog: [], ...PAGE };
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export const getSurface = () => surface;

// A new page starts clean, so one page's selection and handlers never reach the next.
// Identity belongs to the session, not the page: it stays until Shell patches it again.
export function setSurface(page) {
  const { org, email, orgName, catalog } = surface;
  surface = { org, email, orgName, catalog, ...PAGE, ...page };
  emit();
}

export function patchSurface(partial) {
  surface = { ...surface, ...partial };
  emit();
}

// The card a click selected on Home, Library or Explore (owner, 2026-10-09: "when i click on a card in Home/Explore, I do
// not see the pill in the chatcomposer of the selected Projects/Canvas"). It is the dock composer's pill and its context:
// the resource a project's own page publishes (scope.js scopeOf), so a question goes where that resource's questions go.
// `picked` marks it as the pill's, not a page's own. One at a time; a new page starts without one (setSurface).
// `resource`: { kind: 'canvas' | 'project' | 'shared' (a published canvas, by its link token), slug, title, type }.
export const pickCard = (resource) => patchSurface({ resource, selected: null, picked: true });
export const clearPick = () => { if (surface.picked) patchSurface({ resource: null, selected: null, picked: false }); };
export const pickedKey = (s) => (s.picked && s.resource ? `${s.resource.kind}:${s.resource.slug}` : null);
// A library row's pick: a canvas or a project of the viewer's (a review fixture opens nothing, so it is never picked).
export const appPick = (app, title) => (['canvas', 'repository'].includes(app.kind) && !app.fixture
  ? { kind: app.kind === 'repository' ? 'project' : 'canvas', slug: app.name, title, type: app.kind } : null);

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const useSurface = () => useSyncExternalStore(subscribe, getSurface);
