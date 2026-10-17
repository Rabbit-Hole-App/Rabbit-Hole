// The inline AI editor's context (docs/features/inline-ai-editor.md §3-§5, A1): what one Ctrl/Cmd+K request may show
// the model, built locally from the live canvas - never from the last saved copy - and never sent anywhere by itself.
// Pure apart from the injected describeCard(), so the node tests run it without a browser.
//
// A board here is { shapes, items, links, blocks, groups, exchanges, boxes } - the canvas's live lists plus a layout map
// (id -> { x, y, w, h } in world units) the canvas measures. Content and layout stay apart (A1): a content record says
// what an object is and says; where it is comes from `boxes` on each build, so a move never rebuilds a description.

import { cardEditSpec } from './inline-card-edit.js';
import { cardText, semanticSnapshot } from './canvas-semantics.js';
import { docText } from './doc-text.js';
import { fileCoverage } from './file-chat-ref.js';

export const CONTEXT_VERSION = 'inline-context-2';
// relevant: the score a supporting object needs (structure, grouping, section, reading order, shared terms - never
// closeness alone); hops: how far along the diagram's relations; flowGap: the gap between two text boxes read in order.
export const LIMITS = Object.freeze({ objects: 24, targetChars: 4000, chars: 400, total: 8000, rangeAround: 200, connections: 40, relevant: 0.35, hops: 3, flowGap: 48 });
// What a move changes and a description never reads.
const LAYOUT = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'w', 'h', 'fresh', 'cardLayout']);
const LINEAR = new Set(['line', 'arrow', 'curve', 'elbow']);

// FNV-1a, 32-bit: a fingerprint, not a secret.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const clip = (text, max) => (text.length > max ? { text: max > 0 ? `${text.slice(0, max - 1)}\u2026` : '', truncated: true } : { text, truncated: false });
const sameContent = (a, b) => {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!LAYOUT.has(key) && a[key] !== b[key]) return false;
  return true;
};

// The words an object holds, as plain text.
export function plainText(entity, describeCard = null) {
  if (!entity) return '';
  if (entity.type || typeof entity.question === 'string') return String(describeCard?.(entity)?.text ?? entity.title ?? entity.question ?? '');
  if (entity.kind === 'equation') return String(entity.latex ?? '');
  return String(entity.text ?? entity.label ?? '');
}

// One object's content record. `native`: the canvas owns its parts as objects; a flattened image does not.
function describe(entity, list, describeCard) {
  if (list === 'shapes') return { id: entity.id, type: LINEAR.has(entity.kind) ? 'line' : 'shape', kind: entity.kind, text: plainText(entity), native: true,
    ...(entity.level ? { level: entity.level } : {}), ...(entity.fontSize ? { fontSize: entity.fontSize } : {}), ...(entity.locked ? { locked: true } : {}) };
  if (list === 'items') return { id: entity.id, type: entity.kind, text: plainText(entity), native: true, mode: entity.mode === 'code' ? 'code' : 'text',
    ...(entity.level ? { level: entity.level } : {}), ...(entity.fontSize ? { fontSize: entity.fontSize } : {}), ...(entity.locked ? { locked: true } : {}) };
  if (list === 'exchanges') return { id: entity.id, type: 'chat', text: plainText(entity, describeCard), native: true };
  const image = entity.type === 'file' && entity.kind === 'image';
  return { id: entity.id, type: 'card', kind: entity.type, text: plainText(entity, describeCard), native: !image,
    ...(image ? { flattened: true, note: 'A flattened image: one picture. Shapes or nodes drawn inside it are not canvas objects and have no ids.' } : {}),
    ...(entity.locked ? { locked: true } : {}) };
}

// The incremental lookups (A1). One cache per board: lookups(board, key) with another board's key starts empty, so one
// board's descriptions never reach another's request. Indexes rebuild only when their list changed; a content record
// is rebuilt only when the object's content changed (a move keeps it).
export function createContextCache() {
  let key = null, lists = {}, entities = new Map(), byEnd = new Map(), links = new Map(), members = new Map();
  const records = new Map();
  const stats = { hits: 0, misses: 0, resets: 0, snapshots: 0, snapshotHits: 0 };
  let semanticBasis = null, semanticValue = null;
  const reset = () => { key = null; lists = {}; entities = new Map(); byEnd = new Map(); links = new Map(); members = new Map(); records.clear(); semanticBasis = null; semanticValue = null; stats.resets += 1; };
  return {
    stats,
    reset,
    // The board's semantic snapshot (point 7): read again only when a list or a measured box changed since the last
    // build - so the build at submit reuses the one made while the learner wrote, unless the board changed meanwhile.
    semantic(board) {
      const basis = { lists: ['shapes', 'items', 'links', 'blocks', 'groups', 'exchanges'].map(list => board[list]), boxes: JSON.stringify(board.boxes || {}) };
      if (semanticValue && basis.boxes === semanticBasis.boxes && basis.lists.every((list, i) => list === semanticBasis.lists[i])) { stats.snapshotHits += 1; return semanticValue; }
      stats.snapshots += 1;
      semanticBasis = basis;
      semanticValue = semanticSnapshot(board, { budget: { objects: Infinity, chars: Infinity } });
      return semanticValue;
    },
    lookups(board, boardKey, describeCard = null) {
      if (boardKey !== key) { reset(); key = boardKey; }
      const owned = ['shapes', 'items', 'blocks', 'exchanges'];
      if (owned.some(list => lists[list] !== board[list])) {
        entities = new Map(); members = new Map();
        for (const list of owned) for (const entity of board[list] || []) {
          entities.set(entity.id, { entity, list });
          if (entity.groupId) members.set(entity.groupId, [...(members.get(entity.groupId) || []), entity.id]);
        }
        for (const id of records.keys()) if (!entities.has(id)) records.delete(id); // deleted: its description goes
        for (const list of owned) lists[list] = board[list];
      }
      if (lists.links !== board.links) {
        byEnd = new Map(); links = new Map();
        for (const link of board.links || []) {
          links.set(link.id, link);
          for (const end of [link.from, link.to]) byEnd.set(end, [...(byEnd.get(end) || []), link]);
        }
        lists.links = board.links;
      }
      const record = id => {
        const found = entities.get(id);
        if (!found) return null;
        const cached = records.get(id);
        if (cached && sameContent(cached.entity, found.entity)) { cached.entity = found.entity; stats.hits += 1; return cached.record; }
        stats.misses += 1;
        const made = describe(found.entity, found.list, describeCard);
        records.set(id, { entity: found.entity, record: made });
        return made;
      };
      return { entities, byEnd, links, members, record, groups: board.groups || [] };
    },
  };
}

const gapBetween = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
export const unionBox = boxes => {
  const list = boxes.filter(Boolean);
  if (!list.length) return null;
  const x = Math.min(...list.map(box => box.x)), y = Math.min(...list.map(box => box.y));
  return { x, y, w: Math.max(...list.map(box => box.x + box.w)) - x, h: Math.max(...list.map(box => box.y + box.h)) - y };
};
const round = box => box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };

// The kinds of supporting material, in the order the context indicator lists them.
export const RELATIONS = ['connected', 'sibling', 'region', 'diagram', 'inferred', 'group', 'heading', 'label', 'flow', 'discussion', 'mentions', 'annotation'];
// A creation's region (creation §4): what is drawn within this many world units of the insertion anchor.
const REGION = 250;
const HOP = [1, 0.7, 0.5];
const STOP = new Set(('the a an and or of to in on for is are be was were this that these those it its with as at by from what does do how why '
  + 'explain explains show tell me about here there which who can will would should could please make into than then them they their your you '
  + 'not no yes all any each one two get got has have had before after every going until while where when also only just '
  + 'more most some such other same very then than into over under again still even much many well first last next').split(' '));
