import {
  adaptiveLossRuns, adamCoordinates, activations, basinCurve, basinPath, capacityLoss, centeredLogits, classLogits,
  classProbabilities, cosineSchedules, descentPaths, dropout, epochSamples, gaussians, heldoutScheduleRuns,
  minibatchRuns, momentumLossRuns, momentumMemory, momentumValleyPath, newtonCurve, newtonPath,
  nonconvexCurve, penaltyLoss, plainValleyPath, round, safePath, smoothSchedules, stochasticPaths,
  stochasticSamples, uphillPath,
} from './d2l-figure-data.js';

const brief = depth => depth === 'brief';
const detailed = depth => depth === 'detailed';
const spec = diagram => ({ version: 1, diagram });
const axis = (label, min, max) => ({ label, min, max });
const series = (label, coordinates, options = {}) => ({
  label, kind: 'line', points: coordinates.map(([x, y, label]) => ({ x, y, ...(label ? { label } : {}) })), ...options,
});
const pair = (xs, ys) => xs.map((x, i) => [x, ys[i]]);
const indexed = ys => ys.map((y, i) => [i, round(y)]);
const plot = (title, caption, x, y, series, annotations) => spec({
  kind: 'coordinate-plot', title, caption, x: { ...x, scale: 'linear' }, y, series, ...(annotations ? { annotations } : {}),
});
const relation = (title, caption, nodes, edges) => spec({
  kind: 'relationship', layout: 'graph', title, caption,
  nodes: nodes.map(([id, label]) => ({ id, label })),
  edges: edges.map(([from, to, label]) => ({ from, to, label })),
});
const matrix = (title, caption, columns, rows) => spec({
  kind: 'matrix', layout: 'teaching', title, caption, columns, rows: rows.map(([heading, ...cells], i) => ({ id: 'r' + (i + 1), heading, cells: cells.map(String) })),
});
const point = (x, y, label) => ({ kind: 'point', x, y, label });
const ref = (id, lessons, prompt, paraphrase, keywords, useWhen, make) => ({
  id: 'd2l-' + id, lessons, prompts: [prompt], paraphrases: [paraphrase], keywords, useWhen, spec: make('balanced'),
  depths: { overview: { spec: make('brief') }, deep: { spec: make('detailed') } },
});

const gaussian = ref('gaussian-location-scale', ['02'],
  'What happens to a Gaussian when its mean or standard deviation changes?',
  'Can I see a normal curve shift sideways versus spread out?',
  ['gaussian when its mean or standard deviation changes', 'normal curve shift sideways versus spread out', 'gaussian mean and standard deviation'],
  'For noise in linear regression, compare equal spreads with distinct centers and equal centers with distinct spreads. Density area stays one.',
  depth => plot(brief(depth) ? 'Move the center or change the spread' : 'Gaussian location and scale',
    detailed(depth) ? String.raw`Changing $\mu$ shifts the density. Increasing $\sigma$ spreads the same probability mass and lowers its peak.` :
      'Moving the center leaves the width alone. Spreading out the curve lowers its peak.',
    axis(brief(depth) ? 'Difference' : 'Residual', -5.2, 4), axis('Density', 0, 0.55),
    gaussians.map((points, i) => series(['Original', 'Center moved', 'Wider'][i], points))));

const linearUnit = ref('linear-weighted-inputs', ['01', '02'],
  'How can one neuron represent a linear regression model?',
  'What does a linear predictor do with each weighted input and the bias?',
  ['one neuron represent a linear regression model', 'linear predictor do with each weighted input and the bias'],
  'Draw one prediction unit receiving weighted features and a bias, as a mathematical analogy for combining incoming signals.',
  depth => relation(brief(depth) ? 'One prediction combines several inputs' : 'A linear predictor is one output unit',
    detailed(depth) ? String.raw`The unit computes $\hat y=2x_1+3x_2+1$. The bias contributes even when both inputs are zero.` :
      'Give each input a weight, add those contributions, then add a starting offset.',
    [['a', 'First input'], ['b', 'Second input'], ['c', 'Starting offset'], ['out', 'Prediction']],
    [['a', 'out', 'Doubles its input'], ['b', 'out', 'Triples its input'], ['c', 'out', 'Adds one']]));

