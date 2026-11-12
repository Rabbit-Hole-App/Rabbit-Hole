import {
  dot, filters, forecast, gaussian, localWeights, mixWeights, motif, motifField, neighborX, neighborY, normalize,
  origin, paddedPixels, pixels, poolingQueries, receptiveCounts, recurrentHidden, response, rollout,
  rounded, secondChannel, sequenceReadings, sequenceTokens, softmax, windows,
} from './d2l-vision-data.js';
import { crossWeights, decoderPrefix, heads, inputs, positions, queryIndex, sentence } from './transformer-walkthrough-data.js';

const ref = (id, prompt, paraphrase, keywords, useWhen, make, lessons = []) => ({
  id: 'd2l-' + id, lessons, prompts: [prompt], paraphrases: [paraphrase], keywords, useWhen,
  ...make('balanced'), depths: { overview: { detailSpec: null, ...make('brief') }, deep: make('detailed') },
});
const spec = diagram => ({ version: 1, diagram });
const visual = diagram => ({ spec: spec(diagram) });
const two = (diagram, detail) => ({ ...visual(diagram), detailSpec: spec(detail) });
const b = depth => depth === 'brief';
const d = depth => depth === 'detailed';
const names = (width, prefix) => Array.from({ length: width }, (_, index) => prefix + (index + 1));
const axis = (label, min, max) => ({ label, min, max });
const plot = (title, caption, x, y, series, annotations) => ({
  kind: 'coordinate-plot', title, caption, x, y, series, ...(annotations ? { annotations } : {}),
});
const line = (label, xs, ys, options = {}) => ({
  label, kind: 'line', points: xs.map((x, index) => ({ x, y: ys[index] })), ...options,
});
const range = values => ({ min: Math.min(0, ...values.flat()), max: Math.max(1, ...values.flat()) });
const heat = (title, caption, cells, opts = {}) => ({
  kind: 'heatmap', title, ...(caption === undefined ? {} : { caption }), range: range(cells),
  columns: names(cells[0].length, 'C'), rows: cells.map((row, i) => ({ label: 'R' + (i + 1), cells: row })), ...opts,
});
const matrix = (title, caption, columns, rows, emphasis) => ({
  kind: 'matrix', layout: 'teaching', title, caption, columns,
  rows: rows.map(([heading, ...cells], i) => ({ id: 'r' + i, heading, cells: cells.map(String) })),
  ...(emphasis ? { emphasis } : {}),
});
const graph = (title, caption, nodes, edges) => ({
  kind: 'relationship', layout: 'graph', title, caption, nodes: nodes.map(([id, label]) => ({ id, label })),
  edges: edges.map(([from, to, label]) => ({ from, to, label })),
});
const panels = (title, caption, items) => ({
  kind: 'comparison', variant: 'panels', title, caption,
  panels: items.map(diagram => ({ heading: diagram.title, diagram })),
});
const tensor = (values, role = 'input') => ({
  tensor: { rows: 1, columns: values.length, dimensions: '1 × ' + values.length, role, values },
});
const transform = (title, caption, operation, before, after) => ({
  kind: 'transformation', title, caption, operation,
  before: { label: 'Inputs', items: before }, after: { label: 'Result', items: after },
});
const hit = (y, x) => ({ row: y, column: x });
const footprint = (y, x) => [hit(y, x), hit(y, x + 1), hit(y + 1, x), hit(y + 1, x + 1)];
const fieldWindows = windows(pixels, 2, 2);
const patch = fieldWindows[0][0].cells;
const scores = filters.map(filter => fieldWindows.map(row => row.map(({ cells }) => response(cells, filter))));
const paddedWindows = windows(paddedPixels, 2, 2);
const pooled = fieldWindows.map(row => row.map(({ cells }) => Math.max(...cells.flat())));
const mixed = mixWeights.map(weights => dot(weights, [pixels[0][0], secondChannel[0][0]]));

const motifDetector = ref('shared-patch-detector',
  'How does a convolution find the same pattern in different places?',
  'Why can the same local filter spot a motif at two locations?',
  ['convolution find the same pattern', 'same local filter spot a motif'],
  'Use a small invented field with the same motif twice. A single exact-match rule makes both response positions visible.',
  depth => {
    const matches = windows(motifField, 2, 2).map(row => row.map(({ cells }) =>
      Number(cells.flat().every((value, index) => value === motif.flat()[index]))));
    const input = heat(b(depth) ? 'One pattern, two places' : 'A repeated local patch',
      b(depth) ? 'The marked patches are the same.' : 'Both marked windows contain the same four entries.',
      motifField, { highlights: [...footprint(0, 1), ...footprint(2, 2)] });
    return d(depth) ? two(input, heat('Response locations', 'An exact match earns one. Every other window earns zero.', matches,
      { highlights: [hit(0, 1), hit(2, 2)] })) : visual(input);
  });

const convolution = ref('convolution-window-arithmetic',
  'How do I calculate one output cell of a convolution?',
  'Where does one number in a CNN feature map come from?',
  ['calculate one output cell of a convolution', 'one number in a cnn feature map'],
  'Line up one window with one filter. Keep the four products and their sum visible.',
  depth => {
    const products = patch.flat().map((value, index) => value * filters[0].flat()[index]);
    const output = response(patch, filters[0]);
    const arithmetic = matrix(b(depth) ? 'Multiply, then add' : 'One filter response',
      d(depth) ? 'At this position, $2(2)+1(-1)+4(1)+7(0)=' + output + '$.' : 'Each input cell multiplies its matching weight. Add the products.',
      ['Patch entry', 'Weight', 'Product'],
      [...products.map((value, index) => ['Cell ' + (index + 1), patch.flat()[index], filters[0].flat()[index], value]),
        ['Sum', '—', '—', output]], { rows: ['r4'] });
    return d(depth) ? two(arithmetic, heat('Window on the input', 'This output uses the marked top-left patch.', pixels,
      { highlights: footprint(0, 0) })) : visual(arithmetic);
  });

