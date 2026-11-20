// Brief 45, Build MVP 1 step 5 (spec section 5.3): the measurements code adds to the Build model's user message, from running the function and measuring text. No judgment, no subject word.
// measureBlueprint(blueprint, { kinds }) -> a JSON object: outputs (each number output's range over the sampled settings and times, each flag's values), reach (how far each COMPUTED part reaches, in the lesson's units; a fixed part is
// already in the blueprint), widths (px at the card's 14 px body size of every text that will be drawn), turns (how many times each graph line turns), kinds (the least sizes of kindsFacts, passed through).
// The blueprint may be a stored one whose label still has `at`: the form check is not run, the function is run directly (interact-blueprint-check.js sample, as the checker samples it).
import { sample, sampleGraph } from './interact-blueprint-check.js';
import { pointsOf, reachOf, turnsOf, valueText } from './interact-blueprint-build.js';
import { DRAWN_TEXT_SIZES } from './interact-layout.js';
import { textWidth } from './tutor-diagrams/primitives.js';
import { shownLength } from './tutor-diagrams/kind-limits.js';

const r3 = value => (Number.isFinite(value) ? Number(value.toPrecision(3)) : value);
const px = text => r3(textWidth(text, DRAWN_TEXT_SIZES.value)); // /explain's own counter, at the body size every text of the card is drawn at
const isOutput = entry => typeof entry === 'string' && !['small', 'medium', 'large'].includes(entry);

export async function measureBlueprint(blueprint, { kinds = {} } = {}) {
  const sampled = await sample(blueprint);
  if (sampled.problems.length) throw new Error(`the function does not run: ${sampled.problems[0].message}`);
  const rows = sampled.points.flatMap(setting => [...setting.check, ...setting.fine]), out = { outputs: {}, flags: {}, reach: {}, widths: {}, turns: {}, kinds };

  // (a) every output's range over every sampled setting and time; a flag is "true", "false" or "both"
  for (const output of blueprint.math.outputs) {
    const values = rows.map(row => row[output.id]);
    if (output.kind === 'number') out.outputs[output.id] = [r3(Math.min(...values)), r3(Math.max(...values))];
    else out.flags[output.id] = values.every(v => v === true) ? 'true' : values.every(v => v === false) ? 'false' : 'both';
  }
  // how far each computed part reaches: [minX, maxX, minY, maxY]; a label with `at` counts that point, a label near a part has none
  for (const part of blueprint.pictures.main.parts) {
    const points = pointsOf(part);
    if (!points.flat().some(isOutput)) continue;
    const box = reachOf({ pictures: { main: { parts: [part] } } }, rows);
    out.reach[part.id] = [r3(box.minX), r3(box.maxX), r3(box.minY), r3(box.maxY)];
  }

  // (b) widths in px of every text drawn: labels, arrow labels, each value's widest text, each explanation line, the formula as the layout module measures it, a kind picture's own texts (shown characters and px)
  const labels = {};
  for (const part of blueprint.pictures.main.parts) {
    if (part.type === 'label' && part.text) labels[part.id] = px(part.text);
    if (part.type === 'arrow' && part.label) labels[part.id] = px(part.label);
  }
  out.widths.labels = labels;
  out.widths.values = blueprint.values.map(entry => r3(Math.max(...rows.map(row => textWidth(valueText(entry, row[entry.value]), DRAWN_TEXT_SIZES.value)))));
  const { always, cases, otherwise } = blueprint.explanation;
  out.widths.explanation = { always: always.map(px), cases: cases.map(entry => px(entry.text)), ...(otherwise === undefined ? {} : { otherwise: px(otherwise) }) };
  if (blueprint.relationship.formula) out.widths.formula = px(`$${blueprint.relationship.formula}$`);
  const panel = blueprint.pictures.panel;
  if (panel?.type === 'kind') out.widths.kind = { title: [shownLength(panel.title), px(panel.title)], lines: (panel.series ?? []).map(series => [shownLength(series.label), px(series.label)]) };

  // (c) how many times each graph line turns, the most over the sampled settings (the checker's own graph sampling)
  if (panel?.type === 'kind' && panel.kind === 'coordinate-plot') {
    const graph = await sampleGraph(blueprint, sampled);
    panel.series.forEach((series, k) => { out.turns[series.value] = Math.max(...graph.curves.map(entry => turnsOf(entry.ys[k]))); });
  }
  return out;
}
