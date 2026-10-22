// The gates a model-written interactive scene passes before it becomes a card (/explain's `animation` primitive,
// learn-primitives.js). Server-only, so the layout lint and the consistency checker stay out of the browser bundle. Every
// gate is the existing one the authored cards pass (web/src/nanogpt/card-gates.mjs uses the same functions): nothing here
// is a second scene format or a second validator, only the order they run in and which input states they see.
import { evaluateScene } from '../../web/src/scene-evaluate.js';
import { checkSceneConsistency } from '../../web/src/scene-consistency.js';
import { checkLayoutLint } from '../../web/src/scene-layout-lint.js';
import { cellLegibilityIssues, legibilityIssues, sceneContentBounds } from '../../web/src/scene-layout.js';
import { formatCell } from '../../web/src/scene-format.js';

// What a precomputed scene says on its face (owner, 2026-10-21): a control there selects stored results, it recalculates
// nothing. Fixed words, placed by the server under the scene's content, never written by the model.
export const SAMPLES_NOTE = 'Precomputed samples: each setting shows a stored result, not a live calculation.';
const MAX_SCENE_CHARS = 60000;

// The interaction space the gates and the verifier see (EXP-04, owner review 2026-10-21): every setting a learner can reach,
// that is every combination of every visible control's values (each toggle both ways, each choice option, each index
// position). Nothing is sampled: a scene with more settings than MAX_SETTINGS, or a control whose values cannot all be
// listed (indices, vec2), is refused with that reason, so what is checked is always all of it. A hidden input has no
// control (scene-evaluate.js applyInputToBlock refuses it), so it stays at its default.
export const MAX_SETTINGS = 64;
const LISTED = new Set(['bool', 'choice', 'index']);
const controlValues = scene => (scene.inputs || []).filter(input => !input?.hidden).map(input => {
  const values = input?.type === 'bool' ? [true, false] : input?.type === 'choice' ? (input.options || []).map(option => option?.id)
    : input?.type === 'index' ? [...Array((scene.exampleData?.[input.of] || []).length).keys()] : [];
  return [input, [input?.default, ...values.filter(value => value !== input?.default)]];
});
export function spaceProblem(scene) {
  const controls = controlValues(scene);
  const unlisted = controls.find(([input]) => !LISTED.has(input?.type));
  if (unlisted) return `Input "${unlisted[0]?.name}": a generated scene's controls are bool, choice or index inputs, whose settings can all be checked, not ${JSON.stringify(unlisted[0]?.type)}`;
  const count = controls.reduce((product, [, values]) => product * values.length, 1);
  if (count > MAX_SETTINGS) return `The controls offer ${count} settings in combination (${controls.map(([input, values]) => `${input.name}: ${values.length}`).join(' x ')}); every setting is checked, and at most ${MAX_SETTINGS} are supported: use fewer controls, options or positions`;
  return null;
}

// Every setting the gates check, as the inputs moved off their defaults: the defaults ({}) first, then each control alone,
// then combinations, so the simplest setting with a problem is the one reported.
export function inputStates(scene) {
  const problem = spaceProblem(scene);
  if (problem) throw new Error(problem);
  const controls = controlValues(scene);
  let picks = [[]]; // per state, the position of each control's value in its list (0 = its default)
  for (const [, values] of controls) picks = picks.flatMap(pick => values.map((_, i) => [...pick, i]));
  const rank = pick => pick.map(i => i || Infinity), moved = pick => pick.filter(Boolean).length;
  picks.sort((a, b) => { const [x, y] = [rank(a), rank(b)], i = x.findIndex((v, j) => v !== y[j]); return moved(a) - moved(b) || (i < 0 ? 0 : x[i] - y[i]); });
  return picks.map(pick => Object.fromEntries(controls.map(([input, values], i) => [input.name, values[pick[i]]]).filter((_, i) => pick[i])));
}