const filterMaps = ref('convolution-filter-maps',
  'Why do two convolution filters make different feature maps from one image?',
  'How can different CNN filters respond to the same patch differently?',
  ['two convolution filters make different feature maps', 'different cnn filters respond to the same patch'],
  'Compute two filter responses from the same input windows. Keep response scales shared and explain why the largest responses differ.',
  depth => {
    const shared = range(scores.flat());
    const responses = panels(b(depth) ? 'Two filters see different things' : 'One field, two response maps',
      'Both maps use the same windows and the same color scale.',
      scores.map((grid, index) => {
        const strongest = Math.max(...grid.flat());
        const cell = grid.flat().indexOf(strongest);
        return heat('Filter ' + (index + 1), undefined, grid,
          { range: shared, highlights: [hit(Math.floor(cell / grid[0].length), cell % grid[0].length)] });
      }));
    if (!d(depth)) return visual(responses);
    return two(responses, matrix('Different local rules', 'Both filters take an aligned dot product with each patch.',
      ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
      filters.map((filter, index) => ['Filter ' + (index + 1), ...filter.flat()])));
  });

const reuse = ref('convolution-window-reuse',
  'Why do center pixels get used more times than corners in convolution?',
  'How often does each pixel appear in a sliding filter window?',
  ['center pixels get used more times', 'each pixel appear in a sliding filter window'],
  'Count how many valid windows include each position. Use the same input size while changing the filter size.',
  depth => {
    const small = heat(b(depth) ? 'How often each square is used' : 'Coverage by valid windows',
      d(depth) ? 'Unit stride and no padding. Each entry counts distinct window origins covering that position.' :
        'Corner cells are in fewer windows than the center.',
      receptiveCounts(2), { range: { min: 0, max: 4 }, highlights: [hit(0, 0), hit(1, 1)] });
    return b(depth) ? visual(small) : two(small, heat('Coverage with a larger filter',
      'The larger window spans the entire height of this example.', receptiveCounts(3), { range: { min: 0, max: 4 } }));
  });

const padding = ref('convolution-zero-border',
  'What does zero padding do to the edge of a convolution?',
  'How does adding a border of zeros let a CNN filter use edge pixels?',
  ['zero padding do to the edge', 'border of zeros let a cnn filter'],
  'Mark the zero border and a window that reaches past the original field. Recompute its response and output dimensions.',
  depth => {
    const value = response(paddedWindows[0][1].cells, filters[0]);
    return visual(heat(b(depth) ? 'Make room at the edge' : 'A filter window on the padded border',
      d(depth) ? 'The padded field is $5\\times6$. A $2\\times2$ filter at unit stride yields $4\\times5$ outputs.' :
        'This edge window uses two border zeros and two original pixels. Its response is ' + value + '.',
      paddedPixels, { highlights: footprint(0, 1) }));
  });

const stride = ref('convolution-axis-strides',
  'What changes when a convolution strides farther horizontally than vertically?',
  'How do different horizontal and vertical CNN strides change the output grid?',
  ['convolution strides farther horizontally', 'different horizontal and vertical cnn strides'],
  'Use one source grid and filter with distinct strides along the two axes. Show the filter origins and the resulting shape.',
  depth => {
    const placed = windows(paddedPixels, 2, 2, 1, 2).flat();
    const origins = heat(b(depth) ? 'Move right in bigger jumps' : 'Different strides on each axis',
      d(depth) ? '$\\lfloor(5-2)/1\\rfloor+1=4$ rows and $\\lfloor(6-2)/2\\rfloor+1=3$ columns.' :
        'Move one row down or two columns right at each step. The marked cells are window starts.',
      paddedPixels, { highlights: placed.map(({ y, x }) => hit(y, x)) });
    return b(depth) ? visual(origins) : two(origins, heat('Strided feature map',
      'Every marked start gives one output cell.',
      windows(paddedPixels, 2, 2, 1, 2).map(row => row.map(({ cells }) => response(cells, filters[0])))));
  });

const channelSum = ref('convolution-input-channel-sum',
  'How does a convolution combine multiple input channels into one output?',
  'What happens to the separate color channel products in one CNN filter?',
  ['convolution combine multiple input channels', 'separate color channel products in one cnn filter'],
  'Show an aligned patch and filter per channel. Sum the per-channel responses to make one output channel at the chosen location.',
  depth => {
    const other = windows(secondChannel, 2, 2)[0][0].cells;
    const contributions = [response(patch, filters[0]), response(other, filters[1])];
    const total = contributions[0] + contributions[1];
    const summary = matrix(b(depth) ? 'Add the channel results' : 'Multi-channel filter response',
      d(depth) ? 'Channel dot products sum to $' + contributions[0] + '+' + contributions[1] + '=' + total + '$.' :
        'Each channel has its own matched filter slice. Together they produce one output value.',
      ['Local response', 'Output contribution'], [['First channel', contributions[0], 'Add'],
        ['Second channel', contributions[1], 'Add'], ['One output', total, 'Combined']], { rows: ['r2'] });
    return d(depth) ? two(summary, matrix('Aligned channel patches',
      'Read the four patch positions in the same order for both channels.',
      ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
      [['First patch', ...patch.flat()], ['First weights', ...filters[0].flat()],
        ['Second patch', ...other.flat()], ['Second weights', ...filters[1].flat()]])) : visual(summary);
  });

const pointwise = ref('pointwise-channel-mixing',
  'What does a one by one convolution actually do to the channels?',
  'Why can a pointwise convolution change depth without changing image size?',
  ['one by one convolution actually do to the channels', 'pointwise convolution change depth'],
  'Hold a single position fixed. Use the input channels at that position and a small mixing matrix to compute the output channels.',
  depth => {
    const mix = transform(b(depth) ? 'Mix channels at one place' : 'Pointwise channel mixing',
      d(depth) ? 'At this location, $2-6=-4$, $2(2)+6=10$ and $0.5(2)=1$. Two channels become three.' :
        'The same rule mixes two channels into three at each position. It uses no neighboring pixels.',
      'Multiply the channel vector by the mixing weights',
      [{ label: 'Input channels', ...tensor([pixels[0][0], secondChannel[0][0]]) }],
      [{ label: 'Output channels', ...tensor(mixed, 'output') }]);
    return d(depth) ? two(mix, matrix('Weights for each new channel', 'Each row reads the same input vector.',
      ['Input one', 'Input two'], mixWeights.map((row, index) => ['Output ' + (index + 1), ...row]))) : visual(mix);
  });