const complexity = ref('complexity-heldout-error', ['09', '10'],
  'Why can a more complex model get worse on held-out data?',
  'What does error versus model complexity look like for overfitting?',
  ['more complex model get worse on held out data', 'error versus model complexity'],
  'Compare training and held-out error at the same model sizes. Mark the lowest observed held-out error; the toy traces are not measurements.',
  depth => plot(brief(depth) ? 'A better fit can predict worse' : 'Complexity and held-out error',
    detailed(depth) ? 'Illustrative errors. Choose the size with the lowest validation error, then use a separate test set for final evaluation.' :
      'The training error keeps falling. Held-out error rises again after the best model size.',
    axis('Model size', 1, 5), axis('Error', 0, 1),
    [series('Training', indexed(capacityLoss.train).map(([x,y]) => [x+1,y])),
      series('Held-out', indexed(capacityLoss.holdout).map(([x,y]) => [x+1,y]))],
    [point(3, capacityLoss.holdout[2], 'Best held-out score')]));

const weightDecay = ref('weight-decay-heldout-loss', ['02', '09', '10'],
  'How does weight decay change training and validation loss?',
  'Can weight decay help when my training loss drops and validation loss stays flat?',
  ['weight decay change training and validation loss', 'weight decay help when my training loss drops', 'weight decay validation loss'],
  'Use matched epochs, examples and initial loss to illustrate weight decay trading in-sample fit for held-out improvement.',
  depth => plot(brief(depth) ? 'A less exact fit can generalize better' : 'Weight decay changes the fit trade-off',
    detailed(depth) ? String.raw`Data loss is shown for both splits. The penalized run minimizes $L_{\rm data}+\lambda\lVert w\rVert_2^2$.` :
      'With a penalty, training loss ends higher and held-out loss ends lower in this example.',
    axis('Epoch', 0, 6), axis('Data loss', 0, 0.9),
    Object.values(penaltyLoss).map((values, i) => series(['Train without penalty', 'Held-out without penalty', 'Train with penalty', 'Held-out with penalty'][i],
      [0, 2, 4].map(j => [epochSamples[j], values[j]])))));

const classScores = ref('softmax-affine-class-scores', ['03'],
  'How does softmax regression create its raw class scores?',
  'Do all classes use the same input features before the softmax?',
  ['softmax regression create its raw class scores', 'all classes use the same input features before the softmax'],
  'Draw each class using its own learned weights on the same feature vector. Distinguish the scores from the later softmax normalization.',
  depth => relation(brief(depth) ? 'The same clues feed different scores' : 'Each class has its own affine score',
    detailed(depth) ? 'Each score $z_j=w_j^T x+b_j$ has a different weight vector. Softmax normalizes all scores together.' :
      'Every class reads the same inputs through different weights. The scores become probabilities together.',
    [['a', 'First input'], ['b', 'Second input'], ['x', 'Class A score'], ['y', 'Class B score']],
    [['a', 'x', 'Uses first class weight'], ['b', 'x', 'Uses second class weight'],
      ['a', 'y', 'Uses a separate weight'], ['b', 'y', 'Uses another weight']]));

const stableSoftmax = ref('softmax-shift-for-stability', ['03'],
  'Why subtract the maximum before calculating softmax?',
  'How does stable softmax avoid overflow with huge logits?',
  ['subtract the maximum before calculating softmax', 'stable softmax avoid overflow', 'subtract max before softmax', 'stable softmax'],
  'Compare one score row, subtract its maximum from every class, and show normalized probabilities for the shifted scores.',
  depth => matrix(brief(depth) ? 'Keep the gaps and use smaller scores' : 'Subtract the maximum for stable softmax',
    detailed(depth) ? String.raw`The same factor cancels from each ratio: $p_i=e^{z_i-m}/\sum_j e^{z_j-m}$, where $m=\max_j z_j$.` :
      'Subtract the largest score from every entry. The ordering and differences stay the same.',
    ['Class A', 'Class B', 'Class C'],
    [[brief(depth) ? 'Original scores' : 'Logits', ...classLogits], ['Shifted scores', ...centeredLogits], ['Class chances', ...classProbabilities]]));

