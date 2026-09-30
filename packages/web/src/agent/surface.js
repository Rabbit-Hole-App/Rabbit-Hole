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

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const useSurface = () => useSyncExternalStore(subscribe, getSurface);
