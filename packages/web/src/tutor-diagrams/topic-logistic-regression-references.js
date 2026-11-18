import * as data from './topic-logistic-regression-data.js';
import replay from './topic-logistic-regression-replay-cases.json' with { type: 'json' };
const metadata = data.metadata;
const spec = diagram => ({ version: 1, diagram });
const reference = ({ id, keywords, useWhen, overview, standard, deep }) => { const row = replay.prompts.find(item => item.referenceId === id); return { id, topic: metadata.topic, artifactTopic: metadata.artifactTopic, lessons: metadata.lessons, sources: metadata.sources, origin: 'lesson', lesson: metadata.lessons[0], promptOrigins: [{ id: row.id, prompt: row.prompt, origin: 'lesson', lesson: metadata.lessons[0] }], prompts: [row.prompt, ...row.paraphrases], paraphrases: row.paraphrases, keywords, shortKeywords: keywords, useWhen, ...standard, depths: { overview, standard, deep } }; };
export const topicMetadata = metadata;
const parts = [
(() => {
const lrOneD = data.derived();
const lrOneV = lrOneD.display;
const lrOneAxis = (label, min, max) => ({ label, min, max });
const lrOneSamples = (label, kind, points) => ({ label, kind, samples: { x: points.map(point => point.x), y: points.map(point => point.y) } });
const lrOneScoreSamples = (label, points) => ({ label, kind: 'line', smooth: true, samples: { x: { start: lrOneV.sigmoid.domain.xMin, step: lrOneV.constants.two }, y: points.map(point => point.y) } });
function lrOneChain(title, labels, caption) {
  const names = ['a', 'b', 'c'];
  return { kind: 'flow', title, caption,
    nodes: labels.map((label, index) => ({ id: names[index], label, role: index === labels.length - 1 ? 'outcome' : 'process' })),
    edges: labels.slice(1).map((_, index) => ({ from: names[index], to: names[index + 1] })) };
}
function lrOneLinear(deep) {
  const v = lrOneV;
  const d = v.linear.domain;
  return { kind: 'coordinate-plot', title: 'A line leaves the probability band',
    caption: deep ? `Worked example. $\\hat y=(${v.linear.fit.sxy}/${v.linear.fit.sxx})h${v.linear.fit.intercept}$. Shading marks invalid probabilities.` : 'Worked example. Shading marks invalid probabilities.',
    x: lrOneAxis('Hours studied', d.xMin, d.xMax), y: lrOneAxis('Pass/fail output', d.yMin, d.yMax),
    series: [
      { label: 'Observed', kind: 'scatter', samples: { x: { start: d.xMin, step: v.constants.one }, y: v.dataset.points.map(point => point.y) } },
      lrOneSamples('Fit', 'line', v.linear.line)
    ],
    annotations: [
      { kind: 'band', axis: 'y', from: d.yMin, to: v.constants.zero, label: 'Invalid low' },
      { kind: 'band', axis: 'y', from: v.constants.one, to: d.yMax, label: 'Invalid high' }
    ] };
}
function lrOneOutlier(deep) {
  const v = lrOneV;
  const d = v.outlier.domain;
  return { kind: 'coordinate-plot', title: 'A distant student flattens the fit',
    caption: deep ? `Illustrative values. After refitting, cutoff $h=(${v.constants.half}-b)/m\\approx${v.outlier.fit.cutoff}$ hours.` : 'Illustrative values. Markers show the half-probability crossings.',
    x: lrOneAxis('Hours studied', d.xMin, d.xMax), y: lrOneAxis('Pass/fail output', d.yMin, d.yMax),
    series: [
      lrOneSamples('Students', 'scatter', [...v.dataset.points, v.outlier.point]),
      lrOneSamples('Before', 'line', v.outlier.originalLine),
      lrOneSamples('After', 'line', v.outlier.refitLine),
      lrOneSamples('Half crossings', 'scatter', [{ x: v.linear.fit.cutoff, y: v.constants.half }, { x: v.outlier.fit.cutoff, y: v.constants.half }])
    ] };
}
function lrOneSigmoid(deep) {
  const v = lrOneV;
  const d = v.sigmoid.domain;
  return { kind: 'coordinate-plot', title: 'Sigmoid links score to probability',
    caption: deep ? `Illustrative values. $\\sigma(z)=1/(1+e^{-z})$; $\\sigma(${v.sigmoid.midpoint.x})=${v.sigmoid.midpoint.y}$.` : 'Illustrative values. The tails approach the probability bounds.',
    x: lrOneAxis('Linear score $z$', d.xMin, d.xMax), y: lrOneAxis('Pass probability', d.yMin, d.yMax),
    series: [lrOneScoreSamples('Sigmoid', v.sigmoid.points)],
    annotations: [
      { kind: 'reference-line', axis: 'y', value: v.constants.zero, label: 'Lower limit' },
      { kind: 'reference-line', axis: 'y', value: v.constants.one, label: 'Upper limit' },
      { kind: 'reference-line', axis: 'x', value: v.sigmoid.midpoint.x, label: 'Zero score' },
      { kind: 'reference-line', axis: 'y', value: v.sigmoid.midpoint.y, label: 'Half probability' }
    ] };
}
function lrOneDerivative(deep) {
  const v = lrOneV;
  const d = v.sigmoid.domain;
  return { kind: 'coordinate-plot', title: 'The sigmoid derivative peaks centrally',
    caption: deep ? `Illustrative values. $\\sigma'(z)=p(1-p)$; $${v.constants.half}(1-${v.constants.half})=${v.sigmoid.derivativePeak}$ at $z=${v.sigmoid.midpoint.x}$.` : 'Illustrative values. The derivative is largest where the sigmoid is steepest.',
    x: lrOneAxis('Linear score $z$', d.xMin, d.xMax), y: lrOneAxis('Probability or slope per score', d.yMin, d.yMax),
    series: [lrOneScoreSamples('Sigmoid', v.sigmoid.points), lrOneScoreSamples('Derivative', v.sigmoid.derivativePoints)],
    annotations: [{ kind: 'point', x: v.sigmoid.midpoint.x, y: v.sigmoid.derivativePeak, label: `Peak $${v.sigmoid.derivativePeak}$` }] };
}
return { references: [reference({ id: 'ml-logistic-regression-linear-unbounded', keywords: ['linear fit', 'unbounded output', 'pass fail'], useWhen: 'Explain why least-squares predictions on the hours data can leave the probability band, rather than explaining sigmoid or threshold tuning.', overview: { spec: spec(lrOneChain('A straight fit is unbounded', ['Pass/fail observations', 'Fit a straight line', 'Outputs can leave the probability band'], 'Worked example. Least squares does not constrain probabilities.')) }, standard: { spec: spec(lrOneLinear(false)) }, deep: { spec: spec(lrOneLinear(true)) } }),
reference({ id: 'ml-logistic-regression-outlier-leverage', keywords: ['outlier', 'shifted line', 'cutoff moves'], useWhen: 'Compare the original hours fit with the refit after adding the distant student; show leverage and the changed half-probability crossing.', overview: { spec: spec(lrOneChain('A distant observation changes the fit', ['Add a distant student', 'The slope flattens', 'The cutoff moves'], 'Illustrative values. A distant observation changes predictions throughout the fitted line.')) }, standard: { spec: spec(lrOneOutlier(false)) }, deep: { spec: spec(lrOneOutlier(true)) } }),
reference({ id: 'ml-logistic-regression-sigmoid-shape', keywords: ['sigmoid', 's curve', 'midpoint half'], useWhen: 'Show the sigmoid shape, its limiting probabilities and its midpoint; do not substitute a derivative or precision-recall plot.', overview: { spec: spec(lrOneChain('Sigmoid rises through its midpoint', [`Approach $${lrOneV.constants.zero}$`, `$\\sigma(${lrOneV.sigmoid.midpoint.x})=${lrOneV.sigmoid.midpoint.y}$`, `Approach $${lrOneV.constants.one}$`], 'Illustrative values. The curve rises while remaining between the probability bounds.')) }, standard: { spec: spec(lrOneSigmoid(false)) }, deep: { spec: spec(lrOneSigmoid(true)) } }),
reference({ id: 'ml-logistic-regression-sigmoid-derivative', keywords: ['sigmoid derivative', 'peak at zero', 'flat tails'], useWhen: 'Connect sigmoid steepness with its derivative: the middle has the largest product and both tails flatten.', overview: { spec: spec(lrOneChain('The derivative peaks in the middle', ['The middle is steep', '$p(1-p)$ is largest', 'The tails are flat'], 'Illustrative values. Near either probability bound, the derivative product shrinks.')) }, standard: { spec: spec(lrOneDerivative(false)) }, deep: { spec: spec(lrOneDerivative(true)) } })], derived: () => ({}) };
})(),
(() => {
const b2D = data.derived();
const b2C = b2D.constants;
const b2Shown = b2D.display;
const b2Axis = (label, min, max) => ({ label, min, max });

function b2Pipeline(depth) {
  if (depth === 'overview') return {
    kind: 'flow', title: 'From input to predicted class',
    caption: 'Illustrative values; thresholding turns probability into a class.',
    nodes: [
      { id: 'a', role: 'process', label: 'Compute a linear score from $x$' },
      { id: 'b', role: 'process', label: 'Convert the score to a probability' },
      { id: 'c', role: 'outcome', label: 'Apply a threshold to pick a class' },
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  };
  const example = b2Shown.pipeline.examples.at(-1);
  const deep = depth === 'deep';
  return {
    kind: 'flow', title: 'Score, probability, then class',
    caption: deep
      ? `Illustrative values; $z=${b2D.pipeline.w}×${example.x}${b2D.pipeline.b}=${example.z}$; $p≈${example.p}$; predict $${example.prediction}$.`
      : 'Illustrative values; keep the probability separate from the class.',
    nodes: [
      { id: 'x', role: 'process', label: deep ? `Take $x=${example.x}$ hours` : 'Take input $x$' },
      { id: 'z', role: 'process', label: 'Compute $z=wx+b$' },
      { id: 'p', role: 'process', label: 'Compute $p=1/(1+e^{-z})$' },
      { id: 'q', role: 'decision', label: `Is $p≥${b2D.pipeline.threshold}$?` },
      { id: 'yes', role: 'outcome', label: `Predict $${b2C.one}$` },
      { id: 'no', role: 'outcome', label: `Predict $${b2C.zero}$` },
    ],
    edges: [
      { from: 'x', to: 'z' }, { from: 'z', to: 'p' }, { from: 'p', to: 'q' },
      { from: 'q', to: 'yes', label: 'Yes' }, { from: 'q', to: 'no', label: 'No' },
    ],
  };
}

function b2Loss(depth) {
  if (depth === 'overview') return {
    kind: 'flow', title: 'Confidence is useful only when correct',
    caption: 'Illustrative values; confident mistakes have unbounded loss.',
    nodes: [
      { id: 'q', role: 'decision', label: 'Confident prediction?' },
      { id: 'c', role: 'outcome', label: 'Loss approaches zero' },
      { id: 'w', role: 'outcome', label: 'Loss grows without bound' },
    ],
    edges: [{ from: 'q', to: 'c', label: 'Correct' }, { from: 'q', to: 'w', label: 'Wrong' }],
  };
  const select = points => points.filter((point, index) => index % b2C.two === b2C.zero || point.x === b2C.half);
  const samples = points => ({ x: points.map(point => point.x), y: points.map(point => point.y) });
  const domain = b2D.loss.domain;
  return {
    kind: 'coordinate-plot', title: 'Confidence changes log loss',
    caption: depth === 'deep'
      ? 'Illustrative values; $L=-y\\ln(p)-(1-y)\\ln(1-p)$.'
      : 'Illustrative values; confident mistakes cost more.',
    x: b2Axis('Predicted pass probability', domain.xMin, domain.xMax),
    y: b2Axis('Log loss (nats)', domain.yMin, domain.yMax),
    series: [
      { label: `$y=${b2C.one}$`, kind: 'line', smooth: true, samples: samples(select(b2Shown.loss.positive)) },
      { label: `$y=${b2C.zero}$`, kind: 'line', smooth: true, samples: samples(select(b2Shown.loss.negative)) },
    ],
  };
}

function b2Training(depth) {
  if (depth === 'overview') return {
    kind: 'cycle', title: 'Learn by repeating',
    caption: 'Illustrative values; repeat until converged.',
    steps: ['Compute predictions and loss', 'Use gradients to update weights'],
  };
  const t = b2Shown.training;
  if (depth === 'standard') return {
    kind: 'cycle', title: 'The gradient descent training loop',
    caption: `Illustrative values; start at $w=b=${b2C.zero}$ and stop when converged.`,
    steps: ['Predict $p=\\sigma(wx+b)$', 'Compute mean log loss', 'Compute slope and bias gradients', 'Subtract learning rate times gradients'],
  };
  return {
    kind: 'cycle', title: 'Recompute the initial update',
    caption: `Illustrative values; $\\eta=${t.learningRate}$, $dw=${t.sumDw}/${t.n}=${t.dw}$, $db=${t.sumDb}/${t.n}=${t.db}$; $w'=${t.after.w},b'=${t.after.b}$. Stop when converged.`,
    steps: [
      '$p=\\sigma(wx+b)$',
      'Compute mean log loss',
      '$dw=(1/n)\\sum(p-y)x$, $db=(1/n)\\sum(p-y)$',
      '$w←w-\\eta dw$, $b←b-\\eta db$',
    ],
  };
}

function b2Boundary(depth) {
  const boundary = b2D.boundary;
  if (depth === 'overview') return {
    kind: 'flow', title: 'Which side predicts which class?',
    caption: 'Illustrative values; compare study plus practice hours with the boundary.',
    nodes: [
      { id: 'q', role: 'decision', label: `$x_1+x_2<${boundary.domain.xMax}$?` },
      { id: 'n', role: 'outcome', label: `Predict $${b2C.zero}$` },
      { id: 'p', role: 'outcome', label: `Predict $${b2C.one}$` },
    ],
    edges: [{ from: 'q', to: 'n', label: 'Yes' }, { from: 'q', to: 'p', label: 'No' }],
  };
  return {
    kind: 'coordinate-plot', title: 'A straight separator between clusters',
    caption: depth === 'deep'
      ? `Illustrative values; $x_1+x_2${boundary.b}=0$ gives $p=${b2C.half}$ on the line.`
      : 'Illustrative values; the line separates the class clusters.',
    x: b2Axis('Study time (hours)', boundary.domain.xMin, boundary.domain.xMax),
    y: b2Axis('Practice time (hours)', boundary.domain.yMin, boundary.domain.yMax),
    series: [
      ...[b2C.zero, b2C.one].map(label => {
        const points = boundary.points.filter(point => point.label === label);
        return { label: `Predict $${label}$ side`, kind: 'scatter', samples: { x: points.map(point => point.x), y: points.map(point => point.y) } };
      }),
      { label: 'Boundary', kind: 'line', points: boundary.line },
    ],
  };
}

function b2BoundarySamples() {
  const boundary = b2D.boundary;
  return {
    kind: 'coordinate-plot', title: 'Test points across the boundary',
    caption: `Illustrative values; $z=x_1+x_2${boundary.b}$, $p=1/(1+e^{-z})$.`,
    x: b2Axis('Study time (hours)', boundary.domain.xMin, boundary.domain.xMax),
    y: b2Axis('Practice time (hours)', boundary.domain.yMin, boundary.domain.yMax),
    series: [
      { label: 'Boundary', kind: 'line', points: boundary.line },
      { label: 'Test points', kind: 'scatter', points: b2Shown.boundary.samples.map(sample => ({ x: sample.x, y: sample.y, label: `$z=${sample.z},p≈${sample.p}$` })) },
    ],
  };
}
return { references: [reference({ id: 'ml-logistic-regression-model-pipeline', keywords: ['model pipeline', 'threshold decision', 'linear then sigmoid'], useWhen: 'Trace an input through the linear score, sigmoid probability and threshold decision, keeping probability distinct from predicted class.', overview: { spec: spec(b2Pipeline('overview')) }, standard: { spec: spec(b2Pipeline('standard')) }, deep: { spec: spec(b2Pipeline('deep')) } }),
reference({ id: 'ml-logistic-regression-log-loss', keywords: ['log loss', 'confident wrong', 'two curves'], useWhen: 'Compare binary cross-entropy for the two true labels and explain why confidently wrong predictions have unbounded loss.', overview: { spec: spec(b2Loss('overview')) }, standard: { spec: spec(b2Loss('standard')) }, deep: { spec: spec(b2Loss('deep')) } }),
reference({ id: 'ml-logistic-regression-gradient-descent', keywords: ['gradient descent', 'training loop', 'weight update'], useWhen: 'Show the repeated forward, loss, gradient and update stages; Detailed recomputes the initial update from the shared training rows.', overview: { spec: spec(b2Training('overview')) }, standard: { spec: spec(b2Training('standard')) }, deep: { spec: spec(b2Training('deep')) } }),
reference({ id: 'ml-logistic-regression-linear-separator', keywords: ['decision boundary', 'two clusters', 'linear separator'], useWhen: 'Locate the straight score boundary between the illustrative clusters, using study and practice hours as the two learner quantities.', overview: { spec: spec(b2Boundary('overview')) }, standard: { spec: spec(b2Boundary('standard')) }, deep: { spec: spec(b2Boundary('deep')), detailSpec: spec(b2BoundarySamples()) } })], derived: () => { const training = data.derived().training; return { logisticGradientSumMagnitude: Math.abs(training.sumDw), logisticGradientMagnitude: Math.abs(training.dw) }; } };
})(),
(() => {
const lr3d = data.derived();
const lr3v = lr3d.display;
// Softmax as panels: scores, their exponentials, then one stacked bar of shares (the bar is the whole, 1). Shared classes give a class one colour in every panel.
function lr3Panels(title, caption, shown, steps) {
  const s = lr3v.softmax;
  const bars = values => s.classes.map((c, i) => ({ label: `Class ${c}`, value: values[i] }));
  const scores = { kind: 'bar-chart', title: 'Raw scores', bars: bars(shown.scores) };
  const powers = { kind: 'bar-chart', title: 'Powers of e', bars: bars(shown.exponentials), caption: `Sum $= ${shown.denominator}$` };
  const shares = { kind: 'bar-chart', variant: 'stacked', title: 'Shares of one whole', unit: 'probability', bars: bars(shown.probabilities), total: lr3v.constants.one };
  return { kind: 'panels', title, caption, shared: ['classes'],
    panels: steps ? [{ diagram: scores }, { diagram: powers }, { diagram: shares }]
      : [{ diagram: scores }, { diagram: shares }],
    links: steps ? [{ from: 0, to: 1, operation: '$\\exp(z)$' }, { from: 1, to: 2, operation: `$\\div ${shown.denominator}$` }] : [{ from: 0, to: 1, operation: 'softmax' }] };
}
function lr3Softmax(depth) {
  const s = lr3v.softmax, shown = s.shown;
  if (depth === 'overview') return lr3Panels('Scores become probabilities', `Illustrative values; probabilities are rounded and add up to ${lr3v.constants.one}. Class ${s.winner} wins.`, shown, false);
  return lr3Panels('Scores become a distribution', depth === 'deep'
    ? `Illustrative values; $p_k=e^{z_k}/Σ_j e^{z_j}$, so $p_{${s.winner}}≈${shown.exponentials[s.winner]}/${shown.denominator}≈${shown.probabilities[s.winner]}$ (rounded).`
    : `Illustrative values, rounded to two places. Class ${s.winner} keeps the largest share.`, shown, true);
}
// The one-diagram variant sent to the author in place of the panels (reference-single-variants.js): scores and probabilities side by side in one grouped chart.
function lr3SoftmaxSingle() {
  const s = lr3v.softmax;
  return { useWhen: 'Show raw multiclass scores next to their normalized softmax probabilities in one chart, with the largest score retaining the largest probability. Not the binary sigmoid.',
    spec: spec({ kind: 'bar-chart', variant: 'grouped', title: 'Scores become a distribution', unit: 'value',
      categories: s.classes.map(c => `Class ${c}`), series: [{ label: 'Raw score', values: s.shown.scores }, { label: 'Probability', values: s.shown.probabilities }],
      caption: `Illustrative values, rounded to two places. Class ${s.winner} keeps the largest share.` }) };
}
// Deep only: every score raised by one. Each exponential is multiplied by e, the sum grows the same way, and the shares come out identical.
const lr3SoftmaxRaised = () => lr3Panels('Adding one to every score changes nothing', 'Every score plus 1: each $e^z$ is multiplied by $e$, so the shares stay the same.', lr3v.softmax.shown.raised, true);
function lr3Imbalance(depth) {
  const m = lr3v.imbalance;
  if (depth === 'overview') return {
    kind: 'bar-chart', title: 'The majority dominates accuracy', unit: 'cases',
    bars: [{ label: 'Negative', value: m.negative }, { label: 'Positive', value: m.positive }],
    caption: 'Illustrative values; always predicting negative misses every positive case.',
  };
  return {
    kind: 'bar-chart', variant: 'grouped', title: 'Always negative misses the minority', unit: 'cases',
    categories: ['Actual negative', 'Actual positive'],
    series: [{ label: 'Correct', values: [m.tn, m.tp] }, { label: 'Wrong', values: [m.fp, m.fn] }],
    caption: depth === 'deep'
      ? `Illustrative values; accuracy $(${m.tn}+${m.tp})/${m.total}=${m.accuracy}$ (${m.accuracyPercent}%); recall $${m.tp}/${m.positive}=${m.recall}$ (${m.recallPercent}%).`
      : `Illustrative values; accuracy ${m.accuracyPercent}%, but positive recall ${m.recallPercent}%. All positive cases are missed.`,
  };
}
function lr3Confusion(depth) {
  const m = lr3v.confusion;
  const brief = depth === 'overview';
  return {
    kind: 'matrix', title: 'Thresholded predictions',
    columns: ['Predicted positive', 'Predicted negative', ...(!brief ? ['Actual total'] : [])],
    rows: [
      { heading: 'Actually positive', cells: [`TP ${m.tp}`, `FN ${m.fn}`, ...(!brief ? [String(m.actualPositive)] : [])] },
      { heading: 'Actually negative', cells: [`FP ${m.fp}`, `TN ${m.tn}`, ...(!brief ? [String(m.actualNegative)] : [])] },
    ],
    caption: brief ? `Use $p≥${m.threshold}$ for a positive prediction.`
      : depth === 'deep'
        ? `At $t=${m.threshold}$, precision $${m.tp}/${m.predictedPositive}=${m.precision}$; recall $${m.tp}/${m.actualPositive}=${m.recall}$; $F_1=2PR/(P+R)=${m.f1}$.`
        : `${m.n} cases at $t=${m.threshold}$. Predicted positive total ${m.predictedPositive}; predicted negative total ${m.predictedNegative}.`,
  };
}
function lr3Threshold(depth) {
  const rows = lr3v.thresholds;
  const low = rows[lr3v.constants.zero];
  const high = rows.at(-lr3v.constants.one);
  const middle = lr3v.confusion;
  if (depth === 'overview') return {
    kind: 'matrix', title: 'A higher cutoff changes the balance', columns: ['Precision', 'Recall'],
    rows: [low, high].map(m => ({ heading: `Threshold ${m.threshold}`, cells: [String(m.precision), String(m.recall)] })),
    caption: 'Same cases; a higher threshold removes positive calls. Metrics are rounded.',
  };
  return {
    kind: 'coordinate-plot', title: 'Precision rises as recall falls',
    x: { label: 'Threshold probability', min: low.threshold, max: high.threshold },
    y: { label: 'Metric share', min: lr3v.constants.zero, max: lr3v.constants.one },
    series: [
      { label: 'Precision', kind: 'line', samples: { x: rows.map(m => m.threshold), y: rows.map(m => m.precision) } },
      { label: 'Recall', kind: 'line', samples: { x: rows.map(m => m.threshold), y: rows.map(m => m.recall) } },
    ],
    annotations: [{ kind: 'point', label: 'Equal metrics', x: middle.threshold, y: middle.precision }],
    caption: depth === 'deep'
      ? `Same ${middle.n} cases; plotted ratios rounded. At $t=${low.threshold}$, $P=${low.tp}/${low.predictedPositive}≈${low.precision}$ and $R=${low.tp}/${low.actualPositive}=${low.recall}$. At $t=${high.threshold}$, $R=${high.tp}/${high.actualPositive}=${high.recall}$.`
      : `Same ${middle.n} cases. Raising the threshold increases precision and reduces recall. Metrics are rounded.`,
  };
}
return { references: [reference({ id: 'ml-logistic-regression-softmax', keywords: ['softmax', 'probabilities sum', 'multi class'], useWhen: 'Show raw multiclass scores becoming normalized softmax probabilities, with the largest score retaining the largest probability. Not the binary sigmoid.', overview: { spec: spec(lr3Softmax('overview')) }, standard: { spec: spec(lr3Softmax('standard')) }, deep: { spec: spec(lr3Softmax('deep')), detailSpec: spec(lr3SoftmaxRaised()) } }),
reference({ id: 'ml-logistic-regression-accuracy-trap', keywords: ['class imbalance', 'accuracy trap', 'zero recall'], useWhen: 'Explain why an always-negative classifier has high accuracy on an imbalanced dataset while missing every positive case.', overview: { spec: spec(lr3Imbalance('overview')) }, standard: { spec: spec(lr3Imbalance('standard')) }, deep: { spec: spec(lr3Imbalance('deep')) } }),
reference({ id: 'ml-logistic-regression-confusion-matrix', keywords: ['confusion matrix', 'true positive', 'false negative'], useWhen: 'Place the supplied probability predictions into actual-by-predicted confusion cells at the fixed threshold, then calculate precision, recall and F-score.', overview: { spec: spec(lr3Confusion('overview')) }, standard: { spec: spec(lr3Confusion('standard')) }, deep: { spec: spec(lr3Confusion('deep')) } }),
reference({ id: 'ml-logistic-regression-threshold-tradeoff', keywords: ['threshold tuning', 'precision recall', 'tradeoff'], useWhen: 'Compare precision and recall as the probability threshold changes on the same supplied predictions. Use threshold on the horizontal axis, not a ROC curve or a sigmoid.', overview: { spec: spec(lr3Threshold('overview')) }, standard: { spec: spec(lr3Threshold('standard')) }, deep: { spec: spec(lr3Threshold('deep')) } })], derived: () => ({}), softmaxSingle: lr3SoftmaxSingle() };
})(),
];
export const references = Object.freeze(parts.flatMap(part => part.references));
export const softmaxSingleSpec = parts.find(part => part.softmaxSingle).softmaxSingle;
export function derived() { return Object.assign({}, data.derived(), ...parts.map(part => part.derived?.() ?? {})); }