// The words that carry meaning, lowercased, a plural's s dropped: what "shares its terms" compares.
export const terms = text => new Set((String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || [])
  .map(word => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)).filter(word => word.length >= 2 && !STOP.has(word)));
const HEADING = new Set(['h1', 'h2', 'h3']);

// The supporting objects for one target, each with the reason it is there and a score; only those that reach
// limits.relevant, best first (nearest first among equals). Pure: the snapshot, the board's own entities and boxes.
// ponytail: fixed weights and plain term overlap (no stemming beyond a plural s, no synonyms); tune the weights or add a
// small embedding when the canvas fixtures show a miss.
// anchor: a creation's insertion point (world), when nothing is selected: the region around it seeds the same relevance.
export function relevant(snapshot, board, look, present, { request = '', boxes = {}, limits = LIMITS, anchor = null } = {}) {
  const entries = new Map([...snapshot.cards, ...snapshot.objects].map(entry => [entry.id, entry]));
  const boxOf = id => boxes[id] || entries.get(id)?.box || null;
  const targetBox = present.length ? unionBox(present.map(boxOf)) : anchor ? { x: anchor.x - 1, y: anchor.y - 1, w: 2, h: 2 } : null;
  const best = new Map();
  const offer = (id, relation, score, extra = {}) => {
    const entry = entries.get(id), found = look.entities.get(id);
    if (!entry || present.includes(id) || !found || (found.list === 'shapes' && LINEAR.has(found.entity.kind)) || found.entity.inline) return;
    if ((best.get(id)?.score ?? -1) < score) best.set(id, { id, relation, score, extra });
  };
  // The diagram: along stored links and drawn arrows, both ways, up to limits.hops; a drawn arrow counts as much as the
  // reading of its ends is sure. Annotation connectors are earlier notes, not the diagram.
  const next = new Map();
  for (const relation of snapshot.relations) {
    if (relation.source === 'annotation') continue;
    const weight = relation.source === 'inferred' ? relation.confidence : 1;
    for (const [a, b] of [[relation.from, relation.to], [relation.to, relation.from]]) next.set(a, [...(next.get(a) || []), { id: b, weight, relation }]);
  }
  let frontier = present.map(id => ({ id, score: 1 }));
  const reached = new Set(present);
  // A creation: what is drawn near the anchor is its subject (the closer, the stronger), and the diagrams it is part of.
  if (!present.length && targetBox) {
    for (const entry of entries.values()) {
      const box = boxOf(entry.id), found = look.entities.get(entry.id);
      if (!box || (found?.list === 'shapes' && LINEAR.has(found.entity.kind))) continue;
      const gap = gapBetween(targetBox, box);
      if (gap > REGION) continue;
      const score = 0.2 + 0.55 * (1 - gap / REGION);
      offer(entry.id, 'region', score, { gap: Math.round(gap) });
      // Only what is near enough to count seeds the diagram walk; anything further can still come in through it.
      if (score >= limits.relevant) { frontier.push({ id: entry.id, score }); reached.add(entry.id); }
    }
  }
  for (let hop = 0; hop < Math.min(limits.hops, HOP.length) && frontier.length; hop += 1) {
    const step = [];
    for (const from of frontier) for (const edge of next.get(from.id) || []) {
      if (reached.has(edge.id)) continue;
      const score = from.score * HOP[hop] * edge.weight;
      const relation = hop ? 'diagram' : edge.relation.source === 'inferred' ? 'inferred' : 'connected';
      offer(edge.id, relation, score, { hops: hop + 1, ...(edge.relation.source === 'inferred' ? { confidence: edge.relation.confidence } : {}) });
      step.push({ id: edge.id, score });
    }
    for (const entry of step) reached.add(entry.id);
    frontier = step;
  }
  // Labels written on or right against the target.
  for (const entry of snapshot.objects) if (present.includes(entry.labelOf)) offer(entry.id, 'label', 0.95, { labelOf: entry.labelOf });
  // Its section: the column heading above it, and the section's other material when the section is small.
  const sections = new Set(present.map(id => entries.get(id)?.sectionId).filter(Boolean));
  // A creation's section: the column heading whose card sits last above the anchor.
  if (!present.length && targetBox) {
    const above = snapshot.cards.filter(card => card.type === 'heading' && boxOf(card.id) && boxOf(card.id).y <= targetBox.y).sort((a, b) => boxOf(b.id).y - boxOf(a.id).y)[0];
    if (above) sections.add(above.id);
  }
  for (const section of sections) {
    offer(section, 'heading', 0.9);
    const members = [...entries.values()].filter(entry => entry.sectionId === section && entry.id !== section);
    for (const entry of members) offer(entry.id, 'heading', members.length <= 8 ? 0.4 : 0.25, { section });
  }
  // A heading written on the canvas just above the target's region.
  if (targetBox) {
    const above = (board.items || []).filter(item => HEADING.has(item.level) && item.mode !== 'code' && boxOf(item.id)).map(item => ({ item, box: boxOf(item.id) }))
      .filter(({ box }) => box.y + box.h <= targetBox.y + 4 && targetBox.y - (box.y + box.h) <= 600 && box.x < targetBox.x + targetBox.w + 200 && box.x + box.w > targetBox.x - 200)
      .sort((a, b) => b.box.y - a.box.y);
    if (above[0]) offer(above[0].item.id, 'heading', 0.85);
  }
  // Reading order: the text boxes stacked with a text target, before and after it.
  const texts = (board.items || []).filter(item => item.kind === 'text' && item.mode !== 'code' && boxOf(item.id));
  for (const id of present) {
    if (!texts.some(item => item.id === id)) continue;
    for (const dir of [-1, 1]) {
      let at = boxOf(id);
      for (let step = 0; step < 4; step += 1) {
        const following = texts.filter(item => !present.includes(item.id) && Math.abs(boxOf(item.id).x - at.x) <= 24)
          .map(item => { const box = boxOf(item.id); return { item, box, gap: dir > 0 ? box.y - (at.y + at.h) : at.y - (box.y + box.h) }; })
          .filter(({ gap }) => gap >= -4 && gap <= limits.flowGap).sort((a, b) => a.gap - b.gap)[0];
        if (!following) break;
        offer(following.item.id, HEADING.has(following.item.level) ? 'heading' : 'flow', 0.85 - step * 0.15, { order: dir < 0 ? 'before' : 'after' });
        at = following.box;
      }
    }
  }
  // Discussion of it: a chat answered about the target.
  for (const exchange of board.exchanges || []) if (present.includes(exchange.linkFrom)) offer(exchange.id, 'discussion', 0.9);
  // Shared terms with the request and the target's own words, however far away.
  const query = new Set([...terms(request), ...present.flatMap(id => [...terms(entries.get(id)?.text)])]);
  for (const entry of entries.values()) {
    const shared = [...terms(`${entry.title || ''} ${entry.text}`)].filter(word => query.has(word));
    const score = shared.length >= 2 ? 0.45 + 0.1 * Math.min(shared.length - 2, 3) : shared.length === 1 && shared[0].length >= 6 ? 0.38 : 0;
    const known = best.get(entry.id);
    if (score && known) best.set(entry.id, { ...known, score: Math.max(known.score, score) + 0.1 });
    else if (score) offer(entry.id, 'mentions', score, { shared: shared.slice(0, 5) });
  }
  // Labels on what is already in: a label travels with its object.
  for (const entry of snapshot.objects) if (entry.labelOf && (best.get(entry.labelOf)?.score ?? 0) >= limits.relevant) offer(entry.id, 'label', 0.5, { labelOf: entry.labelOf });
  const distance = id => (targetBox && boxOf(id) ? gapBetween(targetBox, boxOf(id)) : Infinity);
  return [...best.values()].filter(entry => entry.score >= limits.relevant).sort((a, b) => b.score - a.score || distance(a.id) - distance(b.id));
}

