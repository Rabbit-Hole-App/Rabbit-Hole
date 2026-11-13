// How the trusted renderer reads the SHAPE of a generated /interactive frame (the composed card's scene), so the same drawing comes out whichever model wrote the program: the author decides what is in
// the scene and every number; this decides how it is drawn. Pure geometry and naming conventions on the frame objects, no subject and no wording, shared by the drawing (AnimatedScene.jsx Frame ->
// FrameFigures.jsx LookShape) and the layout checks (frame-overlap.js). It reads a contract frame object (kind, id, text) and a scene object (type, id, label) alike.
//
// The conventions are the ones the SDK helpers already produce (explain-program/sdk-figures.js), so an author who uses the helpers gets the look without knowing it:
//   lane      a box with a text "<id>.title" and a text "<id>.state" beside it (sdk.panel). Lanes are ordered left to right: the first is drawn blue-soft, the second warm-soft, any other plain.
//             Every lane draws the frame's first y axis (sdk.axis, orientation 'y') inside its left edge, with a dashed grid; that axis object itself is then not drawn a second time.
//   text      a text whose anchor lies inside a lane is kept inside the lane (its drawn position moves, never its meaning).
import { textWidthPx } from '../interact-description-fit.js';

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

// -> { objects, lanes }: the objects the renderer draws, in the same order. An object that is part of a recognised look carries `look: { part, ... }` (drawn by LookShape); a child that left its
// lane is moved back inside it. Nothing else changes, and a frame with no lane comes back as it was.
export function frameLook(objects) {
  const lanes = lanesOf(objects);
  if (!lanes.length) return { objects, lanes };
  const byId = new Map(lanes.map(lane => [lane.id, lane]));
  const titles = new Map(lanes.flatMap(lane => [[`${lane.id}.title`, 'lane-title'], [`${lane.id}.state`, 'lane-state']]));
  const source = lanes[0].axis?.id;
  return {
    lanes,
    objects: objects.map(object => {
      const lane = byId.get(object.id);
      if (lane) return { ...object, look: { part: 'lane', lane } };
      if (titles.has(object.id)) return { ...object, look: { part: titles.get(object.id) } };
      if (object.id === source) return { ...object, look: { part: 'hidden' } };
      if (kindOf(object) === 'text') {
        const home = laneAt(lanes, object.x, object.y);
        if (home) { const at = clampText(object, home); if (at.x !== object.x || at.y !== object.y) return { ...object, ...at }; }
      }
      return object;
    }),
  };
}