const pool = ref('max-pooling-windows',
  'How does a CNN max pooling window turn a patch into one number?',
  'Which values survive when the same max pool moves across an image?',
  ['cnn max pooling window turn a patch', 'same max pool moves across an image'],
  'Mark a real winner in each example window. Derive the output grid from those maxima without filter weights.',
  depth => {
    const maxima = heat(b(depth) ? 'Keep each strongest value' : 'A max-pooled feature map',
      d(depth) ? 'A $2\\times2$ window with stride one returns $\\max$ of each patch. The output shape is $2\\times3$.' :
        'Each output is the largest number in its input window.',
      pooled, { highlights: [hit(0, 0), hit(1, 2)] });
    return b(depth) ? visual(maxima) : two(heat('Two pooling windows',
      'In the top-left patch the winner is 7. In the bottom-right patch it is 8.',
      pixels, { highlights: [...footprint(0, 0), ...footprint(1, 2)] }), maxima);
  });

const classifier = ref('cnn-shape-through-classifier',
  'How does a small CNN like LeNet shrink an image and end up with class scores?',
  'Where do the width and channel count change in a LeNet style classifier?',
  ['small cnn like lenet shrink an image', 'width and channel count change in a lenet'],
  'Show a small independent LeNet-style network, with invented channel sizes and explicit output shapes. Keep flattening distinct from pooling.',
  depth => visual({
    kind: 'block-stack', title: b(depth) ? 'From an image to class scores' : 'Shape changes in a small CNN',
    caption: d(depth) ? 'Pooling halves each spatial axis. Flattening turns $2\\times2\\times5$ entries into 20 dense inputs.' :
      'Convolutions change channels, pooling shrinks the field, and the classifier reads the flattened result.',
    blocks: [
      { id: 'image', label: 'Input image', ...(b(depth) ? {} : { dims: '$8\\times8\\times1$' }) },
      { id: 'c1', label: b(depth) ? 'First feature maps' : 'First convolution', ...(b(depth) ? {} : { dims: '$8\\times8\\times3$' }) },
      { id: 'p1', label: 'First pooling', ...(b(depth) ? {} : { dims: '$4\\times4\\times3$' }) },
      { id: 'c2', label: b(depth) ? 'Next feature maps' : 'Second convolution', ...(b(depth) ? {} : { dims: '$4\\times4\\times5$' }) },
      { id: 'p2', label: 'Second pooling', ...(b(depth) ? {} : { dims: '$2\\times2\\times5$' }) },
      { id: 'dense', label: 'Flattened inputs and scores', ...(b(depth) ? {} : { dims: '$20\\to3$' }), role: 'output' },
    ],
  }));

const lossX = [1, 2, 3, 4, 5, 6];
const cnnTrain = ref('cnn-loss-and-accuracy',
  'Why do a CNN’s loss and accuracy curves tell different stories?',
  'How should I read LeNet training loss alongside held-out accuracy?',
  ['cnn s loss and accuracy curves', 'lenet training loss alongside held out accuracy'],
  'Use separate scales for loss and accuracy. Label the training and held-out series explicitly.',
  depth => {
    const losses = plot(b(depth) ? 'Errors across training passes' : 'Training and held-out loss',
      'The fit and held-out loss both fall after an early plateau.', axis('Epoch', 1, 6), axis('Loss', 0, 3),
      [line('Training', lossX, [2.6, 2.6, 2.3, 1.5, 0.9, 0.6]), line('Held out', lossX, [2.7, 2.7, 2.4, 1.7, 1.2, 0.9])]);
    return b(depth) ? visual(losses) : two(losses, plot('Held-out accuracy',
      d(depth) ? 'Accuracy is the fraction classified correctly. This axis is bounded from zero to one.' :
        'On held-out examples, the fraction correct rises.',
      axis('Epoch', 1, 6), axis('Accuracy', 0, 1), [line('Held out', lossX, [0.18, 0.18, 0.25, 0.49, 0.62, 0.69])]));
  }, ['09']);

export const d2lCnnReferences = [
  motifDetector, convolution, filterMaps, reuse, padding, stride, channelSum, pointwise, pool, classifier, cnnTrain,
];

const observedSteps = names(sequenceReadings.length, '').map(Number);
const earlySteps = observedSteps.slice(0, 10);
const sequenceCaption = 'The values rise and fall in order. A shuffled list would hide that pattern.';
const orderedReadings = ref('ordered-sequence-readings',
  'What does the order of observations tell me in a time series?',
  'Why does shuffling a time series hide its rises and reversals?',
  ['order of observations tell me in a time series', 'shuffling a time series hide its rises'],
  'Use an independent ordered signal with a rise, a turn and another rise. Distinguish the time axis from the value axis.',
  depth => visual(plot(b(depth) ? 'Order shows the turns' : 'Time order exposes recurring structure',
    d(depth) ? 'The line describes observed order. These measurements alone establish neither a trend model nor a forecast.' : sequenceCaption,
    axis('Time step', 1, 10), axis('Reading', 0, 7),
    [line('Observed', earlySteps, sequenceReadings.slice(0, 10))],
    b(depth) ? undefined : [{ kind: 'point', x: 3, y: sequenceReadings[2], label: 'First peak' }])), ['15']);

const state = ref('recurrent-state-handoff',
  'How does a recurrent model carry its hidden state from one time step to the next?',
  'How does the same RNN update rule remember an earlier input?',
  ['recurrent model carry its hidden state', 'same rnn update rule remember'],
  'Reuse the same hidden update at two time steps. Keep the fresh measurement separate from the state and the output.',
  depth => {
    const chain = graph(b(depth) ? 'Carry a summary forward' : 'A recurrent state handoff',
      d(depth) ? 'Both steps use $h_t=0.5h_{t-1}+x_t$. The output here simply reads the current state.' :
        'Each step mixes a new observation with the summary from the previous step.',
      [['x1', 'First input'], ['h1', 'First state'], ['y1', 'First readout'], ['x2', 'Second input'],
        ['h2', 'Second state'], ['y2', 'Second readout']],
      [['x1', 'h1', 'Supplies first reading'], ['h1', 'y1', 'Provides first readout'],
        ['h1', 'h2', 'Carries earlier information'], ['x2', 'h2', 'Supplies new reading'], ['h2', 'y2', 'Provides second readout']]);
    return d(depth) ? two(chain, matrix('The same state rule twice', 'Keep half the old state and add the new measurement.',
      ['Old state', 'New input', 'New state'],
      [['Step one', recurrentHidden[0], sequenceReadings[0], recurrentHidden[1]],
        ['Step two', recurrentHidden[1], sequenceReadings[1], recurrentHidden[2]]])) : visual(chain);
  }, ['15']);

