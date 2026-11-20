// The blueprint checker (Brief 38 spec section 5): code only, no model. checkBlueprint(value) -> { ok, problems, notes, measured, failed }. Each problem is { code, path, message, check }; the message is one sentence
// that names the field and that the model can act on, built from the blueprint's own ids and numbers (no subject word lives here). At most 12 problems are returned. The checks run in order and a later group runs
// only when the earlier ones pass. The model's function runs only in the pinned QuickJS engine (interact-blueprint-run.js). Texts that go into an /explain spec are counted by /explain's own parser
// (parseTutorDiagram, which applies its shownLength inside); a picture's room is measured with the renderer (renderTutorDiagram with figureOptions) and the card's own texts with the layout module (arrangeText).
import { checkForm } from './interact-blueprint-form.js';
import { blueprintRunner, getEngine } from './interact-blueprint-run.js';
import {
  FRAME_MS, MAX_PROBLEMS, MIN_MOVE_PX, REL_TOLERANCE, SAMPLE_POSITIONS, SAMPLE_TIMES, SELECT_BUTTON_PAD_PX, SELECT_GAP_PX, SELECT_ROW_PX, STAGE_MIN_HEIGHT, TURN_LIMIT, WINDOW_PAD_PX, WINDOW_TIMES, GRAPH_SAMPLES, KEPT_SAMPLES,
} from './interact-blueprint-constants.js';
import { curveOf, defaultsOf, fitWindow, linesAt, outputsOfPart, pointsOf, reachOf, resolve, rolesOf, settingsGrid, specOf, timesOf, turnsOf, valueText, yRangeOf } from './interact-blueprint-build.js';
import { blueprintCardSchema, place, source as programSourceOf } from './interact-templates/blueprint.js';
import { DRAWN_TEXT_SIZES, LayoutError, figureOptions, layoutById, pickLayout } from './interact-layout.js';
import { renderTutorDiagram } from './tutor-diagrams/TutorDiagram.js';
import { parseTutorDiagram } from './tutor-diagrams/spec.js';
import { textWidth } from './tutor-diagrams/primitives.js';
import { CONTRACT_LIMITS } from './explain-program/contract.js';
import { runProgram } from './explain-program/runtime.js';

const code = text => `\`${text}\``;
const num = value => (Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000));
const near = (a, b) => Math.abs(a - b) <= REL_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
const grid = (a, b, n) => Array.from({ length: n }, (_, k) => a + (b - a) * k / (n - 1));
const describe = (setting, time) => (time === null || time === undefined ? setting.name : `${setting.name}, t = ${num(time)}`);

