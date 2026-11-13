import * as data from './topic-linear-regression-data.js';
import replay from './topic-linear-regression-replay-cases.json' with { type: 'json' };
const metadata = data.metadata;
const spec = diagram => ({ version: 1, diagram });
const reference = ({ id, keywords, useWhen, overview, standard, deep }) => { const row = replay.prompts.find(item => item.referenceId === id); return { id, topic: metadata.topic, artifactTopic: metadata.artifactTopic, lessons: metadata.lessons, sources: metadata.sources, origin: 'lesson', lesson: metadata.lessons[0], promptOrigins: [{ id: row.id, prompt: row.prompt, origin: 'lesson', lesson: metadata.lessons[0] }], prompts: [row.prompt, ...row.paraphrases], paraphrases: row.paraphrases, keywords, shortKeywords: keywords, useWhen, ...standard, depths: { overview, standard, deep } }; };
export const topicMetadata = metadata;
const parts = [
(() => {
const lrD = data.derived();
const lrSamples = points => ({ x: points.map(point => point.x), y: points.map(point => point.y) });
const lrToyAxes = {
  x: { label: 'Input $x$', min: lrD.axes.toy.xMin, max: lrD.axes.toy.xMax },
  y: { label: 'Target $y$', min: lrD.axes.toy.yMin, max: lrD.axes.toy.yMax },
};
function lrSlope(depth) {
  const brief = depth === 'overview';
  const deep = depth === 'deep';
  const triangle = lrD.fit.triangle;
  const selected = brief ? lrD.points.filter((_, i) => i % 2 === 0) : lrD.points;
  return {
    kind: 'coordinate-plot', title: 'Slope and intercept', ...lrToyAxes,
    series: [
      { label: 'Toy observations', kind: 'scatter', samples: lrSamples(selected) },
      { label: 'Fitted line', kind: 'line', samples: lrSamples(lrD.fit.line) },
      ...(!brief ? [{ label: 'Slope triangle', kind: 'line', samples: lrSamples([triangle.from, triangle.corner, triangle.to]) }] : []),
    ],
    annotations: [{ kind: 'point', label: `$b=${lrD.fit.b}$`, ...lrD.fit.intercept }],
    caption: brief ? 'Selected toy points. Slope tilts the line; intercept locates its vertical-axis crossing.' : deep ?
      `Rise $${triangle.rise}$ for run $${triangle.run}$; $\\hat y(${lrD.points.at(-1).x})=${lrD.fit.w}\\times ${lrD.points.at(-1).x}+${lrD.fit.b}=${lrD.fit.predictions.at(-1)}$.` :
      `Rise $${triangle.rise}$ for run $${triangle.run}$; the intercept is the vertical-axis crossing.`,
  };
}
function lrResiduals(depth) {
  const brief = depth === 'overview';
  const points = lrD.points.map((point, i) => ({ x: point.x, y: lrD.fit.residuals[i] })).filter((_, i) => !brief || i % 2 === 0);
  return {
    kind: 'coordinate-plot', title: 'Residuals become a cost',
    x: lrToyAxes.x,
    y: { label: 'Residual $y-\\hat y$', min: -lrD.constants.one, max: lrD.constants.one },
    series: [{ label: 'Observed minus fitted', kind: 'stem', samples: { ...lrSamples(points), showValues: !brief } }],
    caption: brief ? 'Selected toy residuals. Square the gaps, then average.' : depth === 'deep' ?
      `$\\mathrm{MSE}=(${lrD.fit.squares.join('+')})/${lrD.counts.rows}=${lrD.fit.mse}$. Squared gaps sum to $${lrD.fit.sse}$.` :
      'Gaps from the fitted line, shifted to a common zero baseline; square before averaging.',
  };
}
function lrBowl(depth) {
  const brief = depth === 'overview';
  const points = lrD.profile.samples.filter((_, i) => !brief || i % 2 === 0).map(point => ({ x: point.w, y: point.mse }));
  return {
    kind: 'coordinate-plot', title: 'The MSE bowl and its bottom',
    x: { label: 'Slope $w$', min: lrD.axes.profile.xMin, max: lrD.axes.profile.xMax },
    y: { label: 'Mean squared error', min: lrD.axes.profile.yMin, max: lrD.axes.profile.yMax },
    series: [{ label: 'Optimized-intercept cost', kind: 'line', smooth: true, samples: { ...lrSamples(points), showValues: !brief } }],
    ...(!brief ? { annotations: [{ kind: 'point', label: 'Lowest cost', x: lrD.fit.w, y: lrD.fit.mse }] } : {}),
    caption: brief ? 'Selected slopes. Refit the intercept at each slope; the bowl has a unique bottom.' : depth === 'deep' ?
      `$\\mathrm{MSE}(w)=(${lrD.profile.numerator.quadratic}w^2-${Math.abs(lrD.profile.numerator.linear)}w+${lrD.profile.numerator.constant})/${lrD.profile.divisor}$. Use $b=${lrD.summary.meanY}-${lrD.summary.meanX}w$.` :
      `Refit the intercept at each slope. The bottom is $w=${lrD.fit.w}$ with $\\mathrm{MSE}=${lrD.fit.mse}$.`,
  };
}
function lrLoop(depth) {
  return {
    kind: 'cycle', title: 'Repeat until the stopping test passes',
    steps: depth === 'overview' ? ['Compute predictions and cost', 'Compute gradients and update parameters', 'Check whether to stop'] : depth === 'deep' ?
      ['Compute $\\hat y=wx+b$', 'Compute $J$ from squared residuals', 'Compute $\\partial_w J$ and $\\partial_b J$', 'Update $w\\leftarrow w-\\alpha\\partial_w J$ and $b\\leftarrow b-\\alpha\\partial_b J$', 'Check stopping tolerance'] :
      ['Compute predictions', 'Compute squared-error cost', 'Compute gradients', 'Update weight and intercept', 'Check stopping tolerance'],
    caption: depth === 'deep' ?
      `Illustrative loop. $J=\\frac{1}{n}\\sum_i(\\hat y_i-y_i)^2$; exact toy minimum $J=${lrD.fit.mse}$. Exit when the stopping test passes; otherwise repeat.` :
      'Illustrative loop. Exit when the stopping test passes; otherwise repeat. Low cost alone does not certify optimality.',
  };
}
return { references: [reference({ id: 'ml-linear-regression-slope-intercept', keywords: ['slope', 'intercept', 'fitted line'], useWhen: 'Explain slope as rise over run and intercept as the vertical-axis crossing of the fitted toy line.', overview: { spec: spec(lrSlope('overview')) }, standard: { spec: spec(lrSlope('standard')) }, deep: { spec: spec(lrSlope('deep')) } }),
reference({ id: 'ml-linear-regression-residual-mse', keywords: ['mean squared error', 'residuals', 'squared error'], useWhen: 'Turn the residuals of the fitted toy line into squared gaps, their sum, and mean squared error.', overview: { spec: spec(lrResiduals('overview')) }, standard: { spec: spec(lrResiduals('standard')) }, deep: { spec: spec(lrResiduals('deep')) } }),
reference({ id: 'ml-linear-regression-cost-bowl', keywords: ['cost surface', 'convex bowl', 'minimum'], useWhen: 'Show the bowl-shaped MSE profile over slope, optimizing the intercept at each slope, and locate its bottom.', overview: { spec: spec(lrBowl('overview')) }, standard: { spec: spec(lrBowl('standard')) }, deep: { spec: spec(lrBowl('deep')) } }),
reference({ id: 'ml-linear-regression-training-loop', keywords: ['training loop', 'gradient descent', 'update rule'], useWhen: 'Explain the repeating prediction, cost, gradient, update, and stopping-test loop rather than the size of an individual update.', overview: { spec: spec(lrLoop('overview')) }, standard: { spec: spec(lrLoop('standard')) }, deep: { spec: spec(lrLoop('deep')) } })], derived: () => ({ bowlLinearMagnitude: Math.abs(data.derived().profile.numerator.linear) }) };
})(),
(() => {
const lr2D = data.derived();
const lr2Zero = lr2D.constants.zero;
const lr2Small = lr2D.descent.steps[0];
const lr2Large = lr2D.descent.steps[1];
function lr2FirstBrief() {
  return {
    kind: 'flow', title: 'The first weight update',
    nodes: [
      { id: 'zero', label: `Set $w=${lr2Zero}$`, role: 'process' },
      { id: 'updated', label: `Move to $w=${lr2Small.w}$`, role: 'outcome' }
    ],
    edges: [{ from: 'zero', to: 'updated' }],
    caption: 'A negative cost gradient makes the weight increase.'
  };
}
function lr2First(deep) {
  return {
    kind: 'number-line', title: 'An update along the weight axis',
    min: lr2D.axes.weight.min, max: lr2D.axes.weight.max,
    markers: [
      { value: lr2Zero, label: `$w=${lr2Zero}$` },
      { value: lr2Small.w, label: `$w=${lr2Small.w}$` },
      { value: lr2D.fit.w, label: `Fitted $w=${lr2D.fit.w}$` }
    ],
    intervals: [{ from: lr2Zero, to: lr2Small.w, startClosed: true, endClosed: true, label: 'Positive update' }],
    caption: deep
      ? `$\u005c\u005cDelta w=${lr2Small.rate}\u005c\u005ctimes\u005c\u005cfrac{${lr2D.constants.two}}{${lr2D.counts.rows}}\u005c\u005ctimes${lr2D.summary.sumXY}=${lr2Small.deltaW}$. The intercept also becomes $b'=${lr2Small.b}$.`
      : 'The negative gradient gives a positive weight change. The fitted slope is shown for comparison; the intercept changes too.'
  };
}
function lr2RateBrief() {
  return {
    kind: 'comparison', title: 'Step size changes the cost direction',
    columns: [lr2Small, lr2Large].map(step => ({
      heading: `$\u005c\u005calpha=${step.rate}$`,
      items: [`$J:${lr2D.descent.start.mse}\u005c\u005cto${step.mse}$`]
    })),
    caption: 'A small update lowers the cost; an oversized update can raise it.'
  };
}
function lr2Rate(deep) {
  const a = lr2D.axes.learningCost;
  return {
    kind: 'coordinate-plot', title: 'Cost after the first update',
    x: { label: 'Updates completed', min: a.xMin, max: a.xMax, unit: 'updates' },
    y: { label: 'Mean squared error', min: a.yMin, max: a.yMax, unit: 'squared y' },
    series: [lr2Small, lr2Large].map(step => ({
      label: `$\u005c\u005calpha=${step.rate}$`, kind: 'line',
      points: [{ x: lr2Zero, y: lr2D.descent.start.mse }, { x: step.step, y: step.mse }]
    })),
    annotations: [
      { kind: 'point', label: 'Lower cost', x: lr2Small.step, y: lr2Small.mse },
      { kind: 'point', label: 'Higher cost', x: lr2Large.step, y: lr2Large.mse }
    ],
    caption: deep
      ? `$J=\u005c\u005cfrac{1}{${lr2D.counts.rows}}\u005c\u005csum(\u005c\u005chat y-y)^2$. Updates give $(w,b)=(${lr2Small.w},${lr2Small.b})$ or $(${lr2Large.w},${lr2Large.b})$.`
      : `Both runs begin at $w=b=${lr2Zero}$. The larger update overshoots the fitted slope $w=${lr2D.fit.w}$ and raises cost.`
  };
}
function lr2Normal(depth) {
  const brief = depth === 'brief';
  const deep = depth === 'detailed';
  const s = lr2D.summary;
  return {
    kind: 'comparison', title: 'Direct solve or iterative updates?',
    columns: [
      { heading: 'Normal equation', items: brief
        ? ['Use a direct solve when the feature matrix is manageable.']
        : deep ? [
          `$w=\u005c\u005cfrac{${s.sxy}}{${s.sxx}}=${lr2D.fit.w}$`,
          `$b=${s.meanY}-${lr2D.fit.w}\u005c\u005ctimes${s.meanX}=${lr2D.fit.b}$`,
          'Dense inversion costs $O(p^3)$ in feature count $p$.'
        ] : [
          'Solve directly for the least-squares fit.',
          'Prefer a manageable feature matrix.',
          `$w=${lr2D.fit.w},\u005c\u005c b=${lr2D.fit.b}$`
        ] },
      { heading: 'Gradient descent', items: brief
        ? ['Use iterative updates for very large or streaming data.']
        : deep ? [
          `$w'=${lr2Zero}+${lr2Small.rate}\u005c\u005ctimes\u005c\u005cfrac{${lr2D.constants.two}}{${lr2D.counts.rows}}\u005c\u005ctimes${s.sumXY}=${lr2Small.w}$`,
          'Repeat until a stopping criterion is met.',
          'Avoid a dense inverse; tune the learning rate.'
        ] : [
          'Repeat updates with a tuned rate.',
          'Prefer very large or streaming datasets.',
          `After an update, $w=${lr2Small.w}$.`
        ] }
    ],
    caption: deep
      ? 'With full column rank, direct solving and converged descent target the same fit. Prefer QR or SVD to explicitly forming an inverse.'
      : 'Choose by feature count, memory and data access, not by an assumption that iterative fitting is a different regression model.'
  };
}
function lr2ScalingBrief() {
  return {
    kind: 'flow', title: 'Make feature scales comparable',
    nodes: [
      { id: 'scale', label: 'Standardize each feature', role: 'process' },
      { id: 'direct', label: 'Take straighter gradient steps', role: 'outcome' }
    ],
    edges: [{ from: 'scale', to: 'direct' }],
    caption: 'Illustrative values; comparable scales can reduce zigzagging across a narrow loss valley.'
  };
}
function lr2Scaling(scaled, deep) {
  const a = lr2D.axes.contours;
  const model = scaled ? lr2D.scaling.scaledDescent : lr2D.scaling.rawDescent;
  const contour = scaled ? lr2D.scaling.scaledContour : lr2D.scaling.rawContour;
  const unit = scaled ? 'y per SD' : 'y per unit';
  return {
    kind: 'coordinate-plot',
    title: scaled ? 'Standardization makes the path direct' : 'Unscaled features bend the path',
    x: { label: 'Weight $w_1$', min: a.xMin, max: a.xMax, unit },
    y: { label: 'Weight $w_2$', min: a.yMin, max: a.yMax, unit },
    series: [{ label: scaled ? 'Direct path' : 'Zigzag path', kind: 'line',
      samples: { x: model.points.map(point => point.x), y: model.points.map(point => point.y) }
    }],
    annotations: [{ kind: 'ellipse', label: scaled ? 'Round valley' : 'Narrow valley',
      center: { x: lr2Zero, y: lr2Zero }, radiusX: contour.radiusX, radiusY: contour.radiusY
    }],
    caption: deep
      ? scaled
        ? 'Illustrative values; $z=(x-\u005c\u005cmu)/\u005c\u005csigma$ centers each feature and gives it unit population variance.'
        : "Illustrative values; unequal curvature causes alternating steps. $\u005c\u005cmathbf w'=\u005c\u005cmathbf w-\u005c\u005calpha H\u005c\u005cmathbf w$."
      : scaled
        ? 'Illustrative values; comparable feature scales allow a more direct path toward the centre.'
        : 'Illustrative values; the narrow valley makes updates bounce across its steep direction.'
  };
}
return { references: [reference({ id: 'ml-linear-regression-first-step', keywords: ['gradient step', 'weight update', 'first epoch'], useWhen: 'Show the first gradient step from zero on the toy data, not the repeated training loop or a contour path.', overview: { spec: spec(lr2FirstBrief()) }, standard: { spec: spec(lr2First(false)) }, deep: { spec: spec(lr2First(true)) } }),
reference({ id: 'ml-linear-regression-learning-rate', keywords: ['learning rate', 'overshoot', 'cost increase'], useWhen: 'Compare the cost after a single update at two learning rates from the same zero initialization; do not substitute a learning-rate schedule.', overview: { spec: spec(lr2RateBrief()) }, standard: { spec: spec(lr2Rate(false)) }, deep: { spec: spec(lr2Rate(true)) } }),
reference({ id: 'ml-linear-regression-normal-equation', keywords: ['normal equation', 'closed form', 'direct solve'], useWhen: 'Choose between directly solving least squares and iterative gradient descent, using the same toy fit for comparison.', overview: { spec: spec(lr2Normal('brief')) }, standard: { spec: spec(lr2Normal('balanced')) }, deep: { spec: spec(lr2Normal('detailed')) } }),
reference({ id: 'ml-linear-regression-feature-scaling', keywords: ['feature scaling', 'standardization', 'elongated contours'], useWhen: 'Explain why unequal feature ranges create a narrow loss valley and why standardization makes gradient descent more direct. Contours and paths are schematic, not a fitted two-feature toy model.', overview: { spec: spec(lr2ScalingBrief()) }, standard: { spec: spec(lr2Scaling(false, false)), detailSpec: spec(lr2Scaling(true, false)) }, deep: { spec: spec(lr2Scaling(false, true)), detailSpec: spec(lr2Scaling(true, true)) } })], derived: () => ({}) };
})(),
(() => {
const lrEndData = data.derived();
const lrEndSamples = points => ({ x: points.map(point => point.x), y: points.map(point => point.y) });
function lrEndPolynomial(depth) {
  const d = lrEndData;
  const p = d.polynomial;
  if (depth === 'overview') return {
    kind: 'comparison', title: 'Training fit is not generalization',
    columns: [
      { heading: 'Straight line', items: ['Leaves some training error'] },
      { heading: `Degree ${p.degree} interpolant`, items: ['Matches every training point'] },
    ],
    caption: 'Illustrative extrapolation: matching training points does not guarantee good predictions.',
  };
  const a = d.axes.polynomial;
  const samples = p.samples.filter(point => point.x >= d.points[0].x);
  return {
    kind: 'coordinate-plot', title: 'Fit is not generalization',
    x: { label: 'Input', min: a.xMin, max: a.xMax },
    y: { label: 'Target', min: a.yMin, max: a.yMax },
    series: [
      { label: 'Toy', kind: 'scatter', samples: lrEndSamples(d.points) },
      { label: 'Line', kind: 'line', samples: lrEndSamples(d.fit.line) },
      { label: 'Interpolant', kind: 'line', samples: { x: { start: samples[0].x, step: samples[1].x - samples[0].x }, y: samples.map(point => point.y) } },
    ],
    annotations: [{ kind: 'point', label: 'New target', x: p.newPoint.x, y: p.newPoint.y }],
    caption: depth === 'deep' ? `Illustrative new target; interpolant training $MSE=${p.trainMse}$.` : 'Illustrative new target; exact toy fits.',
  };
}
function lrEndPolynomialError() {
  const point = lrEndData.polynomial.newPoint;
  return {
    kind: 'bar-chart', title: 'New-target squared errors', unit: '$y^2$',
    bars: [
      { label: 'Line', value: point.lineSquaredError },
      { label: 'Interpolant', value: point.polynomialSquaredError },
    ],
    caption: `Illustrative target. $(${point.polynomialPrediction}-${point.y})^2=${point.polynomialSquaredError}$.`,
  };
}
function lrEndRSquared(depth) {
  const fit = lrEndData.fit;
  const brief = depth === 'overview';
  return {
    kind: 'bar-chart', title: 'Error relative to predicting the mean', unit: '$y^2$',
    bars: [
      { label: 'Total', value: fit.baseline.sse },
      { label: 'Residual', value: fit.sse },
      ...(!brief ? [{ label: 'Removed', value: fit.explainedSse }] : []),
    ],
    caption: brief ? 'The line leaves less squared error than the mean baseline.' : depth === 'deep' ? `$R^2=1-${fit.sse}/${fit.baseline.sse}=${fit.rSquared}$. Perfect: $R^2=${fit.benchmarks.perfectR2}$; mean baseline: $R^2=${fit.benchmarks.meanR2}$.` : `Explained fraction $R^2=${fit.rSquared}$, relative to the mean baseline.`,
  };
}
function lrEndRidge(depth) {
  if (depth === 'overview') return {
    kind: 'flow', title: 'Penalize weight magnitude',
    nodes: [
      { id: 'penalty', label: 'Add ridge penalty', role: 'process' },
      { id: 'weight', label: 'Decrease $w$', role: 'outcome' },
    ],
    edges: [{ from: 'penalty', to: 'weight' }],
    caption: 'Penalize the weight, not the intercept.',
  };
  const r = lrEndData.ridge;
  const a = lrEndData.axes.ridge;
  const example = r.samples[lrEndData.constants.one];
  return {
    kind: 'coordinate-plot', title: 'Ridge shrinks the weight',
    x: { label: 'Penalty', min: a.xMin, max: a.xMax },
    y: { label: 'Weight', min: a.yMin, max: a.yMax },
    series: [{ label: 'Ridge solutions', kind: 'line', samples: { x: r.samples.map(sample => sample.lambda), y: r.samples.map(sample => sample.w) } }],
    annotations: [{ kind: 'reference-line', axis: 'y', value: r.asymptote, label: 'Zero limit' }],
    caption: depth === 'deep' ? `$w=${r.numerator}/(${r.denominatorBase}+λ)$. At $λ=${example.lambda}$, $w=${example.w}$. The intercept is unpenalized.` : 'The intercept is unpenalized; larger penalties reduce the fitted weight.',
  };
}
function lrEndHoldout(depth) {
  const d = lrEndData;
  const h = d.holdout;
  const brief = depth === 'overview';
  const selected = brief ? d.points.filter((point, i) => i % d.constants.two === d.constants.zero) : d.points;
  const selectedIds = selected.map(point => point.id);
  return {
    kind: 'sample-set', title: 'Reserve a row before fitting',
    samples: selected.map(point => ({ id: point.id, label: `$(${point.x},${point.y})$` })),
    groups: [
      { id: 'train', label: 'Training', members: h.trainIds.filter(id => selectedIds.includes(id)) },
      { id: 'test', label: 'Test', members: h.testIds },
    ],
    caption: brief ? 'Selected training rows; the test row stays unseen during fitting.' : depth === 'deep' ? `$w=${h.summary.sxy}/${h.summary.sxx}=${h.w}$; $b=${h.summary.meanY}-${h.w}*${h.summary.meanX}=${h.b}$. Test $MSE=(${h.actual}-${h.prediction})^2=${h.testMse}$.` : `Fit only the training rows. Held-out prediction $y_{pred}=${h.prediction}$; actual $y=${h.actual}$.`,
  };
}
return { references: [reference({ id: 'ml-linear-regression-polynomial-overfit', keywords: ['polynomial regression', 'overfitting', 'degree'], useWhen: 'Compare interpolation of the toy observations with extrapolation to an explicitly illustrative new target.', overview: { spec: spec(lrEndPolynomial('overview')) }, standard: { spec: spec(lrEndPolynomial('standard')) }, deep: { spec: spec(lrEndPolynomial('deep')), detailSpec: spec(lrEndPolynomialError()) } }),
reference({ id: 'ml-linear-regression-r-squared', keywords: ['r-squared', 'explained variance', 'baseline mean'], useWhen: 'Compare the mean baseline error with the fitted residual error and interpret the fraction removed.', overview: { spec: spec(lrEndRSquared('overview')) }, standard: { spec: spec(lrEndRSquared('standard')) }, deep: { spec: spec(lrEndRSquared('deep')) } }),
reference({ id: 'ml-linear-regression-ridge-shrinkage', keywords: ['ridge regression', 'l2 penalty', 'weight shrinkage'], useWhen: 'Show the exact ridge solutions as the penalty increases while the intercept remains unpenalized.', overview: { spec: spec(lrEndRidge('overview')) }, standard: { spec: spec(lrEndRidge('standard')) }, deep: { spec: spec(lrEndRidge('deep')) } }),
reference({ id: 'ml-linear-regression-held-out-row', keywords: ['train test split', 'held out', 'generalization'], useWhen: 'Keep the held-out row outside fitting, then compute its prediction and squared test error.', overview: { spec: spec(lrEndHoldout('overview')) }, standard: { spec: spec(lrEndHoldout('standard')) }, deep: { spec: spec(lrEndHoldout('deep')) } })], derived: () => ({}) };
})(),
];
export const references = Object.freeze(parts.flatMap(part => part.references));
export function derived() { return Object.assign({}, data.derived(), ...parts.map(part => part.derived?.() ?? {})); }
