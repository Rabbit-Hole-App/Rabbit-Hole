// What the CAD viewer's controls outside the card read and drive (cad-controls brief, placement requirement: Interact and
// Fit view live in the selected card's toolbar and the expanded panel's toolbar, never over the model). One entry per viewer
// key (the card id, or `<id>:expanded`): { live, interacting } plus the viewer's { enter, exit, fit }. Pure module state.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

const views = new Map(), listeners = new Map();
const IDLE = Object.freeze({ live: false, interacting: false, api: null });
const notify = key => { for (const listener of listeners.get(key) || []) listener(); };
export function publishView(key, next) {
  const prior = views.get(key) || IDLE;
  if (prior.live === next.live && prior.interacting === next.interacting && prior.api === next.api) return;
  views.set(key, Object.freeze({ ...next })); notify(key);
}
export function dropView(key) { if (views.delete(key)) notify(key); }
export const viewOf = key => views.get(key) || IDLE;
const subscribe = key => listener => {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  return () => listeners.get(key)?.delete(listener);
};
export function useCadView(key) {
  const listen = useMemo(() => subscribe(key), [key]);
  return useSyncExternalStore(listen, () => viewOf(key));
}

// Show dimensions (owner decision 8): off by default, this browser's viewing preference per account and card, never on the
// board, the same in the card and its expanded view. Blocked storage keeps it for this page only.
export const dimensionsKey = (account, cardId) => `rh.cad-dimensions:${account || 'viewer'}:${cardId}`;
export function readDimensions(storage, key) { try { return storage?.getItem(key) === 'on'; } catch { return false; } }
export function writeDimensions(storage, key, on) { try { if (on) storage?.setItem(key, 'on'); else storage?.removeItem(key); } catch { /* this page only */ } }
const shown = new Map(), dimListeners = new Map();
const local = () => { try { return window.localStorage; } catch { return null; } };
export function useCadDimensions(account, cardId) {
  const key = dimensionsKey(account, cardId);
  const [on, setOn] = useState(() => (shown.has(key) ? shown.get(key) : readDimensions(local(), key)));
  useEffect(() => {
    if (!dimListeners.has(key)) dimListeners.set(key, new Set());
    const set = dimListeners.get(key); set.add(setOn); setOn(shown.has(key) ? shown.get(key) : readDimensions(local(), key));
    return () => set.delete(setOn);
  }, [key]);
  const change = value => { shown.set(key, value); writeDimensions(local(), key, value); for (const listener of dimListeners.get(key) || []) listener(value); };
  return [on, change];
}