// ---- check 2: names ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function checkNames(blueprint, seeded = null) {
  const out = [], bad = (path, message) => out.push({ code: 'names', path, message });
  const dups = (ids, path, group) => ids.forEach((id, k) => { if (ids.indexOf(id) !== k) bad(path(k), `${code(path(k))} repeats ${code(id)}; an id is unique among ${group}.`); });
  dups(blueprint.quantities.map(entry => entry.id), k => `quantities[${k}].id`, 'the quantities');
  dups(blueprint.things.map(entry => entry.id), k => `things[${k}].id`, 'the things');
  const controlsAndOutputs = [...blueprint.inputs.map((entry, k) => [entry.id, `inputs[${k}].id`]), ...blueprint.math.outputs.map((entry, k) => [entry.id, `math.outputs[${k}].id`])];
  controlsAndOutputs.forEach(([id, path], k) => { if (controlsAndOutputs.findIndex(([other]) => other === id) !== k) bad(path, `${code(path)} repeats ${code(id)}; an id is unique among the controls and the outputs together.`); });
  dups(blueprint.pictures.main.parts.map(entry => entry.id), k => `pictures.main.parts[${k}].id`, 'the parts');
  const outputs = new Map(blueprint.math.outputs.map(entry => [entry.id, entry.kind])), inputs = new Map(blueprint.inputs.map(entry => [entry.id, entry])), things = new Set(blueprint.things.map(entry => entry.id));
  const number = (id, path) => { if (!outputs.has(id)) bad(path, `${code(path)} names ${code(id)}, which is not a declared output.`); else if (outputs.get(id) !== 'number') bad(path, `${code(path)} names ${code(id)}, a ${outputs.get(id)} output; a number output is needed here.`); };
  const thing = (id, path) => { if (!things.has(id)) bad(path, `${code(path)} names ${code(id)}, which is not one of the things.`); };
  const coordinate = (entry, path) => { if (typeof entry === 'string') number(entry, path); };
  blueprint.pictures.main.parts.forEach((part, k) => {
    const base = `pictures.main.parts[${k}]`;
    for (const key of ['from', 'to', 'at']) if (part[key] && part.type !== 'rect') part[key].forEach((entry, i) => (part.type === 'trace' ? number(entry, `${base}.${key}[${i}]`) : coordinate(entry, `${base}.${key}[${i}]`)));
    if (part.type === 'dot' && !['small', 'medium', 'large'].includes(part.size)) number(part.size, `${base}.size`);
    if (part.of !== undefined) thing(part.of, `${base}.of`);
    // brief 43: a label names the part it is near; that part exists and is not a label (a stored label that still has `at` names none)
    if (part.type === 'label' && part.near !== undefined) {
      const target = blueprint.pictures.main.parts.find(other => other.id === part.near);
      if (!target) bad(`${base}.near`, `${code(`${base}.near`)} names ${code(part.near)}, which is not a part of the picture.`);
      else if (target.type === 'label') bad(`${base}.near`, `${code(`${base}.near`)} names ${code(part.near)}, a label; a label is near a part that is not a label.`);
    }
  });
  const panel = blueprint.pictures.panel;
  if (panel) {
    const over = panel.x.over;
    if (over !== 'time' && inputs.get(over)?.type !== 'number') bad('pictures.panel.x.over', `${code('pictures.panel.x.over')} is ${code(over)}; it must be "time" or the id of a number control.`);
    panel.series.forEach((series, k) => { number(series.value, `pictures.panel.series[${k}].value`); thing(series.of, `pictures.panel.series[${k}].of`); });
  }
  blueprint.values.forEach((entry, k) => { number(entry.value, `values[${k}].value`); thing(entry.of, `values[${k}].of`); });
  blueprint.explanation.cases.forEach((entry, k) => { if (!outputs.has(entry.when)) bad(`explanation.cases[${k}].when`, `${code(`explanation.cases[${k}].when`)} names ${code(entry.when)}, which is not a declared output.`); else if (outputs.get(entry.when) !== 'flag') bad(`explanation.cases[${k}].when`, `${code(`explanation.cases[${k}].when`)} names ${code(entry.when)}, a ${outputs.get(entry.when)} output; a flag output is needed here.`); });
  let namesAnInput = false;
  blueprint.claims.forEach((claim, k) => {
    const base = `claims[${k}]`, control = (id, key, numberOnly) => {
      namesAnInput = true;
      if (!inputs.has(id)) bad(`${base}.${key}`, `${code(`${base}.${key}`)} names ${code(id)}, which is not a control.`);
      else if (numberOnly && inputs.get(id).type !== 'number') bad(`${base}.${key}`, `${code(`${base}.${key}`)} names ${code(id)}, a ${inputs.get(id).type} control; a claim that a value rises or falls needs a number control.`);
    };
    number(claim.value, `${base}.value`);
    if (claim.type === 'unchanged') control(claim.when, 'when', false);
    if (claim.type === 'increases' || claim.type === 'decreases') control(claim.with, 'with', true);
    if (claim.type === 'equal') number(claim.to, `${base}.to`);
    (claim.at ?? []).forEach((held, i) => {
      const input = inputs.get(held.input), path = `${base}.at[${i}]`;
      if (!input) bad(`${path}.input`, `${code(`${path}.input`)} names ${code(held.input)}, which is not a control.`);
      else if (input.type === 'number' && typeof held.value !== 'number') bad(`${path}.value`, `${code(`${path}.value`)} must be a number for the number control ${code(held.input)}.`);
      else if (input.type === 'number' && (held.value < input.min || held.value > input.max)) bad(`${path}.value`, `${code(`${path}.value`)} is ${num(held.value)}, outside the range ${num(input.min)} to ${num(input.max)} of ${code(held.input)}.`);
      else if (input.type === 'select' && !input.options.some(option => option.value === held.value)) bad(`${path}.value`, `${code(`${path}.value`)} is not one of the options of ${code(held.input)}.`);
      else if (input.type === 'boolean' && typeof held.value !== 'boolean') bad(`${path}.value`, `${code(`${path}.value`)} must be true or false for the switch ${code(held.input)}.`);
    });
  });
  if (!namesAnInput) bad('claims', `${code('claims')}: at least one claim must name a control (unchanged "when", increases or decreases "with").`);
  blueprint.inputs.forEach((input, k) => {
    const base = `inputs[${k}]`;
    if (input.type === 'number') {
      if (!(input.min < input.max)) bad(base, `${code(base)}: the minimum ${num(input.min)} must be below the maximum ${num(input.max)}.`);
      else if (input.default < input.min || input.default > input.max) bad(`${base}.default`, `${code(`${base}.default`)} is ${num(input.default)}, outside the range ${num(input.min)} to ${num(input.max)}.`);
    }
    if (input.type === 'select') {
      const values = input.options.map(option => option.value);
      values.forEach((value, i) => { if (values.indexOf(value) !== i) bad(`${base}.options[${i}].value`, `${code(`${base}.options[${i}].value`)} repeats ${code(value)}; option values are unique.`); });
      if (!values.includes(input.default)) bad(`${base}.default`, `${code(`${base}.default`)} is ${code(input.default)}, which is not one of the options.`);
      const row = input.options.reduce((sum, option) => sum + textWidth(option.label, DRAWN_TEXT_SIZES.value) + SELECT_BUTTON_PAD_PX, 0) + SELECT_GAP_PX * (input.options.length - 1);
      if (row > SELECT_ROW_PX) bad(`${base}.options`, `${code(`${base}.options`)}: the option labels need about ${Math.round(row)} px in one row; a row has ${SELECT_ROW_PX} px. Shorten the labels or use fewer options.`);
    }
  });
  blueprint.quantities.forEach((quantity, k) => {
    const path = `quantities[${k}]`, isInput = inputs.has(quantity.id), isOutput = outputs.has(quantity.id);
    if (quantity.role === 'control' && !isInput) bad(`${path}.id`, `${code(`${path}.id`)} is a control quantity (${code(quantity.id)}) but no control has that id.`);
    if (quantity.role === 'result' && !isOutput) bad(`${path}.id`, `${code(`${path}.id`)} is a result quantity (${code(quantity.id)}) but no output of the math function has that id.`);
    if (quantity.role === 'fixed' && (isInput || isOutput)) bad(`${path}.id`, `${code(`${path}.id`)} is a fixed quantity (${code(quantity.id)}) but ${isInput ? 'a control' : 'an output'} has that id; a fixed quantity is held as a constant inside the function.`);
  });
  blueprint.inputs.forEach((input, k) => { if (!blueprint.quantities.some(quantity => quantity.id === input.id && quantity.role === 'control')) bad(`inputs[${k}].id`, `${code(`inputs[${k}].id`)} (${code(input.id)}) has no control quantity of that id; every control is a quantity with the role "control".`); });
  if ((blueprint.pictures.panel !== null) !== (blueprint.layout.pictureCount === 'two')) bad('layout.pictureCount', `${code('layout.pictureCount')} is "${blueprint.layout.pictureCount}" but ${blueprint.pictures.panel === null ? 'there is no panel' : 'there is a panel'}; it is "two" exactly when there is a panel.`);
  if (seeded) {
    if (JSON.stringify(blueprint.relationship) !== JSON.stringify(seeded.relationship)) bad('relationship', `${code('relationship')} is not the one you were given; use it exactly as given.`);
    if (JSON.stringify(blueprint.quantities) !== JSON.stringify(seeded.quantities)) bad('quantities', `${code('quantities')} are not the ones you were given; use them exactly as given, with their roles.`);
  }
  return out;
}

