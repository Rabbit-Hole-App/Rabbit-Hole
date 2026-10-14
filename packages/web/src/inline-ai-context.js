// The inline AI editor's context (docs/features/inline-ai-editor.md §3-§5, A1): what one Ctrl/Cmd+K request may show
// the model, built locally from the live canvas - never from the last saved copy - and never sent anywhere by itself.
// Pure apart from the injected describeCard(), so the node tests run it without a browser.
//
// A board here is { shapes, items, links, blocks, groups, exchanges, boxes } - the canvas's live lists plus a layout map
// (id -> { x, y, w, h } in world units) the canvas measures. Content and layout stay apart (A1): a content record says
// what an object is and says; where it is comes from `boxes` on each build, so a move never rebuilds a description.

import { cardText, semanticSnapshot } from './canvas-semantics.js';

export const CONTEXT_VERSION = 'inline-context-2';
// relevant: the score a supporting object needs (structure, grouping, section, reading order, shared terms - never
// closeness alone); hops: how far along the diagram's relations; flowGap: the gap between two text boxes read in order.
export const LIMITS = Object.freeze({ objects: 24, targetChars: 4000, chars: 400, total: 8000, rangeAround: 200, connections: 40, relevant: 0.35, hops: 3, flowGap: 48 });
// What a move changes and a description never reads.
const LAYOUT = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'w', 'h', 'fresh']);
const LINEAR = new Set(['line', 'arrow', 'curve', 'elbow']);

// FNV-1a, 32-bit: a fingerprint, not a secret.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const clip = (text, max) => (text.length > max ? { text: `${text.slice(0, max)}…`, truncated: true } : { text, truncated: false });
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
export const RELATIONS = ['connected', 'sibling', 'diagram', 'inferred', 'group', 'heading', 'label', 'flow', 'discussion', 'mentions', 'annotation'];
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
export function relevant(snapshot, board, look, present, { request = '', boxes = {}, limits = LIMITS } = {}) {
  const entries = new Map([...snapshot.cards, ...snapshot.objects].map(entry => [entry.id, entry]));
  const boxOf = id => boxes[id] || entries.get(id)?.box || null;
  const targetBox = unionBox(present.map(boxOf));
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
    const base = link ? { id, type: 'connection', text: String(link.label || ''), native: true, from: link.from, to: link.to } : look.record(id);
    const taken = take(base, 'target', {}, limits.targetChars);
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
  const metadata = {
    ...(extras.title ? { canvasTitle: String(extras.title).slice(0, 200) } : {}),
    ...(extras.goal ? { learningGoal: String(extras.goal).slice(0, 300) } : {}),
  };
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

// ---------- Whole-canvas context for every canvas-chat turn (agent-coordination/tasks/2026-10-14-whole-canvas-context-OWNER.md) ----------
// STUB (Lane A lead): the signature and the package shape are fixed; A-core replaces both bodies with the budget policy of
// contract v1.1. A-wire codes against these exports.

// The live board ({ shapes, items, links, blocks, groups, exchanges, boxes }, unsaved editor words already overlaid) as the
// builder's inputs: objects { id, type, kind?, text?, label?, x, y, w, h, group_id? }, connectors { id, from, to, label?,
// explicit }, groups { id, label, member_ids }.
export function boardObjects(board) {
  const boxes = board.boxes || {};
  const at = id => boxes[id] || { x: 0, y: 0, w: 0, h: 0 };
  const objects = [
    ...(board.blocks || []).map(block => ({ id: block.id, type: 'card', kind: block.type, text: String(block.title ?? block.question ?? ''), ...at(block.id), ...(block.groupId ? { group_id: block.groupId } : {}) })),
    ...(board.items || []).map(item => ({ id: item.id, type: item.kind === 'equation' ? 'equation' : 'text', kind: item.kind, text: String(item.latex ?? item.text ?? ''), ...at(item.id), ...(item.groupId ? { group_id: item.groupId } : {}) })),
    ...(board.shapes || []).map(shape => ({ id: shape.id, type: 'shape', kind: shape.kind, text: String(shape.text ?? ''), ...at(shape.id), ...(shape.groupId ? { group_id: shape.groupId } : {}) })),
  ];
  const connectors = (board.links || []).map(link => ({ id: link.id, from: link.from, to: link.to, ...(link.label ? { label: String(link.label) } : {}), explicit: true }));
  const groups = (board.groups || []).map(group => ({ id: group.id, label: String(group.label ?? group.title ?? ''), member_ids: objects.filter(o => o.group_id === group.id).map(o => o.id) }));
  return { objects, connectors, groups };
}

export function buildCanvasContext({ objects = [], connectors = [], groups = [], title = null, request = '', history = [], selection = [], attachments = [], budgetChars = 16000, maxItems = 300, includesUnsaved = true } = {}) {
  void request; void history; void selection; void attachments;
  const items = objects.slice(0, maxItems).map(o => ({ id: o.id, type: o.type, ...(o.kind ? { kind: o.kind } : {}), label: String(o.label ?? o.text ?? '').slice(0, 80), ...(o.group_id ? { group_id: o.group_id } : {}) }));
  const counts = {};
  for (const o of objects) counts[o.type] = (counts[o.type] || 0) + 1;
  const used = items.reduce((sum, item) => sum + item.label.length, 0);
  return {
    version: 1, built_at: new Date().toISOString(), includes_unsaved: !!includesUnsaved, title: title == null ? null : String(title).slice(0, 200),
    inventory: { counts, items, omitted_items: Math.max(0, objects.length - items.length) },
    excerpts: [],
    relations: { explicit: connectors.filter(c => c.explicit).map(c => ({ from: c.from, to: c.to, ...(c.label ? { label: c.label.slice(0, 80) } : {}) })), inferred: [] },
    coverage: { objects_total: objects.length, listed: items.length, included_full: 0, included_partial: 0, media_inspected: 0, unavailable_or_omitted: objects.length - items.length,
      items: items.map(item => ({ id: item.id, type: item.type, status: 'listed' })), reserved_chars: used, budget_chars: budgetChars, used_chars: used,
      summary: `${items.length} objects listed (stub)` },
  };
}