// What to do about a validator refusal real runs kept repeating (L10 runs, 2026-10-21): appended to the validator's own words.
const HINTS = [
  [/opacity: .*boolean/, 'to show or hide with a toggle, store {"on": 1, "off": 0} in exampleData, derive choose [toggle, "on", "off"] and use it as opacity'],
  [/pick key .* names no entry in the record map/, 'an index input picks from a list by position; a record is picked only by a choice input, by its option ids'],
  [/choose needs a boolean/, 'choose takes a bool input first; select by an index or choice input with pick'],
  [/states a computed relationship/, 'write a general law as a text object, or take the equation numbers from derived values with {{name}}'],
  [/lands its arrowhead .* inside the label/, 'end the arrow at least 12px clear of that label, or move the label'],
  [/non-zero entries there/, 'make the sentence and the drawn entries agree: derive the count with sum over the 0/1 list and print it with {{name}}, or correct the stored list'],
  [/non-zero entries at \d+\.\.-?\d+ there/, 'work that setting out again, then make the stored list and the sentence name the same cells'],
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
// Index ranges a sentence states: "0..6", "4-6" (unspaced), "3 to 7".
const RANGE = /(?<![\d.])(\d+)(?:\s*\.\.\s*|[–—-]|\s+to\s+)(\d+)(?![\d])/g;
const rangesIn = text => [...text.matchAll(RANGE)].map(match => [Number(match[1]), Number(match[2])]).filter(([a, b]) => a <= b);
// A sentence that changes with one control, set against a drawn data object whose non-zero entries change with it (a range
// still searched, cells kept), along each line of settings where only that control moves (the others held at each of their
// combinations):
// - a number that is that object's count of non-zero entries at most settings (two different counts at least) must be it at all;
// - an index range it states must be the span of those entries or a block of zeros (cells dropped), once at some setting a range
//   it states was that span exactly.
function drawnEntriesProblem(name, series) {
  const at = (snap, text, data, words) => `${where({ [name]: snap.inputs[name], ...snap.state })}"${text}" says "${words}", but "${data}" draws `;
  for (const data of series[0].objects.values()) {
    if (!Array.isArray(data.values)) continue;
    for (const text of series[0].objects.values()) {
      if (!text.label) continue;
      const pairs = series.filter(snap => snap.objects.get(data.id) && snap.objects.get(text.id)?.label).map(snap => {
        const on = snap.objects.get(data.id).values.map(value => value != null && Number(value) !== 0);
        return { snap, on, count: on.filter(Boolean).length, first: on.indexOf(true), last: on.lastIndexOf(true), label: snap.objects.get(text.id).label };
      });
      if (pairs.length < 3 || new Set(pairs.map(pair => `${pair.first}..${pair.last}:${pair.count}`)).size < 2 || new Set(pairs.map(pair => pair.label)).size < 2) continue;
      const hits = pairs.filter(pair => numbersIn(pair.label).includes(pair.count));
      const miss = pairs.find(pair => !hits.includes(pair));
      if (miss && hits.length * 2 > pairs.length && new Set(hits.map(pair => pair.count)).size >= 2) {
        return `${at(miss.snap, text.id, data.id, miss.label)}${miss.count} non-zero entries there, and at most other settings it states that count`;
      }
      const span = (pair, [a, b]) => a === pair.first && b === pair.last;
      if (!pairs.some(pair => rangesIn(pair.label).some(range => span(pair, range)))) continue;
      for (const pair of pairs) {
        const wrong = rangesIn(pair.label).find(([a, b]) => b < pair.on.length && !span(pair, [a, b]) && pair.on.slice(a, b + 1).some(Boolean));
        if (wrong) return `${at(pair.snap, text.id, data.id, pair.label)}its non-zero entries at ${pair.first}..${pair.last} there, not ${wrong[0]}..${wrong[1]}, and at another setting the range it states is that span`;
      }
    }
  }
  return null;
}
const hinted = message => { const hint = HINTS.find(([pattern]) => pattern.test(message)); return hint ? `${message}. Fix: ${hint[1]}` : message; };

const where = inputs => {
  const entries = Object.entries(inputs);
  return entries.length ? `With input${entries.length > 1 ? 's' : ''} ${entries.map(([name, value]) => `${name} = ${JSON.stringify(value)}`).join(', ')}: ` : '';
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
  const space = spaceProblem(scene);
  if (space) return space;
  const legibility = (() => { try { return legibilityIssues(scene); } catch { return []; } })();
  const series = new Map(); // each line of settings along one control, its first setting first: what drawnEntriesProblem compares
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
    const snap = { state: inputs, inputs: result.inputs, objects: new Map(shown.map(object => [object.id, object])) };
    for (const input of result.declarations || []) {
      if (input.hidden || input.presentation === 'pager') continue;
      const line = JSON.stringify([input.name, Object.entries(inputs).filter(([name]) => name !== input.name)]);
      series.set(line, { name: input.name, snaps: [...(series.get(line)?.snaps || []), snap] });
    }
  }
  for (const { name, snaps } of series.values()) {
    const count = snaps.length >= 3 && drawnEntriesProblem(name, snaps);
    if (count) return count;
  }
  const presentation = presentationProblem(scene);
  if (presentation) return presentation;
  const small = legibility[0];
  if (small) return `${small.textClass} text would draw at ${small.effectivePx}px, below its ${small.floor}px floor: the scene is too wide or tall for one card, so draw less or split it into parts with a pager`;
  return null;
}