// ---- sampling: the function run over the grid (check 3) ---------------------------------------------------------------------------------------------------------------------------------
export async function sample(blueprint) {
  const runner = blueprintRunner(blueprint), settings = settingsGrid(blueprint), problems = [], seen = new Set();
  const checkTimes = timesOf(blueprint, SAMPLE_TIMES), fineTimes = timesOf(blueprint, WINDOW_TIMES), graphTimes = blueprint.pictures.panel?.x.over === 'time' ? timesOf(blueprint, GRAPH_SAMPLES) : [], all = [...checkTimes, ...fineTimes, ...graphTimes];
  const points = [], add = (key, message, path = 'math.code') => { if (!seen.has(key)) { seen.add(key); problems.push({ code: 'function', path, message }); } };
  for (const setting of settings) {
    const run = await runner.run(setting.inputs, all);
    if (run.error) { add(`engine:${run.error.code}`, run.error.code === 'runtime_limit' ? `${code('compute')} runs longer than ${FRAME_MS} ms for one call at ${describe(setting, 0)}; make it cheaper.` : `${code('compute')} does not load or run: ${run.error.detail}.`); break; }
    if (run.thrown) { add(`thrown:${run.thrown}`, `${code('compute')} throws at ${describe(setting, run.at)}: ${run.thrown}.`); break; }
    for (const problem of run.problems) add(`${problem.why}:${problem.id}`, problem.why === 'missing' ? `${code('compute')} returns no ${code(problem.id)} at ${describe(setting, problem.at)}.` : problem.why === 'not_finite' ? `${code(problem.id)} is not a finite number (it is ${problem.got}) at ${describe(setting, problem.at)}.` : `${code(problem.id)} is declared a flag but is ${problem.got} at ${describe(setting, problem.at)}; a flag is true or false.`);
    points.push({ ...setting, ms: run.ms, check: run.rows.slice(0, checkTimes.length), fine: run.rows.slice(checkTimes.length, checkTimes.length + fineTimes.length), graph: run.rows.slice(checkTimes.length + fineTimes.length) });
  }
  if (!problems.length) {
    const again = await runner.run(settings[0].inputs, checkTimes);
    if (JSON.stringify(again.rows) !== JSON.stringify(points[0].check)) add('deterministic', `${code('compute')} gives different outputs for the same inputs and time; it must be deterministic (no Math.random, no state kept between calls).`);
  }
  return { problems, points, runner, checkTimes, fineTimes };
}

