import { derived as toyDerived } from './topic-regularization-data.js';

const d = toyDerived();
const p = d.parameters.hidden;
const spec = diagram => ({ version: 1, diagram });
const bars = (title, values) => ({ kind: 'bar-chart', title, bars: values.map((value, i) => ({ label: ['Hidden A', 'Hidden B'][i], value })) });
const output = () => ({ kind: 'bar-chart', title: 'Output', bars: [{ label: 'Bias', value: d.parameters.hidden.outputBias }, { label: 'Prediction', value: d.hidden.selected.prediction }] });
const inputs = title => ({ kind: 'block-stack', title, blocks: [{ id: 'x', label: 'Input features' }, { id: 'z', label: title === 'Hidden features' ? 'ReLU features' : 'Affine map', inputs: [{ label: '$W,c$' }] }] });
const overview = { kind: 'panels', title: 'Learn nonlinear features', caption: 'Worked example. A hidden layer transforms the original features before the readout.', panels: [{ diagram: inputs('Hidden features') }, { diagram: output() }], links: [{ from: 0, to: 1, operation: 'Predict' }] };
function mechanism(deep) {
  return { kind: 'panels', title: 'A hidden layer changes the features',
    caption: `Worked example. $x=(${d.hidden.selected.input.join(',')})$, $W=(${p.weights.map(row => `(${row.join(',')})`).join(',')})$, $c=(${p.biases.join(',')})$, $v=(${p.readout.join(',')})$, $b=${p.outputBias}$.${deep ? ' $h\\ge0$.' : ''}`,
    panels: [{ diagram: inputs('Preactivation') }, { diagram: bars('After ReLU', d.hidden.selected.activations) }, { diagram: output() }],
    links: [{ from: 0, to: 1, operation: '$\\max(0,z)$' }, { from: 1, to: 2, operation: '$v\\cdot h+b$' }] };
}
const probePlot = (title, y) => ({ kind: 'coordinate-plot', title,
  x: { label: 'Hidden unit', min: 0, max: d.counts.hidden + d.parameters.hidden.outputBias },
  y: { label: 'Activation', min: Math.min(...d.hidden.probe.preactivations), max: Math.max(...d.hidden.probe.preactivations) },
  series: [{ label: 'A then B', kind: 'stem', samples: { x: d.hidden.probe.input.map((_, i) => i + 1), y } }] });
const probe = { kind: 'panels', title: 'ReLU clips a negative preactivation', caption: `Worked example. Input $(${d.hidden.probe.input.join(',')})$; weights unchanged.`,
  panels: [{ diagram: probePlot('Before ReLU', d.hidden.probe.preactivations) }, { diagram: probePlot('After ReLU', d.hidden.probe.activations) }],
  links: [{ from: 0, to: 1, operation: '$\\max(0,z)$' }], shared: ['axis'] };

export const references = Object.freeze([{
  id: 'ml-neural-networks-hidden-layer', topic: 'neural-networks', lessons: ['01', '03', '10'],
  sources: [{ kind: 'figure-brief', path: 'docs/features/explain-on-canvas/handoff/figure-briefs/d2l-mlp/briefs.md#figure-01', revision: '05d5f02f6' }],
  prompts: ['A hidden layer lets each output depend on nonlinear features learned from the same original inputs.',
    'Show how a hidden feature layer changes the inputs before prediction.', 'How do nonlinear hidden features feed a readout?', 'Explain a hidden feature layer using input, ReLU, and output panels.', 'Trace nonlinear hidden features from an affine map to a prediction.', 'Use a hidden feature layer to show what ReLU does to a negative value.'],
  paraphrases: ['Show how a hidden feature layer changes the inputs before prediction.', 'How do nonlinear hidden features feed a readout?', 'Explain a hidden feature layer using input, ReLU, and output panels.', 'Trace nonlinear hidden features from an affine map to a prediction.', 'Use a hidden feature layer to show what ReLU does to a negative value.'],
  keywords: ['hidden feature layer', 'nonlinear hidden features'],
  useWhen: 'Trace learned nonlinear features through a hidden layer and linear readout; not an activation-function curve alone or an optimizer loop.',
  spec: spec(mechanism(false)), depths: { overview: { spec: spec(overview) }, standard: { spec: spec(mechanism(false)) }, deep: { spec: spec(mechanism(true)), detailSpec: spec(probe) } },
}]);
export function derived() { return toyDerived(); }
