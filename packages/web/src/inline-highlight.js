// Owner 2026-11-09: Ctrl+K over highlighted words in a card. The words are the request's subject (a text range of the card), shown as a short chip, marked on the card
// while the window is open, with the window beside them. Pure helpers (no React); the editor and the canvas call them.
import { cardText } from './canvas-semantics.js';

// The chip's text: the first 2-3 words, at most `max` characters, the ellipsis inside the chip (owner: [ maximum likelihod.., x ]).
export function firstWords(text, { words = 3, max = 24 } = {}) {
  const all = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!all.length) return '';
  let shown = all.slice(0, words).join(' ');
  const cut = all.length > words || shown.length > max;
  if (shown.length > max) shown = shown.slice(0, max - 1).trimEnd();
  return cut ? `${shown}…` : shown;
}

// Where a normalized (single-spaced) passage sits in the card's own text: [from, to) in the card's characters, or null. The selection API gives the words as the
// reader sees them, the card's text keeps its line breaks, so both are compared single-spaced and mapped back.
export function locate(whole, passage) {
  const want = String(passage || '').replace(/\s+/g, ' ').trim();
  if (!want) return null;
  let flat = '';
  const at = [];
  let space = true; // collapse runs of white space, drop leading
  for (let i = 0; i < whole.length; i += 1) {
    const blank = /\s/.test(whole[i]);
    if (blank && space) continue;
    flat += blank ? ' ' : whole[i];
    at.push(i);
    space = blank;
  }
  const found = flat.indexOf(want);
  if (found < 0) return null;
  return { from: at[found], to: at[found + want.length - 1] + 1 };
}

// The highlighted words of the card under the selection: { id, range, highlight } or null. highlight: the live Range (kept so the words stay marked after focus moves
// into the Ctrl+K field and the native selection collapses), its client rects, the first line's top relative to the card in world units (alignY: the new card starts level
// with the highlighted line), and the words.
export function pickedHighlight(root, blocks, zoom = 1, selection = typeof window !== 'undefined' ? window.getSelection?.() : null) {
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer, host = node.nodeType === 1 ? node : node.parentElement;
  const card = host?.closest?.('[data-block-id]');
  if (!card || !root.contains(card)) return null;
  const id = card.getAttribute('data-block-id'), block = (blocks || []).find(entry => entry.id === id);
  if (!block) return null;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const spot = locate(cardText(block), text);
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(({ left, top, width, height }) => ({ left, top, width, height }));
  if (!rects.length) return null;
  const top = Math.min(...rects.map(rect => rect.top)), cardTop = card.getBoundingClientRect().top;
  return { id, range: spot ? { id, from: spot.from, to: spot.to, text: cardText(block).slice(spot.from, spot.to) } : null,
    highlight: { id, text, rects, live: range.cloneRange(), alignY: Math.max(0, Math.round((top - cardTop) / (zoom || 1))) } };
}

// What /explain from Ctrl+K sends as the request's context (owner 2026-11-09): the highlighted words first, then the card they come from (its title and text), inside the one 8000-character
// limit every command's context has. Without a card (every other caller) it is the target's words, as before.
export function explainContext(target) {
  const words = String(target?.text ?? '').trim(), card = target?.card;
  if (!card?.body) return words ? words.slice(0, 8000) : null;
  return `Highlighted text:\n${words}\n\nThe card it comes from, "${card.title}":\n${card.body}`.slice(0, 8000);
}

// A scrim over `size` that leaves the given rects (plus `pad`) undimmed: one even-odd path (the outer box, then one hole per rect).
export function scrimPath(size, rects, pad = 3) {
  const holes = rects.map(r => `M${Math.round(r.left - pad)} ${Math.round(r.top - pad)}h${Math.round(r.width + pad * 2)}v${Math.round(r.height + pad * 2)}h${-Math.round(r.width + pad * 2)}z`).join('');
  return `path(evenodd, "M0 0H${Math.round(size.w)}V${Math.round(size.h)}H0z${holes}")`;
}
