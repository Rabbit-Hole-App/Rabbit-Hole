import { derived } from './topic-recurrent-networks-data.js';
import manifest from './topic-recurrent-networks-sources.json' with { type: 'json' };
const d = derived(), u = d.update, l = d.language;
const spec = diagram => ({ version: 1, diagram });
const edge = (from, to, label) => ({ from, to, label });
const updateOverview = { kind: 'block-stack', title: 'One cell rule reused at every position',
  blocks: [{ id: 'combine', label: 'Combine previous state and fresh input' }, { id: 'activate', label: 'ReLU activation' }, { id: 'readout', label: 'Readout from new state', role: 'output' }],
  caption: `Toy $h_t=ReLU(${u.parameters.a}h_{prev}+x_t)$; $y_t=${u.parameters.readout}h_t$. The same parameters apply at both positions.` };
const update = { kind: 'relationship', layout: 'graph', title: 'Fresh inputs, state handoff and both outputs',
  nodes: [{ id: 'h0', label: 'Initial state' }, ...u.rows.map(row => ({ id: 'h' + row.step, label: 'State h' + row.step })),
    ...u.rows.map(row => ({ id: 'x' + row.step, label: 'Fresh x' + row.step })), ...u.rows.map(row => ({ id: 'y' + row.step, label: 'Output y' + row.step }))],
  edges: [edge('h0', 'h1', 'scaled carry'), edge('h1', 'h2', 'scaled carry'), edge('x1', 'h1', 'add before ReLU'), edge('x2', 'h2', 'add before ReLU'), edge('h1', 'y1', 'scale activation'), edge('h2', 'y2', 'scale activation')],
  caption: `Toy $h=ReLU(${u.parameters.a}h_{prev}+x)$, $y=${u.parameters.readout}h$; $h_0=${u.parameters.h0}$, $x=(${u.parameters.inputs.join(',')})$. Each input is observed independently; each new state feeds a readout.` };
const cell = { kind: 'block-stack', title: 'Inside the same recurrent cell',
  blocks: [{ id: 'combine', label: `Combine: $z=${u.parameters.a}h_{prev}+x+${u.parameters.bias}$` }, { id: 'activate', label: 'ReLU: $h=max(0,z)$' }, { id: 'readout', label: 'Readout: $y=2h$', role: 'output' }],
  caption: 'The toy bias is zero. Combine prior state and new input before the activation; read out only after activation.' };
const rectified = { kind: 'coordinate-plot', title: 'Activation can remove a negative combination',
  x: { label: 'Step', min: 0, max: u.rows.length + 1, integerTicks: true }, y: { label: 'Cell value', min: -2, max: 2 },
  series: [['Before ReLU', 'z'], ['After ReLU', 'h']].map(([label, key]) => ({ label, kind: 'stem', points: u.rows.map(row => ({ x: row.step, y: row[key] })) })),
  caption: `Same $h_0=${u.parameters.h0}$, $x=(${u.parameters.inputs.join(',')})$; $z=${u.parameters.a}h_{prev}+x$. ReLU gives $max(0,z)$; negative second combination becomes zero.` };
const outputs = { kind: 'bar-chart', title: 'Readout follows the activated state', unit: 'Output',
  bars: u.rows.map(row => ({ label: 'y' + row.step, value: row.y })),
  caption: '$y_t=2h_t$ after ReLU. The zero second output follows the activation, not a missing input or state handoff.' };
const alignment = { kind: 'matrix', title: 'Observed prefix, internal state, next target', columns: ['Observed input', 'Prefix in state', 'Next target'],
  rows: l.rows.map(row => ({ heading: 'Step ' + row.step, cells: [row.input, row.prefix, row.target] })),
  caption: 'Toy observed birds cross rivers. Each hidden state summarizes its observed prefix; training compares its readout with the next token.' };