// What a cached answer depended on besides the target (point 7): the supporting objects' words and why they are there,
// the relations among them and the metadata - never positions, so a move keeps the answer and an edit around it does not.
const supportPrint = context => hash(JSON.stringify([
  context.related.map(entry => [entry.id, entry.relation, entry.text]), context.relations.map(r => [r.from, r.to, r.label || '', r.directed, r.source]),
  context.connections.map(link => [link.id, link.from, link.to, link.label || '']), context.target.group?.label ?? null, context.metadata,
]));

// The fingerprints a response is checked against before it applies (§11): what the target says (never where it is),
// and the stored connections and group membership around it. Annotation connectors are not structure.
export function fingerprints(look, target) {
  const content = target.ids.map(id => {
    const found = look.entities.get(id) || (look.links.has(id) ? { entity: look.links.get(id) } : null);
    if (!found) return [id, null];
    const entity = found.entity;
    return [id, Object.keys(entity).filter(k => !LAYOUT.has(k)).sort().map(k => [k, entity[k]])];
  });
  const structural = target.ids.flatMap(id => (look.byEnd.get(id) || []).filter(link => link.kind !== 'annotation'))
    .map(link => [link.id, link.from, link.to, link.label || '']).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const group = target.groupId ? (look.members.get(target.groupId) || []).slice().sort() : null;
  return { target: hash(JSON.stringify([content, target.range || null])), relations: hash(JSON.stringify([structural, group])) };
}

// The frozen target checked against the board as it is now (§11): gone ids, changed content, changed connections.
// A move alone is none of these: the caller recomputes placement instead.
export function staleness(frozen, board, cache, boardKey, describeCard = null) {
  const look = cache.lookups(board, boardKey, describeCard);
  const gone = frozen.ids.filter(id => !look.entities.has(id) && !look.links.has(id));
  const now = fingerprints(look, frozen);
  return { gone, content: now.target !== frozen.prints.target, relations: now.relations !== frozen.prints.relations };
}

// Whether a selection can be the target of an inline request, and the frozen target it becomes (§2): the exact ids,
// the group they make up (a whole group, or one member picked inside it), and a text range when one is selected.
export function freezeTarget(board, selection, { range = null } = {}) {
  const look = { entities: new Map(), links: new Map() };
  for (const list of ['shapes', 'items', 'blocks', 'exchanges']) for (const entity of board[list] || []) look.entities.set(entity.id, entity);
  for (const link of board.links || []) look.links.set(link.id, link);
  if (range) {
    const entity = look.entities.get(range.id);
    if (!entity || range.to <= range.from) return null;
    return { ids: [range.id], range: { id: range.id, from: range.from, to: range.to, text: range.text }, groupId: null };
  }
  const ids = selection.filter(id => look.entities.has(id) || look.links.has(id));
  if (!ids.length) return null;
  const gids = new Set(ids.map(id => look.entities.get(id)?.groupId || null));
  const gid = gids.size === 1 ? [...gids][0] : null;
  const whole = gid && [...look.entities.values()].filter(entity => entity.groupId === gid).every(entity => ids.includes(entity.id));
  return { ids, range: null, groupId: gid, wholeGroup: !!whole };
}

