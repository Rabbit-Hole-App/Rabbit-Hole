// /dive (docs/features/dive-v1.md): nested Rabbit Holes. Pure: storage is passed in, so the rules
// are tested without a browser. A hole is a canvas; the card it was entered from is its portal.
// An empty hole lives only in this tab (sessionStorage) until its first canvas object, then
// POST /api/canvases/dives persists its canvas row and its link together (control-plane dives.js).

const PENDING = 'small.dive.pending';
const RETURN = 'small.dive.return';

// Same shape as the server's canvas slugs, so the hole's local keys never move when it persists.
export const newHoleName = () => `canvas-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

// A level's URL: a canvas, or a repository project's Learn tab; a named board rides ?board=.
export function levelHref({ app, board = 'main' }) {
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

// What makes a hole worth keeping: any canvas object - a card, diagram, note, equation, drawing,
// image. Chat alone, suggestion chips and the empty shell do not (the canvas's `content` count
// leaves chat out).
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

// A topic anchor's display title from the learner's own words: "explain softmax" -> "Softmax".
// The raw request is kept on the card beside it.
const LEAD = /^(?:please\s+)?(?:explain|describe|define|what(?:'s| is| are)|how (?:does|do|is|are)|why (?:does|do|is|are)|tell me about|teach me(?: about)?|go deeper (?:into|on)|dive into|learn about|understand|show me|about)\s+/i;
export function anchorTitle(request) {
  const topic = String(request).trim().replace(LEAD, '').replace(/[?.!\s]+$/, '').replace(/^(?:the|a|an)\s+/i, '').slice(0, 60).trim();
  return topic ? topic[0].toUpperCase() + topic.slice(1) : '';
}
// The card a topic dive creates on the current canvas: an ordinary explanation block holding the
// request, marked as a dive anchor. Never a generated lesson.
export const anchorBlock = request => {
  const text = String(request).trim();
  return { type: 'explanation', title: anchorTitle(text), body: text[0].toUpperCase() + text.slice(1), anchor: { request: text } };
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
export function diveRecord({ name, title, via, parent, target, block = null, view = null, question = '', level = 1 }) {
  return {
    dive_id: name, concept: title, title, created_by: via,
    origin: {
      parent, origin_block_id: target.block_id, origin_scene_id: target.scene_id, origin_card_id: target.card_id,
      origin_part_id: target.part_id, origin_concept_ids: target.concept_ids, selected_object: target.selected_object,
      card_depth: target.depth, level, ...(target.anchor_request ? { anchor_request: target.anchor_request } : {}),
    },
    return_point: {
      block_id: target.block_id, part_id: target.part_id, selected_object: target.selected_object, inputs: block?.inputs ?? null, input_revision: block?.inputRevision ?? null,
      practice_open: !!block?.practiceActive, pending_question: question || null, viewport: view ? { x: view.x, y: view.y, zoom: view.z } : null,
    },
  };
}

// The navigator's rows: the path from the root, the current level emphasised, then its immediate
// children. A long path folds its middle so the roots never become a breadcrumb bar.
export function navigatorRows({ path, children }, fold = 5) {
  const levels = path.map((level, index) => ({ ...level, role: index === path.length - 1 ? 'current' : 'ancestor', depth: index }));
  const shown = levels.length > fold ? [levels[0], { role: 'fold', count: levels.length - 4, depth: 1 }, ...levels.slice(-3)] : levels;
  return [...shown, ...children.map(child => ({ ...child, app: child.name, board: 'main', role: 'child', depth: path.length }))];
}
