import { useSyncExternalStore } from 'react';

// Card size (owner, 2026-10-22): one setting for the card grid on Home, Library and Explore, remembered in this browser.
// It is html[data-card-size]; index.css turns it into the grid's minimum card width and, below Large, stacks the card's
// picture above its text. 3 (Large) is the unset look: one card per row, the picture beside the text.
export const CARD_SIZE_KEY = 'small.cardSize';
export const CARD_SIZES = ['Small', 'Medium small', 'Medium large', 'Large'];
export const DEFAULT_CARD_SIZE = CARD_SIZES.length - 1;

const store = () => { try { return window.localStorage; } catch { return null; } };

export function readCardSize(storage) {
  try {
    const raw = storage?.getItem(CARD_SIZE_KEY);
    const n = raw == null || raw === '' ? NaN : Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < CARD_SIZES.length) return n;
  } catch { /* blocked storage: the default */ }
  return DEFAULT_CARD_SIZE;
}

let size = readCardSize(typeof window === 'undefined' ? null : store());
const listeners = new Set();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.dataset.cardSize = String(size); };
apply();

export function setCardSize(next, storage = typeof window === 'undefined' ? null : store()) {
  size = next;
  try { storage?.setItem(CARD_SIZE_KEY, String(next)); } catch { /* the size still applies for this visit */ }
  apply();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useCardSize = () => useSyncExternalStore(subscribe, () => size);