const lagExamples = ref('lag-regression-training-examples',
  'How do I turn a noisy time series into examples for a lag regression?',
  'Which previous readings go in a training row for next-step regression?',
  ['noisy time series into examples for a lag regression', 'previous readings go in a training row'],
  'Use two preceding observations as features for each next target. Keep the target outside the input window.',
  depth => {
    const examples = matrix(b(depth) ? 'Use the last two readings' : 'Sliding windows make lag features',
      d(depth) ? 'The target is $x_t$. The two predictors are $x_{t-2}$ and $x_{t-1}$.' :
        'The same series supplies features and targets at different times. Each target comes after both features.',
      ['Earlier input', 'Latest input', 'Target'], sequenceReadings.slice(2, 6).map((value, i) =>
        ['Step ' + (i + 3), sequenceReadings[i], sequenceReadings[i + 1], value]), { columns: [2] });
    return b(depth) ? visual(examples) : two(plot('The ordered readings',
      'The first worked row uses steps one and two to predict the reading at step three.',
      axis('Time step', 1, 10), axis('Reading', 0, 7),
      [line('Observed', earlySteps, sequenceReadings.slice(0, 10))],
      [{ kind: 'point', x: 3, y: sequenceReadings[2], label: 'First target' }]), examples);
  }, ['15']);

const lagValidation = ref('lag-regression-training-loss',
  'What do training and validation loss mean when fitting a lag regression?',
  'How do I tell whether my lag model improves on held-out observations?',
  ['training and validation loss mean when fitting a lag regression', 'lag model improves on held out observations'],
  'Illustrate train and validation objective on a chronological split. Keep epoch separate from observation time.',
  depth => visual(plot(b(depth) ? 'Check the model on later readings' : 'Fit loss and held-out loss for a lag model',
    d(depth) ? 'These are illustrative squared errors. The validation portion comes after the training portion in time.' :
      'Training error drops, and the error on later reserved observations drops before leveling off.',
    axis('Epoch', 1, 6), axis('Squared error', 0, 4),
    [line('Training', lossX, [3.1, 1.7, 0.9, 0.65, 0.6, 0.56]),
      line('Validation', lossX, [3.4, 2.1, 1.32, 1.1, 1.08, 1.1])])), ['09', '15']);

const testTimes = observedSteps.slice(origin, origin + 6);
const observed = sequenceReadings.slice(origin, origin + 6);
const stepForecasts = testTimes.map(t => forecast(sequenceReadings[t - 3], sequenceReadings[t - 2]));
const recursiveForecasts = testTimes.map((_, index) => rollout(sequenceReadings.slice(0, origin), index + 1));
const rolling = ref('forecast-one-step-refresh',
  'Why is one-step forecasting easier when new observations keep arriving?',
  'What readings are used for rolling one-step-ahead predictions?',
  ['one step forecasting easier when new observations', 'readings are used for rolling one step ahead predictions'],
  'Place every forecast at its target time. Contrast the forecast with the newly measured value, which is available only to later predictions.',
  depth => {
    const predictions = plot(b(depth) ? 'Predict, measure, then predict again' : 'Rolling one-step forecasts',
      d(depth) ? 'Use $0.2x_{t-2}+0.65x_{t-1}+0.45$ for every forecast. Both inputs are observations.' :
        'Each estimate uses the last two measured readings available before its target.',
      axis('Target time', testTimes[0], testTimes.at(-1)), axis('Reading', 0, 7),
      [line('Observed', testTimes, observed), line('One-step estimate', testTimes, stepForecasts)]);
    return d(depth) ? two(predictions, matrix('Inputs become available in order',
      'The new reading becomes the latest input on the next row.', ['Earlier', 'Latest', 'Forecast'],
      testTimes.slice(0, 3).map((t, i) => ['Step ' + t, sequenceReadings[t - 3], sequenceReadings[t - 2], stepForecasts[i]]))) :
      visual(predictions);
  }, ['15']);

const recursive = ref('forecast-feedback-error',
  'Why can a recursive forecast drift when it feeds its own predictions back?',
  'What goes wrong when a multi-step forecast has to reuse its own estimates?',
  ['recursive forecast drift when it feeds its own predictions', 'multi step forecast has to reuse its own estimates'],
  'Use the same lag rule in both modes. Compare estimates refreshed with observations and estimates rolled forward without new measurements.',
  depth => {
    const curves = plot(b(depth) ? 'Old guesses can shape new guesses' : 'Recursive forecast feedback',
      d(depth) ? 'After step nine, the recursive line replaces each missing future input with its own output.' :
        'Both estimates start together. Only the refreshed line gets new measured inputs.',
      axis('Target time', testTimes[0], testTimes.at(-1)), axis('Reading', 0, 7),
      [line('Observed', testTimes, observed), line('Refreshed estimate', testTimes, stepForecasts),
        line('Recursive estimate', testTimes, recursiveForecasts)]);
    return d(depth) ? two(curves, matrix('Where the two inputs come from',
      'From the second forecast onward, the recursive path uses an earlier estimate.',
      ['Earlier input', 'Latest input', 'Recursive forecast'],
      [['First target', sequenceReadings[origin - 2], sequenceReadings[origin - 1], recursiveForecasts[0]],
        ['Second target', sequenceReadings[origin - 1], recursiveForecasts[0] + ' estimated', recursiveForecasts[1]],
        ['Third target', recursiveForecasts[0] + ' estimated', recursiveForecasts[1] + ' estimated', recursiveForecasts[2]]])) :
      visual(curves);
  }, ['15']);

const horizon = ref('forecast-damping-by-horizon',
  'Why does a long-horizon time-series prediction lose its peaks?',
  'What happens if one-step and longer forecasts are lined up by target time?',
  ['long horizon time series prediction lose its peaks', 'longer forecasts are lined up by target time'],
  'Align each forecast at the target it predicts. Change the forecast origin with the horizon and keep the lag rule fixed.',
  depth => {
    const times = observedSteps.slice(7, 13);
    const predictedAt = h => times.map(t => rollout(sequenceReadings.slice(0, t - h), h));
    return visual(plot(b(depth) ? 'Distant guesses can miss the turns' : 'Forecasts compared at the same target times',
      d(depth) ? 'A horizon of $h$ uses history through $t-h$ for the target at $t$. The rule stays fixed.' :
        'Farther-ahead estimates use older observations. In this example, they miss more of the swings.',
      axis('Target time', times[0], times.at(-1)), axis('Reading', 0, 7),
      [line('Observed', times, times.map(t => sequenceReadings[t - 1])),
        line('One step ahead', times, predictedAt(1)), line('Five steps ahead', times, predictedAt(5))]));
  }, ['15']);