// ---- checks 4 to 6: the parts -----------------------------------------------------------------------------------------------------------------------------------------------------------------
function checkParts(blueprint, sampled) {
  const out = [], bad = (check, path, message) => out.push({ code: check, path, message }), parts = blueprint.pictures.main.parts, base = sampled.points[0], first = base.check[0], last = base.check.at(-1);
  const moved = parts.some(part => pointsOf(part).some(point => { const a = resolve(point, first), b = resolve(point, last); return !near(a[0], b[0]) || !near(a[1], b[1]); }));
  if (!moved) return [{ code: 'moves', path: 'pictures.main', message: 'No part moves during the run at the default settings; make something move over time (a dot, a line end, an arrow).' }];
  // every control matters: it changes a part, a graph line or a shown value
  const used = new Set([...parts.flatMap(outputsOfPart), ...(blueprint.pictures.panel?.series.map(series => series.value) ?? []), ...blueprint.values.map(entry => entry.value)]);
  for (const input of blueprint.inputs) {
    if (blueprint.pictures.panel?.x.over === input.id) continue;
    const changed = sampled.points.filter(setting => setting.changed.length === 1 && setting.changed[0] === input.id);
    const matters = changed.some(setting => setting.check.some((row, k) => [...used].some(id => !near(row[id], base.check[k][id]))));
    if (!matters) bad('inputs_matter', `inputs.${input.id}`, `${code(input.id)} changes nothing the learner can see: no part, graph line or shown value depends on it.`);
  }
  if (out.length) return out;
  // drawable
  const rows = sampled.points.flatMap(setting => [...setting.check, ...setting.fine]), reach = reachOf(blueprint, rows);
  parts.forEach((part, k) => { if (part.type === 'dot' && !['small', 'medium', 'large'].includes(part.size)) { const values = rows.map(row => row[part.size]), low = Math.min(...values), high = Math.max(...values); if (low < -REL_TOLERANCE || high > 1 + REL_TOLERANCE) bad('parts_drawable', `pictures.main.parts[${k}].size`, `${code(`pictures.main.parts[${k}].size`)} names ${code(part.size)}, which must stay between 0 and 1; it reaches ${num(low)} to ${num(high)}.`); } });
  let box = null;
  try { box = layoutById(pickLayout(blueprint.layout, { hasPanel: blueprint.pictures.panel !== null })).slots.stage.box; } catch { /* check 9 reports a layout the module does not take */ }
  if (box) {
    const window = fitWindow(reach, box, WINDOW_PAD_PX);
    if (!window) return [...out, { code: 'parts_drawable', path: 'pictures.main', message: 'The parts reach a single point at every setting and time, so there is nothing to draw at a scale; spread the parts out.' }];
    let best = { px: 0, id: null };
    parts.forEach(part => pointsOf(part).forEach(point => {
      const at = rows.map(row => resolve(point, row)), spanX = Math.max(...at.map(p => p[0])) - Math.min(...at.map(p => p[0])), spanY = Math.max(...at.map(p => p[1])) - Math.min(...at.map(p => p[1])), px = Math.hypot(spanX, spanY) * window.s;
      if (px > best.px) best = { px, id: part.id };
    }));
    if (best.px < MIN_MOVE_PX) bad('parts_drawable', 'pictures.main', `The parts move ${Math.round(best.px)} px at the scale needed to show all of them (${num(window.s)} px per unit); bring the parts closer together or make the motion larger. The part that moves most is ${code(best.id)}.`);
  }
  return out;
}

