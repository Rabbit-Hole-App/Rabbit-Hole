// /dive (docs/features/dive-v1.md): nested Rabbit Holes. Pure: storage is passed in, so the rules
// are tested without a browser. A hole is a canvas; the card it was entered from is its portal.
// An empty hole lives only in this tab (sessionStorage) until its first canvas object, then
// POST /api/canvases/dives persists its canvas row and its link together (control-plane dives.js).

const PENDING = 'small.dive.pending';
const RETURN = 'small.dive.return';

// Same shape as the server's canvas slugs, so the hole's local keys never move when it persists.
export const newHoleName = () => `canvas-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

// A level's URL: a canvas, or a repository project's Learn tab; a named board rides ?board=. A shared canvas a hole
// was started from (docs/features/shared-canvas-rabbit-hole.md) is its share link, view only.
export function levelHref({ app, board = 'main', href = null }) {
  if (href) return href;
  const query = new URLSearchParams(app.startsWith('repo-') ? { tab: 'learn' } : {});
  if (board !== 'main') query.set('board', board);
  const search = query.toString();
  return `/apps/${app}${search ? `?${search}` : ''}`;
}
// The pending hole's URL: its parent's, plus ?hole=.
export function holeHref(parent, name) {
  const [path, search = ''] = levelHref(parent).split('?');
  const query = new URLSearchParams(search);
  query.set('hole', name);
  return `${path}?${query}`;
}

// Every object on a canvas, as AdaptiveCanvas reports it in `content`: cards (images, equations and code are cards),
// chat cards placed on the canvas, pen strokes, shapes, text, sticky notes and asked-about areas. Chat that stays in
// the dock's sheet is not on the canvas, so it counts for nothing.
export const canvasObjects = ({ blocks = [], exchanges = [], strokes = [], shapes = [], items = [], areas = [] } = {}) =>
  blocks.length + exchanges.length + strokes.length + shapes.length + items.length + areas.length;
// One rule for a pending hole (owner r29): its empty hint shows, and leaving it discards the hole, only while this is
// false. The first canvas object of any kind hides the hint and keeps the hole.
export const meaningful = state => (state?.content || 0) > 0;



const read = (storage, key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
const write = (storage, key, value) => { try { value == null ? storage.removeItem(key) : storage.setItem(key, JSON.stringify(value)); } catch { /* blocked storage: the hole lasts this page only */ } };

export const pendingHoles = storage => read(storage, PENDING) || {};
export const pendingHole = (storage, name) => pendingHoles(storage)[name] || null;
export function keepPending(storage, hole) { write(storage, PENDING, { ...pendingHoles(storage), [hole.name]: hole }); }
export function dropPending(storage, name) {
  const { [name]: _, ...rest } = pendingHoles(storage);
  write(storage, PENDING, Object.keys(rest).length ? rest : null);
}
// An abandoned hole leaves nothing: its pending record, and every local key Learn wrote for it.
export function discardHole({ session, local, base, name }) {
  dropPending(session, name);
  try { for (const key of Object.keys(local)) if (key === base || key.startsWith(`${base}:`)) local.removeItem(key); } catch { /* nothing kept */ }
}

// Where to land when climbing back: the parent reads it once, on its next mount.
export const setReturn = (storage, point) => write(storage, RETURN, point);
export function takeReturn(storage, { app, board }) {
  const point = read(storage, RETURN);
  if (!point || point.app !== app || point.board !== board) return null;
  write(storage, RETURN, null);
  return point;
}

// The Rabbit Holes Map's dragged spot: its top-left in the canvas frame, one per viewer on this device for every canvas,
// owned or shared, so the map stays where the learner put it while they move between holes. null is the gutter.
const MAP_SPOT = 'small.dive.mapSpot';
export const mapSpot = storage => { const spot = read(storage, MAP_SPOT); return Number.isFinite(spot?.x) && Number.isFinite(spot?.y) ? { x: spot.x, y: spot.y } : null; };
export const keepMapSpot = (storage, spot) => write(storage, MAP_SPOT, spot);
// Kept fully inside the frame; a frame smaller than the map pins it to the top-left corner. The canvas's floating bottom
// strip (minimap, zoom row, composer, hooks: `chrome`, boxes in frame px) is a floor under the map's span, MAP_GAP above
// the highest one there, so the map never slides under it and its grip stays reachable (r29 gate, 2026-10-08).
export const MAP_GAP = 8;
export const clampSpot = ({ x, y }, frame, map, chrome = []) => {
  const left = Math.round(Math.min(Math.max(0, x), Math.max(0, frame.w - map.w)));
  const floor = Math.min(frame.h, ...chrome.filter(box => box.left < left + map.w && box.right > left).map(box => box.top - MAP_GAP));
  return { x: left, y: Math.round(Math.min(Math.max(0, y), Math.max(0, floor - map.h))) };
};

// A topic anchor's display title from the learner's own words: "explain softmax" -> "Softmax".
// The raw request is kept on the card beside it.
const LEAD = /^(?:please\s+)?(?:explain|describe|define|what(?:'s| is| are)|how (?:does|do|is|are)|why (?:does|do|is|are)|tell me about|teach me(?: about)?|go deeper (?:into|on)|dive into|learn about|understand|show me|about)\s+/i;
export function anchorTitle(request) {
  const topic = String(request).trim().replace(LEAD, '').replace(/[?.!\s]+$/, '').replace(/^(?:the|a|an)\s+/i, '').slice(0, 60).trim();
  return topic ? topic[0].toUpperCase() + topic.slice(1) : '';
}
// The card a topic dive creates on the current canvas: an ordinary explanation block holding the
// request, marked as a dive anchor. Never a generated lesson.
// Its body is the request only when that adds to the title: never "Softmax" twice.
const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const anchorBlock = request => {
  const text = String(request).trim(), title = anchorTitle(text);
  return { type: 'explanation', title, ...(same(text, title) ? {} : { body: text[0].toUpperCase() + text.slice(1) }), anchor: { request: text } };
};

// A hole's title: the topic in the learner's words ("explain softmax" -> Softmax), else the card's title.
export const diveTopic = (args, card) => (anchorTitle(args || '') || String(card?.title || '').trim()).slice(0, 120) || 'Untitled hole';

// What a dive request does. Every hole has exactly one originating card, never a duplicate child:
//   { enter }   the card already has a persisted hole
//   { resume }  the card already has a pending hole in this tab
//   { create }  a new pending hole from the selected card
//   { anchor }  no card selected: a topic anchor card is made on this canvas and becomes the origin;
//               the topic is the argument, or else the conversation's last question
//   { ask }     no card, no argument, no referent: ask what to go deeper into
export function planDive({ card, args = '', children = [], pending = {}, parent, referent = '' }) {
  if (!card) {
    const request = args.trim() || String(referent || '').trim();
    return request && anchorTitle(request) ? { anchor: { request, title: anchorTitle(request) } } : { ask: true };
  }
  const child = children.find(entry => entry.origin_block_id === card.id);
  if (child) return { enter: child.name };
  const open = Object.values(pending).find(hole => hole.parent.app === parent.app && hole.parent.board === parent.board && hole.origin_block_id === card.id);
  if (open) return { resume: open.name };
  return { create: { title: diveTopic(args, card) } };
}

// The Dive record (docs/features/tutor-v1-locked-decisions.md §6) for a new hole. `target` is
// learn-target.js resolveTarget(originating block): the block, runtime scene, authored card, part
// and concepts stay five separate identities. An anchor card has no scene or card, so those are null.
// journey (LP1 Task 14, adaptive-learning-path-v1-architecture.md §13): a hole opened from an active journey section
// carries { journey_id, section_id, concept_ids, claim_ids } (LearnJourney.jsx journeyDiveContext, at most 4 ids each),
// beside origin and never inside it, so the child Tutor knows what caused the dive; absent otherwise.
export function diveRecord({ name, title, via, parent, target, block = null, view = null, question = '', level = 1, journey = null }) {
  return {
    dive_id: name, concept: title, title, created_by: via,
    origin: {
      parent, origin_block_id: target.block_id, origin_scene_id: target.scene_id, origin_card_id: target.card_id,
      origin_part_id: target.part_id, origin_concept_ids: target.concept_ids, selected_object: target.selected_object,
      depth: target.depth, level, ...(target.anchor_request ? { anchor_request: target.anchor_request } : {}),
    },
    return_point: {
      block_id: target.block_id, part_id: target.part_id, selected_object: target.selected_object, inputs: block?.inputs ?? null, input_revision: block?.inputRevision ?? null,
      practice_open: !!block?.practiceActive, pending_question: question || null, viewport: view ? { x: view.x, y: view.y, zoom: view.z } : null,
    },
    ...(journey ? { journey } : {}),
  };
}

// The canvas title's Rabbit Holes menu (owner r35): the root, then every kept hole under it at any depth, depth-first,
// each with its depth for the indent, and the level open now marked current. `holes` is the server's list (each hole and
// its parent; dives.js GET, or a shared map's links), so a pending hole is never in it. One row means no holes: no menu.
export function holeRows({ path = [], holes = [] } = {}) {
  const root = path[0], here = path.at(-1);
  if (!root) return [];
  const under = new Map();
  for (const hole of holes) under.set(hole.parent, [...(under.get(hole.parent) || []), hole]);
  const rows = [], walked = new Set();
  const walk = (app, title, depth) => {
    if (walked.has(app)) return; // a corrupted cycle ends here
    walked.add(app);
    rows.push({ app, title, depth, current: app === here.app && !here.pending });
    for (const hole of under.get(app) || []) walk(hole.name, hole.title, depth + 1);
  };
  walk(root.app, root.title, 0);
  return rows;
}

// The navigator's rows: the path from the root, the current level emphasised, then its immediate
// children. A long path folds its middle so the roots never become a breadcrumb bar.
export function navigatorRows({ path, children }, fold = 5) {
  const levels = path.map((level, index) => ({ ...level, role: index === path.length - 1 ? 'current' : 'ancestor', depth: index }));
  const shown = levels.length > fold ? [levels[0], { role: 'fold', count: levels.length - 4, depth: 1 }, ...levels.slice(-3)] : levels;
  return [...shown, ...children.map(child => ({ ...child, app: child.name, board: 'main', role: 'child', depth: path.length }))];
}