const nextCharacter = ref('recurrent-next-character-targets',
  'How does a character RNN line up inputs and targets for training?',
  'What is the target character after each RNN input position?',
  ['character rnn line up inputs and targets', 'target character after each rnn input position'],
  'Use an original short string. Shift targets one position ahead and show where the previous state enters each prediction.',
  depth => {
    const labels = matrix(b(depth) ? 'Guess the next letter' : 'Next-character supervision',
      d(depth) ? 'The row at $t$ compares the prediction based on the prefix through $t$ with the character at $t+1$.' :
        'The state includes earlier letters. The target is the next letter after the current input.',
      ['Current input', 'Prefix used', 'Target'], sequenceTokens.slice(0, -1).map((token, i) =>
        ['Step ' + (i + 1), token, sequenceTokens.slice(0, i + 1).join(''), sequenceTokens[i + 1]]), { columns: [2] });
    return d(depth) ? two(labels, graph('State passes between predictions', 'Each readout uses the state at its own step.',
      [['a', 'State after r'], ['b', 'State after ra'], ['p1', 'Guess after r'], ['p2', 'Guess after ra']],
      [['a', 'b', 'Supplies prior context'], ['a', 'p1', 'Predicts a'], ['b', 'p2', 'Predicts i']])) : visual(labels);
  });

const truncation = ref('backpropagation-through-time-cutoffs',
  'What does truncated backpropagation through time cut off?',
  'How do regular and random truncation change how far an RNN gradient reaches?',
  ['truncated backpropagation through time cut off', 'regular and random truncation change how far'],
  'Make the forward unroll the same in all cases. Indicate only which earlier states a late loss can reach in the backward pass.',
  depth => {
    const cells = [[1, 1, 1, 1, 1], [0, 0, 0, 1, 1], [0, 0, 1, 1, 1], [0, 0, 0, 0, 1]];
    return visual(heat(b(depth) ? 'Stop the backward signal sooner' : 'Gradient reach under three truncation rules',
      d(depth) ? 'For the final loss, one means a backward path exists. Zero means a stop, even though forward state still passes.' :
        'The same last loss can reach all earlier states, or stop at a fixed or sampled boundary.',
      cells, { columns: names(5, 'Step '), rows: ['Full pass', 'Fixed cutoff', 'Sampled cutoff A', 'Sampled cutoff B'].map((label, i) => ({ label, cells: cells[i] })) }));
  });

const sharedGradient = ref('recurrent-weight-gradient-sum',
  'How does backpropagation through time update a weight reused at every step?',
  'Why do gradient contributions from an unrolled RNN add together?',
  ['backpropagation through time update a weight reused', 'gradient contributions from an unrolled rnn add'],
  'Trace gradients from two losses through three uses of the same recurrent weight. Multiply each combined state gradient by the prior state and sum the contributions.',
  depth => {
    const derivatives = [1, 2, 2];
    const terms = derivatives.map((value, index) => value * recurrentHidden[index]);
    const total = terms.reduce((sum, term) => sum + term, 0);
    const table = matrix(b(depth) ? 'Add the training signals for one weight' : 'A shared recurrent weight gets one summed gradient',
      d(depth) ? 'Use $h_t=0.5h_{t-1}+x_t$. Direct losses add gradients $1$ at step two and $2$ at step three. Each hop halves the incoming gradient.' :
        'Multiply each backward signal by the old state. Add these contributions for the shared weight.',
      ['Old state', 'State gradient', 'Weight term'],
      [...terms.map((term, i) => ['Step ' + (i + 1), recurrentHidden[i], derivatives[i], term]),
        ['Total', '—', '—', total]], { rows: ['r3'] });
    return d(depth) ? two(table, graph('Two losses contribute to one gradient', 'State two adds its direct gradient to the gradient from state three.',
      [['loss3', 'Final loss'], ['loss2', 'Earlier loss'], ['last', 'State three'], ['middle', 'State two'], ['first', 'State one']],
      [['loss3', 'last', 'Adds gradient two'], ['loss2', 'middle', 'Adds gradient one'],
        ['last', 'middle', 'Multiplies by one half'], ['middle', 'first', 'Multiplies by one half']])) :
      visual(table);
  });

export const d2lSequenceReferences = [
  orderedReadings, state, lagExamples, lagValidation, rolling, recursive, horizon, nextCharacter, truncation, sharedGradient,
];

const atPositions = (labels, cells) => labels.map((label, index) => ({ label, cells: cells[index] }));
const weights = (title, caption, rows, columns, cells, options) =>
  heat(title, caption, cells, { rows: atPositions(rows, cells), columns, range: { min: 0, max: 1 }, ...options });

const identityAttention = ref('attention-identity-weights',
  'What does it mean if an attention matrix is diagonal?',
  'When does attention simply return the value at the matching position?',
  ['attention matrix is diagonal', 'attention simply return the value at the matching position'],
  'Show a normalized identity weight matrix. Each query takes the value from the same position, so no values are mixed.',
  depth => {
    const identity = ['One', 'Two', 'Three', 'Four'];
    return visual(weights(b(depth) ? 'Each place reads itself' : 'Attention with diagonal weights',
      d(depth) ? 'With $A=I$, the weighted values are $AV=V$. Every row sums to one.' :
        'The marked row takes all its weight from the matching key.',
      identity, identity, identity.map((_, i) => identity.map((_, j) => Number(i === j))),
      { rowLabel: b(depth) ? 'Reading position' : 'Query', columnLabel: 'Key', highlights: [hit(1, 1)] }));
  });

const kernelShape = ref('attention-distance-kernel-shapes',
  'How do different distance kernels decide which keys matter for attention?',
  'Why do Gaussian and box-shaped attention kernels weight neighbors differently?',
  ['different distance kernels decide which keys', 'gaussian and box shaped attention kernels'],
  'Compare unnormalized distance weights. Use a common distance axis to show uniform, smooth and finite-support rules.',
  depth => {
    const offsets = [-3, -1.5, 0, 1.5, 3];
    const curves = [
      line('Smooth decay', offsets, offsets.map(distance => rounded(gaussian(distance, 1.25)))),
      { ...line('Local window', [-3, -1.5, 1.5, 3], [0, 1, 0, 0]), kind: 'step' },
      line('Uniform', [-3, 3], [1, 1]),
    ];
    if (!b(depth)) curves.push(line('Tapered window', offsets, offsets.map(distance => Math.max(0, 1 - (distance / 2) ** 2)), { smooth: false }));
    return visual(plot(b(depth) ? 'Different rules for nearby items' : 'Distance kernels before normalization',
      d(depth) ? 'The smooth rule uses $\\exp(-u^2/2)$ for scaled offset $u$. The local rules cut off at finite distances.' :
        'A smooth rule fades with distance. A window cuts off. Uniform weights ignore distance.',
      axis('Signed offset', -3, 3), axis('Unnormalized weight', 0, 1.15), curves));
  }, ['05', '06']);