const training = { kind: 'relationship', layout: 'graph', title: 'Marked first prediction and next-token target',
  nodes: l.rows.flatMap(row => [{ id: 'x' + row.step, label: 'Observed ' + row.input }, { id: 'h' + row.step, label: 'h' + row.step + ': ' + row.prefix + ' prefix' }, { id: 'p' + row.step, label: 'Prediction p' + row.step }, { id: 'l' + row.step, label: 'Target ' + row.target }]),
  edges: [edge('x1', 'h1', 'encode observation'), edge('h1', 'h2', 'carry state'), edge('x2', 'h2', 'encode observation'), edge('h1', 'p1', 'softmax readout'), edge('h2', 'p2', 'softmax readout'), edge('p1', 'l1', 'worked example loss'), edge('p2', 'l2', 'next-token loss')],
  caption: `Observed inputs. $h=ReLU(${l.parameters.a}h_{prev}+x),h_0=${l.parameters.h0},x=(${l.rows.map(row=>l.parameters.features[row.input]).join(',')})$. $softmax(Uh+b)$ scores the next target.` };
const probabilities = { kind: 'bar-chart', title: 'First prefix trains a hidden representation', unit: 'Probability',
  bars: l.parameters.vocabulary.map((label, j) => ({ label, value: l.rows[0].probabilityBars[j] })),
  caption: `$h=${l.rows[0].state}$; $U=(${l.parameters.slopes.join(',')})$, $b=(${l.parameters.biases.join(',')})$. $p=softmax(Uh+b)$; target cross. $dL/dh=${l.rows[0].stateGradientShown}$; no quality guarantee.` };
const counterfactual = { kind: 'bar-chart', title: 'Keep the observed input after a sampled guess', unit: 'State h2',
  bars: [{ label: 'Observed ' + l.counterfactual.actualInput, value: l.counterfactual.observedState },
    { label: 'Hypothetical ' + l.counterfactual.guess, value: l.counterfactual.guessState }],
  caption: `Same first state; $h_{next}=ReLU(${l.parameters.a}h_{prev}+x)$. Training uses observed ${l.counterfactual.actualInput}, target ${l.rows[1].target}, even after a sampled ${l.counterfactual.guess} guess.` };
const designs = [
  { id: 'ml-recurrent-networks-recurrent-update', keywords: ['activated recurrent update', 'fresh input readout'],
    useWhen: 'Show an activated recurrent update with prior state, fresh input readout and shared cell parameters; not LSTM gates, backward gradients or a linear-only update.',
    paraphrases: ['Explain an activated recurrent update with two fresh inputs.', 'Trace fresh input readout through a shared recurrent cell.', 'Where does ReLU act in an activated recurrent update?', 'Compare both fresh input readout steps with state handoff.', 'Show activation before readout in an activated recurrent update.'],
    depths: { overview: { spec: spec(updateOverview) }, standard: { spec: spec(update), detailSpec: spec(cell) }, deep: { spec: spec(rectified), detailSpec: spec(outputs) } } },
  { id: 'ml-recurrent-networks-recurrent-next-token-training', keywords: ['recurrent prefix supervision', 'teacher forced states'],
    useWhen: 'Show recurrent prefix supervision, teacher forced states and shifted next-token targets; not autoregressive inference feedback, masked tokens, summarization or guaranteed downstream representation quality.',
    paraphrases: ['Explain recurrent prefix supervision with shifted observed targets.', 'Why do teacher forced states use observed words after a guess?', 'Show a hidden representation receiving recurrent prefix supervision.', 'Trace two teacher forced states and their next-token predictions.', 'Compare a sampled guess with the observed input in teacher forced states.'],
    depths: { overview: { spec: spec(alignment) }, standard: { spec: spec(training) }, deep: { spec: spec(probabilities), detailSpec: spec(counterfactual) } } },
];
export const references = Object.freeze(designs.map(({ id, ...design }) => {
  const row = manifest.references.find(entry => entry.referenceId === id);
  return { id, topic: row.topic, lessons: row.lessons,
    sources: [row.source, ...row.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })),
    prompts: [row.source.summary, ...row.alsoCovers.map(source => source.summary), ...design.paraphrases], ...design, ...design.depths.standard };
}));
export { derived };
