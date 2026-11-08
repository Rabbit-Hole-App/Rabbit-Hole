import { getSceneState, validateScene } from '../animation-scene.js';
import { LEGIBILITY_FLOORS, MAX_SCENE_VIEWPORT, sceneLegibility } from '../scene-layout.js';
import { parseFrame, RuntimeError } from './contract.js';

// A guest's frame becomes the trusted renderer's input: the contract check (contract.js), then the existing scene gate
// (validateScene: roles, KaTeX trust and expansion bounds on every math run, on-screen limits) and getSceneState at one
// moment. The result feeds the shared Frame in AnimatedScene.jsx, so a program draws with the same roles, math path and
// selection as every other card. Pure; no React.

const bounds = points => {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  // A flat series (all one value) still needs a positive size for the scene gate.
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
};
const label = object => (object.runs ? { runs: object.runs } : object.text ? { label: object.text } : {});
const common = object => ({ opacity: object.opacity, role: object.role });

// One contract object becomes one scene object. No topic is read here: kind, geometry and role only.
function sceneObject(object) {
  const base = { id: object.id, semanticId: object.id };
  switch (object.kind) {
    case 'box': return { ...base, type: 'box', initialState: { x: object.x, y: object.y, w: object.w, h: object.h, rotation: object.rotation, ...label(object), ...common(object) } };
    case 'circle': return { ...base, type: 'circle', initialState: { x: object.x, y: object.y, w: object.w, rotation: object.rotation, ...label(object), ...common(object) } };
    case 'text': return { ...base, type: 'text', initialState: { x: object.x, y: object.y, align: object.align, ...label(object), ...common(object) } };
    case 'line':
    case 'arrow': return { ...base, type: object.kind, initialState: { x: object.from.x, y: object.from.y, from: object.from, to: object.to, ...label(object), ...common(object) } };
    case 'polyline': return { ...base, type: 'polyline', initialState: { ...bounds(object.points), points: object.points, ...(object.clip ? { clip: object.clip } : {}), ...common(object) } };
    default: throw new Error(`unknown object kind "${object.kind}"`);
  }
}

// The smallest box (CSS px) that draws this frame with every text class it uses at or above its legibility floor
// (scene-layout.js): the frame is drawn at its declared width and height (Frame fixedView), so the box is that size times the
// scale its text classes need, capped at the widest a scene card may grow (MAX_SCENE_VIEWPORT), aspect kept. Generic: the
// declared size and the text classes only.
export function legibleFrame(scene) {
  // The scale each class needs is floor / authored size, read from the scene cards' own legibility report (1 when no text).
  const classes = Object.values(sceneLegibility(scene)?.effective ?? {});
  const required = classes.reduce((worst, size) => Math.max(worst, size.floor / size.authored), 0) || 1;
  const w = Math.min(scene.width * required, MAX_SCENE_VIEWPORT.w);
  return { w: Math.round(w), h: Math.round(w * scene.height / scene.width) };
}

// The card's initial size around that box: chrome is what the card draws beside (w) and above/below (h) the frame, not
// counting the measured rows under it; minWidth keeps room for those rows. A card wider than the box draws the frame wider
// at its own aspect, so the frame's height follows the card's width. Depends on the box only, never on time or readouts.
export function programCardSize(box, { chrome, minWidth = 0 }) {
  const width = Math.max(minWidth, box.w + chrome.w);
  return { width, height: Math.round((width - chrome.w) * box.h / box.w + chrome.h) };
}

// Focus may draw a frame smaller than its legible box, down to the scale where its smallest text reaches the smallest floor the
// legibility rules allow anywhere (LEGIBILITY_FLOORS.metadata, 12 px): the per-class floors size the canvas card, 12 px is the
// readable minimum. A frame of body text (15 px) may shrink to 0.8 of its box; one already capped under its floors, not at all.
export function readableScale(scene, legible = legibleFrame(scene)) {
  const sizes = Object.values(sceneLegibility(scene)?.effective ?? {}).map(size => size.authored);
  const smallest = (sizes.length ? Math.min(...sizes) : LEGIBILITY_FLOORS.body) * legible.w / scene.width;
  return Math.min(1, LEGIBILITY_FLOORS.metadata / smallest);
}

// Focus: the drawing's box inside the room the pane leaves for it (CSS px), aspect kept: the legible box scaled by the smaller
// of the width and height scales, so a wide frame never grows taller than the room and a tall one never wider (owner,
// 2026-10-28: a 16:9 frame in 500 px of height is about 889 px wide, not the full width). It shrinks to fit while that scale
// stays at or above minScale (readableScale); below it the drawing is drawn whole at minScale and `scroll` says the Focus content
// (drawing, controls and Notes together) scrolls as one surface, never the drawing inside a box of its own (owner, 2026-10-29).
// Generic: the legible box, the room and the text floor only.
export function focusFrameBox(legible, room, minScale = 1) {
  const fit = Math.min(room.w / legible.w, room.h / legible.h);
  const scale = fit >= minScale ? fit : minScale;
  return { w: Math.round(legible.w * scale), h: Math.round(legible.h * scale), scroll: fit < minScale };
}

const readoutText = (definition, value) => `${value.toFixed(definition.decimals)}${definition.unit ? ` ${definition.unit}` : ''}`;

// Result: { ok: true, scene, state, readouts: [{ id, label, text }] } or { ok: false, error: RuntimeError, issue }.
// manifest (optional) binds the frame's readouts to their definitions; an undeclared readout id is invalid_output.
export function normalizeFrame(raw, manifest = null) {
  const parsed = parseFrame(raw);
  if (!parsed.ok) return parsed;
  const frame = parsed.value;
  const invalid = issue => ({ ok: false, error: new RuntimeError('invalid_output'), issue });
  const readouts = [];
  for (const readout of frame.readouts) {
    const definition = manifest?.readouts.find(item => item.id === readout.id);
    if (manifest && !definition) return invalid(`readouts: "${readout.id}" is not declared in the manifest`);
    readouts.push({ id: readout.id, label: definition?.label ?? readout.id, text: definition ? readoutText(definition, readout.value) : String(readout.value) });
  }
  try {
    // duration is a required positive number by the scene schema; a program frame is one moment, so any value serves.
    const scene = validateScene({ id: 'explain-program', width: frame.width, height: frame.height, duration: 1, objects: frame.objects.map(sceneObject), timeline: [] });
    return { ok: true, scene, state: getSceneState(scene, 0), readouts };
  } catch (problem) {
    return invalid(problem.message);
  }
}