const hiddenLayer = ref('dense-hidden-layer-activations', ['01', '03', '10'],
  'What does a hidden layer do in a small fully connected network?',
  'How do hidden units learn nonlinear features from the same inputs?',
  ['hidden layer do in a small fully connected network', 'hidden units learn nonlinear features from the same inputs'],
  'Trace a dense hidden layer with separate weights on the same features. Identify the hidden nonlinearity and the later output combination.',
  depth => relation(brief(depth) ? 'Hidden units make new clues' : 'A hidden layer learns features',
    detailed(depth) ? String.raw`Each hidden unit computes $h_j=\phi(w_j^T x+b_j)$. The output combines the hidden activations.` :
      'Each hidden unit combines the same inputs in its own way, then changes the result before passing it on.',
    [['x', 'First input'], ['y', 'Second input'], ['a', 'First hidden unit'], ['b', 'Second hidden unit'], ['out', 'Output score']],
    [['x', 'a', 'Supplies weighted input'], ['y', 'a', 'Supplies another weighted input'],
      ['x', 'b', 'Supplies a new weighted input'], ['y', 'b', 'Supplies its other weighted input'],
      ['a', 'out', 'Passes first activation'], ['b', 'out', 'Passes second activation']]));

const relu = ref('rectifier-activation-shape', ['02', '03'],
  'What happens to positive and negative inputs in a ReLU activation?',
  'Can I see how a rectifier keeps only the positive side?',
  ['positive and negative inputs in a relu activation', 'rectifier keeps only the positive side', 'relu activation shape'],
  'Show one activation curve with a deliberate corner at zero. The positive segment has unit slope.',
  depth => plot(brief(depth) ? 'Keep positive inputs' : 'ReLU has a corner at zero',
    detailed(depth) ? String.raw`The rectified linear unit is $f(x)=\max(0,x)$. The two regions have different slopes.` :
      'Negative inputs become zero. Positive inputs keep their value.',
    axis('Input', -3, 3), axis('Output', 0, 3), [series('Rectifier', [[-3, 0], [0, 0], [3, 3]], { smooth: false })]));

const reluGradient = ref('rectifier-local-gradient', ['02', '03'],
  'Why is the ReLU gradient zero on one side and one on the other?',
  'What happens to the derivative at the ReLU corner?',
  ['relu gradient zero on one side and one on the other', 'derivative at the relu corner'],
  'Use a step to show local ReLU slope away from zero; name the derivative ambiguity at the kink.',
  depth => plot(brief(depth) ? 'The slope switches at zero' : 'ReLU derivative away from zero',
    detailed(depth) ? 'For $x<0$, the slope is zero. For $x>0$, it is one. The classical derivative is undefined at $x=0$.' :
      'The flat side passes no local gradient. The straight rising side passes it through. The exact corner has no single slope.',
    axis('Input', -3, 3), axis('Local slope', 0, 1.2),
    [series('Below zero', [[-3, 0], [-0.12, 0]]), series('Above zero', [[0.12, 1], [3, 1]])]));

const tanh = ref('tanh-sigmoid-activation-ranges', ['03'],
  'How does tanh squash its input differently from sigmoid?',
  'Why does tanh give negative outputs while sigmoid does not?',
  ['tanh squash its input differently from sigmoid', 'tanh give negative outputs while sigmoid'],
  'Compare centered tanh and positive sigmoid activations on the same input and output axes.',
  depth => plot(brief(depth) ? 'Two ways to squash a score' : 'Tanh and sigmoid have different ranges',
    detailed(depth) ? String.raw`For equal inputs, $\tanh(x)$ approaches minus one or one. Sigmoid approaches zero or one.` :
      'One curve is centered at zero and can be negative. The other stays positive.',
    axis('Input', -3, 3), axis('Output', -1, 1),
    [series(brief(depth) ? 'Centered curve' : 'Tanh', activations.tanh), series(brief(depth) ? 'Positive curve' : 'Sigmoid', activations.sigmoid)]));

const saturation = ref('sigmoid-tanh-saturation-gradients', ['02', '03'],
  'Why do sigmoid and tanh gradients vanish near saturation?',
  'Can I see the local slopes of sigmoid and tanh when their inputs get large?',
  ['sigmoid and tanh gradients vanish near saturation', 'local slopes of sigmoid and tanh'],
  'Compare the derivatives on shared axes so the gradient scale near zero and attenuation in both tails are visible.',
  depth => plot(brief(depth) ? 'Extreme inputs pass little change' : 'Activation slopes near saturation',
    detailed(depth) ? String.raw`At zero, $\sigma^\prime(0)=1/4$ and $\tanh^\prime(0)=1$. Both derivatives shrink toward zero in the tails.` :
      'Both slopes are strongest near the center. Extreme inputs pass a much smaller change backward.',
    axis('Input', -3, 3), axis('Local slope', 0, 1),
    [series(brief(depth) ? 'Positive curve slope' : 'Sigmoid slope', activations.sigmoidSlope),
      series(brief(depth) ? 'Centered curve slope' : 'Tanh slope', activations.tanhSlope)]));