// ---- check 7: a kind picture is drawable ------------------------------------------------------------------------------------------------------------------------------------------------------
export async function sampleGraph(blueprint, sampled) {
  const panel = blueprint.pictures.panel;
  if (!panel) return { out: [], plot: null };
  const over = panel.x.over, input = blueprint.inputs.find(entry => entry.id === over), xs = over === 'time' ? grid(0, blueprint.time.duration, GRAPH_SAMPLES) : grid(input.min, input.max, GRAPH_SAMPLES), values = panel.series.map(series => series.value);
  const curves = []; // { setting, time, ys: [per series] }
  for (const setting of sampled.points) {
    if (over === 'time') curves.push({ setting, time: null, ys: values.map(id => setting.graph.map(row => row[id])) });
    else for (const time of sampled.checkTimes) {
      const run = await sampled.runner.sweep(setting.inputs, over, xs, time);
      curves.push({ setting, time, ys: values.map(id => run.rows.map(row => row[id])) });
    }
  }
  const yRange = yRangeOf(curves.flatMap(entry => entry.ys.flat())), plot = { title: panel.title, over, x: { label: panel.x.label, unit: panel.x.unit }, xRange: [xs[0], xs.at(-1)], y: { label: panel.y.label, unit: panel.y.unit }, yRange, series: rolesOf(blueprint).series };
  return { out: [], plot, curves, xs, yRange, values };
}
function checkGraph(blueprint, graph) {
  const out = [], bad = (path, message) => out.push({ code: 'graph', path, message });
  if (!graph.plot) return out;
  const panel = blueprint.pictures.panel, { curves, xs, plot } = graph, turnCount = new Map();
  panel.series.forEach((series, k) => {
    const defaults = curves.filter(entry => entry.setting.name === 'the defaults'), flat = defaults.every(entry => Math.max(...entry.ys[k]) - Math.min(...entry.ys[k]) <= REL_TOLERANCE * Math.max(1, Math.abs(entry.ys[k][0])));
    if (flat) bad(`pictures.panel.series[${k}]`, `${code(`pictures.panel.series[${k}]`)} (${code(series.value)}) is a flat line at the default settings; draw a quantity that changes.`);
    for (const entry of curves) {
      const turns = turnsOf(entry.ys[k]);
      if (turns > (turnCount.get(series.value)?.turns ?? -1)) turnCount.set(series.value, { turns, at: entry });
    }
  });
  for (const [id, { turns, at }] of turnCount) if (turns > TURN_LIMIT) bad('pictures.panel', `${code(id)} turns ${turns} times ${panel.x.over === 'time' ? `in ${num(blueprint.time.duration)} s` : `across the range of ${code(panel.x.over)}`} at ${describe(at.setting, at.time)}; at most ${TURN_LIMIT} can be drawn. ${panel.x.over === 'time' ? 'Shorten the run.' : 'Narrow the range.'}`);
  if (out.length) return out;
  for (const entry of curves) {
    const spec = specOf(plot, entry.ys.map(ys => curveOf(xs, ys, plot.yRange, KEPT_SAMPLES)));
    try { parseTutorDiagram(spec); } catch (error) {
      let message = String(error.message);
      try { const issues = JSON.parse(message); message = issues.map(issue => `${issue.path.slice(1).join('.')}: ${issue.message}`).slice(0, 2).join('; '); } catch { /* not JSON */ }
      return [{ code: 'graph', path: 'pictures.panel', message: `The graph is refused by the /explain parser at ${describe(entry.setting, entry.time)}: ${message}.` }];
    }
  }
  return out;
}

