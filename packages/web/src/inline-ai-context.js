// The inline AI editor's context (docs/features/inline-ai-editor.md §3-§5, A1): what one Ctrl/Cmd+K request may show
// the model, built locally from the live canvas - never from the last saved copy - and never sent anywhere by itself.
// Pure apart from the injected describeCard(), so the node tests run it without a browser.
//
// A board here is { shapes, items, links, blocks, groups, exchanges, boxes } - the canvas's live lists plus a layout map
// (id -> { x, y, w, h } in world units) the canvas measures. Content and layout stay apart (A1): a content record says
// what an object is and says; where it is comes from `boxes` on each build, so a move never rebuilds a description.

export const CONTEXT_VERSION = 'inline-context-1';
export const LIMITS = Object.freeze({ objects: 24, targetChars: 4000, chars: 400, total: 8000, nearby: 3, nearbyGap: 60, touch: 14, rangeAround: 200, connections: 40 });
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
  const stats = { hits: 0, misses: 0, resets: 0 };
  const reset = () => { key = null; lists = {}; entities = new Map(); byEnd = new Map(); links = new Map(); members = new Map(); records.clear(); stats.resets += 1; };
  return {
    stats,
    reset,
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
const near = (point, box, slack) => point.x >= box.x - slack && point.x <= box.x + box.w + slack && point.y >= box.y - slack && point.y <= box.y + box.h + slack;
const round = box => box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };

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
export function buildContext(board, target, { cache, boardKey, describeCard = null, selectionOnly = false, extras = {}, limits = LIMITS } = {}) {
  const look = cache.lookups(board, boardKey, describeCard);
  const boxes = board.boxes || {};
  const omitted = { connected: 0, sibling: 0, inferred: 0, group: 0, annotation: 0, nearby: 0, truncated: 0, connections: 0 };
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
  const targetBox = unionBox(present.map(id => boxes[id]));
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
    // 4. Drawn arrows touching the target: what the picture suggests, not a stored connection.
    if (targetBox) for (const shape of board.shapes || []) {
      if (!LINEAR.has(shape.kind) || present.includes(shape.id)) continue;
      const ends = [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }];
      const touching = present.filter(id => boxes[id] && ends.some(end => near(end, boxes[id], limits.touch)));
      if (!touching.length) continue;
      const far = ends.find(end => !touching.some(id => near(end, boxes[id], limits.touch)));
      const otherId = far && Object.keys(boxes).find(id => !present.includes(id) && id !== shape.id && look.entities.has(id) && near(far, boxes[id], limits.touch));
      const entry = take(look.record(shape.id), 'inferred', { touches: touching, ...(otherId ? { leadsTo: otherId } : {}), note: 'A drawn arrow or line touching the selection: its meaning is inferred from the picture, not a stored connection.' });
      if (entry) related.push(entry);
      if (otherId) { const end = take(look.record(otherId), 'inferred', { via: shape.id }); if (end) related.push(end); }
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
  // 6. Earlier inline explanations about the target, and 7. labels right beside it (only those within nearbyGap).
  if (!selectionOnly && targetBox) {
    for (const shape of board.shapes || []) {
      if (seen.has(shape.id) || !shape.inline?.sources?.some(id => present.includes(id))) continue;
      const entry = take(look.record(shape.id), 'annotation', { note: 'An earlier explanation added beside the selection; not part of the diagram.' });
      if (entry) related.push(entry);
    }
    const candidates = [];
    for (const [id, box] of Object.entries(boxes)) {
      if (seen.has(id) || present.includes(id) || !look.entities.has(id)) continue;
      const record = look.record(id);
      if (!record?.text.trim() || record.type === 'line') continue;
      const gap = gapBetween(targetBox, box);
      if (gap <= limits.nearbyGap) candidates.push({ record, gap });
    }
    candidates.sort((a, b) => a.gap - b.gap);
    candidates.slice(limits.nearby).forEach(() => { omitted.nearby += 1; });
    for (const { record, gap } of candidates.slice(0, limits.nearby)) {
      const entry = take(record, 'nearby', { gap: Math.round(gap), note: 'Only near the selection on the canvas; no stored connection.' });
      if (entry) related.push(entry);
    }
  }
  // 8. The canvas's own title and learning goal, and a short excerpt of a chat linked to the target.
  const conversation = selectionOnly ? '' : (board.exchanges || []).filter(exchange => present.includes(exchange.linkFrom))
    .map(exchange => `Q: ${exchange.question || ''}\nA: ${exchange.answer || ''}`).join('\n\n');
  const broader = {
    ...(extras.title ? { title: String(extras.title).slice(0, 200) } : {}),
    ...(extras.goal ? { goal: String(extras.goal).slice(0, 300) } : {}),
    ...(conversation ? { conversation: clip(conversation, 600).text } : {}),
  };
  const image = targets.find(entry => entry.flattened);
  const imageEntity = image && look.entities.get(image.id)?.entity;
  const counts = { target: targets.length, ...Object.fromEntries(['connected', 'sibling', 'inferred', 'group', 'annotation', 'nearby'].map(relation => [relation, related.filter(entry => entry.relation === relation).length])) };
  return {
    version: CONTEXT_VERSION,
    target: { ids: present, gone, ...(target.range ? { range: true } : {}), objects: targets, ...(group ? { group } : {}) },
    connections, related, complete,
    broader,
    ...(image ? { image: { id: image.id, ...(imageEntity?.mediaId ? { mediaId: imageEntity.mediaId } : {}) } } : {}),
    selectionOnly: !!selectionOnly,
    omitted, counts,
    size: { objects, chars },
    prints: fingerprints(look, target),
  };
}

// Every target the model did not read whole - cut short, or left out by the object or character budget. For the frozen
// target only (Accept refuses a whole replace on these); never sent: a large selection would only grow the request.
export const clippedOf = context => context.target.ids.filter(id => !context.target.objects.some(entry => entry.id === id && !entry.truncated));

// The compact, content-free shape of a context for telemetry (A3/A5): counts only.
export const contextShape = context => ({ objects: context.size.objects, chars: context.size.chars, counts: context.counts,
  omitted: Object.values(context.omitted).reduce((sum, n) => sum + n, 0), selectionOnly: context.selectionOnly });