const valueAt = weights => rounded(dot(weights, neighborY));
const kernelFit = width => poolingQueries.map(query => valueAt(localWeights(query, width)));
const globalWeights = neighborX.map(() => 1 / neighborX.length);
const measurements = { ...line('Measured points', neighborX, neighborY), kind: 'scatter' };
const kernelRegressor = ref('attention-pooling-local-prediction',
  'How does attention pooling make a local regression prediction from nearby examples?',
  'Why does uniform attention pooling predict the same average everywhere?',
  ['attention pooling make a local regression prediction', 'uniform attention pooling predict the same average'],
  'Fit the same original observations with local and uniform weights. Mark why local predictions vary and the global average stays flat.',
  depth => {
    const constant = valueAt(globalWeights);
    const curves = plot(b(depth) ? 'Average nearby points or all points' : 'Local attention pooling versus a global mean',
      d(depth) ? 'A query predicts $\\hat y=\\sum_i w_i y_i$. Local weights depend on query distance, and uniform weights stay the same.' :
        'The nearby points influence the local estimate more. Equal weights give one average at every position.',
      axis('Query position', 0, 6), axis('Predicted value', 0, 5), [
        measurements, line('Local estimate', poolingQueries, kernelFit(1.15)),
        line('Global mean', [0, 6], [constant, constant]),
      ]);
    const selected = localWeights(2, 1.15);
    return d(depth) ? two(curves, matrix('One estimate combines nearby values', 'For a query at position two, multiply every value by its weight.',
      ['Value', 'Local weight', 'Contribution'],
      neighborX.map((x, index) => ['Position ' + x, neighborY[index], selected[index], rounded(selected[index] * neighborY[index])]))) :
      visual(curves);
  }, ['06']);

const localGrid = width => poolingQueries.map(query => localWeights(query, width));
const queryLabels = poolingQueries.map(query => 'Query ' + query);
const keyLabels = neighborX.map(key => 'Key ' + key);
const displayKernelWeights = (title, caption, cells, options = {}) =>
  weights(title, caption, queryLabels, keyLabels, cells,
    { rowLabel: 'Query position', columnLabel: 'Key position', range: { min: 0, max: 1 }, ...options });

const localWeightMap = ref('attention-pooling-neighbor-weight-grid',
  'How can I see which examples a kernel regressor pays attention to?',
  'Why do local attention weights form a band while uniform ones look flat?',
  ['see which examples a kernel regressor pays attention', 'local attention weights form a band'],
  'Sort the original query and key positions. Draw normalized local and uniform weights on the same color scale.',
  depth => {
    const local = displayKernelWeights(b(depth) ? 'Nearby examples carry more weight' : 'Local weight by query and key',
      d(depth) ? 'For each query, $w_i=K_i/\\sum_j K_j$. Its weight can move to a different key as the query moves.' :
        'The strongest cells follow the nearby key positions.', localGrid(1.15));
    return b(depth) ? visual(local) : two(local, displayKernelWeights('Uniform weight by query and key',
      'Every query gives the same share to every key.', poolingQueries.map(() => globalWeights)));
  }, ['06']);

const bandwidthFit = ref('attention-bandwidth-changes-fit',
  'How does the bandwidth change a kernel regression fit?',
  'Why does a wider attention kernel smooth the fitted curve?',
  ['bandwidth change a kernel regression fit', 'wider attention kernel smooth the fitted curve'],
  'Hold the original observations and Gaussian family fixed. Change only width and show the local estimates on common axes.',
  depth => visual(plot(b(depth) ? 'A wider rule makes a smoother fit' : 'Two bandwidths on the same observations',
    d(depth) ? 'With $K=\\exp(-d^2/(2s^2))$, compare $s=0.65$ and $s=2.4$. Normalize separately for every query.' :
      'A narrow rule follows nearby points more closely. A broad rule averages over more of them.',
    axis('Query position', 0, 6), axis('Predicted value', 0, 5), [
      measurements, line('Narrow width', poolingQueries, kernelFit(0.65)),
      line('Broad width', poolingQueries, kernelFit(2.4)),
    ])), ['06', '12']);

const bandwidthWeights = ref('attention-bandwidth-weight-spread',
  'How does kernel bandwidth change which keys receive attention weight?',
  'Why does the weight band widen when a Gaussian attention kernel gets wider?',
  ['bandwidth change which keys receive attention weight', 'weight band widen when a gaussian attention kernel'],
  'Keep query/key positions fixed. Contrast narrow and wide normalized bands under a common scale.',
  depth => {
    const narrow = displayKernelWeights(b(depth) ? 'More weight close by' : 'Normalized weights with a narrow width',
      'The strongest entries concentrate near the query.', localGrid(0.65));
    const wide = displayKernelWeights(b(depth) ? 'Weight reaches farther' : 'Normalized weights with a broad width',
      d(depth) ? 'The same query positions use width $s=2.4$ instead of $0.65$. Rows still sum to one.' :
        'A broader rule spreads each row’s weight over more distant keys.', localGrid(2.4));
    return two(narrow, wide);
  }, ['06', '12']);

