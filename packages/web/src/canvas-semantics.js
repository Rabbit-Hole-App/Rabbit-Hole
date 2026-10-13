// The canvas semantic snapshot (agent-coordination/tasks/2026-10-13-shared-canvas-semantics.md): one read-only view of what
// is on a canvas, for inline Explain/Edit context and the Curious planner. Pure: no React, no network.
//
// board: the live lists the canvas holds now ({ shapes, items, links, blocks, groups, exchanges }, plus an optional `boxes`
// layout map id -> { x, y, w, h } in world units), with unsaved editor text already overlaid by the caller.
// It never grants anything: edit permission stays with the caller's selected ids.
import { hash } from './inline-ai-context.js';
import { headsOf } from './learn-style-panel.js';
import { describeNotebook } from './learn-notebook.js';

export const SEMANTIC_BUDGET = Object.freeze({ objects: 80, chars: 8000 });
const LINEAR = new Set(['line', 'arrow', 'curve', 'elbow']);
const POINTING = new Set(['arrow', 'triangle']); // a dot or a bar ends a line; it does not point
const TOUCH = 14; // how close (world units) an arrow end or a label must be to count as attached
const LABEL_MAX = 60; // a free text box this short can be a label; longer text is content in its own right

// A card's words as the learner sees them: never a hidden answer (a quiz's correct option, a flashcard's back, a code
// exercise's solution, a challenge's expected ideas).
const VISIBLE = ['title', 'question', 'prompt', 'body', 'brief', 'text', 'caption', 'label', 'alt', 'code', 'setup'];
export function cardText(block) {
  if (block.type === 'notebook') { try { return describeNotebook(block).text; } catch { return String(block.title || ''); } }
  const parts = VISIBLE.filter(key => typeof block[key] === 'string' && block[key].trim()).map(key => block[key]);
  const own = typeof block.draft === 'string' ? block.draft : block.starter;
  if (typeof own === 'string' && own.trim()) parts.push(own);
  for (const option of block.options || []) if (option?.text) parts.push(`${option.key ? `${option.key}. ` : ''}${option.text}`);
  for (const card of block.cards || []) if (card?.front) parts.push(card.front);
  for (const section of block.more || []) if (section?.text) parts.push(`${section.label ? `[${section.label}] ` : ''}${section.text}`);
  if (Array.isArray(block.columns)) parts.push(block.columns.join(' | '), ...(block.rows || []).map(row => [].concat(row).join(' | ')));
  const graph = block.spec?.nodes ? block.spec : block.graph?.nodes ? block.graph : null;
  if (graph) {
    const name = new Map(graph.nodes.map(node => [node.id, node.label]));
    parts.push(`Nodes: ${graph.nodes.map(node => node.label).join(', ')}`);
    if (graph.edges?.length) parts.push(`Edges: ${graph.edges.map(edge => `${name.get(edge.from) ?? edge.from} -> ${name.get(edge.to) ?? edge.to}${edge.label ? ` (${edge.label})` : ''}`).join(', ')}`);
  }
  return parts.join('\n');
}
const cardTitle = block => String(block.title ?? block.question ?? block.prompt ?? block.label ?? (block.type === 'heading' ? block.text : '') ?? '');
const objectText = entity => String(entity.kind === 'equation' ? entity.latex ?? '' : entity.text ?? entity.label ?? '');
const objectKind = (entity, list) => (list === 'items' && entity.mode === 'code' ? 'code' : entity.kind);

const round = box => box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };
// A box from the board's measured layout, else from the object's own geometry (shapes by their corners, a text box or a
// sticky by its width and an estimate of its height).
function boxOf(entity, list, boxes) {
  if (boxes?.[entity.id]) return boxes[entity.id];
  if (list === 'shapes') return { x: Math.min(entity.x1, entity.x2), y: Math.min(entity.y1, entity.y2), w: Math.abs(entity.x2 - entity.x1), h: Math.abs(entity.y2 - entity.y1) };
  if (list === 'items') return { x: entity.x, y: entity.y, w: entity.w || 160, h: entity.h || (entity.kind === 'sticky' ? 160 : 24 * String(entity.text || '').split('\n').length) };
  return null;
}
const within = (point, box, slack) => point.x >= box.x - slack && point.x <= box.x + box.w + slack && point.y >= box.y - slack && point.y <= box.y + box.h + slack;
const gap = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
const isLabel = entry => entry.kind === 'text' && entry.text.trim() && entry.text.length <= LABEL_MAX;
const annotation = entity => entity.kind === 'annotation' || !!entity.inline;