// The bounded context package (§3) for one request. Priority: the exact target, its stored connections (however far
// away), its siblings through a shared parent, visually touching arrows (inferred, not stored), its group, earlier
// annotations about it, labels right beside it, then the canvas's title and goal. Everything past the limits is
// counted in `omitted`; nothing says the model saw the whole canvas.
export function buildContext(board, target, { cache, boardKey, describeCard = null, selectionOnly = false, extras = {}, request = '', limits = LIMITS } = {}) {
  const look = cache.lookups(board, boardKey, describeCard);
  const boxes = board.boxes || {};
  const omitted = { ...Object.fromEntries(RELATIONS.map(relation => [relation, 0])), truncated: 0, connections: 0 };
  let chars = 0, objects = 0;
  const seen = new Set();
  const take = (record, relation, extra = {}, max = limits.chars) => {
    if (!record || seen.has(record.id)) return null;
    if (objects >= limits.objects || chars >= limits.total) { omitted[relation] = (omitted[relation] || 0) + 1; return null; }
    const words = clip(record.text, Math.min(max, limits.total - chars));
    if (words.truncated) omitted.truncated += 1;
    seen.add(record.id); objects += 1; chars += words.text.length;
    return { ...record, text: words.text, ...(words.truncated ? { truncated: true } : {}), relation, at: round(boxes[record.id]), ...extra };
  };
  // 1. The exact target, as saved: the editor saves an open text editor's words before it builds this (A1), so the
  // words here and the fingerprint below are the same text.
  const present = target.ids.filter(id => look.entities.has(id) || look.links.has(id));
  const gone = target.ids.filter(id => !present.includes(id));
  const targets = present.map(id => {
    const link = look.links.get(id);
    let base = link ? { id, type: 'connection', text: String(link.label || ''), native: true, from: link.from, to: link.to } : look.record(id);
    const entity = look.entities.get(id);
    const editable = entity?.list === 'blocks' ? cardEditSpec(entity.entity) : null;
    // The complete structured representation replaces a lossy description, and counts against the same budget.
    if (editable?.ok) base = { ...base, text: JSON.stringify(editable.content) };
    const taken = take(base, 'target', {}, limits.targetChars);
    if (taken && editable?.ok && !taken.truncated) {
      const representation = { type: editable.type, fields: editable.fields, content: editable.content };
      const length = JSON.stringify(representation).length;
      if (chars + length <= limits.total) { taken.editable = representation; chars += length; }
      else { taken.truncated = true; omitted.truncated += 1; }
    }
    if (taken && editable && !editable.ok) taken.editLimitation = editable.reason;
    if (taken && target.range && target.range.id === id) {
      const whole = base.text, { from, to } = target.range;
      taken.range = { from, to, text: whole.slice(from, to), before: whole.slice(Math.max(0, from - limits.rangeAround), from), after: whole.slice(to, to + limits.rangeAround) };
    }
    return taken;
  }).filter(Boolean);
  const connections = [], related = [];
  const complete = {};
  // ponytail: the first limits.connections stored links, in board order; the rest are only counted (omitted.connections)
  // and the target is marked incomplete, so a node with hundreds of links stays inside the request body limit. Rank
  // them (structure before annotations, nearest first) if a capped list ever hides the link that matters.
  const addConnection = (entry, of = null) => {
    if (connections.length < limits.connections) { connections.push(entry); return; }
    omitted.connections += 1;
    if (of) complete[of] = false;
  };
  if (!selectionOnly) {
    // 2. Stored connections, both ways, with their other end - near or far.
    const parents = [];
    for (const id of present) {
      const own = look.byEnd.get(id) || [];
      complete[id] = true;
      for (const link of own) {
        const other = link.from === id ? link.to : link.from;
        const kind = link.kind === 'annotation' ? 'annotation' : 'connection';
        if (kind === 'connection' && link.to === id) parents.push({ parent: other, via: link.id, child: id });
        const otherRecord = look.record(other);
        const entry = take(otherRecord, kind === 'annotation' ? 'annotation' : 'connected', { via: link.id });
        if (otherRecord && !entry && !seen.has(other)) complete[id] = false;
        if (entry) related.push(entry);
        addConnection({ id: link.id, kind, from: link.from, to: link.to, ...(link.label ? { label: String(link.label).slice(0, limits.chars) } : {}), direction: link.from === id ? 'outgoing' : 'incoming', of: id, other }, id);
      }
    }
    // 3. Siblings: the parent's other children (one more level, only through a parent).
    for (const { parent, child } of parents) {
      for (const link of look.byEnd.get(parent) || []) {
        if (link.kind === 'annotation' || link.from !== parent || link.to === child || present.includes(link.to)) continue;
        const entry = take(look.record(link.to), 'sibling', { via: parent });
        if (entry) related.push(entry);
        if (!connections.some(known => known.id === link.id)) addConnection({ id: link.id, kind: 'connection', from: link.from, to: link.to, ...(link.label ? { label: String(link.label).slice(0, limits.chars) } : {}), direction: 'sibling', of: parent, other: link.to });
      }
    }
  }
  // 5. The group: its label always (it names what the selection belongs to); its other members unless selection-only.
  const gid = target.groupId || (present.length && present.every(id => look.entities.get(id)?.entity.groupId === look.entities.get(present[0])?.entity.groupId) ? look.entities.get(present[0])?.entity.groupId : null);
  const groupRow = gid ? (look.groups.find(group => group.id === gid) || { id: gid, label: '' }) : null;
  const group = groupRow ? { id: gid, label: String(groupRow.label || '').slice(0, 120), members: (look.members.get(gid) || []).length, whole: !!target.wholeGroup } : null;
  if (group && !selectionOnly) for (const id of look.members.get(gid) || []) {
    if (present.includes(id)) continue;
    const entry = take(look.record(id), 'group');
    if (entry) related.push(entry);
  }
  // 6. Earlier inline explanations about the target.
  if (!selectionOnly) for (const shape of board.shapes || []) {
    if (seen.has(shape.id) || !shape.inline?.sources?.some(id => present.includes(id))) continue;
    const entry = take(look.record(shape.id), 'annotation', { note: 'An earlier explanation added beside the selection; not part of the diagram.' });
    if (entry) related.push(entry);
  }
  // 7. Everything else that helps explain the selection, by relevance (canvas-semantics.js gives the board's structure):
  // the diagram it is part of, labels on it, its heading or section, the text read before and after it, discussion of it,
  // and anything that shares its terms or the request's - however far away. Closeness alone never qualifies.
  const snapshot = selectionOnly ? null : cache.semantic(board);
  const relations = [];
  if (snapshot) {
    const picked = relevant(snapshot, board, look, present, { request, boxes, limits });
    for (const { id, relation, score, extra } of picked) {
      const entity = look.entities.get(id);
      if (!entity || seen.has(id)) continue;
      // A card's words as the learner sees them (never a hidden answer); every other object as described.
      const record = entity.list === 'blocks' ? { ...look.record(id), text: cardText(entity.entity) } : look.record(id);
      const entry = take(record, relation, { score: Math.round(score * 100) / 100, ...extra });
      if (entry) related.push(entry);
    }
    // How the included objects relate, every source kept apart: a stored link, an arrow drawn on the canvas (with how
    // sure the reading of its ends is), an earlier note's connector. The target's own stored links are in connections.
    const included = new Set([...present, ...related.map(entry => entry.id)]);
    const listed = new Set(connections.map(link => link.id));
    for (const relation of snapshot.relations) {
      if (!included.has(relation.from) || !included.has(relation.to) || listed.has(relation.id)) continue;
      relations.push({ from: relation.from, to: relation.to, ...(relation.label ? { label: relation.label.slice(0, limits.chars) } : {}), directed: relation.directed, source: relation.source,
        ...(relation.source === 'inferred' ? { confidence: relation.confidence, ...(relation.confidence < 0.7 ? { uncertain: true } : {}) } : {}) });
    }
  }
  // 8. Metadata: the canvas's title and goal, which may be out of date or name another topic than the selection's.
  const metadata = {};
  omitted.metadata = 0;
  for (const [key, value, max] of [['canvasTitle', extras.title, 200], ['learningGoal', extras.goal, 300]]) {
    if (!value) continue;
    const text = String(value);
    const room = Math.min(max, Math.max(0, limits.total - chars - JSON.stringify({ [key]: '' }).length));
    const selected = text.slice(0, room), length = JSON.stringify({ [key]: selected }).length;
    if (room > 0 && chars + length <= limits.total) { metadata[key] = selected; chars += length; }
    if (!Object.hasOwn(metadata, key) || room < text.length) omitted.metadata += 1;
  }
  // Available conversation and intentionally attached references only; never claim listed sources were read.
  if (!selectionOnly) {
    const conversation = Array.isArray(extras.conversation) ? extras.conversation : [];
    const sources = Array.isArray(extras.sources) ? extras.sources : [];
    metadata.conversation = [];
    metadata.sources = [];
    omitted.conversation = 0; omitted.sources = 0;
    for (const turn of conversation.slice().reverse()) {
      if (!turn || !['user', 'assistant'].includes(turn.role) || typeof turn.text !== 'string') continue;
      const overhead = JSON.stringify({ role: turn.role, text: '', truncated: true }).length;
      const room = Math.min(1000, Math.max(0, limits.total - chars - overhead));
      if (!room) { omitted.conversation += 1; continue; }
      const text = turn.text.slice(0, room);
      const truncated = text.length !== turn.text.length;
      const entry = { role: turn.role, text, ...(truncated ? { truncated: true } : {}) };
      const length = JSON.stringify(entry).length;
      if (chars + length > limits.total) { omitted.conversation += 1; continue; }
      metadata.conversation.unshift(entry);
      chars += length;
      if (truncated) omitted.conversation += 1;
    }
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const entry = { kind: String(source.kind || 'source').slice(0, 60), title: String(source.title || '').slice(0, 200), coverage: 'listed' };
      if (typeof source.sourceId === 'string') entry.sourceId = source.sourceId.slice(0, 200);
      if (source.range && typeof source.range === 'object') entry.range = Object.fromEntries(Object.entries(source.range).filter(([key, value]) => ['start', 'end', 'page', 'line', 'lineEnd', 'from', 'to'].includes(key) && (typeof value === 'number' || typeof value === 'string')).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 100) : value]));
      const length = JSON.stringify(entry).length;
      if (chars + length > limits.total) { omitted.sources += 1; continue; }
      metadata.sources.push(entry); chars += length;
    }
    if (!metadata.conversation.length) delete metadata.conversation;
    if (!metadata.sources.length) delete metadata.sources;
  }
  const image = targets.find(entry => entry.flattened);
  const imageEntity = image && look.entities.get(image.id)?.entity;
  const counts = { target: targets.length, ...Object.fromEntries(RELATIONS.map(relation => [relation, related.filter(entry => entry.relation === relation).length])) };
  const context = {
    version: CONTEXT_VERSION,
    target: { ids: present, gone, ...(target.range ? { range: true } : {}), objects: targets, ...(group ? { group } : {}) },
    connections, related, relations, complete,
    metadata,
    ...(image ? { image: { id: image.id, ...(imageEntity?.mediaId ? { mediaId: imageEntity.mediaId } : {}) } } : {}),
    selectionOnly: !!selectionOnly,
    omitted, counts,
    // How many objects on the canvas were weighed for this context: what it says it chose from, never "everything".
    considered: snapshot ? snapshot.cards.length + snapshot.objects.length - present.length : 0,
    size: { objects, chars },
  };
  return { ...context, prints: { ...fingerprints(look, target), context: supportPrint(context) } };
}

// Every target the model did not read whole - cut short, or left out by the object or character budget. For the frozen
// target only (Accept refuses a whole replace on these); never sent: a large selection would only grow the request.
export const clippedOf = context => context.target.ids.filter(id => !context.target.objects.some(entry => entry.id === id && !entry.truncated));

// The compact, content-free shape of a context for telemetry (A3/A5): counts only.
export const contextShape = context => ({ objects: context.size.objects, chars: context.size.chars, counts: context.counts,
  omitted: Object.values(context.omitted).reduce((sum, n) => sum + n, 0), selectionOnly: context.selectionOnly });