// ---- check 8: the claims hold --------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function checkClaims(blueprint, sampled) {
  const out = [], defaults = defaultsOf(blueprint), times = sampled.checkTimes, positions = input => (input.type === 'number' ? grid(input.min, input.max, SAMPLE_POSITIONS).map(v => Math.round(v * 1e9) / 1e9) : input.type === 'select' ? input.options.map(option => option.value) : [false, true]);
  const held = claim => ({ ...defaults, ...Object.fromEntries((claim.at ?? []).map(entry => [entry.input, entry.value])) });
  for (const [k, claim] of blueprint.claims.entries()) {
    const label = `Claim ${k + 1}`;
    if (claim.type === 'equal') {
      const run = await sampled.runner.run(held(claim), times);
      const miss = run.rows.findIndex(row => !near(row[claim.value], row[claim.to]));
      if (miss >= 0) out.push({ code: 'claims', path: `claims[${k}]`, message: `${label} fails: ${code(claim.value)} is not equal to ${code(claim.to)}${claim.at ? ` at ${claim.at.map(entry => `${entry.input} = ${entry.value}`).join(', ')}` : ' at the defaults'} (${num(run.rows[miss][claim.value])} against ${num(run.rows[miss][claim.to])} at t = ${num(times[miss])}).` });
      continue;
    }
    const id = claim.type === 'unchanged' ? claim.when : claim.with, input = blueprint.inputs.find(entry => entry.id === id), values = positions(input), columns = [];
    for (const value of values) { const run = await sampled.runner.run({ ...held(claim), [id]: value }, times); columns.push(run.rows.map(row => row[claim.value])); }
    for (let t = 0; t < times.length; t++) {
      const series = columns.map(column => column[t]);
      if (claim.type === 'unchanged') { const lo = Math.min(...series), hi = Math.max(...series); if (!near(lo, hi)) { out.push({ code: 'claims', path: `claims[${k}]`, message: `${label} fails: ${code(claim.value)} is not unchanged when ${code(id)} goes from ${num(values[0])} to ${num(values.at(-1))} (${num(lo)} to ${num(hi)}${times[t] ? ` at t = ${num(times[t])}` : ''}).` }); break; } }
      else {
        const up = claim.type === 'increases', badAt = series.findIndex((v, i) => i > 0 && (up ? !(v > series[i - 1] && !near(v, series[i - 1])) : !(v < series[i - 1] && !near(v, series[i - 1]))));
        if (badAt > 0) { out.push({ code: 'claims', path: `claims[${k}]`, message: `${label} fails: ${code(claim.value)} does not ${up ? 'rise' : 'fall'} as ${code(id)} rises from ${num(values[badAt - 1])} to ${num(values[badAt])} (${num(series[badAt - 1])} to ${num(series[badAt])}${times[t] ? ` at t = ${num(times[t])}` : ''}).` }); break; }
      }
    }
  }
  return out;
}

// ---- checks 9 and 10: the layout and the Program --------------------------------------------------------------------------------------------------------------------------------------------
function layoutProblem(error) { return { code: 'layout', path: Array.isArray(error.path) ? error.path.join('.') : String(error.path ?? 'layout'), message: `The layout refuses the scene (${error.code}): ${error.message}.` }; }
function measure(blueprint, sampled, graph) {
  const rows = sampled.points.flatMap(setting => [...setting.check, ...setting.fine]), reach = reachOf(blueprint, rows);
  const valueTexts = blueprint.values.map(entry => { const texts = [...new Set(rows.map(row => valueText(entry, row[entry.value])))]; return texts.sort((a, b) => textWidth(b, DRAWN_TEXT_SIZES.value) - textWidth(a, DRAWN_TEXT_SIZES.value))[0]; });
  const variants = [...new Set(rows.map(row => JSON.stringify(linesAt(blueprint, row))))].map(text => JSON.parse(text));
  return { reach, yRange: graph.plot ? graph.plot.yRange : null, valueTexts, variants, plot: null };
}
function renderPlot(blueprint, graph, height, figureParts = { legend: 'always' }) {
  const answers = { ...blueprint.layout, figureParts }, figure = figureOptions(answers, height ? { height } : undefined), { box } = figure.options;
  const entries = [graph.curves.find(entry => entry.setting.name === 'the defaults'), graph.curves.at(-1), graph.curves.at(-2)].filter(Boolean);
  const rendered = entries.map(entry => renderTutorDiagram(specOf(graph.plot, entry.ys.map(ys => curveOf(graph.xs, ys, graph.plot.yRange, KEPT_SAMPLES))), box.width, figure.options));
  const [first] = rendered, min = { width: Math.max(...rendered.map(r => r.min.width)), height: Math.max(...rendered.map(r => r.min.height)) };
  const result = { geometry: { min, plotArea: first.geometry.plotArea, x: { min: first.geometry.x.min, max: first.geometry.x.max }, y: { min: first.geometry.y.min, max: first.geometry.y.max } }, box };
  // brief 44: a graph that is too tall for its box by no more than its title's height is asked of the renderer again with parts.title false; if that fits, the graph is drawn without its title (figureParts is carried in the measured data for Build)
  const title = first.min.parts?.find(entry => entry.axis === 'height' && entry.part === 'title');
  if (!title || min.height <= box.height || min.height - box.height > title.px) return result;
  const again = renderPlot({ ...blueprint, layout: { ...blueprint.layout } }, graph, height, { legend: 'always', title: false });
  return again.geometry.min.height <= box.height ? { ...again, figureParts: { title: false } } : result;
}
function checkLayout(blueprint, sampled, graph) {
  const measured = measure(blueprint, sampled, graph);
  try {
    pickLayout(blueprint.layout, { hasPanel: blueprint.pictures.panel !== null });
    if (graph.plot) {
      const sized = renderPlot(blueprint, graph, undefined);
      measured.plot = { geometry: sized.geometry };
      const first = place({ blueprint, measured }), final = renderPlot(blueprint, graph, first.figure.h);
      measured.plot = { geometry: final.geometry, ...(final.figureParts ? { figureParts: final.figureParts } : {}) };
    }
    place({ blueprint, measured });
  } catch (error) { if (error instanceof LayoutError || error.name === 'LayoutError') return { problems: [layoutProblem(error)], measured }; throw error; }
  return { problems: [], measured };
}

