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

// What to do about a validator refusal real runs kept repeating (L10 runs, 2026-10-21): appended to the validator's own words.
const HINTS = [
  [/opacity: .*boolean/, 'to show or hide with a toggle, store {"on": 1, "off": 0} in exampleData, derive choose [toggle, "on", "off"] and use it as opacity'],
  [/pick key .* names no entry in the record map/, 'an index input picks from a list by position; a record is picked only by a choice input, by its option ids'],
  [/choose needs a boolean/, 'choose takes a bool input first; select by an index or choice input with pick'],
  [/states a computed relationship/, 'write a general law as a text object, or take the equation numbers from derived values with {{name}}'],
  [/lands its arrowhead .* inside the label/, 'end the arrow at least 12px clear of that label, or move the label'],
  [/non-zero entries there/, 'make the sentence and the drawn entries agree: derive the count with sum over the 0/1 list and print it with {{name}}, or correct the stored list'],
  [/writes ".*", (but|which is false)/, 'compute the result with a derived op (sub, add, scale, sum) and print it with {{name}}, correct the stored numbers, or say it without a calculation'],
];

// What the card states about its own numbers, checked against them (L10's two wrong real scenes, 2026-10-21: a "70 - 80 = 0"
// line, and a step whose "2 candidates left" drew 3). The truth of a stored number the card never restates stays unchecked.
const NUM = '[$€£]?-?\\d[\\d,]*(?:\\.\\d+)?';
const OP = '\\s+[-+x−–]\\s+|\\s*[×*·/÷]\\s*'; // a spaced minus only: "index 0-5" is a range, not a subtraction
const EXPR = `(?:${NUM})(?:(?:${OP})(?:${NUM}))*`;
const number = token => Number(token.replace(/[$€£,]/g, ''));
const hasOp = expr => new RegExp(OP).test(expr);
const decimals = expr => Math.max(0, ...(expr.match(/\d+(?:\.\d+)?/g) || []).map(n => (n.split('.')[1] || '').length));
function calculate(expr) {
  const parts = expr.split(new RegExp(`(${OP})`)).map(part => part.trim());
  const terms = [number(parts[0])], signs = [1];
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i], n = number(parts[i + 1]);
    if (/[x×*·]/.test(op)) terms[terms.length - 1] *= n;
    else if (/[/÷]/.test(op)) terms[terms.length - 1] /= n;
    else { terms.push(n); signs.push(op === '+' ? 1 : -1); }
  }
  return terms.reduce((sum, term, i) => sum + signs[i] * term, 0);
}
// The first written calculation ("70 - 80 = 0", "31 > 37") its own numbers contradict, as words for the repair; null when none.
// A percentage or a power is not read, nor a number glued to a letter, nor one with a unit between it and its operator.
export function falseCalculation(text) {
  if (/[%^]/.test(text)) return null;
  const sides = text.split(/(?<![<>!=])=(?!=)/);
  for (let i = 0; i + 1 < sides.length; i++) {
    const left = sides[i].match(new RegExp(`(?:^|[\\s(:,])(${EXPR})\\s*$`))?.[1];
    const right = sides[i + 1].match(new RegExp(`^\\s*(${EXPR})(?=$|[\\s),.;:!?])`))?.[1];
    if (!left || !right || !(hasOp(left) || hasOp(right))) continue;
    const [shown, worked] = hasOp(left) ? [right, left] : [left, right];
    const value = calculate(worked);
    if (Math.abs(value - calculate(shown)) > 0.5 * 10 ** -decimals(shown) + 1e-9) return `writes "${left} = ${right}", but ${worked} = ${+value.toFixed(6)}`;
  }
  for (const [, a, op, b] of text.matchAll(new RegExp(`(?:^|[\\s(:,])(${NUM})\\s*(<=|>=|≤|≥|<|>)\\s*(${NUM})(?=$|[\\s),.;:!?])`, 'g'))) {
    const [x, y] = [number(a), number(b)];
    if (!{ '<': x < y, '>': x > y, '<=': x <= y, '≤': x <= y, '>=': x >= y, '≥': x >= y }[op]) return `writes "${a} ${op} ${b}", which is false`;
  }
  return null;
}

