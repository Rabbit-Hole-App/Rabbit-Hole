import { fileURLToPath } from 'node:url';
import { writeSubject } from './grid-reference-kit.mjs';

export function buildScene(depth) {
  const data = {
    tokens: ['the', 'cat', 'sat'],
    queries: [[1, 0], [0, 1], [1, 1]],
    keys: [[1, 0], [0, 1], [0, 2]],
    temperatures: [{ id: 't1', value: 1 }, { id: 't2', value: 2 }],
  };
  return {
    subject: 'attention', depth, data, height: 360, readoutY: 300,
    prompt: 'Attention weights for one query token',
    title: 'One query, one row of attention.',
    concept: depth === 'brief' ? 'Each query scores the keys. Softmax makes its weights sum to one.' : depth === 'balanced' ? 'Higher temperature spreads the same query’s attention more evenly.' : 'Dot products become scaled scores, then softmax weights.',
    instructions: depth === 'brief' ? 'Choose a query and follow its weight across the key tokens.' : 'Choose a query, then compare the two temperature settings.',
    heading: 'Toy attention weights', indexLabel: 'Query',
    parameter: depth === 'brief' ? null : { label: 'Temperature', default: data.temperatures[0].id, options: data.temperatures.map(t => ({ id: t.id, label: `T = ${t.value}` })) },
  };
}

export function createModel(scene) {
  const { data, depth } = scene, length = data.tokens.length, dimension = data.keys[0].length;
  const allowed = depth === 'brief' ? data.temperatures.slice(0, 1) : data.temperatures;
  const defaults = () => ({ index: 0, option: allowed[0].id });
  const coerce = (input = {}) => {
    const value = Number(input.index);
    return { index: Number.isFinite(value) ? Math.max(0, Math.min(length - 1, Math.round(value))) : 0,
      option: allowed.some(t => t.id === input.option) ? input.option : allowed[0].id };
  };
  const fixed = (value, places = 3) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places).replace('-', '−');
  const row = (index, temperature) => {
    const dots = data.keys.map(key => key.reduce((sum, value, j) => sum + value * data.queries[index][j], 0));
    const logits = dots.map(value => value / (Math.sqrt(dimension) * temperature));
    const max = Math.max(...logits), exponentials = logits.map(value => Math.exp(value - max));
    const denominator = exponentials.reduce((sum, value) => sum + value, 0);
    const weights = exponentials.map(value => value / denominator);
    return { dots, logits, weights, sum: weights.reduce((sum, value) => sum + value, 0), strongest: weights.indexOf(Math.max(...weights)) };
  };
  const frame = input => {
    const inputs = coerce(input), temperature = allowed.find(t => t.id === inputs.option).value;
    const selected = row(inputs.index, temperature), otherTemperature = data.temperatures.find(t => t.value !== temperature).value;
    const comparison = row(inputs.index, otherTemperature), token = data.tokens[inputs.index];
    return { inputs, temperature, otherTemperature, token, ...selected, comparison,
      selectionLabel: `Query ${token}`, state: `Query: ${token}`,
      callout: { title: `Query: ${token}`, sentence: 'The blue cell receives the largest share of this query’s attention.' },
      readouts: [{ id: 'sum', label: 'Sum before rounding', value: fixed(selected.sum) }, ...(depth === 'brief' ? [] : [{ id: 'peak-change', label: 'Peak vs other T', value: `${selected.weights[selected.strongest] - comparison.weights[comparison.strongest] >= 0 ? '+' : '−'}${fixed(Math.abs(selected.weights[selected.strongest] - comparison.weights[comparison.strongest]) * 100, 1)} pp` }])],
      description: `Toy query ${token} uses vector [${data.queries[inputs.index].join(', ')}]. Key order is ${data.tokens.join(', ')}. At temperature ${temperature}, scaled scores are ${selected.logits.map(v => fixed(v)).join(', ')} and weights are ${selected.weights.map(v => fixed(v)).join(', ')}. The unrounded weights sum to ${fixed(selected.sum)}. No mask or dropout is used.`,
    };
  };
  return { length, dimension, data, depth, defaults, coerce, row, frame, fixed };
}

