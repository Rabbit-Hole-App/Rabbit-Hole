import { derived } from './topic-recurrent-training-data.js';
import manifest from './topic-recurrent-networks-sources.json' with { type: 'json' };
const d = derived(), h = d.horizons, g = d.gradients;
const spec = diagram => ({ version: 1, diagram });
const edge = (from, to, label) => ({ from, to, label });
const reach = (schedules, title) => ({ kind: 'heatmap', title, columns: h.steps.map(i => 'h' + i),
  rowLabel: 'Final loss reach', columnLabel: 'Earlier state', range: { min: 0, max: 1 },
  rows: schedules.map(row => ({ label: row.name, cells: row.reach })),
  caption: 'Toy reach mask: a filled cell means a gradient path exists, not derivative size. Forward states pass every cutoff.' });
const fullFixed = { ...reach(h.schedules.slice(0, 2), 'Same forward states, different gradient reach'),
  columns: ['Reach count'], columnLabel: 'States reachable', range: { min: 0, max: h.steps.length },
  rows: h.schedules.slice(0, 2).map(row => ({ label: row.name, cells: [row.reachableCount] })),
  caption: 'Cells count states reachable from the same final loss, not gradient size. Forward state still passes every cutoff.' };
const schedule = { kind: 'timeline', title: 'Forward pass continues across gradient cuts', layout: 'scaled-lanes', domain: { min: 0, max: h.steps.length, unit: 'step' },
  lanes: [{ id: 'forward', label: 'Forward state', intervals: [{ id: 'pass', label: 'Continuous', start: 0, end: h.steps.length }] },
    ...h.schedules.slice(0, 3).map((row, i) => ({ id: 'lane' + i, label: row.name + ' gradient segments',
      intervals: row.segments.map(({ start, end }, j) => ({ id: 's' + i + j, label: String(end - start), start, end })) }))],
  caption: 'Lengths encode gradient horizons, not direction. Full, fixed and one irregular sample share the same uninterrupted forward pass.' };
const sampled = { ...reach(h.schedules.slice(2), 'Sampled final segments can be short or long'),
  rowLabel: 'Earlier state', columnLabel: 'Sampled boundary', columns: h.schedules.slice(2).map(row => row.name),
  rows: h.steps.map((step, i) => ({ label: 'h' + step, cells: h.schedules.slice(2).map(row => row.reach[i]) })),
  caption: 'Same final loss; $b$ is last cut, $A_s=1[s>b]$ encodes availability, not magnitude. Detach leaves forward values unchanged.' };
const stop = { kind: 'relationship', layout: 'graph', title: 'Backward signal stops; forward state passes',
  nodes: [...h.steps.map(i => ({ id: 'h' + i, label: 'h' + i })), { id: 'loss', label: 'Loss at h' + h.steps.at(-1) }, { id: 'detach', label: 'Detach' }],
  edges: [...h.steps.slice(0, -1).map(i => edge('h' + i, 'h' + (i + 1), 'forward')), edge('loss', 'h6', 'gradient'), edge('h6', 'h5', 'gradient'), edge('h5', 'detach', 'gradient')],
  caption: `Fixed final segment: gradient ends at Detach before h${h.schedules[1].boundaries.at(-2)}. Forward h${h.schedules[1].boundaries.at(-2)} to h${h.schedules[1].boundaries.at(-2)+1} still passes its value.` };
const overviewSum = { kind: 'bar-chart', title: 'Shared weight receives both time-use gradients', unit: 'dL/da',
  bars: g.perUse.map((value, i) => ({ label: 'Use ' + (i + 1), value })),
  caption: `Toy shared $a=${g.parameters.a}$; $h=ah_{prev}+x$. Per-use contributions add to ${g.totalGradient}; they are not separate weights.` };
