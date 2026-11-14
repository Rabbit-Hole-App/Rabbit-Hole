import * as data from './topic-what-is-machine-learning-data.js';
import replay from './topic-what-is-machine-learning-replay-cases.json' with { type: 'json' };
const metadata = data.metadata;
const spec = diagram => ({ version: 1, diagram });
const reference = ({ id, keywords, useWhen, overview, standard, deep }) => { const row = replay.prompts.find(item => item.referenceId === id); return { id, topic: metadata.topic, artifactTopic: metadata.artifactTopic, lessons: metadata.lessons, sources: metadata.sources, origin: 'lesson', lesson: metadata.lessons[0], promptOrigins: [{ id: row.id, prompt: row.prompt, origin: 'lesson', lesson: metadata.lessons[0] }], prompts: [row.prompt, ...row.paraphrases], paraphrases: row.paraphrases, keywords, shortKeywords: keywords, useWhen, ...standard, depths: { overview, standard, deep } }; };
export const topicMetadata = metadata;
const parts = [
(() => {
const mlIntroData = data.derived();
const mlIntroDepths = ['overview', 'standard', 'deep'];
function mlIntroDirection(depth) {
  const brief = depth === 'overview';
  return {
    kind: 'transformation', title: 'Supplied rules versus learned rules',
    before: { label: 'Traditional programming', items: brief ? ['Rules and data', 'Output from a program'] : ['Rules and data are inputs', 'Program applies the rules', 'Output is produced'] },
    after: { label: 'Machine learning', items: brief ? ['Data and expected output', 'Learned rules in a model'] : ['Data and expected outputs are inputs', 'Learning algorithm fits a model', 'Model stores learned rules as parameters'] },
    operation: 'Reverse what is supplied and learned',
    caption: depth === 'deep' ? 'Illustrative: learn parameters by $\\theta^*=\\arg\\min_\\theta\\sum_i L(f_\\theta(x_i),y_i)$.' : 'Illustrative: rules enter a program but emerge from learning as model parameters.'
  };
}
function mlIntroTaxonomy(depth) {
  const t = mlIntroData.taxonomy;
  const familyIds = ['s', 'u', 'r'];
  const taskIds = [['c', 'g'], ['k', 'd'], ['p', 'v']];
  const examples = [['Cat or dog', 'House price'], ['Customers', 'Compressed inputs'], ['Choose moves', 'Future reward']];
  return {
    kind: 'tree', layout: 'hierarchy', title: 'Learning families and their tasks',
    nodes: [{ id: 'm', label: 'Machine learning' }, ...t.families.flatMap((family, index) => [
      { id: familyIds[index], label: family.label, parent: 'm' },
      ...(depth === 'overview' ? [] : family.tasks.map((task, taskIndex) => ({ id: taskIds[index][taskIndex], label: task, parent: familyIds[index], detail: examples[index][taskIndex] })))
    ])],
    caption: depth === 'deep' ? `Illustrative: $${t.nodeCount}=1+${t.familyCount}+${t.taskCount}$ nodes; ${t.leafCount} task leaves at depth ${t.depth}.` : 'Illustrative: targets, hidden structure or rewards determine the learning family.'
  };
}
function mlIntroHidden(depth) {
  const d = mlIntroData;
  const groups = d.clustering.groups;
  if (depth === 'overview') {
    const ids = [['a'], ['c']];
    return {
      kind: 'sample-set', title: 'Nearby inputs suggest groups',
      caption: 'Selected toy inputs; target labels are hidden. Grouping uses proximity, not answers.',
      samples: groups.map((group, index) => ({ id: ids[index][0], label: `$(${group.points[0].x},${group.points[0].y})$` })),
      groups: groups.map((group, index) => ({ id: ['low', 'high'][index], label: ['Lower feature values', 'Higher feature values'][index], members: ids[index] }))
    };
  }
  return {
    kind: 'coordinate-plot', title: 'Structure without target labels',
    x: { label: 'First feature', min: d.axis.min, max: d.axis.max },
    y: { label: 'Second feature', min: d.axis.min, max: d.axis.max },
    series: [{ label: 'Unlabelled inputs', kind: 'scatter', samples: { x: d.points.map(point => point.x), y: d.points.map(point => point.y) } }],
    annotations: groups.map((group, index) => ({ kind: 'circle', label: ['Group A', 'Group B'][index], center: group.center, radius: group.radius })),
    caption: depth === 'deep' ? `Group sizes: $${groups[0].count}+${groups[1].count}=${d.rowCount}$; input means $(${groups[0].center.x},${groups[0].center.y})$, $(${groups[1].center.x},${groups[1].center.y})$.` : 'Targets are hidden; outlines suggest groups, not known classes.'
  };
}
function mlIntroOutputs(depth) {
  const d = mlIntroData;
  if (depth === 'overview') return {
    kind: 'comparison', title: 'Categories versus numeric targets',
    columns: [
      { heading: 'Classification', items: ['Output is a category', 'A boundary separates categories'] },
      { heading: 'Regression', items: ['Output is a real number', 'A fitted curve predicts a target'] }
    ],
    caption: 'Illustrative tasks: choose a category or predict a numeric quantity.'
  };
  return {
    kind: 'coordinate-plot', title: 'Categories and a numeric prediction',
    x: { label: 'First feature', min: d.axis.min, max: d.axis.max },
    y: { label: 'Second feature / target', min: d.axis.min, max: d.axis.max },
    series: [
      ...d.labels.map(label => {
        const points = d.points.filter(point => point.label === label);
        return { label: `Class ${label}`, kind: 'scatter', samples: { x: points.map(point => point.x), y: points.map(point => point.y) } };
      }),
      { label: 'Category boundary', kind: 'line', samples: { x: d.boundary.endpoints.map(point => point.x), y: d.boundary.endpoints.map(point => point.y) } },
      { label: 'Regression fit', kind: 'line', samples: { x: d.regression.line.map(point => point.x), y: d.regression.line.map(point => point.y) } }
    ],
    caption: depth === 'deep' ? 'Illustrative: categories use cross-entropy; numeric targets use $\\mathrm{MSE}=\\sum_i(y_i-\\hat y_i)^2/n$.' : 'Illustrative tasks: colours encode categories; the fitted line predicts the second feature as a numeric target.'
  };
}
function mlIntroLosses() {
  return {
    kind: 'matrix', title: 'Match the loss to the output', columns: ['Output', 'Loss'],
    rows: [
      { heading: 'Classification', cells: ['Category', 'Cross-entropy'] },
      { heading: 'Regression', cells: ['Real target', `$\\mathrm{MSE}=${mlIntroData.regression.mse}$`] }
    ],
    caption: 'Illustrative tasks; regression uses $\\mathrm{MSE}=\\sum_i(y_i-\\hat y_i)^2/n$ on toy targets.'
  };
}
return { references: [reference({ id: 'ml-what-is-machine-learning-program-direction', keywords: ['rules vs data', 'learned model', 'program direction'], useWhen: 'Contrast supplied rules with rules learned as model parameters from data and expected outputs.', overview: { spec: spec(mlIntroDirection('overview')) }, standard: { spec: spec(mlIntroDirection('standard')) }, deep: { spec: spec(mlIntroDirection('deep')) } }),
reference({ id: 'ml-what-is-machine-learning-learning-families', keywords: ['supervised', 'unsupervised', 'reinforcement'], useWhen: 'Show the learning taxonomy as an ordinary hierarchy, with tasks and examples under each family.', overview: { spec: spec(mlIntroTaxonomy('overview')) }, standard: { spec: spec(mlIntroTaxonomy('standard')) }, deep: { spec: spec(mlIntroTaxonomy('deep')) } }),
reference({ id: 'ml-what-is-machine-learning-hidden-groups', keywords: ['clustering', 'no labels', 'two blobs'], useWhen: 'Hide every target label and show proximity-based groups in the shared toy inputs, not a supervised boundary.', overview: { spec: spec(mlIntroHidden('overview')) }, standard: { spec: spec(mlIntroHidden('standard')) }, deep: { spec: spec(mlIntroHidden('deep')) } }),
reference({ id: 'ml-what-is-machine-learning-output-types', keywords: ['classification', 'regression', 'decision boundary'], useWhen: 'Contrast categorical classification outputs and continuous regression targets on shared toy coordinates, then connect each output to its loss.', overview: { spec: spec(mlIntroOutputs('overview')) }, standard: { spec: spec(mlIntroOutputs('standard')) }, deep: { spec: spec(mlIntroOutputs('deep')), detailSpec: spec(mlIntroLosses()) } })], derived: () => ({}) };
})(),
(() => {
const b2Data = data.derived();
const b2WindowCount = b2Data.classCount + 1;
const b2WindowObserved = b2Data.fits.observed.slice(0, b2WindowCount);
const b2WindowMax = b2WindowObserved.at(-1).x;
const b2Chord = b2Data.fits.underfit;
const b2Window = {
  observed: b2WindowObserved,
  underfit: [{ ...b2Chord[0] }, { x: b2WindowMax, y: b2Chord[0].y + (b2Chord[1].y - b2Chord[0].y) * (b2WindowMax - b2Chord[0].x) / (b2Chord[1].x - b2Chord[0].x) }],
  goodFit: b2Data.fits.goodFit.filter(p => p.x <= b2WindowMax),
  overfit: b2Data.fits.overfit.filter(p => p.x <= b2WindowMax),
  bounds: { minX: b2Data.fits.bounds.minX, maxX: b2WindowMax, minY: b2Data.fits.bounds.minY, maxY: b2Data.axis.max }
};
function b2Workflow(depth) {
  const w = b2Data.workflow;
  const steps = depth === 'overview'
    ? ['Collect and prepare data', 'Train and evaluate', 'Deploy', 'Monitor']
    : [...w.stages.slice(0, -2).map(stage => stage === w.stages[1] ? `${stage} · ${w.cleanPercentRange.join('–')}% time` : stage), w.stages.slice(-2).join(' / ')];
  const caption = depth === 'overview'
    ? 'Illustrative. Improve features after weak evaluation; collect fresh data when monitoring shows drift.'
    : depth === 'deep'
      ? `Illustrative. $${w.stageCount}-1=${w.forwardTransitions}$ forward links. Evaluate revisits features if weak; Monitor revisits data if performance drops.`
      : 'Illustrative. Evaluate returns to Feature Engineering if not good enough; Monitor returns to Collect Data if performance drops.';
  return { title: 'The ML workflow repeats', kind: 'cycle', steps, caption };
}
function b2Split(depth) {
  const s = b2Data.split;
  return {
    title: 'Separate learning, tuning and final checking', kind: 'block-stack', orientation: 'horizontal',
    blocks: [
      { id: 'train', label: 'Training · learn parameters', dims: `${s.percentages[0]}%` },
      { id: 'validation', label: 'Validation · tune hyperparameters', dims: `${s.percentages[1]}%` },
      { id: 'test', label: 'Test · sacred final check', dims: `${s.percentages[2]}%` }
    ],
    caption: depth === 'deep'
      ? `Illustrative. $${s.percentages.join('+')}=${s.totalPercent}$ percent. Labels, not widths, give proportions. Check test data only at the end.`
      : 'Illustrative. Labels show proportions, not block widths. Test data stays untouched until the final check.'
  };
}
function b2SplitFlow() {
  return {
    title: 'Give each slice a separate job', kind: 'flow',
    nodes: [
      { id: 'split', label: 'Split data', role: 'fork' },
      { id: 'train', label: 'Learn parameters', role: 'outcome' },
      { id: 'validation', label: 'Tune hyperparameters', role: 'outcome' },
      { id: 'test', label: 'Check test data once', role: 'outcome' }
    ],
    edges: ['train', 'validation', 'test'].map((to, index) => ({ from: 'split', to, label: `${b2Data.split.percentages[index]}%` })),
    caption: 'Illustrative. Partition before fitting; keep the final test separate from model selection.'
  };
}
function b2FitPlot(depth) {
  const w = b2Window;
  return {
    title: 'Fits on the same training points', kind: 'coordinate-plot',
    x: { label: 'Input feature', min: w.bounds.minX, max: w.bounds.maxX },
    y: { label: 'Response', min: w.bounds.minY, max: w.bounds.maxY },
    series: [['Observed', 'observed', 'scatter'], ['Underfit', 'underfit', 'line'], ['Good fit', 'goodFit', 'line'], ['Overfit', 'overfit', 'line']].map(([label, key, kind]) => ({
      label, kind, ...(key === 'goodFit' ? { smooth: true } : {}),
      samples: { x: w[key].map(p => p.x), y: w[key].map(p => p.y) }
    })),
    caption: depth === 'deep'
      ? `Illustrative subset. A good-fit squared residual: $(${w.observed[0].y}-${w.goodFit[0].y})^2=${b2Data.fits.trainingMse.goodFit}$.`
      : 'Illustrative subset. Underfit misses the bend; good fit follows it; overfit chases samples. Judge on unseen data.'
  };
}
function b2FitErrors() {
  const f = b2Data.fits;
  return {
    title: 'Training fit is not generalization', kind: 'bar-chart', variant: 'grouped', unit: 'sq. error',
    categories: ['Training mean', 'Held-out point'],
    series: [['Underfit', 'underfit'], ['Good fit', 'goodFit'], ['Overfit', 'overfit']].map(([label, key]) => ({ label, values: [f.trainingMse[key], f.heldOut.squaredErrors[key]] })),
    caption: 'Illustrative. Errors use the full generated training set and a held-out point, not measured project performance.'
  };
}
function b2Tradeoff(depth) {
  const t = b2Data.tradeoff;
  const best = t.sweetSpot;
  return {
    title: 'Balance bias and variance', kind: 'coordinate-plot',
    x: { label: 'Model complexity', min: t.bounds.minX, max: t.bounds.maxX },
    y: { label: 'Expected squared error', min: t.bounds.minY, max: t.bounds.maxY },
    series: [['Bias squared', 'biasSquared'], ['Variance', 'variance'], ['Noise', 'noise'], ['Total', 'total']].map(([label, key]) => ({ label, kind: 'line', samples: { x: t.points.map(p => p.complexity), y: t.points.map(p => p[key]) } })),
    annotations: [{ kind: 'point', label: 'Sweet spot', x: best.complexity, y: best.total }],
    caption: depth === 'deep'
      ? `Illustrative. At complexity $${best.complexity}$, total $${best.biasSquared}+${best.variance}+${best.noise}=${best.total}$.`
      : 'Illustrative. Low complexity underfits; high complexity overfits. Noise stays fixed.'
  };
}
return { references: [reference({ id: 'ml-what-is-machine-learning-workflow', keywords: ['ml workflow', 'retrain loop', 'data drift'], useWhen: 'Show the ordered ML workflow and its evaluation and monitoring returns. Deploy and Monitor share a cycle card.', overview: { spec: spec(b2Workflow('overview')) }, standard: { spec: spec(b2Workflow('standard')) }, deep: { spec: spec(b2Workflow('deep')) } }),
reference({ id: 'ml-what-is-machine-learning-dataset-split', keywords: ['train split', 'validation set', 'test set'], useWhen: 'Explain training, validation and test responsibilities, illustrative split percentages and the untouched final test.', overview: { spec: spec({ title: 'Learn separately from checking', kind: 'flow', nodes: [{ id: 'train', label: 'Fit on training data', role: 'process' }, { id: 'reserve', label: 'Keep validation and test separate', role: 'outcome' }], edges: [{ from: 'train', to: 'reserve' }], caption: 'Illustrative. Reserve both checking slices before fitting; validation guides tuning, while test is saved for the final check.' }) }, standard: { spec: spec(b2Split('standard')), detailSpec: spec(b2SplitFlow()) }, deep: { spec: spec(b2Split('deep')), detailSpec: spec(b2SplitFlow()) } }),
reference({ id: 'ml-what-is-machine-learning-fit-quality', keywords: ['overfitting', 'underfitting', 'generalization'], useWhen: 'Compare underfit, good and overfit predictions on identical observations, then distinguish training error from unseen error.', overview: { spec: spec({ title: 'Compare fit quality', kind: 'comparison', columns: [{ heading: 'Underfitting', items: ['Too rigid; misses the bend'] }, { heading: 'Good fit', items: ['Follows the trend, not every fluctuation'] }, { heading: 'Overfitting', items: ['Chases samples; may miss unseen points'] }], caption: 'Illustrative. Training fit alone cannot establish generalization.' }) }, standard: { spec: spec(b2FitPlot('standard')) }, deep: { spec: spec(b2FitPlot('deep')), detailSpec: spec(b2FitErrors()) } }),
reference({ id: 'ml-what-is-machine-learning-bias-variance', keywords: ['bias variance', 'total error', 'model complexity'], useWhen: 'Show falling squared bias, rising variance, fixed noise and their summed error minimum as complexity increases.', overview: { spec: spec({ title: 'Complexity trades bias for variance', kind: 'flow', nodes: [{ id: 'complexity', label: 'Increase complexity', role: 'process' }, { id: 'trade', label: 'Reduce bias; increase variance', role: 'process' }, { id: 'balance', label: 'Balance total error', role: 'outcome' }], edges: [{ from: 'complexity', to: 'trade' }, { from: 'trade', to: 'balance' }], caption: 'Illustrative. Seek a balance rather than the most complex model; irreducible noise remains.' }) }, standard: { spec: spec(b2Tradeoff('standard')) }, deep: { spec: spec(b2Tradeoff('deep')) } })], derived: () => ({ fitWindow: b2Window }) };
})(),
(() => {
const wmlTailD = data.derived();
const wmlTailSamples = points => ({ x: points.map(p => p.x), y: points.map(p => p.y) });
const wmlTailAxes = () => ({ x: { label: 'Feature $x_1$', min: wmlTailD.axis.min, max: wmlTailD.axis.max }, y: { label: 'Feature $x_2$', min: wmlTailD.axis.min, max: wmlTailD.axis.max } });
function wmlTailChoice(depth) {
  const brief = depth === 'overview';
  const diagram = brief ? {
    kind: 'flow', title: 'Rules or learning?', caption: 'Illustrative guide; check risk before learning.',
    nodes: [
      { id: 'a', role: 'decision', label: 'Have data?' },
      { id: 'b', role: 'decision', label: 'Can write rules?' },
      { id: 'c', role: 'outcome', label: 'Collect data or use rules' },
      { id: 'd', role: 'outcome', label: 'Use explicit rules' },
      { id: 'e', role: 'outcome', label: 'Check risk and model needs' }
    ],
    edges: [
      { from: 'a', to: 'c', label: 'No' }, { from: 'a', to: 'b', label: 'Yes' },
      { from: 'b', to: 'd', label: 'Yes' }, { from: 'b', to: 'e', label: 'No' }
    ]
  } : {
    kind: 'flow', title: 'Rules or learning?',
    caption: depth === 'deep' ? 'Illustrative guide. Gate on expected loss $R=\\mathbb{E}[L]$.' : 'Illustrative guide; model needs follow below.',
    nodes: [
      { id: 'a', role: 'decision', label: 'Have data?' },
      { id: 'b', role: 'decision', label: 'Can write rules?' },
      { id: 'c', role: 'decision', label: 'Is error cost acceptable?' },
      { id: 'd', role: 'outcome', label: 'Collect data or use rules' },
      { id: 'e', role: 'outcome', label: 'Use explicit rules' },
      { id: 'f', role: 'outcome', label: 'Use deterministic methods' },
      { id: 'g', role: 'outcome', label: 'Check model needs' }
    ],
    edges: [
      { from: 'a', to: 'd', label: 'No' }, { from: 'a', to: 'b', label: 'Yes' },
      { from: 'b', to: 'e', label: 'Yes' }, { from: 'b', to: 'c', label: 'No' },
      { from: 'c', to: 'f', label: 'No' }, { from: 'c', to: 'g', label: 'Yes' }
    ]
  };
  return {
    spec: spec(diagram),
    ...(!brief ? { detailSpec: spec({
      kind: 'flow', title: 'Choose the model family', caption: 'Illustrative guide. Non-strict explanation needs permit ML.',
      nodes: [
        { id: 'a', role: 'decision', label: 'Do you need explainability?' },
        { id: 'b', role: 'outcome', label: 'Use interpretable models' },
        { id: 'c', role: 'decision', label: 'Have labeled data?' },
        { id: 'd', role: 'outcome', label: 'Use supervised learning' },
        { id: 'e', role: 'outcome', label: 'Use semi-supervised learning' },
        { id: 'f', role: 'outcome', label: 'Use unsupervised or self-supervised' }
      ],
      edges: [
        { from: 'a', to: 'b', label: 'Strictly' }, { from: 'a', to: 'c', label: 'Not strictly' },
        { from: 'c', to: 'd', label: 'Enough' }, { from: 'c', to: 'e', label: 'Some' },
        { from: 'c', to: 'f', label: 'None' }
      ]
    }) } : {})
  };
}
function wmlTailCentroids(depth) {
  const d = wmlTailD;
  const [a, b] = d.centroids;
  if (depth === 'overview') return { spec: spec({
    kind: 'flow', title: 'Fit the class means', caption: 'Worked example. Means use all training rows.',
    nodes: [
      { id: 'a', role: 'process', label: 'Group by class' },
      { id: 'b', role: 'process', label: `Compute means $(${a.x},${a.y})$ and $(${b.x},${b.y})$` },
      { id: 'c', role: 'outcome', label: `Measure own distance ${d.radius}` }
    ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
  }) };
  return {
    spec: spec({
      kind: 'coordinate-plot', title: 'Class means on the toy points', caption: 'Worked example. Centres are class means.',
      ...wmlTailAxes(),
      series: d.centroids.map(c => ({ label: `Class ${c.label}`, kind: 'scatter', samples: wmlTailSamples(d.points.filter(p => p.label === c.label)) })),
      annotations: d.centroids.map(c => ({ kind: 'point', x: c.x, y: c.y, label: depth === 'deep' ? `Mean ${c.label} $(${c.x},${c.y})$` : `Mean ${c.label}` }))
    }),
    detailSpec: spec({
      kind: 'coordinate-plot', title: 'Distances to own means',
      caption: depth === 'deep'
        ? `Worked example. $\\mu_0=(${a.sumX}/${a.count},${a.sumY}/${a.count})$, $\\mu_1=(${b.sumX}/${b.count},${b.sumY}/${b.count})$.`
        : `Worked example. All spoke lengths are ${d.radius}.`,
      ...wmlTailAxes(),
      series: d.centroids.map(c => ({ label: `Class ${c.label}`, kind: 'line', samples: wmlTailSamples(d.points.filter(p => p.label === c.label).flatMap(p => [c, p])) }))
    })
  };
}
function wmlTailPredict(depth) {
  const d = wmlTailD;
  const q = d.query;
  if (depth === 'overview') return { spec: spec({
    kind: 'flow', title: 'Predict by distance', caption: 'Worked example. Choose the nearer class mean.',
    nodes: [
      { id: 'a', role: 'process', label: `Locate point $(${q.x},${q.y})$` },
      { id: 'b', role: 'process', label: `Compare distances ${q.roundedDistances[0]} and about ${q.roundedDistances[1]}` },
      { id: 'c', role: 'outcome', label: `Predict class ${q.prediction}` }
    ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
  }) };
  const [a, b] = d.centroids;
  const boundary = d.boundary;
  return {
    spec: spec({
      kind: 'coordinate-plot', title: 'Predict by distance',
      caption: depth === 'deep'
        ? `Worked example. $${boundary.dx}x_1+${boundary.dy}x_2=${boundary.constant}$; query $${q.projection}<${boundary.constant}$ gives class ${q.prediction}.`
        : `Worked example. Distances ${q.roundedDistances[0]} and about ${q.roundedDistances[1]}; predict class ${q.prediction}.`,
      ...wmlTailAxes(),
      series: [
        ...d.centroids.map(c => ({ label: `Mean ${c.label}`, kind: 'scatter', points: [{ x: c.x, y: c.y }] })),
        { label: 'New point', kind: 'scatter', points: [{ x: q.x, y: q.y }] },
        { label: 'Distances', kind: 'line', samples: wmlTailSamples([a, q, b]) },
        { label: 'Bisector', kind: 'line', samples: wmlTailSamples(boundary.endpoints) }
      ]
    }),
    detailSpec: spec({
      kind: 'coordinate-plot', title: 'Centroid separation and midpoint',
      caption: depth === 'deep'
        ? `Worked example. $d=\\sqrt{${boundary.dx}^2+${boundary.dy}^2}=${boundary.distance}$; query $\\sqrt{${q.squared[0]}}$ vs $\\sqrt{${q.squared[1]}}$.`
        : 'Worked example. Bisect the segment at right angles.',
      ...wmlTailAxes(),
      series: [{ label: 'Between means', kind: 'line', samples: wmlTailSamples([a, b]) }],
      annotations: [{ kind: 'point', x: boundary.midpoint.x, y: boundary.midpoint.y, label: depth === 'deep' ? `Midpoint $(${boundary.midpoint.x},${boundary.midpoint.y})$` : 'Midpoint' }]
    })
  };
}
function wmlTailBaseline(depth) {
  const d = wmlTailD;
  const e = d.evaluation;
  const brief = depth === 'overview';
  return { spec: spec({
    kind: 'bar-chart', title: 'Training accuracy versus chance', unit: '%',
    bars: [
      { label: brief ? 'Centroid' : `Centroid (${e.correct} of ${e.total})`, value: e.accuracyPercent },
      { label: brief ? 'Random expected' : `Random expected (${e.randomExpectedCorrect} of ${e.total})`, value: e.randomAccuracyPercent }
    ],
    caption: depth === 'deep'
      ? `Worked example. $${e.correct}/${e.total}\\times${d.percent}\\%=${e.accuracyPercent}\\%$; expected $${e.randomExpectedCorrect}/${e.total}\\times${d.percent}\\%=${e.randomAccuracyPercent}\\%$.`
      : brief ? 'Worked example. Learning beats chance on these training rows.' : 'Worked example. Training accuracy is not held-out performance; random is an expectation.'
  }) };
}
return { references: [reference({ id: 'ml-what-is-machine-learning-model-choice', keywords: ['when not ml', 'decision flow', 'explainability'], useWhen: 'Answer the rules-versus-ML suitability question: gate on data, explicit rules and error cost, then examine explainability and label availability. This is a pragmatic illustrative guide, not a guarantee of safety.', overview: wmlTailChoice('overview'), standard: wmlTailChoice('standard'), deep: wmlTailChoice('deep') }),
reference({ id: 'ml-what-is-machine-learning-class-centroids', keywords: ['nearest centroid', 'class mean', 'fit step'], useWhen: 'Fit the class centroids of the shared training points and inspect every point-to-own-mean distance. Use this for computing means, not for predicting a new point or comparing accuracy with chance.', overview: wmlTailCentroids('overview'), standard: wmlTailCentroids('standard'), deep: wmlTailCentroids('deep') }),
reference({ id: 'ml-what-is-machine-learning-nearest-centroid-predict', keywords: ['decision boundary', 'euclidean distance', 'predict step'], useWhen: 'Predict the supplied new point from the fitted class means; compare Euclidean distances and locate the perpendicular equal-distance bisector. This is the prediction step, not centroid fitting or baseline evaluation.', overview: wmlTailPredict('overview'), standard: wmlTailPredict('standard'), deep: wmlTailPredict('deep') }),
reference({ id: 'ml-what-is-machine-learning-centroid-baseline', keywords: ['random baseline', 'accuracy', 'evaluate step'], useWhen: 'Evaluate nearest-centroid training accuracy against uniform random guessing on the shared points. The random count is an expectation, not an observed draw, and the training result does not establish generalization.', overview: wmlTailBaseline('overview'), standard: wmlTailBaseline('standard'), deep: wmlTailBaseline('deep') })], derived: () => ({}) };
})(),
];
export const references = Object.freeze(parts.flatMap(part => part.references));
export function derived() { return Object.assign({}, data.derived(), ...parts.map(part => part.derived?.() ?? {})); }
