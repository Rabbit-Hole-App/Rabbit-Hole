import * as data from './topic-linear-regression-data.js';
import { derived as regularizationDerived } from './topic-regularization-data.js';
import replay from './topic-linear-regression-replay-cases.json' with { type: 'json' };
const metadata = data.metadata;
const spec = diagram => ({ version: 1, diagram });
const reference = ({ id, keywords, useWhen, overview, standard, deep }) => { const row = replay.prompts.find(item => item.referenceId === id); return { id, topic: metadata.topic, artifactTopic: metadata.artifactTopic, lessons: metadata.lessons, sources: metadata.sources, origin: 'lesson', lesson: metadata.lessons[0], promptOrigins: [{ id: row.id, prompt: row.prompt, origin: 'lesson', lesson: metadata.lessons[0] }], prompts: [row.prompt, ...row.paraphrases], paraphrases: row.paraphrases, keywords, shortKeywords: keywords, useWhen, ...standard, depths: { overview, standard, deep } }; };
export const topicMetadata = metadata;
const parts = [
(() => {
const lrOne = data.derived();
const lrOneAxes = bounds => ({ x: { label: 'Input feature', min: bounds.xMin, max: bounds.xMax }, y: { label: 'Target', min: bounds.yMin, max: bounds.yMax } });
function lrOneLine(brief, deep = false) {
  const d = lrOne;
  const selected = brief ? [d.fit.slope.from, d.fit.slope.to] : d.points;
  return {
    kind: 'coordinate-plot', title: 'Slope and intercept', ...lrOneAxes(d.axes.scatter),
    series: [
      { label: brief ? 'Line predictions' : 'Observed', kind: 'scatter', samples: { x: selected.map(p => p.x), y: selected.map(p => p.y) } },
      { label: 'Fitted line', kind: 'line', points: d.fit.line.map((p, i) => ({ ...p, ...(i === 0 ? { label: `$b=${d.fit.b}$` } : {}) })) },
    ],
    annotations: [
      { kind: 'segment', label: deep ? 'Run' : `Run $${d.fit.slope.run}$`, from: d.fit.slope.from, to: d.fit.slope.corner },
      { kind: 'segment', label: deep ? 'Rise' : `Rise $${d.fit.slope.rise}$`, from: d.fit.slope.corner, to: d.fit.slope.to },
    ],
    caption: brief ? 'Worked example. Fit uses all toy rows; dots are predictions.' : deep ? `Worked example. $w=${d.fit.slope.rise}/${d.fit.slope.run}=${d.fit.w}$.` : 'Worked example.',
  };
}
function lrOneLineArithmetic() {
  const d = lrOne;
  const s = d.fit.slope;
  return {
    kind: 'comparison', title: 'Read the line parameters',
    columns: [
      { heading: 'Slope', items: [`$w=\\frac{${s.to.y}-${s.from.y}}{${s.to.x}-${s.from.x}}=${d.fit.w}$`] },
      { heading: 'Intercept', items: [`$b=${d.summary.meanY}-${d.fit.w}\\times${d.summary.meanX}=${d.fit.b}$`] },
    ],
    caption: 'Worked example. The intercept is the prediction at zero input.',
  };
}
function lrOneResiduals(brief, deep = false) {
  const d = lrOne;
  const selected = brief ? [0, d.points.length - 1] : d.points.map((p, i) => i);
  return {
    kind: 'coordinate-plot', title: 'Residuals are vertical gaps', ...lrOneAxes(d.axes.scatter),
    series: [
      { label: 'Observed gaps', kind: 'scatter', points: selected.map(i => ({ x: d.points[i].x, y: d.points[i].y, low: Math.min(d.points[i].y, d.fit.predictions[i]), high: Math.max(d.points[i].y, d.fit.predictions[i]) })) },
      { label: 'Fitted line', kind: 'line', points: d.fit.line },
    ],
    caption: brief
      ? 'Worked example. Selected rows; square each gap before averaging.'
      : deep
        ? `Worked example. $\\mathrm{MSE}=\\frac{${d.residualCost.sum}}{${d.residualCost.count}}=${d.residualCost.mean}$.`
        : 'Worked example. Gaps join targets to predictions.',
  };
}
function lrOneSquares(deep) {
  const d = lrOne;
  return {
    kind: 'bar-chart', title: 'Square each residual', unit: '$\\mathrm{target}^2$',
    bars: d.points.map((p, i) => ({ label: p.id, value: d.fit.squaredErrors[i] })),
    caption: deep
      ? `Worked example. $\\mathrm{MSE}=\\frac{${d.fit.squaredErrors.join('+')}}{${d.residualCost.count}}=\\frac{${d.residualCost.sum}}{${d.residualCost.count}}=${d.residualCost.mean}$.`
      : `Worked example. Squared gaps total $${d.residualCost.sum}$.`,
  };
}
function lrOneBowl(depth) {
  const d = lrOne;
  const p = d.costProfile;
  const brief = depth === 'overview';
  const selected = brief ? [p.points[0], p.minimum, p.points.at(-1)] : p.points;
  const c = p.coefficients;
  return {
    kind: 'coordinate-plot', title: 'A minimized slice of the cost bowl',
    x: { label: 'Slope weight', min: d.axes.costProfile.xMin, max: d.axes.costProfile.xMax },
    y: { label: 'Mean squared error', min: d.axes.costProfile.yMin, max: d.axes.costProfile.yMax },
    series: [{ label: 'Profiled cost', kind: 'line', smooth: true, samples: { x: selected.map(q => q.x), y: selected.map(q => q.y) } }],
    annotations: [{ kind: 'point', label: brief ? 'Lowest cost' : 'Minimum', x: p.minimum.x, y: p.minimum.y }],
    caption: depth === 'deep'
      ? `Worked example. $b=${d.summary.meanY}-${d.summary.meanX}w$; $J(w)=\\frac{${c.a}w^2-${d.constants.two}\\times${d.summary.sxy}w+${c.c}}{${c.divisor}}$. Positive quadratic coefficient.`
      : 'Worked example. The intercept is reoptimized at every slope weight.',
  };
}
function lrOneLoop(depth) {
  const steps = depth === 'overview'
    ? ['Predict and measure loss', 'Compute gradients and update', 'Check cost; repeat if high']
    : depth === 'deep'
      ? ['Predict $\\hat y=wx+b$', 'Compute $J=\\frac{1}{m}\\sum_i(\\hat y_i-y_i)^2$', 'Compute gradients $g_w,g_b$', 'Update $w\\gets w-\\alpha g_w$ and $b\\gets b-\\alpha g_b$', 'Check cost; stop if low']
      : ['Predict $\\hat y=wx+b$', 'Compute mean squared error', 'Compute cost gradients', 'Update weight and intercept', 'Check cost; stop if low'];
  return {
    kind: 'cycle', title: 'Repeat the gradient descent loop', steps,
    caption: 'Illustrative loop. If cost is high, repeat; if low, stop. A low cost need not be the exact minimum.',
  };
}
return { references: [reference({ id: 'ml-linear-regression-line-meaning', keywords: ['slope', 'intercept', 'fitted line'], useWhen: 'Explain the slope as rise over run and the intercept as the zero-input prediction on the toy fitted line.', overview: { spec: spec(lrOneLine(true)) }, standard: { spec: spec(lrOneLine(false)) }, deep: { spec: spec(lrOneLine(false, true)), detailSpec: spec(lrOneLineArithmetic()) } }),
reference({ id: 'ml-linear-regression-residual-cost', keywords: ['mean squared error', 'residuals', 'squared error'], useWhen: 'Connect the toy fitted-line residuals to their squares, sum and mean squared error.', overview: { spec: spec(lrOneResiduals(true)) }, standard: { spec: spec(lrOneResiduals(false)), detailSpec: spec(lrOneSquares(false)) }, deep: { spec: spec(lrOneResiduals(false, true)), detailSpec: spec(lrOneSquares(true)) } }),
reference({ id: 'ml-linear-regression-cost-bowl', keywords: ['cost surface', 'convex bowl', 'minimum'], useWhen: 'Show the convex quadratic cost profile with the intercept optimized at each slope, and locate the toy least-squares minimum.', overview: { spec: spec(lrOneBowl('overview')) }, standard: { spec: spec(lrOneBowl('standard')) }, deep: { spec: spec(lrOneBowl('deep')) } }),
reference({ id: 'ml-linear-regression-training-loop', keywords: ['training loop', 'gradient descent', 'update rule'], useWhen: 'Explain the repeated predict, cost, gradient and parameter-update cycle, with a stopping check.', overview: { spec: spec(lrOneLoop('overview')) }, standard: { spec: spec(lrOneLoop('standard')) }, deep: { spec: spec(lrOneLoop('deep')) } })], derived: () => ({}) };
})(),
(() => {
const lrB2 = data.derived();
const lrB2Small = lrB2.gradient.steps[0];
const lrB2Large = lrB2.gradient.steps[1];
const lrB2ScalingBriefRadiusY = Number(lrB2.scaling.contours.at(-1).rawRadiusY.toFixed(2));
const lrB2Axes = (bounds, horizontal, vertical) => ({ x: { label: horizontal, min: bounds.xMin, max: bounds.xMax }, y: { label: vertical, min: bounds.yMin, max: bounds.yMax } });
function lrB2First(level) {
  const initial = { x: lrB2.gradient.initial.w, y: lrB2.gradient.initial.b };
  const next = { x: lrB2Small.w, y: lrB2Small.b };
  const nextPoint = { ...next, label: `$w=${lrB2Small.w}$` };
  return {
    kind: 'coordinate-plot', title: 'The first parameter update',
    caption: level === 'deep' ? 'Apply $w\'=w-\\eta g_w$ and $b\'=b-\\eta g_b$ simultaneously.' : 'The arrow updates both parameters; its horizontal movement is the weight change.',
    x: { label: 'Weight $w$', min: lrB2.axes.weight.xMin, max: lrB2.axes.weight.xMax },
    y: { label: 'Intercept $b$', min: lrB2.axes.weight.yMin, max: lrB2.fit.b },
    series: [{ label: 'Parameter states', kind: 'scatter', points: level === 'overview' ? [nextPoint] : [{ ...initial, label: 'Initial' }, nextPoint] }],
    annotations: [{ kind: 'vector', label: 'Update', from: initial, to: next }, { kind: 'point', label: 'Least squares', x: lrB2.fit.w, y: lrB2.fit.b }],
  };
}
function lrB2FirstArithmetic() {
  const g = lrB2.gradient.initial;
  return {
    kind: 'comparison', title: 'Compute the simultaneous update',
    caption: 'Prediction errors are predictions minus targets. Both gradients use the initial parameters.',
    columns: [
      { heading: 'Weight', items: [`Errors: $${g.errors.join(', ')}$`, `$g_w=(2/${lrB2.counts.rows})(${g.sumWeightedErrors})=${g.dw}$`, `$w'=${g.w}-${lrB2Small.rate}(${g.dw})=${lrB2Small.w}$`] },
      { heading: 'Intercept', items: [`$g_b=(2/${lrB2.counts.rows})(${g.sumErrors})=${g.db}$`, `$b'=${g.b}-${lrB2Small.rate}(${g.db})=${lrB2Small.b}$`] },
    ],
  };
}
function lrB2Rates(level) {
  const brief = level === 'overview';
  return {
    kind: 'coordinate-plot', title: 'Learning rate changes the next cost',
    caption: level === 'deep' ? 'Recompute $J=\\frac{1}{n}\\sum_i(wx_i+b-y_i)^2$ after updating both parameters.' : `The larger update passes the best-fit weight $w=${lrB2.fit.w}$.`,
    ...lrB2Axes(lrB2.axes.learning, 'Gradient updates', 'Mean squared error'),
    series: lrB2.gradient.steps.map(step => ({
      label: `$\\eta=${step.rate}$`, kind: brief ? 'scatter' : 'line',
      points: (brief ? step.trace.slice(-1) : step.trace).map((point, i, points) => ({ ...point, ...(i === points.length - 1 ? { label: `$${step.mse}$` } : {}) })),
    })),
    annotations: [{ kind: 'reference-line', axis: 'y', value: lrB2.gradient.initial.mse, label: 'Initial cost' }],
  };
}
function lrB2RateArithmetic() {
  return {
    kind: 'comparison', title: 'Compare the updated parameters',
    caption: `Both runs begin with $J=${lrB2.gradient.initial.mse}$. The larger rate overshoots $w=${lrB2.fit.w}$.`,
    columns: lrB2.gradient.steps.map(step => ({ heading: `$\\eta=${step.rate}$`, items: [`$w'=-${step.rate}(${lrB2.gradient.initial.dw})=${step.w}$`, `$b'=-${step.rate}(${lrB2.gradient.initial.db})=${step.b}$`, `$J'=${step.mse}$`] })),
  };
}
function lrB2Normal(level) {
  if (level === 'overview') return {
    kind: 'comparison', title: 'Choose a solver for the problem',
    caption: 'Feature count, sparsity and memory matter more than a simple small-versus-large row rule.',
    columns: [{ heading: 'Normal equation', items: ['Exact least-squares solution for modest feature counts'] }, { heading: 'Gradient descent', items: ['Iterative fitting for large, sparse or streaming data'] }],
  };
  const deep = level === 'deep';
  return {
    kind: 'comparison', title: 'Direct solving versus iterative fitting',
    caption: deep ? 'The intercept is fitted too. Prefer QR or SVD to explicitly forming a matrix inverse.' : 'Here $p$ counts features. Dense direct solving becomes expensive as the feature count grows.',
    columns: [
      { heading: 'Normal equation', items: deep ? [`$w=${lrB2.summary.sxy}/${lrB2.summary.sxx}=${lrB2.fit.w}$`, `$b=${lrB2.summary.meanY}-${lrB2.fit.w}(${lrB2.summary.meanX})=${lrB2.fit.b}$`, 'Dense solve costs $O(p^3)$', 'Check rank and numerical conditioning'] : [`$w=${lrB2.fit.w}, b=${lrB2.fit.b}$`, 'No learning rate to tune', 'Dense solve costs $O(p^3)$'] },
      { heading: 'Gradient descent', items: deep ? [`$w'=w-\\eta g$`, `$w'=${lrB2.gradient.initial.w}+${lrB2Small.deltaW}=${lrB2Small.w}$`, `$b'=${lrB2Small.b}$`, 'Tune learning rate and stopping rule'] : [`First update: $w=${lrB2Small.w}$`, 'Tune rate and stopping rule', 'Scales through repeated data passes'] },
    ],
  };
}
function lrB2Scaling(level, standardized) {
  const s = lrB2.scaling;
  const brief = level === 'overview';
  const count = brief && standardized ? lrB2.constants.two : lrB2.counts.rows - lrB2.constants.two;
  const path = (standardized ? s.scaledPath : s.rawPath).slice(lrB2.constants.zero, count);
  const contours = brief ? s.contours.slice(-1) : standardized ? [...s.contours].reverse() : s.contours;
  const bounds = standardized ? { ...lrB2.axes.scaling, yMin: lrB2.axes.scaling.xMin, yMax: lrB2.axes.scaling.xMax } : lrB2.axes.scaling;
  return {
    kind: 'coordinate-plot', title: standardized ? 'After standardization' : 'Unscaled feature weights',
    caption: level === 'deep' ? (standardized ? 'Illustrative. $z=(x-\\mu)/\\sigma$; the idealized scaled bowl is $J=(w_1^2+w_2^2)/2$.' : `Illustrative. $J=(w_1^2+${s.curvature}w_2^2)/2$ models unequal curvature.`) : (standardized ? 'Illustrative. Round contours allow a direct path.' : 'Illustrative. A narrow valley creates zigzags.'),
    ...lrB2Axes(bounds, 'Weight $w_1$', 'Weight $w_2$'),
    series: [{ label: 'Descent', kind: 'line', samples: { x: path.map(point => point.x), y: path.map(point => point.y) } }],
    annotations: contours.map(contour => ({
      kind: standardized ? 'circle' : 'ellipse', label: contour.radius === s.contours.at(-1).radius ? 'Outer cost' : 'Inner cost',
      center: { x: lrB2.constants.zero, y: lrB2.constants.zero },
      ...(standardized ? { radius: contour.radius } : { radiusX: contour.rawRadiusX, radiusY: brief ? lrB2ScalingBriefRadiusY : contour.rawRadiusY }),
    })),
  };
}
return { references: [reference({ id: 'ml-linear-regression-first-gradient-step', keywords: ['gradient step', 'weight update', 'first epoch'], useWhen: 'Show the first simultaneous weight and intercept update from zero on the shared toy rows, not a generic descent trajectory.', overview: { spec: spec(lrB2First('overview')) }, standard: { spec: spec(lrB2First('standard')) }, deep: { spec: spec(lrB2First('deep')), detailSpec: spec(lrB2FirstArithmetic()) } }),
reference({ id: 'ml-linear-regression-rate-comparison', keywords: ['learning rate', 'overshoot', 'divergence'], useWhen: 'Compare the costs after a single simultaneous update at the two supplied learning rates from identical zero initialization; do not substitute rate schedules.', overview: { spec: spec(lrB2Rates('overview')) }, standard: { spec: spec(lrB2Rates('standard')) }, deep: { spec: spec(lrB2Rates('deep')), detailSpec: spec(lrB2RateArithmetic()) } }),
reference({ id: 'ml-linear-regression-normal-equation', keywords: ['normal equation', 'closed form', 'complexity'], useWhen: 'Contrast a direct least-squares solution with iterative gradient descent, including dense feature-count complexity, sparsity and numerical conditioning.', overview: { spec: spec(lrB2Normal('overview')) }, standard: { spec: spec(lrB2Normal('standard')) }, deep: { spec: spec(lrB2Normal('deep')) } }),
reference({ id: 'ml-linear-regression-feature-scaling-overlay', keywords: ['feature scaling', 'standardization', 'elongated contours'], useWhen: 'Topic overlay for gradient-descent-contours: explain unequal feature scales with a narrow illustrative valley and a separate standardized contour plot. Preserve the original generic reference module.', overview: { spec: spec(lrB2Scaling('overview', false)), detailSpec: spec(lrB2Scaling('overview', true)) }, standard: { spec: spec(lrB2Scaling('standard', false)), detailSpec: spec(lrB2Scaling('standard', true)) }, deep: { spec: spec(lrB2Scaling('deep', false)), detailSpec: spec(lrB2Scaling('deep', true)) } })], derived: () => ({ scalingBriefRadiusY: Number(data.derived().scaling.contours.at(-1).rawRadiusY.toFixed(2)) }) };
})(),
(() => {
const lrFinalData = data.derived();
const lrFinalAxis = (label, bounds, axis) => ({ label, min: bounds[`${axis}Min`], max: bounds[`${axis}Max`] });
function lrFinalPolynomial(depth) {
  const d = lrFinalData;
  const brief = depth === 'overview';
  return {
    kind: 'coordinate-plot', title: 'Perfect training fit can fail beyond the data',
    caption: depth === 'deep' ? `Illustrative error $(${d.polynomial.polynomialPrediction}-${d.polynomial.newPoint.y})^2=${d.polynomial.polynomialSquaredError}$.` : 'Illustrative extrapolation scenario. Training fits are computed from the shared rows.',
    x: lrFinalAxis('Input feature', d.axes.polynomial, 'x'),
    y: lrFinalAxis('Target', d.axes.polynomial, 'y'),
    series: [
      { label: 'Training', kind: 'scatter', samples: { x: d.points.map(p => p.x), y: d.points.map(p => p.y) } },
      ...(!brief ? [{ label: 'Straight fit', kind: 'line', samples: { x: [d.summary.minX, d.axes.polynomial.xMax], y: [d.fit.predictions[d.constants.zero], d.polynomial.linePrediction] } }] : []),
      { label: 'Interpolating polynomial', kind: 'line', samples: { x: { start: d.summary.minX, step: d.polynomial.sampleStep }, y: d.polynomial.samples.map(p => p.y) } },
      { label: 'Illustrative new target', kind: 'scatter', points: [d.polynomial.newPoint] },
    ],
  };
}
function lrFinalPolynomialErrors() {
  const d = lrFinalData;
  return {
    kind: 'bar-chart', variant: 'grouped', title: 'Interpolation is not a generalization guarantee', unit: '$y^2$',
    categories: ['Training mean', 'Illustrative new target'],
    series: [
      { label: 'Straight fit', values: [d.fit.mse, d.polynomial.lineSquaredError] },
      { label: 'Polynomial', values: [d.polynomial.trainMse, d.polynomial.polynomialSquaredError] },
    ],
    caption: `Illustrative new target. Polynomial error $(${d.polynomial.polynomialPrediction}-${d.polynomial.newPoint.y})^2=${d.polynomial.polynomialSquaredError}$; line error $(${d.polynomial.linePrediction}-${d.polynomial.newPoint.y})^2=${d.polynomial.lineSquaredError}$.`,
  };
}
function lrFinalRSquared(depth) {
  const d = lrFinalData;
  const r = d.rSquared;
  return {
    kind: 'bar-chart', title: 'Compare the fitted line with the mean baseline', unit: '$y^2$',
    bars: [
      { label: 'Mean baseline', value: r.total },
      { label: 'Remaining error', value: r.residual },
      ...(depth !== 'overview' ? [{ label: 'Explained reduction', value: r.explained }] : []),
    ],
    caption: depth === 'overview' ? 'The fitted line leaves less squared error than predicting the mean.' : depth === 'deep'
      ? `$R^2=1-${r.residual}/${r.total}=${r.value}$. Explained reduction $${r.total}-${r.residual}=${r.explained}$.`
      : `Mean prediction $${r.baselineMean}$; the fitted line has $R^2=${r.value}$.`,
  };
}
function lrFinalRSquaredLimits() {
  const r = lrFinalData.rSquared;
  return {
    kind: 'bar-chart', title: 'Read the toy fit between the reference cases', unit: '$y^2$',
    bars: [
      { label: `Mean baseline $R^2=${r.baseline.value}$`, value: r.baseline.sse },
      { label: `Toy fit $R^2=${r.value}$`, value: r.residual },
      { label: `Perfect fit $R^2=${r.perfect.value}$`, value: r.perfect.sse },
    ],
    caption: `$R^2=1-${r.residual}/${r.total}=${r.value}$. The line removes baseline squared error; a worse-than-mean fit can have negative $R^2$.`,
  };
}
function lrFinalRidge(depth) {
  const d = lrFinalData;
  const brief = depth === 'overview';
  return {
    kind: 'coordinate-plot', title: 'A larger ridge penalty shrinks the weight',
    x: lrFinalAxis('Ridge penalty $λ$', d.axes.ridge, 'x'),
    y: lrFinalAxis('Fitted weight $w$', d.axes.ridge, 'y'),
    series: [{ label: 'Ridge solutions', kind: 'line', points: d.ridge.points.map(p => ({ ...p, ...(!brief ? { label: `$w=${p.y}$` } : {}) })) }],
    annotations: [
      { kind: 'reference-line', axis: 'y', value: d.ridge.asymptote, label: 'Zero limit' },
      ...(!brief ? [{ kind: 'point', label: 'No penalty', x: d.ridge.points[d.constants.zero].x, y: d.ridge.points[d.constants.zero].y }] : []),
    ],
    caption: depth === 'deep'
      ? `$w=${d.ridge.numerator}/(${d.ridge.denominator}+λ)$; $b=${d.summary.meanY}-${d.summary.meanX}w$. Minimize $MSE+λw^2$.`
      : 'Sampled ridge solutions. The intercept is not penalized; the weight approaches zero as the penalty grows.',
  };
}
function lrFinalHoldout(depth) {
  const d = lrFinalData;
  const h = d.holdout;
  const brief = depth === 'overview';
  const held = d.points.find(p => h.testIds.includes(p.id));
  return {
    kind: 'sample-set', title: 'Keep the test row out of fitting',
    samples: d.points.map(p => ({ id: p.id, label: `$(${p.x},${p.y})$` })),
    groups: brief ? [
      { id: 'train', label: `Train: ${h.trainCount} rows; test: ${h.testCount}`, members: h.trainIds, omitted: h.testIds },
    ] : [
      { id: 'train', label: `Training: ${h.trainCount} rows`, members: h.trainIds },
      { id: 'test', label: `Test: ${h.testCount} row`, members: h.testIds },
    ],
    caption: brief ? 'Fit the training group. Its omitted row is the test row, evaluated only after fitting.' : depth === 'deep'
      ? `Fit $w=${h.w}$, $b=${h.b}$; test squared error $(${h.testPredictions[d.constants.zero]}-${held.y})^2=${h.testMse}$.`
      : 'Fit only the training rows. Evaluate the untouched test row after fitting.',
  };
}
return { references: [reference({ id: 'ml-linear-regression-polynomial-overfit', keywords: ['polynomial regression', 'overfitting', 'degree'], useWhen: 'Contrast exact interpolation of the training rows with unstable extrapolation to an explicitly illustrative new target.', overview: { spec: spec(lrFinalPolynomial('overview')) }, standard: { spec: spec(lrFinalPolynomial('standard')) }, deep: { spec: spec(lrFinalPolynomial('deep')), detailSpec: spec(lrFinalPolynomialErrors()) } }),
reference({ id: 'ml-linear-regression-r-squared', keywords: ['r-squared', 'explained variance', 'baseline mean'], useWhen: 'Compare residual squared error with the mean baseline and interpret the fraction of baseline error removed.', overview: { spec: spec(lrFinalRSquared('overview')) }, standard: { spec: spec(lrFinalRSquared('standard')) }, deep: { spec: spec(lrFinalRSquared('deep')), detailSpec: spec(lrFinalRSquaredLimits()) } }),
reference({ id: 'ml-linear-regression-ridge-shrinkage', keywords: ['ridge regression', 'l2 penalty', 'weight shrinkage'], useWhen: 'Show how the fitted toy weight changes with the ridge penalty when the intercept is unpenalized.', overview: { spec: spec(lrFinalRidge('overview')) }, standard: { spec: spec(lrFinalRidge('standard')) }, deep: { spec: spec(lrFinalRidge('deep')) } }),
reference({ id: 'ml-linear-regression-held-out-row', keywords: ['train test split', 'held out', 'generalization'], useWhen: 'Separate training membership from test membership before solving the line and evaluating the held-out prediction.', overview: { spec: spec(lrFinalHoldout('overview')) }, standard: { spec: spec(lrFinalHoldout('standard')) }, deep: { spec: spec(lrFinalHoldout('deep')) } })], derived: () => ({}) };
})(),
];
// C01 adds an affine unit without changing the earlier fitted-line references.
parts.push((() => {
  const d = regularizationDerived();
  const p = d.parameters.linear;
  const output = () => ({ kind: 'bar-chart', title: 'Output', bars: [{ label: 'Bias', value: p.bias }, { label: 'Prediction', value: d.linear.selected.prediction }] });
  const inputs = () => ({ kind: 'block-stack', title: 'Linear unit', blocks: [{ id: 'x', label: 'Input features' }, { id: 'y', label: 'Weighted sum', inputs: [{ label: '$w,b$' }] }] });
  const overview = { kind: 'panels', title: 'A linear predictor is one unit', caption: 'Worked example. Every input connects to the same linear output.', panels: [{ diagram: inputs() }, { diagram: output() }], links: [{ from: 0, to: 1, operation: 'Evaluate' }] };
  const mechanism = deep => ({ kind: 'panels', title: 'Multiply, add, then add the bias',
    caption: deep ? 'Worked example. $\\Delta\\hat y=w_A\\Delta a$ when the other feature and weights stay fixed.' : `Worked example. $x=(${d.linear.selected.input.join(',')})$, $w=(${p.weights.join(',')})$, $b=${p.bias}$.`,
    panels: [{ diagram: inputs() }, { diagram: { kind: 'bar-chart', title: 'Weighted terms', bars: d.linear.selected.terms.map((value, i) => ({ label: ['Feature A', 'Feature B'][i], value })) } }, { diagram: output() }],
    links: [{ from: 0, to: 1, operation: 'Multiply' }, { from: 1, to: 2, operation: '$\\sum+b$' }] });
  const probe = { kind: 'coordinate-plot', title: 'One feature changes, one stays fixed', caption: `Worked example. Feature B stays $${d.linear.selected.input[1]}$; $w_A=${p.weights[0]}$ is the slope.`,
    x: { label: 'Feature A', min: d.linear.selected.input[0] - p.bias, max: d.linear.probe.input[0] + p.bias }, y: { label: 'Prediction', min: d.linear.selected.prediction - p.bias, max: d.linear.probe.prediction + p.bias },
    series: [{ label: 'Same linear unit', kind: 'line', points: [d.linear.selected, d.linear.probe].map(row => ({ x: row.input[0], y: row.prediction })) }] };
  const paraphrases = ['Show an affine unit with weighted feature contributions and a bias.', 'How does a weighted feature sum become one linear prediction?', 'Trace an affine unit from the inputs through multiplication and summation.', 'Explain a weighted feature sum as a single output unit.', 'Use an affine unit to show what happens when only one feature changes.'];
  return { references: [{ id: 'ml-linear-regression-linear-unit', topic: 'linear-regression', lessons: ['01', '02'],
    sources: [{ kind: 'figure-brief', path: 'docs/features/explain-on-canvas/handoff/figure-briefs/d2l-linear-regression/briefs.md#figure-06', revision: '05d5f02f6' }],
    prompts: ['An ordinary linear predictor can be drawn as one output unit with a connection from each input feature.', ...paraphrases], paraphrases,
    keywords: ['affine unit', 'weighted feature sum'],
    useWhen: 'Trace a single affine unit from weighted features to a prediction; not a fitted-line residual plot or a nonlinear hidden layer.',
    spec: spec(mechanism(false)), depths: { overview: { spec: spec(overview) }, standard: { spec: spec(mechanism(false)) }, deep: { spec: spec(mechanism(true)), detailSpec: spec(probe) } },
  }], derived: () => ({ c01: regularizationDerived() }) };
})());
export const references = Object.freeze(parts.flatMap(part => part.references));
export function derived() { return Object.assign({}, data.derived(), ...parts.map(part => part.derived?.() ?? {})); }
