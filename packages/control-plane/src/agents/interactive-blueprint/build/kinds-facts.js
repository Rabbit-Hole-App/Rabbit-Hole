// Brief 45, Build MVP 1 step 2 (spec 8.2): kinds-facts, made once per request. For each kind picture the blueprint names (pictures.main.kind, pictures.panel.kind; a parts picture names none): the kind's limits as /explain counts them
// (kind-limits.js) and the renderer's least size in the box of each layout that has that picture's slot, with the optional parts (title, legend) on and off. Nothing here names a subject: numbers and field names only.
// kindsFacts(blueprint) -> { text, data }. `text` goes into the system prompt at the kinds-facts position; `data` is the same numbers as JSON, for the request's record. No kind picture: { text: '', data: {} }.
// Runs in Node and in a Worker: no fs, no DOM. The renderer folder is read, never changed.
import { kindLimits } from '../../../../../web/src/tutor-diagrams/kind-limits.js';
import { renderTutorDiagram } from '../../../../../web/src/tutor-diagrams/TutorDiagram.js';
import { LAYOUTS, DRAWN_TEXT_SIZES } from '../../../../../web/src/interact-layout.js';
import { sample, sampleGraph } from '../../../../../web/src/interact-blueprint-check.js';
import { curveOf, specOf } from '../../../../../web/src/interact-blueprint-build.js';
import { KEPT_SAMPLES } from '../../../../../web/src/interact-blueprint-constants.js';

const SIZE = DRAWN_TEXT_SIZES.value; // the body size every text of the card is drawn at (14)
// The optional parts the renderer takes: the title on or off, the legend always or none. Each combination is one entry of the least size.
const COMBOS = [['title + legend', { title: true, legend: 'always' }], ['title only', { title: true, legend: 'none' }], ['legend only', { title: false, legend: 'always' }], ['neither', { title: false, legend: 'none' }]];

// What the Build model can act on: the shown-character limit of each text of the kind and the counts of its top-level lists (not the nested point, annotation or sample fields).
const limitsOf = kind => kindLimits(kind).filter(entry => !/[|{]/.test(entry.path) && ((entry.type === 'text' && (entry.path.match(/\[\]/g) ?? []).length <= 1 && !entry.path.includes('points')) || (entry.type === 'list' && !entry.path.includes('.') && !entry.path.includes('[]'))))
  .map(({ path, type, min, max, optional }) => ({ path, type, min, max, optional }));

// The spec the renderer is asked: built from the blueprint as the checker builds it (renderPlot in interact-blueprint-check.js): the curves at the defaults, and at the last two settings.
async function plotSpecs(blueprint) {
  const sampled = await sample(blueprint);
  if (sampled.problems.length) throw new Error(`the function does not run: ${sampled.problems[0].message}`);
  const graph = await sampleGraph(blueprint, sampled);
  return [graph.curves.find(entry => entry.setting.name === 'the defaults'), graph.curves.at(-1), graph.curves.at(-2)].filter(Boolean)
    .map(entry => specOf(graph.plot, entry.ys.map(ys => curveOf(graph.xs, ys, graph.plot.yRange, KEPT_SAMPLES))));
}

// The options of figureOptions in interact-layout.js (box of the slot, every text size at the body size, the parts), built from a slot box directly because figureOptions takes the card's answers, not a layout id.
const optionsOf = (box, parts) => ({ box: { width: box[2], height: box[3] }, sizes: { title: SIZE, heading: SIZE, body: SIZE, small: SIZE }, parts });

// The least size of one picture in one slot box for one set of parts: the largest over the specs, as the checker takes it.
function leastIn(specs, box, parts) {
  const rendered = specs.map(spec => renderTutorDiagram(spec, box[2], optionsOf(box, parts))), first = rendered[0].min;
  return { width: Math.max(...rendered.map(entry => entry.min.width)), height: Math.max(...rendered.map(entry => entry.min.height)), parts: first.parts };
}

const partsText = list => list.map(entry => `${entry.part} ${entry.px}`).join(', ');

async function pictureFacts(blueprint, key) {
  const picture = blueprint.pictures[key];
  if (!picture || picture.type !== 'kind') return null;
  const slot = key === 'panel' ? 'panel' : 'stage', facts = { kind: picture.kind, slot, limits: limitsOf(picture.kind), least: null };
  // shortcut: the spec is built for coordinate-plot only (the one panel kind of the built blueprints); another kind is named with its limits and its least size is stated as not measured, upgrade when a second kind is built.
  if (picture.kind !== 'coordinate-plot' || key !== 'panel') return facts;
  const specs = await plotSpecs(blueprint);
  facts.least = {};
  for (const layout of LAYOUTS) {
    const box = layout.slots[slot]?.box;
    if (!box) continue; // a layout without this picture's slot cannot carry it: not listed
    facts.least[layout.id] = { box: [box[2], box[3]], combos: Object.fromEntries(COMBOS.map(([name, parts]) => { const { width, height } = leastIn(specs, box, parts); return [name, [width, height]]; })), parts: leastIn(specs, box, COMBOS[0][1]).parts };
  }
  return facts;
}

export async function kindsFacts(blueprint) {
  const data = {}, lines = [];
  for (const key of ['main', 'panel']) {
    const facts = await pictureFacts(blueprint, key);
    if (!facts) continue;
    data[key] = facts;
    lines.push(`The ${key} picture is a "${facts.kind}" kind picture, drawn by the renderer in the ${facts.slot} slot of the layout.`);
    lines.push(`Its limits, counted as shown: ${facts.limits.map(entry => `${entry.path} ${entry.type === 'list' ? 'has' : 'is'} ${entry.min ?? 0} to ${entry.max} ${entry.type === 'list' ? 'entries' : 'characters'}${entry.optional ? ' (optional)' : ''}`).join('; ')}.`);
    if (!facts.least) { lines.push('Its least size in each layout box is not measured.'); continue; }
    lines.push('Its least size in px (width x height) in the slot box of each layout that has the slot, with the optional parts on and off:');
    for (const [id, entry] of Object.entries(facts.least)) lines.push(`- ${id}, box ${entry.box[0]} x ${entry.box[1]}: ${Object.entries(entry.combos).map(([name, [w, h]]) => `${name} ${w} x ${h}`).join('; ')}.`);
    const distinct = [...new Set(Object.values(facts.least).map(entry => partsText(entry.parts)))];
    lines.push(distinct.length === 1 ? `What the least size is made of, in px, with the title and the legend on (the same in every layout box): ${distinct[0]}.` : `What the least size is made of, in px, with the title and the legend on: ${Object.entries(facts.least).map(([id, entry]) => `${id}: ${partsText(entry.parts)}`).join('. ')}.`);
  }
  return { text: lines.join('\n'), data };
}