// ---------- Whole-canvas context for every canvas-chat turn (agent-coordination/tasks/2026-10-14-whole-canvas-context-OWNER.md,
// contract v1.1 and the rulings in canvas-context-SUBLANES.md) ----------
// Every turn gets the whole board's inventory; how much more each object gets follows one deterministic budget policy -
// relevance by shared terms, never a phrase, keyword or regex rule on the request.

const MEDIA = new Set(['image', 'video', 'file']);
const CARD_TYPES = { heading: 'heading', image: 'image', video: 'video', pdf: 'file', slide: 'file', paper: 'file' };
const cardType = block => (block.type === 'file' ? (block.kind === 'image' ? 'image' : block.kind === 'clip' ? 'video' : 'file') : CARD_TYPES[block.type] || 'card');
const itemType = item => (item.mode === 'code' ? 'code' : item.kind === 'equation' || item.kind === 'sticky' ? item.kind : HEADING.has(item.level) ? 'heading' : 'text');

// The live board ({ shapes, items, links, blocks, groups, exchanges, boxes }, unsaved editor words already overlaid) as the
// builder's inputs: objects { id, type, kind?, text, label?, x, y, w, h, group_id?, section_id?, media?, unreadable? },
// connectors { id, from, to, label?, explicit, kind?: 'near'|'labels', basis? }, groups { id, label, member_ids }.
// Stored links (annotations aside) are explicit; drawn arrows and labels are what the picture suggests, never stated as fact.
// Freehand strokes (board.strokes, { points } in world units) carry no ids and are not recognised: one listed object per
// region that holds ink, its content unavailable - never left out, never read as absent.
export function boardObjects(board) {
  const snap = semanticSnapshot(board, { budget: { objects: Infinity, chars: Infinity } });
  const boxes = board.boxes || {}, blocks = new Map((board.blocks || []).map(block => [block.id, block]));
  const shapes = new Map((board.shapes || []).map(shape => [shape.id, shape])), items = new Map((board.items || []).map(item => [item.id, item]));
  const place = (id, box = boxes[id]) => (box ? { x: box.x, y: box.y, w: box.w, h: box.h } : {});
  const ties = entry => ({ ...(entry.groupId ? { group_id: entry.groupId } : {}), ...(entry.sectionId ? { section_id: entry.sectionId } : {}) });
  const objects = [
    ...snap.cards.map(card => {
      const block = blocks.get(card.id), type = block ? cardType(block) : 'chat', kind = block && (block.type === 'file' ? block.kind : block.type);
      // An imported file card (fileRef, canvas-file-imports.md section 3) is listed by its name with what was extracted from it
      // (file-chat-ref.js fileCoverage); its content never rides in the canvas package, only through its attached file ref,
      // which the server reads from the extracted text. A picture or player never makes it read.
      if (block?.fileRef && !(MEDIA.has(type) && type !== 'file')) {
        return { id: card.id, type: 'file', ...(block.fileRef.family ? { kind: String(block.fileRef.family) } : {}), text: '', label: String(block.fileRef.meta?.name || card.title || 'File'),
          ...place(card.id), ...ties(card), file: fileCoverage(block.fileRef) };
      }
      // A card with no words to show holds its content some other way (a scene, a drawing): listed, its content unavailable.
      const unreadable = block && !MEDIA.has(type) && !card.text.trim() && !['heading', 'divider'].includes(block.type);
      return { id: card.id, type, ...(kind && kind !== type ? { kind } : {}), text: card.text, ...(card.title.trim() ? { label: card.title } : {}), ...place(card.id), ...ties(card),
        ...(MEDIA.has(type) ? { media: true } : unreadable ? { unreadable: true } : {}) };
    }),
    ...snap.objects.map(entry => {
      const type = shapes.has(entry.id) ? (LINEAR.has(entry.kind) ? 'connector' : 'shape') : itemType(items.get(entry.id));
      return { id: entry.id, type, ...(entry.kind && entry.kind !== type ? { kind: entry.kind } : {}), text: entry.text, ...place(entry.id, entry.box), ...ties(entry) };
    }),
  ];
  const connectors = [];
  for (const relation of snap.relations) {
    const base = { id: relation.id, from: relation.from, to: relation.to, ...(relation.label ? { label: relation.label } : {}) };
    if (relation.source === 'connector') connectors.push({ ...base, explicit: true });
    else if (relation.source === 'inferred') connectors.push({ ...base, explicit: false, kind: 'near',
      basis: `drawn ${shapes.get(relation.id)?.kind || 'line'}${relation.label ? ` "${relation.label.slice(0, 40)}"` : ''} (ends matched by position, confidence ${relation.confidence})` });
  }
  for (const entry of snap.objects) if (entry.labelOf) connectors.push({ id: `${entry.id}>${entry.labelOf}`, from: entry.id, to: entry.labelOf, explicit: false, kind: 'labels', basis: 'short text touching one shape (by position)' });
  // The canvas document (BlockNote-on-Canvas, board.doc, the live editor's blocks with unsaved text): one object, whether or not
  // Editor view shows it - hiding changes visibility, not what exists. Nothing when it holds no words.
  const words = docText(board.doc?.blocks);
  if (words) objects.push({ id: 'doc', type: 'document', text: words, label: words.split('\n')[0].replace(/^#+\s*/, ''), ...place('doc') });
  const inks = (board.strokes || []).map(stroke => unionBox((stroke.points || []).map(p => ({ x: p.x, y: p.y, w: 0, h: 0 })))).filter(Boolean);
  const area = unionBox([...objects.filter(placed), ...inks]), regions = new Map();
  for (const box of inks) { const region = regionIn(box, area); regions.set(region, [...(regions.get(region) || []), box]); }
  for (const [region, boxes] of regions) objects.push({ id: `ink:${region}`, type: 'ink', kind: 'strokes', text: '', label: plural(boxes.length, 'freehand stroke'), region, ...unionBox(boxes) });
  return { objects, connectors, groups: snap.groups.map(group => ({ id: group.id, label: group.title, member_ids: group.memberIds })) };
}

// Per-object excerpt caps (selected or attached, any other, a region's or group's representative), the label steps, and the
// server's caps (Toolbar answers a 400 past them); json keeps 1,000 under the server's 64,000, inventoryJson leaves the rest room.
// A file card's line in the canvas package: listed, with what an attached copy of it would give (canvas-file-imports.md 6).
const FILE_REASON = { listed: 'file: listed only, not extracted', extracted: 'file: extracted, read when attached', partial: 'file: partly extracted, when attached', unavailable: 'file: content unavailable' };
export const CANVAS = Object.freeze({ focus: 3000, other: 1200, spread: 300, minPassage: 40, labels: [80, 60, 40, 24], id: 120, excerpts: 200,
  explicit: 600, inferred: 600, coverage: 300, json: 63000, inventoryJson: 40000, document: 6000, passages: 20 });
const TYPE = /^[a-z][a-z0-9_-]{0,39}$/;
const REGIONS = [['top-left', 'top', 'top-right'], ['left', 'center', 'right'], ['bottom-left', 'bottom', 'bottom-right']];
const SEP = '\n…\n';
const PASSAGE = /[^\n]*?(?:[.!?](?=\s)|\n|$)/g; // a sentence or a line
const flat = text => String(text ?? '').replace(/\s+/g, ' ').trim();
const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const jsonSize = value => JSON.stringify(value).length + 1; // + the comma between list entries
const sum = (list, of) => list.reduce((total, entry) => total + of(entry), 0);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const placed = o => [o.x, o.y, o.w, o.h].every(Number.isFinite);
// A coarse 3x3 area of the board's box, from the object's centre.
const third = (at, start, length) => (length > 0 ? Math.min(2, Math.max(0, Math.floor(((at - start) / length) * 3))) : 1);
const regionIn = (box, area) => REGIONS[third(box.y + box.h / 2, area.y, area.h)][third(box.x + box.w / 2, area.x, area.w)];

// A text cut to `cap` chars: whole when it fits; else its opening passage, then the passages that share the most weighted
// terms, then the rest in order - as ascending [start, end) offsets into the text, joined by SEP.
function excerptOf(text, cap, weigh) {
  if (text.length <= cap) return { text, omitted: 0 };
  const spans = [];
  for (const match of text.matchAll(PASSAGE)) {
    const body = match[0].trim();
    if (body) { const start = match.index + match[0].length - match[0].trimStart().length; spans.push({ start, end: start + body.length, i: spans.length }); }
  }
  const scored = spans.slice(1).map(span => ({ span, score: weigh(text.slice(span.start, span.end)) })).filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.span.i - b.span.i).map(entry => entry.span);
  const picked = new Map();
  let room = cap;
  for (const span of [spans[0], ...scored, ...spans.slice(1)]) {
    if (picked.has(span.i)) continue;
    const length = Math.min(span.end - span.start, room - (picked.size ? SEP.length : 0));
    if (length < Math.min(CANVAS.minPassage, span.end - span.start)) { if (room < CANVAS.minPassage) break; continue; }
    picked.set(span.i, { start: span.start, end: span.start + length });
    room -= length + (picked.size > 1 ? SEP.length : 0);
  }
  // Passages a few blank characters apart read as one: no separator between them (never longer than the separator was).
  let passages = [];
  [...picked.values()].forEach((span, rank) => { span.rank = rank; });
  for (const span of [...picked.values()].sort((a, b) => a.start - b.start)) {
    const last = passages.at(-1);
    if (last && span.start - last.end <= SEP.length && !text.slice(last.end, span.start).trim()) { last.end = span.end; last.rank = Math.min(last.rank, span.rank); }
    else passages.push({ ...span });
  }
  // At most CANVAS.passages (the server's limit): the passages picked last go first; what they held counts as left out.
  if (passages.length > CANVAS.passages) passages = passages.sort((a, b) => a.rank - b.rank).slice(0, CANVAS.passages).sort((a, b) => a.start - b.start);
  passages = passages.map(({ start, end }) => ({ start, end }));
  return { text: passages.map(p => text.slice(p.start, p.end)).join(SEP), passages, omitted: text.length - sum(passages, p => p.end - p.start) };
}

// The canvas_context package (contract v1.1). Budget order: (1) the reserved whole-board share - every listed object's
// label, the group labels (groups are listed objects) and the stored links' labels; (2) the rest as bounded excerpts by
// relevance to the request and the recent turns; (3) the spread, one representative per region and group. Coverage says
// exactly what was listed, sent in full, sent in part, inspected, or left out - never more.
export function buildCanvasContext({ objects = [], connectors = [], groups = [], title = null, request = '', history = [], selection = [], attachments = [], budgetChars = 16000, maxItems = 300, reserveChars = 6000, includesUnsaved = true } = {}) {
  const budget = Math.max(0, Math.min(budgetChars, 16000)), reserve = Math.min(reserveChars, budget), cap = Math.max(0, Math.min(maxItems, CANVAS.coverage));
  // Every object once, in board order: the objects, the stored links, the groups.
  const entries = [], byId = new Map();
  const add = entry => { const id = String(entry.id ?? ''); if (id && !byId.has(id)) { byId.set(id, { ...entry, id, index: entries.length }); entries.push(byId.get(id)); } };
  for (const o of objects) add({ id: o.id, type: TYPE.test(o.type) ? o.type : 'card', kind: o.kind, text: String(o.text ?? ''), name: o.label,
    group: o.group_id == null ? null : String(o.group_id), section: o.section_id == null ? null : String(o.section_id),
    box: placed(o) ? { x: o.x, y: o.y, w: o.w, h: o.h } : null, region: REGIONS.flat().includes(o.region) ? o.region : null,
    media: !!o.media, inspected: !!(o.media && o.inspected), dark: o.type === 'ink' || !!o.unreadable || !!o.file, file: o.file || null });
  const links = connectors.filter(c => byId.has(String(c.from)) && byId.has(String(c.to)));
  for (const c of links) if (c.explicit) add({ id: c.id, type: 'connector', text: String(c.label ?? '') });
  for (const g of groups) add({ id: g.id, type: 'group', text: String(g.label ?? ''), members: true });
  for (const e of entries) if (e.members) e.box = unionBox(entries.filter(m => m.group === e.id).map(m => m.box));
  const board = unionBox(entries.map(e => e.box));
  for (const e of entries) if (e.box && board && !e.region) e.region = regionIn(e.box, board); // ink comes with the region it was gathered by

  // Relevance: the request's terms (weight 1) and the recent turns' (0.5), ids cited in earlier turns, then a share of the
  // best related object's score - along any connection, and among group and section mates. Board order breaks ties.
  // ponytail: plain term overlap (terms() above); add a small embedding if the canvas fixtures show a miss.
  const weights = new Map();
  for (const turn of history.slice(-6)) for (const word of terms(turn?.text)) weights.set(word, 0.5);
  for (const word of terms(request)) weights.set(word, 1);
  const weigh = text => { let score = 0; for (const word of terms(text)) score += weights.get(word) || 0; return score; };
  const cited = new Set(history.flatMap(turn => turn?.refs || []).map(String));
  const selected = new Set(selection.map(String)), attached = new Set(attachments.map(String)), focus = new Set([...selected, ...attached]);
  for (const e of entries) if (e.group && focus.has(e.group)) focus.add(e.id); // a selected or attached group brings its members
  const keysOf = e => [e.members ? `g ${e.id}` : e.group && `g ${e.group}`, e.section && `s ${e.section}`].filter(Boolean);
  const around = new Map(), mates = new Map();
  const join = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  for (const c of links) { join(around, String(c.from), byId.get(String(c.to))); join(around, String(c.to), byId.get(String(c.from))); }
  for (const e of entries) for (const key of keysOf(e)) join(mates, key, e);
  for (const e of entries) e.base = weigh(`${e.name || ''} ${e.text}`) + (cited.has(e.id) ? 2 : 0);
  // ponytail: mates are scanned per member, O(group size^2) - 400 objects in one group is 160k steps; keep a per-group top-2 if that grows.
  for (const e of entries) {
    const linked = around.get(e.id) || [], together = keysOf(e).flatMap(key => mates.get(key)).filter(m => m !== e);
    const best = list => Math.max(0, ...list.map(m => m.base));
    e.score = e.base + 0.5 * best(linked) + 0.3 * best(together) + (focus.has(e.id) ? 3 : [...linked, ...together].some(m => focus.has(m.id)) ? 2 : 0);
  }
  const byScore = (a, b) => b.score - a.score || a.index - b.index;
  const tier = e => (selected.has(e.id) ? 0 : attached.has(e.id) ? 1 : e.type === 'heading' || e.type === 'document' ? 2 : e.members ? 3 : 4);

  // (1) The reserved share: labels shorten (80, 60, 40, 24) before any object goes; past that, or past the item cap, the
  // lowest-ranked objects go and are recorded as omitted (cap). Stored-link labels take at most a quarter of the reserve.
  const nameOf = e => flat(String(String(e.name ?? '').trim() ? e.name : e.text).slice(0, 400));
  const itemOf = (e, max) => ({ id: e.id, type: e.type, ...(e.kind && e.kind !== e.type ? { kind: String(e.kind).slice(0, 40) } : {}), label: shorten(nameOf(e), max),
    ...(e.group && e.group.length <= CANVAS.id ? { group_id: e.group } : {}), ...(e.region ? { region: e.region } : {}) });
  const fits = id => id.length <= CANVAS.id;
  const stored = links.filter(c => c.explicit && fits(String(c.from)) && fits(String(c.to)));
  const linkRoomAt = max => Math.min(Math.floor(reserve / 4), sum(stored, c => shorten(flat(c.label), max).length));
  let listed = entries.filter(e => fits(e.id)).sort((a, b) => tier(a) - tier(b) || byScore(a, b)).slice(0, cap), max = CANVAS.labels[0], items = [];
  for (max of CANVAS.labels) {
    items = listed.map(e => itemOf(e, max));
    if (sum(items, item => item.label.length) + linkRoomAt(max) <= reserve && sum(items, jsonSize) <= CANVAS.inventoryJson) break;
  }
  const linkRoom = linkRoomAt(max);
  let labelChars = sum(items, item => item.label.length), inventoryJson = sum(items, jsonSize);
  while (items.length && (labelChars + linkRoom > reserve || inventoryJson > CANVAS.inventoryJson)) { const gone = items.pop(); labelChars -= gone.label.length; inventoryJson -= jsonSize(gone); }
  listed = listed.slice(0, items.length);
  const listedIds = new Set(listed.map(e => e.id));
  // 'full' without an excerpt only when the label sent IS the whole text, untrimmed, after any shortening.
  const held = e => !!e.text.trim() && e.text === shorten(nameOf(e), max);

  // (2)+(3) The rest of the budget as excerpts, each bounded (CANVAS.focus for the selection and attachments, CANVAS.other
  // else) and cut to its most relevant passages. Three rounds: the selection and attachments (at most half), one
  // representative for each region and group none of whose objects has an excerpt yet (at most a quarter more), then every
  // object by relevance - a later round may extend an earlier excerpt up to its cap.
  const jsonRoom = CANVAS.json - inventoryJson - 4000; // 4000: the package's other fields
  const cuts = new Map();
  let spent = 0, excerptJson = 0;
  // The canvas document has its own share, taken before the other objects' excerpts and after the reserve: at most
  // CANVAS.document characters and half of what the reserve leaves, its opening plus the passages that share the request's
  // terms when it is longer. The rest of the canvas keeps the other half and its whole reserve, however long the document.
  const doc = listed.find(e => e.type === 'document' && e.text.trim() && !held(e));
  let docChars = 0;
  if (doc) {
    const cut = excerptOf(doc.text, Math.min(CANVAS.document, Math.floor((budget - labelChars - linkRoom) / 2)), weigh);
    if (cut.text) { docChars = cut.text.length; excerptJson = JSON.stringify(cut.text).length + JSON.stringify(cut.passages || []).length + 300; cuts.set(doc.id, { ...cut, json: excerptJson }); }
  }
  const room = budget - labelChars - linkRoom - docChars;
  const candidates = listed.filter(e => e !== doc && !e.media && !e.dark && e.text.trim() && !held(e)).sort(byScore);
  const give = (e, most, ceiling) => {
    const had = cuts.get(e.id), size = had ? had.text.length : 0, allowed = Math.min(most, size + ceiling - spent);
    if ((had && !had.omitted) || allowed <= size || allowed < Math.min(CANVAS.minPassage, e.text.length) || (!had && cuts.size >= CANVAS.excerpts)) return;
    const cut = excerptOf(e.text, allowed, weigh), json = JSON.stringify(cut.text).length + JSON.stringify(cut.passages || []).length + 300;
    if (excerptJson - (had?.json || 0) + json > jsonRoom) return;
    spent += cut.text.length - size; excerptJson += json - (had?.json || 0); cuts.set(e.id, { ...cut, json });
  };
  for (const e of candidates) if (focus.has(e.id)) give(e, CANVAS.focus, room / 2);
  const spread = new Map();
  for (const e of candidates) for (const key of [e.region && `r ${e.region}`, e.group && `g ${e.group}`]) if (key) join(spread, key, e);
  const spreadCeiling = spent + room / 4;
  for (const list of spread.values()) if (!list.some(e => cuts.has(e.id))) give(list[0], CANVAS.spread, spreadCeiling);
  for (const e of candidates) give(e, focus.has(e.id) ? CANVAS.focus : CANVAS.other, room);

  const statusOf = e => {
    if (!fits(e.id)) return { status: 'unavailable', reason: 'unreadable', hidden: true }; // an id the server cannot take
    if (!listedIds.has(e.id)) return { status: 'omitted', reason: 'cap' };
    if (e.media) return e.inspected ? { status: 'media' } : { status: 'unavailable', reason: 'media' };
    if (e.file) return { status: 'listed', reason: FILE_REASON[e.file] || FILE_REASON.listed };
    if (e.dark) return { status: 'unavailable', reason: 'unreadable' };
    const cut = cuts.get(e.id);
    if (cut) return cut.omitted ? { status: 'partial', reason: 'budget', omitted_chars: cut.omitted } : { status: 'full' };
    if (!e.text.trim()) return { status: 'listed' };
    return held(e) ? { status: 'full' } : { status: 'listed', reason: 'budget', omitted_chars: e.text.length };
  };
  const statuses = entries.map(e => ({ e, ...statusOf(e) }));
  const count = test => statuses.filter(test).length;
  const total = entries.length, full = count(s => s.status === 'full'), partial = count(s => s.status === 'partial');
  const byType = list => Object.entries(list.reduce((tally, s) => ({ ...tally, [s.e.type]: (tally[s.e.type] || 0) + 1 }), {})).map(([type, n]) => plural(n, type)).join(', ');
  const inspected = statuses.filter(s => s.status === 'media'), unseen = statuses.filter(s => s.reason === 'media');
  const capped = count(s => s.status === 'omitted'), ink = count(s => s.status === 'unavailable' && s.e.type === 'ink');
  const unavailable = count(s => s.status === 'unavailable' && s.reason !== 'media' && s.e.type !== 'ink');
  const docCut = doc && cuts.get(doc.id);
  const docLine = docCut ? (docCut.omitted ? `document partial: ${docCut.text.length} of ${doc.text.length} characters` : 'document in full') : null;
  const summary = [listed.length === total ? `${plural(total, 'object')} listed` : `${listed.length} of ${total} objects listed`, `${full} included in full, ${partial} partially`,
    ...(docLine ? [docLine] : []),
    ...(inspected.length ? [`${byType(inspected)} inspected`] : []), ...(unseen.length ? [`${byType(unseen)} not inspected`] : []),
    ...(ink ? [`freehand ink in ${plural(ink, 'area')} not described`] : []),
    ...(capped ? [`${capped} omitted for space`] : []), ...(unavailable ? [`${unavailable} unavailable`] : [])].join('; ').slice(0, 200);

  const counts = {};
  for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
  const reasonOf = e => (focus.has(e.id) ? 'relevant' : cited.has(e.id) ? 'recent' : e.score > 0 ? 'relevant' : 'structural');
  const excerpts = entries.filter(e => cuts.has(e.id)).map(e => {
    const cut = cuts.get(e.id);
    return { id: e.id, type: e.type, text: cut.text, reason: reasonOf(e), inclusion: cut.omitted ? 'partial' : 'full', omitted_chars: cut.omitted, ...(cut.omitted ? { passages: cut.passages } : {}) };
  });
  // Relations with at least one listed end, the most relevant first: stored links, then what the picture suggests (drawn
  // arrows, labels, and the smallest closed shape whose box holds another object's box).
  const shown = c => fits(String(c.from)) && fits(String(c.to)) && (listedIds.has(String(c.from)) || listedIds.has(String(c.to)));
  const ranked = list => list.filter(shown).sort((a, b) => Math.max(byId.get(String(b.from)).score, byId.get(String(b.to)).score) - Math.max(byId.get(String(a.from)).score, byId.get(String(a.to)).score));
  const drawn = links.filter(c => !c.explicit).map(c => ({ from: String(c.from), to: String(c.to), kind: c.kind === 'labels' ? 'labels' : 'near', basis: shorten(String(c.basis || 'drawn on the canvas (by position)'), 120) }));
  const paired = new Set(drawn.flatMap(r => [`${r.from}>${r.to}`, `${r.to}>${r.from}`]));
  const areaOf = box => box.w * box.h;
  // ponytail: every object against every closed shape, O(objects x shapes); bucket the boxes if boards grow past a few thousand.
  const closed = entries.filter(e => e.type === 'shape' && e.box);
  for (const e of entries) {
    if (!e.box || e.members || e.type === 'connector') continue;
    const holder = closed.filter(s => s !== e && s.box.x <= e.box.x && s.box.y <= e.box.y && s.box.x + s.box.w >= e.box.x + e.box.w && s.box.y + s.box.h >= e.box.y + e.box.h && areaOf(s.box) > areaOf(e.box))
      .sort((a, b) => areaOf(a.box) - areaOf(b.box))[0];
    if (holder && !paired.has(`${holder.id}>${e.id}`)) drawn.push({ from: holder.id, to: e.id, kind: 'contains', basis: "inside the shape's box (by position)" });
  }

  const pack = {
    version: 1, built_at: new Date().toISOString(), includes_unsaved: !!includesUnsaved, title: title == null ? null : String(title).slice(0, 200),
    inventory: { counts, items: entries.filter(e => listedIds.has(e.id)).map(e => itemOf(e, max)), omitted_items: total - listed.length },
    excerpts,
    relations: { explicit: [], inferred: [] },
    coverage: { objects_total: total, listed: listed.length, included_full: full, included_partial: partial, media_inspected: inspected.length,
      unavailable_or_omitted: count(s => s.status === 'unavailable' || s.status === 'omitted'), items: [], reserved_chars: 0, budget_chars: budget, used_chars: 0, summary },
  };
  // What is left of the JSON cap, in this order: stored links (at most half of it), coverage.items (what was left out
  // first), drawn relations. The counts above stay exact whatever these lists had to drop.
  let left = CANVAS.json - JSON.stringify(pack).length - 40; // 40: the char counts filled in below
  const fill = (list, from, most, share = left) => {
    const floor = left - share;
    for (const entry of from) { if (list.length >= most || left - jsonSize(entry) < floor) break; list.push(entry); left -= jsonSize(entry); }
  };
  let linkChars = 0;
  fill(pack.relations.explicit, ranked(stored).map(c => {
    const label = shorten(flat(c.label), max), keep = label && linkChars + label.length <= linkRoom;
    if (keep) linkChars += label.length;
    return { from: String(c.from), to: String(c.to), ...(keep ? { label } : {}) };
  }), CANVAS.explicit, left / 2);
  const ORDER = { omitted: 0, unavailable: 1, partial: 2, unsent: 3, media: 4, full: 5, listed: 6 };
  const slot = s => ORDER[s.status === 'listed' && s.reason ? 'unsent' : s.status];
  fill(pack.coverage.items, statuses.filter(s => !s.hidden).sort((a, b) => slot(a) - slot(b) || a.e.index - b.e.index)
    .map(({ e, status, reason, omitted_chars }) => ({ id: e.id, type: e.type, status, ...(reason ? { reason } : {}), ...(omitted_chars ? { omitted_chars } : {}) })), CANVAS.coverage);
  fill(pack.relations.inferred, ranked(drawn), CANVAS.inferred);
  const keptLinks = sum(pack.relations.explicit, r => (r.label || '').length);
  pack.coverage.reserved_chars = labelChars + keptLinks;
  pack.coverage.used_chars = labelChars + keptLinks + docChars + spent;
  return pack;
}

// The context of a creation (owner brief 2026-10-13, creation §4): no target, an insertion anchor. The same builder and
// the same relevance, seeded from the region around the anchor instead of a selection: what is drawn there and the
// diagram it belongs to, the heading or section the anchor sits under, and anything that shares the request's terms,
// however far. Subject only: the region's look (style) travels apart, from the editor (inline-placement.js regionStyle).
// The canvas title stays metadata, and the request decides the topic: on a blank canvas the context is the request.
export function buildCreationContext(board, anchor, { cache, boardKey, describeCard = null, request = '', extras = {}, style = null, limits = LIMITS } = {}) {
  const look = cache.lookups(board, boardKey, describeCard);
  const boxes = board.boxes || {};
  const snapshot = cache.semantic(board);
  const omitted = { ...Object.fromEntries(RELATIONS.map(relation => [relation, 0])), truncated: 0, connections: 0 };
  let chars = 0, objects = 0;
  const related = [];
  for (const { id, relation, score, extra } of relevant(snapshot, board, look, [], { request, boxes, limits, anchor })) {
    const entity = look.entities.get(id);
    if (!entity) continue;
    const record = entity.list === 'blocks' ? { ...look.record(id), text: cardText(entity.entity) } : look.record(id);
    if (!record) continue;
    if (objects >= limits.objects || chars >= limits.total) { omitted[relation] = (omitted[relation] || 0) + 1; continue; }
    const words = clip(record.text, Math.min(limits.chars, limits.total - chars));
    if (words.truncated) omitted.truncated += 1;
    objects += 1; chars += words.text.length;
    related.push({ ...record, text: words.text, ...(words.truncated ? { truncated: true } : {}), relation, score: Math.round(score * 100) / 100, at: round(boxes[id]), ...extra });
  }
  const included = new Set(related.map(entry => entry.id));
  const relations = snapshot.relations.filter(relation => included.has(relation.from) && included.has(relation.to)).map(relation => ({
    from: relation.from, to: relation.to, ...(relation.label ? { label: relation.label.slice(0, limits.chars) } : {}), directed: relation.directed, source: relation.source,
    ...(relation.source === 'inferred' ? { confidence: relation.confidence, ...(relation.confidence < 0.7 ? { uncertain: true } : {}) } : {}),
  }));
  const metadata = { ...(extras.title ? { canvasTitle: String(extras.title).slice(0, 200) } : {}), ...(extras.goal ? { learningGoal: String(extras.goal).slice(0, 300) } : {}) };
  const counts = { target: 0, ...Object.fromEntries(RELATIONS.map(relation => [relation, related.filter(entry => entry.relation === relation).length])) };
  const context = {
    version: CONTEXT_VERSION, creation: true, anchor: { x: Math.round(anchor.x), y: Math.round(anchor.y) },
    target: { ids: [], gone: [], objects: [] }, connections: [], related, relations, complete: {}, metadata,
    ...(style ? { style } : {}),
    selectionOnly: false, omitted, counts, considered: snapshot.cards.length + snapshot.objects.length, size: { objects, chars },
  };
  return { ...context, prints: { target: hash(JSON.stringify(['creation', context.anchor])), relations: hash('[]'), context: supportPrint(context) } };
}

// The validator's compact view of a creation (inline-ai-decide.js summaryOf reads `region`): the subject material around
// the anchor, then its look - never the context package itself. At most 1,500 characters.
export function regionSummary(context) {
  const subject = context.related.slice(0, 12).map(entry => `${entry.type}${entry.kind ? `:${entry.kind}` : ''} "${String(entry.text).replace(/\s+/g, ' ').slice(0, 80)}"`).join('; ');
  const look = context.style ? `style: ${['kind', 'color', 'fill', 'font', 'fontSize', 'route'].map(key => `${key} ${context.style[key] ?? 'none'}`).join(', ')}` : '';
  return [subject ? `near the insertion point: ${subject}` : 'the insertion point is on empty canvas', context.metadata.canvasTitle ? `canvas title (may be outdated): ${context.metadata.canvasTitle}` : '', look].filter(Boolean).join(' | ').slice(0, 1500);
}