const objective = ref('regularized-forward-graph', ['02', '10'],
  'What is the forward computation graph for a regularized neural-network loss?',
  'Where do labels and weight penalties enter the training objective?',
  ['forward computation graph for a regularized neural network loss', 'labels and weight penalties enter the training objective'],
  'Show data and weights producing a prediction, prediction and target producing data loss, and the weights producing a separate penalty that joins only at the final objective.',
  depth => relation(brief(depth) ? 'The objective adds two costs' : 'Forward graph with a weight penalty',
    detailed(depth) ? String.raw`The objective is $J=L(\hat y,y)+\lambda R(w)$. The penalty is a separate path from the learned weights.` :
      'Compare the prediction with the target. Separately, charge a cost for large weights. Add the two costs.',
    [['x', 'Training inputs'], ['w', 'Model weights'], ['p', 'Prediction'], ['y', 'Target'], ['l', 'Data loss'], ['r', 'Weight cost'], ['j', 'Objective']],
    [['x', 'p', 'Provides model inputs'], ['w', 'p', 'Determines the prediction'], ['p', 'l', 'Provides the estimate'],
      ['y', 'l', 'Supplies the target'], ['w', 'r', 'Sets the penalty'], ['l', 'j', 'Adds fitting error'], ['r', 'j', 'Adds weight cost']]));

const dropoutMask = ref('inverted-dropout-mask', ['10', '12'],
  'What happens to each hidden unit under an inverted dropout mask?',
  'Why does inverted dropout scale the units it keeps during training?',
  ['each hidden unit under an inverted dropout mask', 'inverted dropout scale the units it keeps'],
  'Use one original mask and activations; zero the dropped unit and divide retained activations by the keep rate during training. Inference uses all units with no extra scaling.',
  depth => matrix(brief(depth) ? 'One training pass drops a hidden unit' : 'Inverted dropout on hidden activations',
    detailed(depth) ? 'For keep rate $p=0.5$, training passes $a_i m_i/p$ with a sampled mask. Inference passes $a_i$.' :
      'Kept values are doubled during this training pass. At inference all units run normally.',
    ['Unit A', 'Unit B', 'Unit C'],
    [['Before mask', ...dropout.units], ['This mask', ...dropout.mask.map(value => value ? 'Keep' : 'Drop')],
      ['Training output', ...dropout.units.map((v, i) => v * dropout.mask[i] / dropout.keep)]]));

const dropoutMetrics = ref('dropout-validation-metrics', ['09', '10'],
  'How should I read validation loss and accuracy when training with dropout?',
  'Can validation loss fall after accuracy levels off in a dropout run?',
  ['validation loss and accuracy when training with dropout', 'accuracy levels off in a dropout run'],
  'Compare distinct loss and accuracy metrics on the same epochs. Use an illustrative run, not a causal estimate of the benefit of dropout.',
  depth => plot(brief(depth) ? 'Accuracy and loss can move differently' : 'Reading a dropout training run',
    detailed(depth) ? String.raw`Accuracy counts correct decisions. Cross-entropy $-\log(p_y)$ also responds to confidence in the true class.` :
      'In this example the model makes the same share of correct decisions while held-out loss keeps improving.',
    axis('Epoch', 0, 6), axis('Held-out metric', 0, 1),
    [series('Loss', pair(epochSamples, dropout.heldoutLoss)), series('Accuracy', pair(epochSamples, dropout.heldoutAccuracy))]));

