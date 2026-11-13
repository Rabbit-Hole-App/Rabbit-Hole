// How the trusted renderer reads the SHAPE of a generated /interactive frame (the composed card's scene), so the same drawing comes out whichever model wrote the program: the author decides what is in
// the scene and every number; this decides how it is drawn. Pure geometry and naming conventions on the frame objects, no subject and no wording, shared by the drawing (AnimatedScene.jsx Frame ->
// FrameFigures.jsx LookShape) and the layout checks (frame-overlap.js). It reads a contract frame object (kind, id, text) and a scene object (type, id, label) alike.
//
// The conventions are the ones the SDK helpers already produce (explain-program/sdk-figures.js), so an author who uses the helpers gets the look without knowing it:
//   lane      a box with a text "<id>.title" and a text "<id>.state" beside it (sdk.panel). Lanes are ordered left to right: the first is drawn blue-soft, the second warm-soft, any other plain.
//             Every lane draws the frame's first y axis (sdk.axis, orientation 'y') inside its left edge, with a dashed grid; that axis object itself is then not drawn a second time.
//   body      a circle of 12 px or more (sdk.circle). Bodies are coloured by order, whatever role they carry: the first process blue, the second decision gold, any later one the third identity slot.
//             An sdk-8 frame cannot give a body role "observed" (olive): contract.js parseGuestResult refuses it.
//   text      a text whose anchor lies inside a lane is kept inside the lane (its drawn position moves, never its meaning).
import { textWidthPx } from '../interact-description-fit.js';
import { BODY_MIN } from './contract.js';

export const LANE_INSET = 6; // px a child keeps from a lane's edge
export const LANE_AXIS_X = 36; // the lane axis line sits this far in from the lane's left edge, its tick labels to the left of it
const TEXT_SIZE = 14; // the body size the layout checks measure with

const kindOf = object => object.kind ?? object.type;
const textOf = object => object.text ?? object.label ?? (object.runs ? object.runs.map(run => run.text ?? run.tex ?? '').join('') : '') ?? '';
export const axisOf = object => object.axisSpec
  ? { id: object.id, ...object.axisSpec }
  : { id: object.id, orientation: object.orientation, x0: object.x, y0: object.y, length: object.length, min: object.min, max: object.max, ticks: object.ticks, label: object.label, unit: object.unit };

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