const unroll = { kind: 'relationship', layout: 'graph', title: 'Shared recurrence and losses',
  nodes: [...g.states.map((_, i) => ({ id: 'h' + i, label: 'h' + i })), { id: 'a', label: 'Shared a' },
    ...g.predictions.map((_, i) => ({ id: 'p' + (i + 1), label: 'p' + (i + 1) })), ...g.losses.map((_, i) => ({ id: 'l' + (i + 1), label: 'L' + (i + 1) }))],
  edges: [edge('h0', 'h1', '+x1'), edge('h1', 'h2', '+x2'), edge('a', 'h1', 'scale carry'), edge('a', 'h2', 'scale carry'),
    edge('h1', 'p1', 'readout'), edge('h2', 'p2', 'readout'), edge('p1', 'l1', 'target y1'), edge('p2', 'l2', 'target y2')],
  caption: `Toy $h=${g.parameters.a}h_{prev}+x,h_0=${g.parameters.h0}$, $x=(${g.parameters.inputs.join(',')})$. $p=h,y=(${g.parameters.targets.join(',')}),L=${g.parameters.lossScale}(p-y)^${g.parameters.lossPower}$ per step.` };
const sharedOverview = { kind: 'relationship', layout: 'graph', title: 'Both losses train the same recurrent parameter',
  nodes: [{ id: 'a', label: 'Shared a' }, ...g.predictions.map((_, i) => ({ id: 'h' + (i + 1), label: 'State h' + (i + 1) })), ...g.losses.map((_, i) => ({ id: 'l' + (i + 1), label: 'Loss L' + (i + 1) }))],
  edges: [edge('a', 'h1', 'scale carry'), edge('a', 'h2', 'scale carry'), edge('h1', 'h2', 'handoff'), edge('h1', 'l1', 'via readout'), edge('h2', 'l2', 'via readout')],
  caption: 'One recurrent parameter set is reused. Both readout losses can train it through their own state and prior state uses.' };
const sensitivity = { kind: 'heatmap', title: 'Each loss reaches its prior states', columns: g.states.map((_, i) => 'h' + i),
  rowLabel: 'Loss', columnLabel: 'State', range: { min: 0, max: Math.max(...g.sensitivities.flat().filter(value => value !== null)) },
  rows: g.sensitivities.map((cells, i) => ({ label: 'L' + (i + 1), cells })),
  caption: 'Cells are $dL_t/dh_s=(p_t-y_t)a^{t-s}$; blank means future, not zero. Later loss also reaches earlier state uses.' };
const gradientBars = { ...overviewSum, title: 'Sum contributions to the one shared parameter',
  caption: `$dL/da=\\sum_t (dL/dh_t)h_{prev}=${g.perUse.join('+')}=${g.totalGradient}$. Earlier use includes later loss through state handoff.` };
const designs = [
  { id: 'ml-recurrent-training-gradient-horizons', keywords: ['gradient segment horizons', 'forward versus detach'],
    useWhen: 'Compare full, fixed and sampled gradient segment horizons while forward state passes; not state resets, forecast horizons or gradient magnitude.',
    paraphrases: ['Compare gradient segment horizons without resetting recurrent state.', 'Show forward versus detach at a fixed cutoff.', 'Why do sampled gradient segment horizons differ?', 'Trace forward versus detach for the final recurrent loss.', 'Contrast short and long gradient segment horizons.'],
    depths: { overview: { spec: spec(fullFixed) }, standard: { spec: spec(schedule) }, deep: { spec: spec(sampled), detailSpec: spec(stop) } } },
  { id: 'ml-recurrent-training-shared-parameter-gradients', keywords: ['loss state dependencies', 'shared gradient uses'],
    useWhen: 'Unroll shared recurrent parameter uses with per-step losses and loss state dependencies; not independent time weights, only a final loss, or optimizer updates.',
    paraphrases: ['Show loss state dependencies for a shared recurrent weight.', 'How do shared gradient uses add across time?', 'Trace loss state dependencies before summing parameter gradients.', 'Show shared gradient uses with two prediction losses.', 'Which prior states receive the later loss in loss state dependencies?'],
    depths: { overview: { spec: spec(sharedOverview) }, standard: { spec: spec(unroll) }, deep: { spec: spec(sensitivity), detailSpec: spec(gradientBars) } } },
];
export const references = Object.freeze(designs.map(({ id, ...design }) => {
  const row = manifest.references.find(entry => entry.referenceId === id);
  return { id, topic: row.topic, lessons: row.lessons, sources: [{ kind: 'figure-brief', path: row.source.brief, revision: manifest.sourceRevision }],
    prompts: [row.source.summary, ...row.alsoCovers.map(source => source.summary), ...design.paraphrases], ...design, ...design.depths.standard };
}));
export { derived };