const neuronAnalogy = ref('neuron-signal-path-analogy', ['01'],
  'What parts of a biological neuron inspired an artificial neuron?',
  'How is a neuron receiving and sending a signal like a prediction unit?',
  ['biological neuron inspired an artificial neuron', 'neuron receiving and sending a signal like a prediction unit'],
  'Use the receive, integrate and send order as an analogy for a numerical unit. Leave out anatomy unless it is actually the learner’s topic.',
  depth => spec({
    kind: 'flow', title: brief(depth) ? 'From incoming signal to outgoing signal' : 'The neuron signal path as an analogy',
    caption: detailed(depth) ? String.raw`The artificial unit uses $a=f(\sum_i w_i x_i+b)$. A biological cell integrates inputs by more complex mechanisms.` :
      'Both examples combine inputs before passing on an output. A real cell uses much more than arithmetic.',
    nodes: [
      { id: 'input', label: brief(depth) ? 'Receive signals' : 'Receive input at synapses', role: 'process' },
      { id: 'combine', label: brief(depth) ? 'Combine the signals' : 'Combine at the cell body', role: 'process' },
      { id: 'output', label: brief(depth) ? 'Send an outgoing signal' : 'Send a spike along the axon', role: 'outcome' },
    ],
    edges: [{ from: 'input', to: 'combine' }, { from: 'combine', to: 'output' }],
  }));

const descent = ref('gradient-descent-rate-regimes', ['02', '12'],
  'How can I see gradient descent overshoot when the learning rate is too large?',
  'Why do some learning rates crawl, settle, or bounce away on the same loss?',
  ['gradient descent overshoot when the learning rate is too large', 'learning rates crawl settle or bounce away'],
  'Show ordered iterates from one starting point on a scalar quadratic. A very small rate crawls and a large enough rate diverges with alternating signs.',
  depth => plot(brief(depth) ? 'A small step, a direct step, or a growing bounce' : 'Step size changes the descent path',
    detailed(depth) ? String.raw`Loss $w^2$ gives update factor $1-2\eta$. The optimum is zero.` :
      'All runs start at the same weight. Compare their distance from zero.',
    axis('Update', 0, 4), axis('Weight', -4.5, 4.5), descentPaths.map((path, i) =>
      series(['Small steps', 'Steady steps', 'One step', 'Growing bounce'][i], (i === 3 ? [0, 1, 2, 3, 4] : [0, 1, 4]).map(j => [j, round(path[j])]), { smooth: false }))));

const basin = ref('gradient-descent-local-basin', ['02', '12'],
  'Why can gradient descent find a local minimum but miss a deeper one?',
  'Can I see a descent path get stuck in the wrong valley?',
  ['gradient descent find a local minimum but miss', 'descent path get stuck in the wrong valley'],
  'Plot one nonconvex loss with two valleys and mark the actual ordered descent path from a start in the shallower basin.',
  depth => plot(brief(depth) ? 'The nearest low point can miss a lower one' : 'Descent can settle in a local minimum',
    detailed(depth) ? String.raw`Start on the right and update $w\gets w-\eta L^\prime(w)$. The left basin is lower.` :
      'Starting on the right leads into the right-hand valley. The other valley is lower.',
    axis('Weight', -1.6, 1.6), axis('Loss', 0, 2.8),
    [series('Loss', basinCurve.filter((_, i) => i !== 1)), series('Update path', [basinPath[0], basinPath[1], basinPath.at(-1)], { smooth: false })],
    [point(...basinCurve[2], 'Lower basin'), point(...basinPath.at(-1), 'Where the updates settle')]));

const newton = ref('newton-convex-curvature-steps', ['02', '12'],
  'How does Newton optimization use curvature to move to a minimum?',
  'Why does Newton divide the gradient by curvature in a convex problem?',
  ['newton optimization use curvature to move to a minimum', 'newton divide the gradient by curvature'],
  'Draw actual Newton iterates on one convex scalar loss. Separate local curvature from the slope that supplies the descent direction.',
  depth => plot(brief(depth) ? 'Bending changes the step length' : 'Newton steps use slope and curvature',
    detailed(depth) ? String.raw`The update is $w\gets w-L^\prime(w)/L^{\prime\prime}(w)$. This example has positive curvature throughout.` :
      'A steep slope calls for a larger move. A sharper bend reduces that move.',
    axis('Weight', -2, 2), axis('Loss', 0, 4.2),
    [series('Loss', newtonCurve), series('Updates', [newtonPath[0], newtonPath[1], newtonPath[2], newtonPath.at(-1)], { smooth: false })]));