export function drawPicture(frame, model, scene, R) {
  const detailed = scene.depth === 'detailed', balanced = scene.depth === 'balanced';
  const x = 118, gap = 8, width = 88, height = 52, mainY = detailed ? 145 : 70;
  let svg = R.text('keys.heading', x, 22, 'Keys →', { size: 13, color: R.C.muted });
  model.data.tokens.forEach((token, j) => {
    const cx = x + j * (width + gap) + width / 2;
    svg += R.text(`key.${j}.label`, cx, 47, token, { anchor: 'middle', weight: 600 });
    if (detailed) svg += R.text(`key.${j}.vector`, cx, 67, `[${model.data.keys[j].join(', ')}]`, { anchor: 'middle', size: 13, color: R.C.muted });
  });
  svg += R.text('query.label', 20, mainY + 21, frame.token, { weight: 600 });
  svg += R.text('query.role', 20, mainY + 42, 'Query →', { size: 13, color: R.C.muted });
  frame.weights.forEach((value, j) => { svg += R.cell(`weight.${j}`, x + j * (width + gap), mainY, width, height, model.fixed(value), { value, row: frame.inputs.index, column: j, selected: j === frame.strongest, role: 'process' }); });
  if (balanced) {
    svg += R.text('current.label', x, mainY + height + 21, `Current: T = ${frame.temperature}`, { size: 13, color: R.C.blue });
    svg += R.text('comparison.label', 20, 180, 'Other T →', { size: 13, color: R.C.muted });
    frame.comparison.weights.forEach((value, j) => { svg += R.cell(`comparison.${j}`, x + j * (width + gap), 152, width, height, model.fixed(value), { value, row: frame.inputs.index, column: j, role: 'decision' }); });
    svg += R.text('comparison.temperature', x, 228, `Comparison: T = ${frame.otherTemperature}`, { size: 13, color: R.C.warm });
  } else if (detailed) {
    svg += R.text('scores.label', 20, 112, 'Scores z →', { size: 13, color: R.C.muted });
    frame.logits.forEach((value, j) => { svg += R.cell(`logit.${j}`, x + j * (width + gap), 83, width, 42, model.fixed(value), { value, row: frame.inputs.index, column: j, size: 16 }); });
    svg += R.text('dot-products', 20, 225, `q = [${model.data.queries[frame.inputs.index].join(', ')}]     q·Kᵀ = [${frame.dots.join(', ')}]`, { size: 14 });
    svg += R.text('score.formula', 20, 250, `zⱼ = (q·kⱼ) / (√${model.dimension} × ${frame.temperature})`, { size: 14, color: R.C.muted });
    svg += R.text('softmax.formula', 20, 275, 'wⱼ = exp(zⱼ) / Σₗ exp(zₗ)', { size: 14, color: R.C.muted });
  } else {
    svg += R.text('weights.label', x, 151, 'Weights for the selected query', { size: 13, color: R.C.muted });
    svg += R.paragraph('toy.note', 20, 205, 'Toy vectors, one attention head. Every query uses the same key order.', 48, { size: 14, color: R.C.muted });
  }
  const anchor = [x + frame.strongest * (width + gap) + width / 2, mainY + height];
  const spine = x + model.length * (width + gap) - gap + 12, calloutY = detailed ? 83 : 70;
  return { svg, anchor, calloutPath: [anchor, [anchor[0], anchor[1] + 4], [spine, anchor[1] + 4], [spine, calloutY + 20], [444, calloutY + 20]], callout: { x: 444, y: calloutY, width: 176, chars: 21 } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeSubject(buildScene, createModel, drawPicture);
