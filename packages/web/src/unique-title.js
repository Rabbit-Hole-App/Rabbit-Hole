// Unique card names on one canvas (owner 2026-11-07: "no cards have the same title", so Add a link can pick a card by its title).
// Pure: no React, no DOM. A name is compared as it is SHOWN: trimmed, whitespace collapsed, case-insensitive. A colliding name steps
// to "Name (2)", "(3)"...; a trailing " (N)" on the wanted name is dropped first, so a copy of "Gradients (2)" becomes "Gradients (3)".
// A card with no name (only a type placeholder such as "Untitled note") is not compared and never renamed: placeholders are not names.
import { TITLE_MAX, namedTitleOf } from './card-rename.js';

const HEADING_MAX = 200; // card-rename.js: sections are document content with their own cap
export const nameKey = name => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// The wanted name, or the same name stepped to the next free " (N)" against `names` (any iterable of the names already taken). The BASE is trimmed
// so base + suffix fits `max`, never the suffix.
export function uniqueTitle(names, desired, { max = Infinity } = {}) {
  const wanted = String(desired ?? '').replace(/\s+/g, ' ').trim();
  const taken = new Set([...names].map(nameKey));
  if (!wanted || !taken.has(nameKey(wanted))) return wanted;
  const base = wanted.replace(/ \(\d+\)$/, '') || wanted;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`, room = Math.max(1, max - suffix.length);
    const next = `${base.slice(0, room).trimEnd()}${suffix}`;
    if (!taken.has(nameKey(next))) return next;
  }
}

// Which names a block competes with: a heading (a Table of contents section) only with other headings; every other card with the other cards.
const scopeOf = block => (block?.type === 'heading' ? 'heading' : 'card');
// The name a block shows, '' when it has none. A heading's name is its whole text (not cut: a section is not a card title).
const nameOf = block => {
  if (!block || typeof block.type !== 'string') return '';
  if (block.type === 'heading') return String(block.text ?? '').replace(/\s+/g, ' ').trim();
  return namedTitleOf(block);
};

// True when another card (not `selfId`) of the same scope already shows `name`: what a rename checks before it saves.
export function titleTaken(blocks, name, selfId, scope = 'card') {
  const key = nameKey(name);
  return !!key && (blocks || []).some(block => block?.id !== selfId && scopeOf(block) === scope && nameKey(nameOf(block)) === key);
}

// The board with every duplicate name stepped to "(N)", or the SAME array when there is none (so a state update that changes nothing re-renders
// nothing). `known`: ids already on the board before this change; a card that is new keeps the suffix, not the one that was there first. With no
// `known` (a board as it loads) the later duplicate in board order is the one that steps, so the result is the same on every load. The disambiguated
// name goes where it does least harm: a heading's own text; for every other card its customTitle, the display name that sits beside the card's own
// title/label/question, so a model's or a file's own text is never overwritten.
export function uniquifyBlocks(blocks, known = null) {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;
  const order = blocks.map((_, index) => index);
  if (known) order.sort((a, b) => (known.has(blocks[a]?.id) ? 0 : 1) - (known.has(blocks[b]?.id) ? 0 : 1) || a - b);
  const names = { card: [], heading: [] }, keys = { card: new Set(), heading: new Set() };
  const patched = new Map();
  for (const index of order) {
    const block = blocks[index], name = nameOf(block);
    if (!name) continue;
    const scope = scopeOf(block), key = nameKey(name);
    if (!keys[scope].has(key)) { keys[scope].add(key); names[scope].push(name); continue; }
    const next = uniqueTitle(names[scope], name, { max: scope === 'heading' ? HEADING_MAX : TITLE_MAX });
    keys[scope].add(nameKey(next)); names[scope].push(next);
    patched.set(index, scope === 'heading' ? { ...block, text: next } : { ...block, customTitle: next });
  }
  return patched.size ? blocks.map((block, index) => patched.get(index) || block) : blocks;
}

// What the picker shows beside a title so equal or empty names stay apart (the Add a link card picker): the card's place in board order.
export const positionHint = (blocks, id) => { const at = (blocks || []).findIndex(block => block?.id === id); return at < 0 ? '' : `#${at + 1}`; };