const nonconvex = ref('newton-negative-curvature-safeguard', ['02', '12'],
  'Why can Newton optimization go uphill with negative curvature?',
  'Can a safeguarded Newton step avoid running up a nonconvex loss?',
  ['newton optimization go uphill with negative curvature', 'safeguarded newton step avoid running up'],
  'Use the same nonconvex scalar objective and start for the undamped Newton step and a damped positive-curvature safeguard.',
  depth => plot(brief(depth) ? 'An uphill jump and a safer move' : 'Negative curvature can reverse Newton’s step',
    detailed(depth) ? String.raw`Scale the downhill direction by $0.3/\max(1,|L^{\prime\prime}(w)|)$.` :
      'Both paths start at the same point. The guarded step follows the downhill direction and limits its size.',
    axis('Weight', -1.2, 1.2), axis('Loss', 0, 1.4),
    [series('Loss', nonconvexCurve.filter((_, i) => i !== 2)), series('Original step', uphillPath.slice(0, 2), { smooth: false }),
      series('Guarded step', safePath.slice(0, 3), { smooth: false })]));

const stochastic = ref('sgd-noise-and-decay', ['02', '12'],
  'Why does stochastic gradient descent keep jittering near the optimum?',
  'What happens if I shrink SGD steps too quickly when gradients are noisy?',
  ['stochastic gradient descent keep jittering near the optimum', 'shrink sgd steps too quickly when gradients are noisy', 'noisy sgd path'],
  'Use the same noisy gradients, start and step budget for constant, rapid-decay and gradual-decay schedules.',
  depth => plot(brief(depth) ? 'Smaller steps can quiet the bounce' : 'Stochastic descent under three step schedules',
    detailed(depth) ? String.raw`These toy updates use $w\gets w-\eta_t(w+\epsilon_t)$ with the same noise. A rapidly shrinking rate can stall early.` :
      'The fixed steps keep bouncing. The fastest shrinkage settles before reaching zero.',
    axis('Update', 0, 24), axis('Weight error', -0.55, 2.7),
    stochasticPaths.map((path, i) => series(['Fixed steps', 'Rapid decay', 'Gradual decay'][i],
      [0, 3, 7, 21, 24].map(t => [t, round(path[t])]), { smooth: false }))));

const batchEpochs = ref('minibatch-loss-per-epoch', ['02', '12'],
  'Why does changing batch size change progress per epoch?',
  'How many updates do single examples and full batches make in one pass?',
  ['changing batch size change progress per epoch', 'single examples and full batches make in one pass'],
  'Use one original regression sample and the same learning rate for single-example, small-batch, medium-batch and full-data updates.',
  depth => plot(brief(depth) ? 'One pass can contain different numbers of updates' : 'Loss by data pass at different batch sizes',
    detailed(depth) ? 'With 12 examples, batch size $B$ gives $12/B$ updates per pass.' :
      'Smaller batches make more updates per pass through the examples.',
    axis('Data passes', 0, 4), axis('Loss', 0, 0.65),
    minibatchRuns.map(({ batchSize, losses }) => series('Batch of ' + batchSize, [0, batchSize === 6 ? 2 : 1, 4].map(x => [x, losses[x]])))));

const batchClock = ref('minibatch-loss-by-wall-time', ['02', '12'],
  'Can a small batch be fastest in wall-clock time even if one example updates more often?',
  'How do I compare batch sizes by time to the same training loss?',
  ['small batch be fastest in wall clock time', 'compare batch sizes by time to the same training loss'],
  'Compare toy elapsed time to the same loss target. Use the same training traces as the per-epoch comparison and say timings come from an assumed cost model.',
  depth => plot(brief(depth) ? 'Compare time to reach the same loss' : 'Batch size changes elapsed time to a target',
    detailed(depth) ? String.raw`Toy update cost is $(0.18+0.025B)$ ms.` :
      'In this toy cost model, the batch of three reaches the same loss first.',
    axis('Elapsed ms', 0, 10), axis('Loss', 0, 0.65),
    minibatchRuns.map(({ batchSize, epochMs, losses }) => series('Batch of ' + batchSize,
      [0, batchSize === 6 ? 2 : 1, 4].map(epoch => [round(epoch * epochMs), losses[epoch]]))),
    [{ kind: 'reference-line', axis: 'y', value: 0.06, label: 'Shared target' }]));

