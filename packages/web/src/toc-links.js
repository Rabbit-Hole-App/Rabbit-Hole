// Links from a card to a Table of contents section (owner 2026-11-07, "Add a link" > Link to TOC). Pure, so the unit tests read it.
// The link lives on the CARD, as block.tocLinks = [entryId, ...] (an outline entry id: outlineFrom/tocOf), and is the one source of truth:
// the Table of contents derives its side (linkedCards) from the cards, so the two directions can never disagree and one edit writes once.
// It is NOT block.refs: refs hold canvas targets and the server indexes them as canvas references (control-plane canvas-refs.js boardRefs),
// which would reject a section id. Only manual outline entries are linkable: a roadmap row ('roadmap:<stepId>') belongs to the server.
import { outlineTree } from './learn-outline-model.js';

export const MAX_TOC_LINKS = 20;
// Blocks that cannot hold a link: a standalone canvas reference card (it IS a link) and a heading (it is the contents' own content).
export const holdsTocLink = block => !!block && block.type !== 'canvas-ref' && block.type !== 'heading';

// The card's tocLinks with one more entry, or why not: { tocLinks } | { reason: 'unsupported' | 'exists' | 'limit' }.
export function withTocLink(block, entryId) {
  if (!holdsTocLink(block) || typeof entryId !== 'string' || !entryId || entryId.startsWith('roadmap:')) return { reason: 'unsupported' };
  const held = block.tocLinks || [];
  if (held.includes(entryId)) return { reason: 'exists' };
  if (held.length >= MAX_TOC_LINKS) return { reason: 'limit' };
  return { tocLinks: [...held, entryId] };
}
// The card's tocLinks without entryId, or null when it holds no such link (nothing to undo).
export const withoutTocLink = (block, entryId) => {
  const kept = (block?.tocLinks || []).filter(id => id !== entryId);
  return block?.tocLinks && kept.length < block.tocLinks.length ? kept : null;
};
// The card as it would be saved with only the links that still name a section of the contents (an entry removed from the contents leaves its id behind
// on the cards: removing an entry never writes the canvas's blocks, so an Undo of the removal brings the link back). Applied when a link is WRITTEN, so a
// card never stops at the limit because of links to sections that no longer exist. outline: outlineFrom entries.
export function withLiveLinks(block, outline) {
  const live = new Set((outline || []).map(entry => entry.id)), held = block?.tocLinks;
  if (!held || held.every(id => live.has(id))) return block;
  return { ...block, tocLinks: held.filter(id => live.has(id)) };
}
// The cards linked to an entry, [{ id, title }] in canvas order. rows: [[cardId, title, entryIds]] (what the canvas reports to the page).
export const linkedCards = (rows, entryId) => (rows || []).filter(([, , ids]) => ids.includes(entryId)).map(([id, title]) => ({ id, title }));
// A card's links that still name an entry of the contents, with the entry's title: [{ id, title }]. A link to a removed entry shows nothing.
export function resolvedLinks(block, outline) {
  const titles = new Map((outline || []).map(entry => [entry.id, entry.label]));
  return (block?.tocLinks || []).filter(id => titles.has(id)).map(id => ({ id, title: titles.get(id) }));
}
// The sections a picker lists: the outline in reading order with its number path (1, 1.1), manual entries only.
export function sectionChoices(outline) {
  const out = [];
  const walk = nodes => nodes.forEach(node => { out.push({ id: node.entry.id, title: node.entry.label, path: node.number || '', level: node.entry.level }); walk(node.children); });
  walk(outlineTree((outline || []).filter(entry => !String(entry.id).startsWith('roadmap:'))));
  return out;
}
// The ids of every heading above an entry, outermost first ([] for a top-level or unknown one): the sections to unfold so a highlighted row is on screen.
export function ancestorsOf(outline, entryId) {
  const walk = (nodes, path) => {
    for (const node of nodes) {
      if (node.entry.id === entryId) return path;
      const found = walk(node.children, [...path, node.entry.id]);
      if (found) return found;
    }
    return null;
  };
  return walk(outlineTree(outline || []), []) || [];
}
