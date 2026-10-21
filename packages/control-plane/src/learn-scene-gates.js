// The gates a model-written interactive scene passes before it becomes a card (/explain's `animation` primitive,
// learn-primitives.js). Server-only, so the layout lint and the consistency checker stay out of the browser bundle. Every
// gate is the existing one the authored cards pass (web/src/nanogpt/card-gates.mjs uses the same functions): nothing here
// is a second scene format or a second validator, only the order they run in and which input states they see.
import { evaluateScene } from '../../web/src/scene-evaluate.js';
import { checkSceneConsistency } from '../../web/src/scene-consistency.js';
import { checkLayoutLint } from '../../web/src/scene-layout-lint.js';
import { cellLegibilityIssues, legibilityIssues, sceneContentBounds } from '../../web/src/scene-layout.js';

// What a precomputed scene says on its face (owner, 2026-10-21): a control there selects stored results, it recalculates
// nothing. Fixed words, placed by the server under the scene's content, never written by the model.
export const SAMPLES_NOTE = 'Precomputed samples: each setting shows a stored result, not a live calculation.';
const MAX_SCENE_CHARS = 60000;
// An index input with more positions than this is checked at its first, middle and last; fewer, at every one.
const EVERY_POSITION = 8;

// The input values a scene is checked at: the defaults, then each control moved alone through its values.
export function inputStates(scene) {
  const states = [{}];
  for (const input of scene.inputs || []) {
    if (input.hidden) continue;
    let values = [];
    if (input.type === 'bool') values = [true, false];
    else if (input.type === 'choice') values = (input.options || []).map(option => option.id);
    else if (input.type === 'index') {
      const length = (scene.exampleData?.[input.of] || []).length;
      values = length <= EVERY_POSITION ? [...Array(length).keys()] : [0, Math.floor(length / 2), length - 1];
    }
    for (const value of values) if (value !== input.default) states.push({ [input.name]: value });
  }
  return states;
}

const where = inputs => {
  const [entry] = Object.entries(inputs);
  return entry ? `With input ${entry[0]} = ${JSON.stringify(entry[1])}: ` : '';
};

// The first problem a learner would meet, in words the model can act on for its one repair; null when every gate passes.
export function sceneProblem(scene) {
  if (!scene || typeof scene !== 'object') return 'scene must be an object';
  if (JSON.stringify(scene).length > MAX_SCENE_CHARS) return `The scene is over ${MAX_SCENE_CHARS.toLocaleString('en-US')} characters of JSON: draw fewer objects`;
  const image = (scene.objects || []).find(object => object?.type === 'image');
  if (image) return `Object "${image.id}": a generated scene draws no images (there is no image file to show); use shapes, text and data objects`;
  const legibility = (() => { try { return legibilityIssues(scene); } catch { return []; } })();
  for (const inputs of inputStates(scene)) {
    let result;
    try { result = evaluateScene(structuredClone(scene), scene.duration, inputs); }
    catch (error) { return `${where(inputs)}${error.message}`; }
    const pager = (result.declarations || []).find(input => input.presentation === 'pager');
    const part = pager ? result.inputs[pager.name] : undefined;
    const onScreen = { ...result.scene, objects: result.scene.objects.filter(object => object.part === undefined || object.part === part) };
    const consistency = checkSceneConsistency(onScreen).issues[0];
    if (consistency) return `${where(inputs)}${consistency.message}`;
    const lint = checkLayoutLint(onScreen).issues[0];
    if (lint) return `${where(inputs)}${lint.message}`;
    const cell = cellLegibilityIssues(result.state)[0];
    if (cell) return `${where(inputs)}grid "${cell.object}": its numbers (e.g. "${cell.longest}") draw at ${cell.effectivePx}px, below the ${cell.floor}px floor: widen its cell`;
  }
  const small = legibility[0];
  if (small) return `${small.textClass} text would draw at ${small.effectivePx}px, below its ${small.floor}px floor: the scene is too wide or tall for one card, so draw less or split it into parts with a pager`;
  return null;
}

// A precomputed scene gets the fixed note under its content, as an ordinary text object: the renderer is unchanged.
export function withSamplesNote(scene, calculation) {
  const objects = (scene.objects || []).filter(object => object?.id !== 'samples-note');
  if (calculation !== 'precomputed') return { ...scene, objects };
  let bounds = null;
  try { bounds = sceneContentBounds(evaluateScene(structuredClone({ ...scene, objects }), scene.duration, {}).scene); } catch { /* sceneProblem reports it */ }
  const x = Math.round(bounds?.xMin ?? 40), y = Math.round((bounds?.yMax ?? (scene.height || 400) - 40) + 32);
  const note = { id: 'samples-note', type: 'text', semanticId: 'samples-note', initialState: { text: SAMPLES_NOTE, x, y, typography: 'annotation' } };
  return { ...scene, height: Math.max(scene.height || 0, y + 24), objects: [...objects, note] };
}