const momentum = ref('momentum-in-narrow-valley', ['02', '12'],
  'Why does momentum help gradient descent in a narrow loss valley?',
  'Can momentum reduce a growing zigzag at the same learning rate?',
  ['momentum help gradient descent in a narrow loss valley', 'momentum reduce a growing zigzag at the same learning rate'],
  'Use identical initial weights and learning rate for plain and momentum updates. Show their paths relative to an elongated equal-loss contour.',
  depth => plot(brief(depth) ? 'Remember earlier moves to quiet a zigzag' : 'Momentum in a narrow loss valley',
    detailed(depth) ? String.raw`Use $v_t=0.6v_{t-1}+g_t$ and $w_t=w_{t-1}-0.45v_t$. Both runs use the same rate.` :
      'Both paths take the same first step. Without memory the bounce grows. With memory it settles.',
    axis('Shallow direction', -2.4, 2.4), axis('Steep direction', -3.2, 5),
    [series('Plain descent', plainValleyPath, { smooth: false }),
      series('With momentum', [0, 1, 2, 3, 5, 7].map(i => momentumValleyPath[i]), { smooth: false })],
    [{ kind: 'ellipse', center: { x: 0, y: 0 }, radiusX: 2.2, radiusY: 0.7, label: 'Equal-loss contour' }]));

const memory = ref('momentum-gradient-memory', ['02', '12'],
  'How much do older gradients count in momentum?',
  'Why does a larger momentum coefficient remember older steps longer?',
  ['older gradients count in momentum', 'larger momentum coefficient remember older steps longer'],
  'Show how the coefficient on a gradient falls with its age for different momentum settings, including no memory.',
  depth => plot(brief(depth) ? 'Older steps count less' : 'Momentum weights decay with age',
    detailed(depth) ? String.raw`A gradient from $k$ updates ago has weight $\beta^k$. All traces assign weight one to the current gradient.` :
      'All three rules fully count the newest gradient. More memory lets older gradients keep a larger share.',
    axis('Age in steps', 0, 7), axis('Gradient weight', 0, 1),
    momentumMemory.map((points, i) => series(['None', 'Short memory', 'Long memory'][i], points, { smooth: false }))));

const momentumRate = ref('momentum-rate-loss-history', ['02', '12'],
  'How do momentum and learning rate work together during training?',
  'Why can reducing the learning rate help when momentum is high?',
  ['momentum and learning rate work together during training', 'reducing the learning rate help when momentum is high'],
  'Compare the same illustrative minibatches and loss under a baseline, higher momentum, and higher momentum with a smaller rate.',
  depth => plot(brief(depth) ? 'Changing memory may call for smaller steps' : 'Tune step size and momentum together',
    detailed(depth) ? 'Toy regression uses the same batches throughout. The middle run adds momentum; the third also lowers the rate.' :
      'The heavier memory makes one run more uneven. A smaller step changes the pattern without changing the data.',
    axis('Data passes', 0, 4), axis('Loss', 0, 0.65),
    momentumLossRuns.map((losses, i) => series(['No memory', 'More memory', 'More memory, lower rate'][i], pair([0, 1, 2, 3, 4], losses)))));

const adamMoment = ref('adam-per-coordinate-rescaling', ['02', '12'],
  'Why can Adam take different steps for two coordinates with the same gradient?',
  'How does Adam use a running squared gradient to scale each update?',
  ['adam take different steps for two coordinates with the same gradient', 'adam use a running squared gradient to scale each update', 'adam per coordinate step size'],
  'Use two coordinates with the same current gradient and first moment, different squared-gradient histories, and computed Adam updates.',
  depth => matrix(brief(depth) ? 'The same gradient can make different moves' : 'Adam scales each coordinate separately',
    detailed(depth) ? String.raw`At update three, $|\Delta w_i|=0.18\hat m_i/(\sqrt{\hat v_i}+\epsilon)$. The displayed moments are before bias correction.` :
      'Both coordinates have the same current gradient. The larger recent squared gradients give a smaller move.',
    ['Coordinate A', 'Coordinate B'], [
      ['Current gradient', ...adamCoordinates.map(row => row.gradient)],
      [brief(depth) ? 'Recent direction' : 'First moment', ...adamCoordinates.map(row => round(row.m, 3))],
      [brief(depth) ? 'Recent squared size' : 'Second moment', ...adamCoordinates.map(row => round(row.v, 3))],
      ['Move size', ...adamCoordinates.map(row => round(row.move, 3))],
    ]));