// The declared presentation earns its controls (EXP-T26 M2, plan v2.1 section 1.2), checked by comparing evaluated states,
// never by reading words. Only a scene that declares a presentation is held to it; saved scenes without one keep the
// card's static reading (animation-scene.js presentationMode). This supports, and does not replace, the independent review
// of whether the experiment is useful.
// What an object shows, without the attention marks: a highlight directs the eye, it does not change what is drawn.
const substance = object => JSON.stringify([object.visible && object.opacity > 0.01, Math.round(object.opacity * 100), object.x, object.y, object.w, object.h,
  object.from, object.to, object.rotation, object.label, object.runs, object.values, object.labels, object.tokens]);
const listedValues = (input, data) => input.type === 'bool' ? [false, true] : input.type === 'choice' ? input.options.map(option => option.id)
  : [...Array((data?.[input.of] || []).length).keys()];
export function presentationProblem(scene) {
  const presentation = scene?.presentation;
  if (!presentation) return null;
  let base;
  try { base = evaluateScene(structuredClone(scene), scene.duration, {}); } catch (error) { return error.message; }
  const timeline = base.scene.timeline;
  if (presentation.mode === 'time' && timeline.every(event => ['appear', 'highlight', 'emphasize', 'pause'].includes(event.action))) {
    return 'presentation: time mode on a timeline that only reveals or highlights: nothing is taught by playing it, so declare static (or steps that each change what is drawn)';
  }
  if (presentation.mode === 'steps') {
    const at = time => evaluateScene(structuredClone(scene), time, {}).state.objects.map(substance).join('|');
    const steps = base.scene.presentation.steps;
    for (let i = 1; i < steps.length; i += 1) {
      if (at(steps[i].at) === at(steps[i - 1].at)) return `presentation: step "${steps[i].title}" draws the same as "${steps[i - 1].title}" (a highlight alone is not a step): merge them or change what the step shows`;
    }
  }
  const visible = (base.declarations || []).filter(input => !input.hidden && input.presentation !== 'pager');
  const experiments = presentation.experiments || [];
  const missing = visible.find(input => !experiments.some(experiment => experiment.input === input.name));
  if (missing) return `presentation: control "${missing.name}" has no experiment: declare its purpose, the objects it affects and the contrasts to compare, or remove the control`;
  for (const experiment of experiments) {
    const input = visible.find(entry => entry.name === experiment.input);
    const values = listedValues(input, scene.exampleData);
    // dependsOn: the controls this effect needs set (a reference shown, a mode chosen); the change may show in any of their settings.
    let contexts = [{}];
    for (const name of experiment.dependsOn || []) {
      const other = visible.find(entry => entry.name === name);
      if (!other || name === input.name) return `presentation: experiment "${experiment.id}" depends on "${name}", which is not another visible control`;
      contexts = contexts.flatMap(context => listedValues(other, scene.exampleData).map(value => ({ ...context, [name]: value })));
    }
    const drawn = contexts.map(context => values.map(value => new Map(evaluateScene(structuredClone(scene), scene.duration, { ...context, [input.name]: value }).state.objects.map(object => [object.id, substance(object)]))));
    for (const target of experiment.affects) {
      for (let i = 1; i < values.length; i += 1) {
        if (drawn.every(series => series[i].get(target) === series[i - 1].get(target))) {
          return `presentation: experiment "${experiment.id}" says "${input.name}" changes "${target}", but it draws the same at ${input.name} = ${JSON.stringify(values[i - 1])} and ${JSON.stringify(values[i])} (a moved highlight does not count): make every setting change it, or do not list it in affects`;
        }
      }
    }
  }
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

// The card as a learner meets it, for the verifier pass (agents/learn-scene-verify.js): every shown object at the defaults,
// then, for every other setting the gates check (inputStates: all combinations), what changes. Numbers as the renderer prints them (formatCell).
export function cardAtSettings(scene) {
  const declared = (scene.inputs || []).filter(input => !input.hidden);
  const named = (input, value) => {
    if (input.type === 'bool') return value ? 'on' : 'off';
    if (input.type === 'choice') return input.options?.find(option => option.id === value)?.label ?? value;
    const entry = input.type === 'index' ? scene.exampleData?.[input.of]?.[value] : undefined;
    return typeof entry === 'string' || typeof entry === 'number' ? `${entry} (position ${value})` : JSON.stringify(value);
  };
  const lines = [`Controls: ${declared.map(input => `${input.name} ("${input.label}")`).join('; ') || 'none'}.`];
  let defaults = null;
  for (const inputs of inputStates(scene)) {
    const { state, inputs: values } = evaluateScene(structuredClone(scene), scene.duration, inputs);
    const shown = new Map(state.objects.filter(object => object.visible && object.opacity > 0.01).map(object => [object.id, describe(object)]).filter(([, words]) => words));
    const setting = declared.map(input => `${input.name} = ${named(input, values[input.name])}`).join(', ') || 'the only setting';
    lines.push('', `Setting ${setting}${defaults ? ' (only what differs from the defaults):' : ' (the defaults):'}`,
      ...[...shown].filter(([id, words]) => defaults?.get(id) !== words).map(([id, words]) => `- ${id}: ${words}`));
    defaults ||= shown;
  }
  return lines.join('\n');
}
function describe(object) {
  const label = object.label ? ` "${object.label}"` : '';
  if (Array.isArray(object.tokens) && object.tokens.length) return `${object.type}${label}: ${object.tokens.join(' | ')}`;
  if (!Array.isArray(object.values)) return label ? `${object.type}${label}` : null;
  const cells = values => values.map(value => (value == null ? '(blank)' : formatCell(value, object.numberFormat || undefined))).join(', ');
  const cols = object.cols || object.values.length;
  const drawn = object.type === 'grid' ? Array.from({ length: object.rows || 1 }, (_, row) => `[${cells(object.values.slice(row * cols, (row + 1) * cols))}]`).join(' ') : `[${cells(object.values)}]`;
  const axes = [object.rowLabels?.length && `rows ${object.rowLabels.join(' | ')}`, object.columnLabels?.some(Boolean) && `columns ${object.columnLabels.join(' | ')}`,
    object.labels?.length && `bars ${object.labels.join(' | ')}`].filter(Boolean).join('; ');
  return `${object.type}${label}${axes ? ` (${axes})` : ''}: ${drawn}${object.cellHighlight != null ? `; highlighted ${JSON.stringify(object.cellHighlight)}` : ''}`;
}