const numbersIn = text => (text.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map(number);
// A sentence whose number follows a drawn data object's count of non-zero entries as one control moves must follow it at every
// setting checked: matched at most of them (two different counts at least) and missed at one is a stored count gone wrong.
function countProblem(name, series) {
  for (const data of series[0].objects.values()) {
    if (!Array.isArray(data.values)) continue;
    for (const text of series[0].objects.values()) {
      if (!text.label) continue;
      const pairs = series.filter(snap => snap.objects.get(data.id) && snap.objects.get(text.id)?.label).map(snap => ({ inputs: snap.inputs,
        count: snap.objects.get(data.id).values.filter(value => value != null && Number(value) !== 0).length, label: snap.objects.get(text.id).label }));
      if (pairs.length < 3 || new Set(pairs.map(pair => pair.count)).size < 2 || new Set(pairs.map(pair => pair.label)).size < 2) continue;
      const hits = pairs.filter(pair => numbersIn(pair.label).includes(pair.count));
      const miss = pairs.find(pair => !hits.includes(pair));
      if (miss && hits.length * 2 > pairs.length && new Set(hits.map(pair => pair.count)).size >= 2) {
        return `With input ${name} = ${JSON.stringify(miss.inputs[name])}: "${text.id}" says "${miss.label}", but "${data.id}" draws ${miss.count} non-zero entries there, and at most other settings it states that count`;
      }
    }
  }
  return null;
}
const hinted = message => { const hint = HINTS.find(([pattern]) => pattern.test(message)); return hint ? `${message}. Fix: ${hint[1]}` : message; };

const where = inputs => {
  const [entry] = Object.entries(inputs);
  return entry ? `With input ${entry[0]} = ${JSON.stringify(entry[1])}: ` : '';
};

// The first problem a learner would meet, in words the model can act on for its one repair; null when every gate passes.
export const sceneProblem = scene => { const problem = firstProblem(scene); return problem && hinted(problem); };
function firstProblem(scene) {
  if (!scene || typeof scene !== 'object') return 'scene must be an object';
  if (JSON.stringify(scene).length > MAX_SCENE_CHARS) return `The scene is over ${MAX_SCENE_CHARS.toLocaleString('en-US')} characters of JSON: draw fewer objects`;
  const image = (scene.objects || []).find(object => object?.type === 'image');
  if (image) return `Object "${image.id}": a generated scene draws no images (there is no image file to show); use shapes, text and data objects`;
  // The derive seam reads args as names or numbers; anything else would surface as a bare TypeError, not a fix to make.
  for (const [name, spec] of Object.entries(scene.derived || {})) {
    if (!spec || typeof spec.op !== 'string' || !Array.isArray(spec.args)) return `derived.${name} needs {"op": "<op>", "args": [...]}`;
    const bad = spec.args.find(arg => typeof arg !== 'string' && !Number.isFinite(arg));
    if (bad !== undefined) return `derived.${name} (${spec.op}): every arg is a name, a dotted path or a number, not ${JSON.stringify(bad).slice(0, 60)} - put lists in exampleData and name them`;
  }
  const legibility = (() => { try { return legibilityIssues(scene); } catch { return []; } })();
  const series = new Map(); // each control's settings, the defaults first: what countProblem compares
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
    const shown = result.state.objects.filter(object => object.visible && object.opacity > 0.01);
    for (const object of shown) {
      const wrong = object.label && falseCalculation(object.label);
      if (wrong) return `${where(inputs)}"${object.id}" ${wrong}`;
    }
    const moved = Object.keys(inputs)[0], snap = { inputs: result.inputs, objects: new Map(shown.map(object => [object.id, object])) };
    for (const input of result.declarations || []) {
      if (!input.hidden && input.presentation !== 'pager' && (moved === undefined || moved === input.name)) series.set(input.name, [...(series.get(input.name) || []), snap]);
    }
  }
  for (const [name, snaps] of series) {
    const count = snaps.length >= 3 && countProblem(name, snaps);
    if (count) return count;
  }
  const small = legibility[0];
  if (small) return `${small.textClass} text would draw at ${small.effectivePx}px, below its ${small.floor}px floor: the scene is too wide or tall for one card, so draw less or split it into parts with a pager`;
  return null;
}

// "live" is a claim that the scene calculates: a scene whose derived block only selects (pick, choose, gate, concat) shows
// stored numbers whatever it declares, so it must say precomputed and carry the note. Mixed scenes are the model's to declare.
const SELECTS = new Set(['pick', 'choose', 'gate', 'concat']);
export function calculationProblem(scene, calculation) {
  const ops = Object.values(scene?.derived || {}).map(spec => spec?.op);
  if (calculation === 'live' && !ops.some(op => !SELECTS.has(op))) {
    return 'calculation is "live" but no derived op calculates anything (only pick, choose, gate or concat select stored values): compute the results with the ops, or set calculation to "precomputed"';
  }
  return null;
}

// The frame is fitted to each object's authored w and h (scene-layout.js sceneContentBounds); a data object that authors
// none is measured by its label alone, so its cells or bars past the label were cropped (a real run's 11-bar chart showed 9).
// The renderer's own size for it (getSceneState, at the default inputs) is written in: what is drawn does not change.
const DATA_TYPES = new Set(['strip', 'grid', 'bars', 'tokens']);
export function withDataSizes(scene) {
  let drawn;
  try { drawn = new Map(evaluateScene(structuredClone(scene), scene.duration, {}).state.objects.map(object => [object.id, object])); } catch { return scene; }
  return { ...scene, objects: (scene.objects || []).map(object => {
    const state = object?.initialState || {}, size = drawn.get(object?.id);
    if (!DATA_TYPES.has(object?.type) || !size || (state.w != null && state.h != null)) return object;
    return { ...object, initialState: { ...state, w: state.w ?? size.w, h: state.h ?? size.h } };
  }) };
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