// -> [{ id, x, y, w, h, index, axis }] the lanes of a frame, left to right; axis is the frame's first y axis spec or null.
export function lanesOf(objects) {
  const ids = new Set(objects.map(object => object.id));
  const lanes = objects.filter(object => kindOf(object) === 'box' && ids.has(`${object.id}.title`) && ids.has(`${object.id}.state`))
    .map(object => ({ id: object.id, x: object.x, y: object.y, w: object.w, h: object.h }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const source = objects.find(object => kindOf(object) === 'axis' && axisOf(object).orientation === 'y');
  const axis = source ? axisOf(source) : null;
  return lanes.map((lane, index) => ({ ...lane, index, axis }));
}

const inside = (lane, x, y) => x >= lane.x && x <= lane.x + lane.w && y >= lane.y && y <= lane.y + lane.h;
const laneAt = (lanes, x, y) => lanes.find(lane => inside(lane, x, y)) ?? null;

// A text kept inside its lane: start-aligned at its left edge, middle-aligned at its centre. Returns the moved x and y.
export function clampText(object, lane) {
  const width = textWidthPx(textOf(object), TEXT_SIZE), middle = object.align === 'middle';
  const left = lane.x + LANE_INSET + (middle ? width / 2 : 0), right = lane.x + lane.w - LANE_INSET - (middle ? width / 2 : width);
  return { x: clamp(object.x, left, right), y: clamp(object.y, lane.y + TEXT_SIZE, lane.y + lane.h - LANE_INSET) };
}

// A body is a circle of at least this diameter (a smaller one is a mark, a dot or a hole); bodies take the scene's identity hues in the order they appear: the first process blue, the second decision gold,
// any later one the third slot (interact-style.js IDENTITIES). The author does not pick a body's colour.

export const BODY_SLOTS = Object.freeze(['identity-1', 'identity-2', 'identity-3']);
const NAMED_BODIES = Object.freeze({ 'ball.toss': 'identity-1', 'ball.drop': 'identity-2' });
export const isBody =object => kindOf(object) === 'circle' && object.w >= BODY_MIN;

// A callout is the boxes "<id>.l0" .. "<id>.l3" of sdk.callout (stacked, equally wide, each with its own text). They are drawn as ONE white card whose lines take their colours by order (the first blue
// ink and bold, the second orange, the third green, the fourth muted), and the card is kept inside the lane it sits in. -> Map(box id -> look): the lowest line carries the whole card, the others none.
export const CALLOUT_INK = Object.freeze(['blueInk', 'warm', 'green', 'muted']);
function calloutsOf(objects, lanes) {
  const groups = new Map();
  for (const object of objects) {
    const match = kindOf(object) === 'box' && textOf(object) ? /^(.+)\.l([0-3])$/.exec(object.id) : null;
    if (match) groups.set(match[1], [...(groups.get(match[1]) ?? []), { object, line: Number(match[2]) }]);
  }
  const out = new Map();
  for (const [name, entries] of groups) {
    const lines = entries.sort((a, b) => a.line - b.line).map(({ object }) => object);
    const box = { x: Math.min(...lines.map(o => o.x)), y: Math.min(...lines.map(o => o.y)), w: Math.max(...lines.map(o => o.w)), h: lines.reduce((sum, o) => sum + o.h, 0) };
    const home = laneAt(lanes, box.x + box.w / 2, box.y + box.h / 2);
    const dx = home ? clamp(box.x, home.x + LANE_INSET, home.x + home.w - LANE_INSET - box.w) - box.x : 0, dy = home ? clamp(box.y, home.y + LANE_INSET, home.y + home.h - LANE_INSET - box.h) - box.y : 0;
    const card = { name, x: box.x + dx, y: box.y + dy, w: box.w, h: box.h, lines: lines.map((o, i) => ({ text: textOf(o), y: o.y + dy + o.h / 2, ink: CALLOUT_INK[i] })) };
    lines.forEach((o, i) => out.set(o.id, i === 0 ? { part: 'callout-card', card } : { part: 'callout-line' }));
  }
  return out;
}

// A vector's kind, from the words of its label first and then of its id: v (velocity), a (acceleration) or F (force). It decides the colour and the dash, nothing else. Words are split at case
// changes and non-letters ("vec.v", "tossedVelocity", "Gravity pulls down"); the first word that names a kind wins, and a single letter v, a or F (any case) counts.
const KIND_WORDS = Object.freeze({
  v: ['v', 'vel', 'velocity', 'speed', 'motion', 'moving'],
  a: ['a', 'acc', 'accel', 'acceleration', 'gravity'],
  F: ['f', 'force', 'weight', 'thrust'],
});
const wordsOf = text => String(text ?? '').split(/[^A-Za-z]+|(?<=[a-z])(?=[A-Z])/).filter(Boolean).map(word => word.toLowerCase());
export function vectorKind(label, id) {
  for (const source of [label, id]) {
    for (const word of wordsOf(source)) for (const [kind, names] of Object.entries(KIND_WORDS)) if (names.includes(word)) return kind;
  }
  return null;
}

// -> { objects, lanes }: the objects the renderer draws, in the same order. An object that is part of a recognised look carries `look: { part, ... }` (drawn by LookShape) or an `identitySlot` (a body); a
// child that left its lane is moved back inside it. Nothing else changes, and a frame with nothing to read comes back as it was.
//   plot      a series of one scatter point is the current point (process-blue dot, dashed blue guides to the axes); a text "<plot id>.note" is the plot's note, drawn orange (13 px / 600).
//   vector    an arrow (sdk.vector) whose label text "<id>L", or whose id, names a kind (vectorKind): drawn blue solid for v, orange dashed for a, green for F; its label takes the same colour.
export function frameLook(objects) {
  const lanes = lanesOf(objects), byId = new Map(lanes.map(lane => [lane.id, lane]));
  const titles = new Map(lanes.flatMap(lane => [[`${lane.id}.title`, 'lane-title'], [`${lane.id}.state`, 'lane-state']]));
  const source = lanes[0]?.axis?.id;
  const labels = new Map(objects.filter(object => kindOf(object) === 'text').map(object => [object.id, textOf(object)]));
  const vectors = new Map(objects.filter(object => kindOf(object) === 'arrow').map(object => [object.id, vectorKind(labels.get(`${object.id}L`), object.id)]).filter(([, kind]) => kind));
  const callouts = calloutsOf(objects, lanes), plots = new Set(objects.filter(object => kindOf(object) === 'plot').map(object => object.id));
  let bodies = 0;
  const out = objects.map(object => {
    if (callouts.has(object.id)) return { ...object, look: callouts.get(object.id) };
    const lane = byId.get(object.id);
    if (lane) return { ...object, look: { part: 'lane', lane } };
    if (titles.has(object.id)) return { ...object, look: { part: titles.get(object.id) } };
    if (object.id === source) return { ...object, look: { part: 'hidden' } };
    // The named bodies keep their hue whatever the object order (ball.toss primary, ball.drop second); any other body takes the next slot in order.
    if (isBody(object)) return { ...object, identitySlot: NAMED_BODIES[object.id] ?? BODY_SLOTS[Math.min(bodies++, BODY_SLOTS.length - 1)] };
    if (vectors.has(object.id)) return { ...object, look: { part: 'vector', kind: vectors.get(object.id) } };
    if (kindOf(object) === 'text') {
      const home = laneAt(lanes, object.x, object.y), at = home ? clampText(object, home) : null;
      const moved = at && (at.x !== object.x || at.y !== object.y) ? { ...object, ...at } : object;
      const owner = object.id.endsWith('L') ? vectors.get(object.id.slice(0, -1)) : null;
      if (object.id.endsWith('.note') && plots.has(object.id.slice(0, -5))) return { ...moved, look: { part: 'plot-note' } };
      return owner ? { ...moved, look: { part: 'vector-label', kind: owner } } : moved;
    }
    return object;
  });
  const changed = out.some((object, index) => object !== objects[index]);
  return { lanes, objects: changed ? out : objects };
}