const adaptive = ref('adam-yogi-loss-history', ['02', '12'],
  'What does comparing Adam and Yogi loss curves tell me?',
  'How can different second-moment updates still reach a similar training loss?',
  ['comparing adam and yogi loss curves', 'different second moment updates still reach a similar training loss'],
  'Compare the same toy minibatches under the two moment-update rules. The loss plot shows similar outcomes, not equivalence of the internal updates.',
  depth => plot(brief(depth) ? 'Different updates can reach similar loss' : 'Adam and Yogi on the same toy regression',
    detailed(depth) ? String.raw`Yogi updates the second moment using the sign of $v-g^2$. The same batches and base rate are used here.` :
      'The two rules handle gradient history differently. Both get close to the bottom on these toy data.',
    axis('Data passes', 0, 4), axis('Loss', 0, 0.65),
    adaptiveLossRuns.map((values, i) => series(['Adam', 'Yogi'][i], pair([0, 1, 2, 3, 4], values)))));

const scheduleDecay = ref('inverse-root-factor-schedules', ['12'],
  'How does inverse square root learning-rate decay differ from factor decay with a floor?',
  'What does a rate floor do to a multiplicative learning-rate schedule?',
  ['inverse square root learning rate decay differ from factor decay', 'rate floor do to a multiplicative learning rate schedule'],
  'Start both toy schedules at the same rate and compare gradual inverse-square-root decay with constant-factor decay that reaches a floor.',
  depth => plot(brief(depth) ? 'Two ways to make steps smaller' : 'Inverse-root and factor rate decay',
    detailed(depth) ? String.raw`Compare $0.4/\sqrt{t+1}$ with $\max(0.05,0.4\cdot0.65^t)$. The floor holds the second curve flat.` :
      'One rule keeps shrinking slowly. The other shrinks by the same factor until it reaches a lower limit.',
    axis('Update', 0, 8), axis('Learning rate', 0, 0.45),
    smoothSchedules.map((points, i) => series(['Gradual shrinkage', 'Factor and floor'][i], points))));

const warmup = ref('cosine-warmup-schedules', ['12'],
  'What does cosine learning-rate decay look like with and without warmup?',
  'When does warmup hand off to cosine annealing?',
  ['cosine learning rate decay look like with and without warmup', 'warmup hand off to cosine annealing'],
  'Compare two cosine decay runs with a common maximum, end step and floor. One reaches the maximum after a linear warmup.',
  depth => plot(brief(depth) ? 'Raise the step size before shrinking it' : 'Cosine decay with and without warmup',
    detailed(depth) ? String.raw`After warmup, use $0.04+0.18(1+\cos(\pi s))$ with $s$ increasing to one. Then hold the floor.` :
      'Warmup climbs to the usual starting rate. Both schedules then ease into the same lower limit.',
    axis('Update', 0, 8), axis('Learning rate', 0, 0.45),
    cosineSchedules.map((points, i) => series(['Start at full rate', 'Start with warmup'][i], points, i === 1 ? { smooth: false } : {}))));

const scheduleOutcome = ref('schedule-heldout-training-outcome', ['09', '10', '12'],
  'How do I judge a learning-rate schedule from held-out accuracy over time?',
  'Can a warmup schedule improve the start without changing the final test accuracy?',
  ['judge a learning rate schedule from held out accuracy over time', 'warmup schedule improve the start without changing the final test accuracy'],
  'Compare matched toy held-out traces for fixed, gradual, milestone, cosine and warmup rates. Label the histories illustrative and avoid a performance guarantee.',
  depth => plot(brief(depth) ? 'Compare the start and the finish' : 'A schedule can change when accuracy improves',
    detailed(depth) ? 'Toy validation scores at matched epochs. Warmup leads early in this example and ends tied with cosine decay.' :
      'Track performance on unseen examples. An early lead can disappear by the end.',
    axis('Epoch', 0, 6), axis('Held-out accuracy', 0.4, 0.8),
    Object.values(heldoutScheduleRuns).map((points, i) => series(['Fixed', 'Gradual', 'Milestone', 'Cosine', 'Warmup'][i],
      [0, 1, 4].map(j => [epochSamples[j], points[j]])))));

export const d2lFigureReferences = [
  gaussian, linearUnit, neuronAnalogy, complexity, weightDecay, classScores, stableSoftmax, hiddenLayer, relu, reluGradient,
  saturation, tanh, objective, dropoutMask, dropoutMetrics, descent, basin, newton, nonconvex, stochastic, batchEpochs,
  batchClock, momentum, memory, momentumRate, adamMoment, adaptive, scheduleOutcome, scheduleDecay, warmup,
];