async function checkProgram(blueprint, sampled, measured) {
  const out = [], notes = [], dropped = [], bad = message => out.push({ code: 'program', path: 'math.code', message });
  let source;
  try { source = programSourceOf({ geometry: { blueprint: { blueprint, measured } } }); } catch (error) { return [{ code: 'program', path: error.path ?? 'blueprint', message: `The Program cannot be built: ${error.message}.` }]; }
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > CONTRACT_LIMITS.sourceBytes) return [{ code: 'program', path: 'math.code', message: `The Program is ${bytes} bytes; at most ${CONTRACT_LIMITS.sourceBytes}. The function and the texts are too long; shorten ${code('compute')}.` }];
  const { parseFrame } = await import('./explain-program/contract.js'), { normalizeFrame } = await import('./explain-program/frame.js'), { frameOverlaps, layoutProblems } = await import('./explain-program/frame-overlap.js');
  const engine = await getEngine(), settings = [sampled.points[0], sampled.points.at(-1), sampled.points.at(-2)].filter(Boolean), times = [0, blueprint.time.duration / 2, blueprint.time.duration];
  let worst = 0, objects = 0;
  for (const setting of settings) for (const time of times) {
    const started = performance.now(), run = runProgram(engine, { source, request: { requestId: '1', inputs: setting.inputs, time, seed: 1, state: null }, sdkVersion: 'sdk-8' }), ms = performance.now() - started;
    worst = Math.max(worst, ms);
    if (!run.ok) { bad(run.code === 'runtime_limit' ? `One frame takes longer than ${FRAME_MS} ms at ${describe(setting, time)}; make ${code('compute')} cheaper (the Program calls it up to 129 times per frame).` : `The Program does not run at ${describe(setting, time)}: ${run.detail}.`); return { out, source, worst, objects }; }
    const frame = run.value.frame; objects = Math.max(objects, frame.objects.length);
    // brief 44: a label with no clear side is left out of the frame by the program and counted (notes and measured.facts.droppedLabels); it no longer fails the check.
    const drawn = new Set(frame.objects.map(object => object.id)), parts = blueprint.pictures.main.parts, leftOut = parts.filter(part => part.type === 'label' && !drawn.has(`part.${part.id}`) && (part.near === undefined || drawn.has(`part.${part.near}`)));
    leftOut.forEach(part => { notes.push(`label ${part.id} left out at ${describe(setting, time)}: no clear side`); dropped.push({ label: part.id, near: part.near ?? null, at: describe(setting, time) }); });
    if (frame.objects.length >= CONTRACT_LIMITS.objects) bad(`One frame has ${frame.objects.length} objects; at most ${CONTRACT_LIMITS.objects - 1}. Draw fewer parts.`);
    const parsed = parseFrame(frame); if (!parsed.ok) { bad(`The frame is refused by the host at ${describe(setting, time)}: ${parsed.error ?? JSON.stringify(parsed).slice(0, 160)}.`); return { out, source, worst, objects }; }
    const normalized = normalizeFrame(frame); if (!normalized.ok) { bad(`The frame cannot be normalized at ${describe(setting, time)}.`); return { out, source, worst, objects }; }
    const overlaps = frameOverlaps({ ...frame, bodySize: 14 }), problems = layoutProblems({ ...frame, bodySize: 14 });
    if (overlaps.length || problems.length) { bad(`Things overlap in the frame at ${describe(setting, time)}: ${JSON.stringify([...overlaps, ...problems][0]).slice(0, 160)}.`); return { out, source, worst, objects }; }
  }
  if (worst > FRAME_MS) bad(`One frame takes ${Math.round(worst)} ms; the limit is ${FRAME_MS}. Make ${code('compute')} cheaper.`);
  return { out, notes, dropped, source, worst, objects };
}

