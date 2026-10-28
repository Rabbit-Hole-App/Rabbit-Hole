import { getSceneState, validateScene } from '../animation-scene.js';
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