const slotLabels = names(sentence.length, 'Slot ');
const prefixRows = ['Short item', 'Long item'];
const masked = (values, length, scale) => values.map((_, i) => i < length ? scale[i] : null);
const prefixScores = [heads[0].scores[0], heads[0].scores[queryIndex]];
const lengths = [2, 4];
const prefixWeights = prefixScores.map((row, i) => masked(row, lengths[i], softmax(row.slice(0, lengths[i]))));
const paddingMask = ref('attention-valid-length-padding',
  'What does a valid-length padding mask do before attention softmax?',
  'Why do padded positions get zero attention weight even if their raw score is high?',
  ['valid length padding mask do before attention softmax', 'padded positions get zero attention weight'],
  'Use two different valid key counts. Mask padded keys before normalization and distinguish this mask from the decoder’s look-ahead rule.',
  depth => {
    const outcome = weights(b(depth) ? 'Ignore empty places' : 'Attention over valid keys only',
      d(depth) ? 'Normalize only the allowed scores. In $A=\\operatorname{softmax}(S+M)$, padded entries have $M=-\\infty$.' :
        'Only real keys share each row’s weight. Gray slots stand for padding.',
      prefixRows, slotLabels, prefixWeights, { rowLabel: 'Batch item', columnLabel: 'Key slot' });
    if (!d(depth)) return visual(outcome);
    return two(heat('Raw scores include padded keys', 'In the short item, slot three has the highest raw score but represents padding.',
      prefixScores, { rows: atPositions(prefixRows, prefixScores), columns: slotLabels, highlights: [hit(0, 2)] }), outcome);
  });

const query = heads[0].queries[queryIndex];
const additiveKeys = inputs.slice(0, 3);
const keyProjection = [[0.5, 0, 0, 0.3], [0, 0.4, -0.25, 0]];
const projectedQuery = [0.4 * query[0], 0.6 * query[1]];
const additiveKeyProjections = additiveKeys.map(key => keyProjection.map(weights => dot(weights, key)));
const additiveScores = additiveKeyProjections.map(key => rounded(dot([1, -0.5],
  key.map((part, index) => Math.tanh(part + projectedQuery[index])))));
const additiveShares = softmax(additiveScores);
const additive = ref('attention-additive-score-projection',
  'How can additive attention compare queries and keys with different vector sizes?',
  'What gets projected before Bahdanau-style additive attention assigns a weight?',
  ['additive attention compare queries and keys with different vector sizes', 'projected before bahdanau style additive attention'],
  'Use query and key vectors of different widths. Project into a shared hidden width, score with a small nonlinear function, then normalize only valid keys.',
  depth => {
    const dimensions = matrix(b(depth) ? 'Put the inputs in the same space' : 'Project unlike query and key widths',
      d(depth) ? 'Compute $e_j=v^\\top\\tanh(W_q q+W_k k_j)$, then normalize over real keys.' :
        'Each input has its own learned projection. The projected vectors have matching widths.',
      ['Before projection', 'After projection'],
      [['Query', 'Two entries', 'Two entries'], ['Each key', 'Four entries', 'Two entries']]);
    const shares = weights('Scores become shares over real keys', 'The final slot is padding. Its score is excluded.',
      ['One query'], [...sentence.slice(0, 3), 'Pad'], [[...additiveShares, null]]);
    return b(depth) ? visual(dimensions) : two(dimensions, shares);
  });

const sourceWords = ['red', 'birds', 'fly'];
const targetWords = ['les', 'oiseaux', 'rouges', 'volent'];
const bahdanauWeights = [[0.28, 0.60, 0.12], [0.15, 0.71, 0.14], [0.73, 0.20, 0.07], [0.08, 0.14, 0.78]];
const fixedSummary = ref('recurrent-translation-fixed-context',
  'Why is one fixed summary a bottleneck for an RNN translator?',
  'What does a sequence-to-sequence decoder get if it has no attention?',
  ['one fixed summary a bottleneck for an rnn translator', 'sequence to sequence decoder get if it has no attention'],
  'Use an invented source sentence and show that only the encoder’s final state reaches the decoder. No direct links from individual source positions.',
  depth => visual(graph(b(depth) ? 'One summary has to carry the sentence' : 'Translation with a fixed encoder summary',
    d(depth) ? 'The encoder compresses the source into its final hidden state. The decoder has no separate access to earlier encoder states.' :
      'The writing side starts from one summary of the whole source.',
    [['source', sourceWords.join(' ')], ['enc', 'Reading network'], ['summary', 'Final source state'],
      ['d1', 'First writing step'], ['d2', 'Second writing step']],
    [['source', 'enc', 'Supplies ordered words'], ['enc', 'summary', 'Compresses source history'],
      ['summary', 'd1', 'Initializes writing state'], ['d1', 'd2', 'Passes state to next word']])));

const recurrentAttention = ref('bahdanau-changing-decoder-context',
  'Why does Bahdanau attention let an RNN decoder look at different words as it writes?',
  'How does the previous decoder state choose which encoder states to read?',
  ['bahdanau attention let an rnn decoder look at different words', 'previous decoder state choose which encoder states'],
  'Use the previous decoder state as a query and encoder states as both keys and values. The weighted context goes into the next recurrent update.',
  depth => {
    const cycle = graph(b(depth) ? 'Look at the source for each next word' : 'The recurrent decoder retrieves fresh context',
      d(depth) ? 'At target step $t$, $s_{t-1}$ queries source states. The resulting context helps compute $s_t$.' :
        'The previous writing state tells attention which source details matter for the next update.',
      [['enc', 'Encoded source words'], ['prev', 'Previous writing state'], ['att', 'Source weighting'],
        ['ctx', 'Weighted source context'], ['new', 'Updated writing state']],
      [['enc', 'att', 'Supplies keys and values'], ['prev', 'att', 'Provides the query'],
        ['att', 'ctx', 'Combines source values'], ['ctx', 'new', 'Supplies retrieved context'], ['prev', 'new', 'Supplies recurrent state']]);
    return d(depth) ? two(cycle, weights('The source choice can change', 'Two target words give their largest weight to different source words.',
      targetWords.slice(1, 3), sourceWords, bahdanauWeights.slice(1, 3), { highlights: [hit(0, 1), hit(1, 0)] })) : visual(cycle);
  });

const translationGap = ref('translation-train-validation-loss',
  'Why can an attention translation model have lower training loss but higher validation loss?',
  'How do I spot overfitting in a sequence-to-sequence translation loss chart?',
  ['attention translation model have lower training loss', 'overfitting in a sequence to sequence translation loss chart'],
  'Use an illustrative translation run whose training loss drops after held-out loss has reached its minimum. Do not imply these are measured model scores.',
  depth => visual(plot(b(depth) ? 'A better fit can make worse guesses on new sentences' : 'Train and validation loss diverge',
    d(depth) ? 'These are invented token losses. In this run, the fourth epoch is the best checkpoint by held-out loss.' :
      'Training loss keeps falling. Held-out loss turns upward after its best value.',
    axis('Epoch', 1, 7), axis('Loss per token', 0, 4.5),
    [line('Training', [1, 2, 3, 4, 5, 6, 7], [4.2, 2.7, 1.9, 1.4, 1.0, 0.7, 0.5]),
      line('Validation', [1, 2, 3, 4, 5, 6, 7], [3.9, 3.1, 2.4, 2.1, 2.25, 2.5, 2.7])],
    b(depth) ? undefined : [{ kind: 'point', x: 4, y: 2.1, label: 'Lowest validation loss' }])), ['09', '10']);