// ---- the whole checker ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// light: the form, the names, the function run over the grid, and the claims only (MVP 1 as cut by the owner, 2026-11-19): no moves, controls-matter, parts, graph, layout or Program checks and no measured facts.
// legacyLabels (offline only, brief 43): a stored blueprint whose label still has `at` (brief 41's) is checked as it is; its labels are placed around that point. The form check sees each such label with a stand-in `near`.
// through: the last check to run. 10 (the default, Build's) builds the Program and tests the frame; the design phase asks for 9 (brief 42): the blueprint is checked as a design, and check 10 is Build's.
const withStandIn = value => { const copy = structuredClone(value), first = copy.pictures?.main?.parts?.find(part => part.type !== 'label'); for (const part of copy.pictures?.main?.parts ?? []) if (part.type === 'label' && part.at && first) { delete part.at; part.near = first.id; } return copy; };
const withAtBack = (parsed, original) => { for (const part of parsed.pictures.main.parts) { const was = original.pictures.main.parts.find(other => other.id === part.id); if (part.type === 'label' && was?.at) { part.at = was.at; delete part.near; } } return parsed; };
export async function checkBlueprint(value, { seeded = null, light = false, through = 10, legacyLabels = false } = {}) {
  const notes = [], done = (failed, problems, measured = null) => ({ ok: !failed, failed, problems: problems.slice(0, MAX_PROBLEMS).map(problem => ({ ...problem, check: failed })), notes, measured });
  const form = checkForm(legacyLabels ? withStandIn(value) : value);
  if (!form.ok) return done(1, form.problems);
  const blueprint = legacyLabels ? withAtBack(form.value, value) : form.value;
  const names = checkNames(blueprint, seeded);
  if (names.length) return done(2, names);
  const sampled = await sample(blueprint);
  if (sampled.problems.length) return done(3, sampled.problems);
  if (light) { const lightClaims = await checkClaims(blueprint, sampled); return lightClaims.length ? done(8, lightClaims) : { ok: true, failed: 0, problems: [], notes, measured: null, blueprint }; }
  const parts = checkParts(blueprint, sampled);
  if (parts.length) return done(parts[0].code === 'moves' ? 4 : parts[0].code === 'inputs_matter' ? 5 : 6, parts);
  const graph = await sampleGraph(blueprint, sampled), graphProblems = checkGraph(blueprint, graph);
  if (graphProblems.length) return done(7, graphProblems);
  const claims = await checkClaims(blueprint, sampled);
  if (claims.length) return done(8, claims);
  const layout = checkLayout(blueprint, sampled, graph);
  if (layout.problems.length) return done(9, layout.problems, layout.measured);
  if (through < 10) return { ok: true, failed: 0, problems: [], notes, measured: layout.measured, blueprint };
  const program = await checkProgram(blueprint, sampled, layout.measured);
  const turns = {};
  if (graph.plot) graph.plot.series.forEach((series, k) => { turns[series.value] = Math.max(...graph.curves.map(entry => turnsOf(entry.ys[k]))); });
  const measured = { ...layout.measured, facts: { droppedLabels: program.dropped ?? [], turns, msPerFrameWorst: Math.round(program.worst * 10) / 10, programBytes: program.source ? new TextEncoder().encode(program.source).length : null, frameObjects: program.objects, msPerComputeBatch: Math.round(Math.max(...sampled.points.map(point => point.ms))) } };
  notes.push(...(program.notes ?? []));
  if (program.out.length) return done(10, program.out, measured);
  const card = blueprintCardSchema.safeParse({ blueprint: legacyLabels ? withStandIn(blueprint) : blueprint, measured });
  if (!card.success) return done(10, [{ code: 'program', path: 'blueprint', message: `What was measured does not fit the card's data: ${card.error.issues[0].message}.` }], measured);
  return { ok: true, failed: 0, problems: [], notes, measured, blueprint };
}