// The whole board, unbudgeted: every card and object, every relation, every group.
function readBoard(board) {
  const boxes = board.boxes || {};
  const cards = [], objects = [], geometry = new Map();
  // Sections are the column's headings: a card belongs to the heading above it; a free object to the last heading whose
  // top is above its middle. ponytail: by height alone, as the column stacks sections; a canvas laid out in columns of
  // sections would need the heading's horizontal reach too.
  const headings = [];
  let section = null;
  for (const block of board.blocks || []) {
    if (block.type === 'heading') { section = block.id; if (boxes[block.id]) headings.push({ id: block.id, y: boxes[block.id].y }); }
    cards.push({ id: block.id, type: block.type, title: cardTitle(block), text: cardText(block), groupId: block.groupId || null, sectionId: section });
    if (boxes[block.id]) geometry.set(block.id, { box: boxes[block.id], closed: true });
  }
  // A chat card is part of the discussion on the canvas: the learner's question and the answer shown.
  for (const exchange of board.exchanges || []) {
    cards.push({ id: exchange.id, type: 'chat', title: String(exchange.question || ''), text: [exchange.question, exchange.answer].filter(Boolean).join('\n'), groupId: exchange.groupId || null, sectionId: null });
    if (boxes[exchange.id]) geometry.set(exchange.id, { box: boxes[exchange.id], closed: true });
  }
  headings.sort((a, b) => a.y - b.y);
  const sectionAt = box => (box ? headings.filter(heading => heading.y <= box.y + box.h / 2).at(-1)?.id ?? null : null);
  for (const [list, entities] of [['shapes', board.shapes || []], ['items', board.items || []]]) for (const entity of entities) {
    const box = boxOf(entity, list, boxes);
    objects.push({ id: entity.id, kind: objectKind(entity, list), text: objectText(entity), groupId: entity.groupId || null, sectionId: sectionAt(box), box: round(box) });
    if (box && !(list === 'shapes' && LINEAR.has(entity.kind))) geometry.set(entity.id, { box, closed: list === 'shapes' || entity.kind === 'sticky', entity });
  }
  const known = new Set([...cards, ...objects].map(entry => entry.id));
  const relations = [];
  // Stored links: a connector is a domain relation; an annotation (by its metadata) explains, it is not structure.
  for (const link of board.links || []) {
    if (!known.has(link.from) || !known.has(link.to)) continue;
    relations.push(directed({ id: link.id, from: link.from, to: link.to, label: String(link.label || ''), source: annotation(link) ? 'annotation' : 'connector' }, headsOf(link)));
  }
  // Drawn arrows and lines: what the picture suggests. Each end attaches to the object it touches - a shape or card before a
  // text box lying over it, the smallest when several - and an end that touches two of the same rank keeps its doubt in
  // a lower confidence rather than being settled.
  // ponytail: every arrow end and label is checked against every placed box, O(arrows x objects): about 1 ms for 100
  // objects, 30 ms for 1,200. Bucket the boxes in a coarse grid if boards that large are read on every change.
  const labels = new Set(), placed = [...geometry.entries()], short = objects.filter(entry => isLabel(entry) && entry.box);
  const attach = point => {
    const hits = placed.filter(([, { box }]) => within(point, box, TOUCH))
      .map(([id, { box, closed }]) => ({ id, closed, inside: within(point, box, 0), area: box.w * box.h }))
      .sort((a, b) => (b.closed - a.closed) || (a.area - b.area));
    if (!hits.length) return null;
    const rivals = hits.filter(hit => hit.closed === hits[0].closed).length;
    return { id: hits[0].id, confidence: (hits[0].inside ? 1 : 0.75) * (rivals > 1 ? 0.5 : 1) };
  };
  for (const shape of board.shapes || []) {
    if (!LINEAR.has(shape.kind)) continue;
    const start = attach({ x: shape.x1, y: shape.y1 }), end = attach({ x: shape.x2, y: shape.y2 });
    if (!start || !end || start.id === end.id) continue;
    let label = objectText(shape);
    if (!label.trim()) {
      // A short free text box at the arrow's middle is its label.
      const mid = { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
      const found = short.find(entry => within(mid, entry.box, TOUCH * 2) && entry.id !== start.id && entry.id !== end.id);
      if (found) { label = found.text; labels.add(found.id); }
    }
    const relation = { id: shape.id, from: start.id, to: end.id, label, source: annotation(shape) ? 'annotation' : 'inferred' };
    relations.push(directed(relation.source === 'inferred' ? { ...relation, confidence: Math.round(start.confidence * end.confidence * 100) / 100 } : relation, headsOf(shape)));
  }
  // A short free text box touching exactly one shape is that shape's label; touching two or more, it labels neither.
  for (const entry of short) {
    if (labels.has(entry.id)) continue;
    const touching = placed.filter(([id, { box, closed }]) => id !== entry.id && closed && gap(entry.box, box) <= TOUCH);
    if (touching.length === 1) entry.labelOf = touching[0][0];
  }
  const members = new Map();
  for (const entry of [...cards, ...objects]) if (entry.groupId) members.set(entry.groupId, [...(members.get(entry.groupId) || []), entry.id]);
  const groups = (board.groups || []).map(group => ({ id: group.id, title: String(group.label ?? group.title ?? ''), memberIds: members.get(group.id) || [] }));
  return { cards, objects, relations, groups };
}
// The arrowheads say which way a relation points: one head points from the other end to it; none or two, no direction.
function directed(relation, heads) {
  const start = POINTING.has(heads.start), end = POINTING.has(heads.end);
  if (start && !end) return { ...relation, from: relation.to, to: relation.from, directed: true };
  return { ...relation, directed: end && !start };
}

// A stable hash of what the board says: text, labels, kinds, relations and group/section membership, in id order -
// never positions, sizes, confidence, the selection, the camera, hover, or the order a focus put things in.
export function semanticFingerprint(snapshot) {
  const byId = list => [...(list || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hash(JSON.stringify([
    byId(snapshot.cards).map(card => [card.id, card.type, card.title, card.text, card.groupId, card.sectionId]),
    byId(snapshot.objects).map(entry => [entry.id, entry.kind, entry.text, entry.groupId, entry.sectionId, entry.labelOf || null]),
    (snapshot.relations || []).map(r => [r.from, r.to, r.label, r.directed, r.source]).map(r => JSON.stringify(r)).sort(),
    byId(snapshot.groups).map(group => [group.id, group.title, [...group.memberIds].sort()]),
  ]));
}

// The snapshot: focus ids first (in the caller's order), then what they connect to or share a group with, then the rest in
// board order; cut to the budget, with what the cut left out counted (never silent). The lists keep that order. The fingerprint is of the whole board before the cut, so it never depends on focus or budget.
export function semanticSnapshot(board, { budget = SEMANTIC_BUDGET, focus = { ids: [] } } = {}) {
  const full = readBoard(board);
  const fingerprint = semanticFingerprint(full);
  const focusIds = (focus?.ids || []).filter(Boolean);
  const neighbours = new Set();
  for (const relation of full.relations) {
    if (focusIds.includes(relation.from)) neighbours.add(relation.to);
    if (focusIds.includes(relation.to)) neighbours.add(relation.from);
  }
  for (const group of full.groups) if (group.memberIds.some(id => focusIds.includes(id))) group.memberIds.forEach(id => neighbours.add(id));
  const rank = entry => { const at = focusIds.indexOf(entry.id); return at >= 0 ? at : neighbours.has(entry.id) ? focusIds.length : focusIds.length + 1; };
  const entries = [...full.cards.map(entry => ({ list: 'cards', entry })), ...full.objects.map(entry => ({ list: 'objects', entry }))]
    .map((item, index) => ({ ...item, index })).sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index);
  const kept = { cards: [], objects: [] }, omitted = { objects: 0, chars: 0 };
  let objects = 0, chars = 0;
  for (const { list, entry } of entries) {
    if (objects >= budget.objects || chars >= budget.chars) { omitted.objects += 1; omitted.chars += entry.text.length; continue; }
    const room = budget.chars - chars, text = entry.text.length > room ? entry.text.slice(0, room) : entry.text;
    omitted.chars += entry.text.length - text.length;
    objects += 1; chars += text.length;
    kept[list].push(text === entry.text ? entry : { ...entry, text, truncated: true });
  }
  const ids = new Set([...kept.cards, ...kept.objects].map(entry => entry.id));
  return {
    ...kept,
    relations: full.relations.filter(relation => ids.has(relation.from) && ids.has(relation.to)),
    groups: full.groups.map(group => ({ ...group, memberIds: group.memberIds.filter(id => ids.has(id)) })),
    omitted,
    fingerprint,
  };
}