const alignment = ref('bahdanau-read-translation-alignment',
  'How do I read the attention heatmap for an RNN translation?',
  'Why can the strongest alignment move backwards across source words?',
  ['attention heatmap for an rnn translation', 'strongest alignment move backwards across source words'],
  'Read each generated word as one attention row. Use an original source and translation whose adjective and noun reorder, with illustrative weights.',
  depth => visual(weights(b(depth) ? 'Which source word helps each guess?' : 'Source alignment in recurrent translation',
    d(depth) ? 'Every target row sums to one. These illustrative weights show the noun and adjective in a different order.' :
      'Read each target row across. The largest share can jump backward when word order changes.',
    targetWords, sourceWords, bahdanauWeights, { rowLabel: 'Target word', columnLabel: 'Source word',
      highlights: [hit(1, 1), hit(2, 0)] })));

const connections = ref('cnn-rnn-attention-path-length',
  'How do convolutions, RNNs and self-attention connect distant words differently?',
  'Why can two far-apart positions connect in one self-attention step?',
  ['convolutions rnns and self attention connect distant words', 'far apart positions connect in one self attention step'],
  'Compare an original short sequence under local convolution, forward recurrence and global self-attention. Separate signal hops from which calculations can run together.',
  depth => visual(matrix(b(depth) ? 'Three ways to pass information' : 'Paths between positions in a sequence',
    d(depth) ? 'Compare positions one and five with a width-three local filter, a forward RNN and unrestricted attention.' :
      'Local filters and a forward state need several hops. Global attention can reach the far position directly.',
    ['Direct access', 'Hops across toy sequence', 'Work in parallel'],
    [['Local convolution', 'Adjacent positions', 'Four layers', 'Positions in each layer'],
      ['Forward recurrence', 'Previous state', 'Four transitions', 'Each step waits'],
      ['Global attention', 'Any position', 'One layer', 'All query positions']], { columns: [1] })));

const positional = ref('transformer-position-signal-frequency',
  'Why does sinusoidal positional encoding use several different frequencies?',
  'How do the slow and fast sine waves change with word position?',
  ['sinusoidal positional encoding use several different frequencies', 'slow and fast sine waves change with word position'],
  'Use the same four features as the Transformer walkthrough. Draw the fast pair and slow pair on identical scales.',
  depth => {
    const plotPair = (name, caption, columns) => plot(name, caption,
      axis('Word position', 0, sentence.length - 1), axis('Signal value', -1, 1),
      columns.map((column, i) => line(i ? 'Cosine signal' : 'Sine signal', positions.map((_, p) => p), positions.map(row => row[column]))));
    const fast = plotPair(b(depth) ? 'A pattern that changes quickly' : 'Faster position features',
      d(depth) ? 'Use $\\sin(p)$ and $\\cos(p)$ at each word position $p$.' : 'These two signals change rapidly across the short sentence.', [0, 1]);
    const slow = plotPair(b(depth) ? 'A pattern that changes slowly' : 'Slower position features',
      d(depth) ? 'Use $\\sin(p/100)$ and $\\cos(p/100)$ on the same axes.' : 'These two change slowly over the same positions.', [2, 3]);
    return two(fast, slow);
  });

const encoderRows = sentence.slice(0, 4).map((token, index) => (index + 1) + ' ' + token);
const validSource = [...encoderRows, 'Padding one', 'Padding two'];
const readHead = (head, rows) => head.scores.slice(0, rows).map(scores => masked(scores, 4, softmax(scores.slice(0, 4))));
const encoderHeads = ref('transformer-encoder-head-weight-grids',
  'How can I compare encoder self-attention heatmaps from different heads?',
  'What does it mean if encoder attention heads look at different source words?',
  ['compare encoder self attention heatmaps from different heads', 'encoder attention heads look at different source words'],
  'Use the two walkthrough heads over the same valid source prefix. Use one color scale and mask the padded key positions for both.',
  depth => {
    const rowCount = b(depth) ? 2 : 4;
    const first = weights(b(depth) ? 'One way to read the words' : 'Encoder head A weights',
      'Only the first four key slots contain source words.',
      encoderRows.slice(0, rowCount), validSource, readHead(heads[0], rowCount), { rowLabel: 'Query', columnLabel: 'Key' });
    const second = weights(b(depth) ? 'Another way to read the words' : 'Encoder head B weights',
      d(depth) ? 'Both heads mask the same keys. Independent projections give different normalized scores across the allowed keys.' :
        'The available positions stay the same. The head can give them different weights.',
      encoderRows.slice(0, rowCount), validSource, readHead(heads[1], rowCount), { rowLabel: 'Query', columnLabel: 'Key' });
    return two(first, second);
  });

const crossRows = decoderPrefix.map((token, index) => (index + 1) + ' ' + token);
const maskedCross = crossWeights.map(row => masked(row, 4, normalize(row.slice(0, 4))));
const cross = ref('transformer-cross-attention-grid-padding',
  'How do I read a cross-attention heatmap with source padding?',
  'Can a decoder word attend to padding in the encoder input?',
  ['read a cross attention heatmap with source padding', 'decoder word attend to padding in the encoder input'],
  'Use the walkthrough’s separate target prefix and source positions. Re-normalize the illustrative source weights over the four real key slots.',
  depth => visual(weights(b(depth) ? 'Writing words read real source words' : 'Cross-attention masks source padding',
    d(depth) ? 'Rows are target queries and columns are source keys. The valid source prefix is the same for every query.' :
      'Each row reads the real source words. The empty slots get no weight.',
    crossRows, validSource, maskedCross, { rowLabel: 'Target query', columnLabel: 'Source key' })));

export const d2lAttentionReferences = [
  identityAttention, kernelShape, kernelRegressor, localWeightMap, bandwidthFit, bandwidthWeights, paddingMask,
  additive, fixedSummary, recurrentAttention, translationGap, alignment, connections, positional, encoderHeads, cross,
];

export const d2lVisionReferences = [...d2lCnnReferences, ...d2lSequenceReferences, ...d2lAttentionReferences];
