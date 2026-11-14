import test from 'node:test';
import assert from 'node:assert';
import * as data from './topic-what-is-machine-learning-data.js';
import { references, derived } from './topic-what-is-machine-learning-references.js';
import replay from './topic-what-is-machine-learning-replay-cases.json' with { type: 'json' };
test('the merged derived() carries every value of the data module', () => assert.deepStrictEqual(Object.fromEntries(Object.keys(data.derived()).map(key => [key, derived()[key]])), data.derived()));
{
const introIds = ['ml-what-is-machine-learning-program-direction', 'ml-what-is-machine-learning-learning-families', 'ml-what-is-machine-learning-hidden-groups', 'ml-what-is-machine-learning-output-types'];
const introKeywords = [['rules vs data', 'learned model', 'program direction'], ['supervised', 'unsupervised', 'reinforcement'], ['clustering', 'no labels', 'two blobs'], ['classification', 'regression', 'decision boundary']];
const introRef = index => references.find(item => item.id === introIds[index]);
const introClose = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const introSum = values => values.reduce((sum, value) => sum + value, 0);
function introCheckNumbers(value, available) {
  if (typeof value === 'number') assert.ok(available.includes(value), `Unregistered numeric field ${value}`);
  else if (typeof value === 'string') {
    for (const match of value.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)) assert.ok(available.includes(Number(match[0])), `Unregistered displayed number ${match[0]}`);
  } else if (value && typeof value === 'object') Object.values(value).forEach(child => introCheckNumbers(child, available));
}
test('intro references preserve their own prompts, keywords and lesson origins', () => {
  introIds.forEach((id, index) => {
    const ref = introRef(index);
    const row = replay.prompts.find(item => item.referenceId === id);
    assert.ok(ref && row);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.deepStrictEqual(ref.keywords, introKeywords[index]);
    assert.deepStrictEqual(ref.shortKeywords, introKeywords[index]);
    assert.ok(ref.keywords.every(keyword => keyword === keyword.toLowerCase() && keyword.split(' ').length <= 3));
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    assert.ok(row.paraphrases.every(prompt => ref.prompts.includes(prompt)));
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.deepStrictEqual(ref.promptOrigins, [{ id: row.id, prompt: row.prompt, origin: 'lesson', lesson: data.metadata.lessons[0] }]);
    for (const depth of ['overview', 'standard', 'deep']) {
      assert.ok(ref.depths[depth].spec.diagram);
      introCheckNumbers(ref.depths[depth].spec, data.derived().displayNumbers);
      if (ref.depths[depth].detailSpec) introCheckNumbers(ref.depths[depth].detailSpec, data.derived().displayNumbers);
    }
    assert.deepStrictEqual(ref.spec, ref.depths.standard.spec);
  });
});
test('the rule-direction transformation gains a parameter-learning formula', () => {
  const ref = introRef(0);
  const brief = ref.depths.overview.spec.diagram;
  const balanced = ref.spec.diagram;
  const deep = ref.depths.deep.spec.diagram;
  assert.strictEqual(balanced.kind, 'transformation');
  assert.ok(brief.before.items.length + brief.after.items.length < balanced.before.items.length + balanced.after.items.length);
  assert.match(balanced.before.items.join(' '), /Rules and data are inputs/);
  assert.match(balanced.after.items.join(' '), /Model stores learned rules as parameters/);
  assert.ok(deep.caption.includes('$w,b$'));
  assert.ok(deep.caption.includes('$L(wx+b,y)$'));
  assert.ok(deep.caption.includes('rules emerge as parameters'));
  assert.ok(!deep.caption.includes('^') && !deep.caption.includes('_'));
  assert.notStrictEqual(deep.caption, balanced.caption);
  assert.ok([brief, balanced, deep].every(diagram => diagram.caption.startsWith('Illustrative')));
});
test('taxonomy counts, leaves and depth are recomputed from the hierarchy', () => {
  const ref = introRef(1);
  const nodes = ref.spec.diagram.nodes;
  const root = nodes.find(node => !node.parent);
  const families = nodes.filter(node => node.parent === root.id);
  const leaves = nodes.filter(node => !nodes.some(child => child.parent === node.id));
  const expectedTasks = [['Classification', 'Regression'], ['Clustering', 'Dimensionality Reduction'], ['Policy Optimization', 'Value Learning']];
  assert.deepStrictEqual(families.map(node => node.label), ['Supervised', 'Unsupervised', 'Reinforcement']);
  families.forEach((family, index) => assert.deepStrictEqual(nodes.filter(node => node.parent === family.id).map(node => node.label), expectedTasks[index]));
  const nodeDepth = node => node.parent ? nodeDepth(nodes.find(parent => parent.id === node.parent)) + 1 : 0;
  const d = data.derived();
  assert.strictEqual(d.taxonomy.familyCount, families.length);
  assert.strictEqual(d.taxonomy.taskCount, introSum(expectedTasks.map(tasks => tasks.length)));
  assert.strictEqual(d.taxonomy.leafCount, leaves.length);
  assert.strictEqual(d.taxonomy.nodeCount, nodes.length);
  assert.strictEqual(d.taxonomy.depth, Math.max(...nodes.map(nodeDepth)));
  assert.strictEqual(nodes.length, 1 + families.length + leaves.length);
  assert.ok(leaves.every(node => node.detail));
  assert.ok(ref.depths.overview.spec.diagram.nodes.length < nodes.length);
  assert.strictEqual(ref.depths.overview.spec.diagram.title, 'Learning families');
  assert.ok(nodes.every(node => !Object.hasOwn(node, 'side')));
  assert.match(ref.depths.deep.spec.diagram.caption, new RegExp(String(nodes.length)));
});
test('hidden groups use inputs alone and recompute every position, radius and count', () => {
  const rows = data.toyData.rows.map(row => row.slice(0, data.toyData.features.length));
  const xs = [...new Set(rows.map(row => row[0]))].sort((a, b) => a - b);
  let gap = -Infinity;
  let threshold;
  xs.slice(1).forEach((x, index) => {
    if (x - xs[index] > gap) { gap = x - xs[index]; threshold = (x + xs[index]) / 2; }
  });
  const partitions = [rows.filter(row => row[0] <= threshold), rows.filter(row => row[0] > threshold)];
  const d = data.derived();
  assert.strictEqual(d.rowCount, rows.length);
  assert.strictEqual(d.clustering.threshold, threshold);
  assert.strictEqual(d.clustering.gap, gap);
  assert.strictEqual(d.clustering.clusterCount, partitions.length);
  const diagram = introRef(2).spec.diagram;
  assert.deepStrictEqual(diagram.series[0].samples, { x: rows.map(row => row[0]), y: rows.map(row => row[1]) });
  const coordinates = rows.flat();
  const minimum = Math.min(0, ...coordinates);
  const maximum = Math.max(...coordinates) + 1;
  assert.deepStrictEqual([diagram.x.min, diagram.y.min, diagram.x.max, diagram.y.max], [minimum, minimum, maximum, maximum]);
  partitions.forEach((part, index) => {
    const center = { x: introSum(part.map(row => row[0])) / part.length, y: introSum(part.map(row => row[1])) / part.length };
    const radius = Math.max(...part.map(row => Math.hypot(row[0] - center.x, row[1] - center.y)));
    assert.strictEqual(d.clustering.groups[index].count, part.length);
    assert.deepStrictEqual(d.clustering.groups[index].center, center);
    introClose(d.clustering.groups[index].radius, radius);
    assert.deepStrictEqual(diagram.annotations[index].center, center);
    introClose(diagram.annotations[index].radius, radius);
  });
  assert.strictEqual(introSum(partitions.map(part => part.length)), rows.length);
  const brief = introRef(2).depths.overview.spec.diagram;
  assert.strictEqual(brief.kind, 'coordinate-plot');
  assert.deepStrictEqual(brief.x, diagram.x);
  assert.deepStrictEqual(brief.y, diagram.y);
  assert.strictEqual(brief.series.length, 1);
  assert.strictEqual(brief.series[0].kind, 'scatter');
  assert.strictEqual(brief.series[0].label, 'Unlabelled inputs');
  assert.deepStrictEqual(brief.series[0].samples, { x: rows.map(row => row[0]), y: rows.map(row => row[1]) });
  assert.strictEqual(brief.series[0].samples.x.length, rows.length);
  assert.strictEqual(brief.series[0].samples.y.length, rows.length);
  assert.strictEqual((brief.annotations || []).length, 0);
  const briefElements = brief.series.reduce((count, series) => count + series.samples.x.length, 0) + (brief.annotations || []).length;
  const balancedElements = diagram.series.reduce((count, series) => count + series.samples.x.length, 0) + diagram.annotations.length;
  assert.ok(briefElements < balancedElements);
  assert.match(brief.caption, /targets hidden/);
  assert.match(brief.caption, /Proximity suggests groups/);
  const withinDistances = partitions.flatMap(part => part.flatMap((point, index) => part.slice(index + 1).map(other => Math.hypot(point[0] - other[0], point[1] - other[1]))));
  const betweenDistances = partitions[0].flatMap(point => partitions[1].map(other => Math.hypot(point[0] - other[0], point[1] - other[1])));
  assert.ok(Math.max(...withinDistances) < Math.min(...betweenDistances));
  const deep = introRef(2).depths.deep.spec.diagram;
  assert.deepStrictEqual(deep.series, diagram.series);
  assert.deepStrictEqual(deep.annotations, diagram.annotations);
  assert.notStrictEqual(deep.caption, diagram.caption);
  assert.ok(deep.caption.includes(`$${partitions[0].length}+${partitions[1].length}=${rows.length}$`));
  partitions.forEach(part => {
    const meanX = introSum(part.map(row => row[0])) / part.length;
    const meanY = introSum(part.map(row => row[1])) / part.length;
    assert.ok(deep.caption.includes(`$(${meanX},${meanY})$`));
  });
});
test('output comparison recomputes category geometry and regression arithmetic', () => {
  const rows = data.toyData.rows;
  const n = rows.length;
  const labels = [...new Set(rows.map(row => row.at(-1)))].sort((a, b) => a - b);
  const sumX = introSum(rows.map(row => row[0]));
  const sumY = introSum(rows.map(row => row[1]));
  const sumXX = introSum(rows.map(row => row[0] * row[0]));
  const sumXY = introSum(rows.map(row => row[0] * row[1]));
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const squaredErrorSum = introSum(rows.map(row => (row[1] - (intercept + slope * row[0])) ** 2));
  const d = data.derived();
  introClose(d.regression.slope, slope);
  introClose(d.regression.intercept, intercept);
  introClose(d.regression.squaredErrorSum, squaredErrorSum);
  introClose(d.regression.mse, squaredErrorSum / n);
  const diagram = introRef(3).spec.diagram;
  assert.strictEqual(diagram.kind, 'coordinate-plot');
  labels.forEach((label, index) => {
    const part = rows.filter(row => row.at(-1) === label);
    assert.strictEqual(diagram.series[index].label, `Class ${label}`);
    assert.deepStrictEqual(diagram.series[index].samples, { x: part.map(row => row[0]), y: part.map(row => row[1]) });
  });
  const centers = labels.map(label => {
    const part = rows.filter(row => row.at(-1) === label);
    return [introSum(part.map(row => row[0])) / part.length, introSum(part.map(row => row[1])) / part.length];
  });
  const boundary = diagram.series.find(series => series.label === 'Category boundary').samples;
  boundary.x.forEach((x, index) => {
    const y = boundary.y[index];
    const squared = centers.map(center => (x - center[0]) ** 2 + (y - center[1]) ** 2);
    introClose(squared[0], squared[1]);
  });
  const fitted = diagram.series.find(series => series.label === 'Regression fit').samples;
  fitted.x.forEach((x, index) => introClose(fitted.y[index], intercept + slope * x));
  const deep = introRef(3).depths.deep.spec.diagram;
  assert.notStrictEqual(deep.caption, diagram.caption);
  assert.ok(deep.caption.includes('$'));
  assert.ok(deep.caption.includes('MSE'));
  assert.ok(deep.caption.includes('sum_i'));
  const detail = introRef(3).depths.deep.detailSpec.diagram;
  assert.ok(detail.rows[0].cells.includes('Cross-entropy'));
  assert.ok(detail.rows[1].cells.some(cell => cell.includes(String(d.regression.mse))));
  introClose(Number(detail.rows[1].cells[1].split('=')[1].replace('$', '')), squaredErrorSum / n);
  assert.strictEqual(introRef(3).depths.overview.spec.diagram.kind, 'comparison');
  assert.ok(diagram.caption.startsWith('Illustrative'));
  assert.ok(deep.caption.startsWith('Illustrative'));
  assert.ok(detail.caption.startsWith('Illustrative'));
});
}
{
const b2Ids = ['ml-what-is-machine-learning-workflow', 'ml-what-is-machine-learning-dataset-split', 'ml-what-is-machine-learning-fit-quality', 'ml-what-is-machine-learning-bias-variance'];
const b2Ref = id => { const found = references.find(r => r.id === id); assert.ok(found, id); return found; };
const b2Sum = values => values.reduce((a, b) => a + b, 0);
function b2Close(actual, expected) {
  if (typeof expected === 'number') { assert.ok(Number.isFinite(actual)); assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`); }
  else if (Array.isArray(expected)) { assert.strictEqual(actual.length, expected.length); expected.forEach((v, i) => b2Close(actual[i], v)); }
  else if (expected && typeof expected === 'object') { assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort()); Object.entries(expected).forEach(([k, v]) => b2Close(actual[k], v)); }
  else assert.strictEqual(actual, expected);
}
const b2Numbers = v => typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(b2Numbers) : [];
const b2Strings = v => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(b2Strings) : [];
test('batch questions, learner keywords and lesson origin remain attached to their own references', () => {
  const keywords = [['ml workflow', 'retrain loop', 'data drift'], ['train split', 'validation set', 'test set'], ['overfitting', 'underfitting', 'generalization'], ['bias variance', 'total error', 'model complexity']];
  b2Ids.forEach((id, i) => {
    const ref = b2Ref(id), row = replay.prompts.find(item => item.referenceId === id);
    assert.ok(row);
    assert.strictEqual(replay.prompts.filter(item => item.referenceId === id).length, 1);
    assert.strictEqual(ref.prompts[0], row.prompt);
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    [row.prompt, ...row.paraphrases].forEach(phrase => assert.ok(ref.prompts.includes(phrase)));
    assert.deepStrictEqual(ref.keywords, keywords[i]);
    assert.deepStrictEqual(ref.shortKeywords, ref.keywords);
    ref.keywords.forEach(k => { assert.strictEqual(k, k.toLowerCase()); assert.ok(k.split(/\s+/).length <= 3); });
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.strictEqual(ref.lesson, data.metadata.lessons[0]);
    assert.ok(ref.promptOrigins.some(o => o.prompt === row.prompt && o.id === row.id && o.origin === 'lesson' && o.lesson === ref.lesson));
    ['overview', 'standard', 'deep'].forEach(depth => assert.ok(ref.depths[depth].spec.diagram));
  });
});
test('workflow preserves separate detailed stages and both labelled feedback returns; split arithmetic is recomputed', () => {
  const d = data.derived(), w = d.workflow, ref = b2Ref(b2Ids[0]);
  const stages = 'Collect Data|Clean and Explore|Feature Engineering|Split Data|Train Model|Evaluate|Deploy|Monitor'.split('|');
  assert.deepStrictEqual(w.stages, stages);
  const stageCount = stages.reduce(n => n + 1, 0), transitions = stages.slice(1).length;
  assert.strictEqual(w.stageCount, stageCount);
  assert.strictEqual(w.forwardTransitions, transitions);
  assert.strictEqual(stageCount - 1, transitions);
  const expectedFeedback = [
    { from: 'Evaluate', to: 'Feature Engineering', condition: 'not good enough' },
    { from: 'Monitor', to: 'Collect Data', condition: 'performance drops' }
  ];
  assert.deepStrictEqual(w.feedback, expectedFeedback);
  assert.strictEqual(w.returnCount, expectedFeedback.length);
  const cleanRange = [6 / 10, 8 / 10].map(f => f * 10 ** 2);
  assert.deepStrictEqual(w.cleanPercentRange, cleanRange);
  const renderedSteps = [...stages.slice(0, -2).map((s, i) => i === 1 ? `${s} · ${cleanRange.join('–')}% time` : s), stages.slice(-2).join(' / ')];
  assert.strictEqual(ref.spec.diagram.kind, 'cycle');
  assert.strictEqual(ref.depths.overview.spec.diagram.kind, 'cycle');
  assert.deepStrictEqual(ref.spec.diagram.steps, renderedSteps);
  assert.ok(ref.depths.overview.spec.diagram.steps.length < ref.spec.diagram.steps.length);
  const renderedCount = renderedSteps.length;
  const forwardCount = renderedSteps.slice(1).length;
  b2Close(derived().workflowCounts, { renderedSteps: renderedCount, forwardLinks: forwardCount });
  assert.strictEqual(renderedCount - 1, forwardCount);
  expectedFeedback.forEach(e => [e.from, e.to, e.condition].forEach(s => assert.ok(ref.spec.diagram.caption.includes(s))));
  const deep = ref.depths.deep.spec.diagram;
  assert.strictEqual(deep.kind, 'flow');
  assert.strictEqual(deep.nodes.length, stageCount);
  assert.deepStrictEqual(deep.nodes.map(node => node.label), ['Collect Data', 'Clean and Explore', 'Create Features', 'Split Data', 'Train Model', 'Evaluate', 'Publish Model', 'Check Performance']);
  assert.strictEqual(deep.edges.length, transitions);
  assert.deepStrictEqual(deep.edges, deep.nodes.slice(1).map((node, index) => ({ from: deep.nodes[index].id, to: node.id })));
  assert.ok(deep.nodes.slice(0, -1).every(node => node.role === 'process'));
  assert.strictEqual(deep.nodes.at(-1).role, 'outcome');
  assert.strictEqual(deep.caption, `Illustrative. Clean and Explore: ${cleanRange.join('–')}% of time. $${stageCount}-1=${transitions}$ forward links; see feedback inset.`);
  const detail = ref.depths.deep.detailSpec.diagram;
  assert.strictEqual(detail.kind, 'flow');
  const byId = Object.fromEntries(detail.nodes.map(node => [node.id, node]));
  assert.deepStrictEqual(detail.nodes.map(node => node.label), ['Evaluate Model', 'Create Features Again', 'Publish Model', 'Check Performance', 'Collect Data Again', 'Keep Monitoring']);
  assert.strictEqual(new Set(detail.nodes.map(node => node.label)).size, detail.nodes.length);
  assert.deepStrictEqual(detail.edges, [
    { from: 'e', to: 'f', label: expectedFeedback[0].condition },
    { from: 'e', to: 'd', label: 'good enough' },
    { from: 'd', to: 'm' },
    { from: 'm', to: 'c', label: expectedFeedback[1].condition },
    { from: 'm', to: 'k', label: 'stable' }
  ]);
  assert.strictEqual(byId.e.role, 'decision');
  assert.strictEqual(byId.m.role, 'decision');
  assert.strictEqual(byId.f.role, 'outcome');
  assert.strictEqual(byId.c.role, 'outcome');
  assert.ok(detail.caption.includes('Feedback is unrolled'));
  for (const flow of [deep, detail]) {
    const ids = new Set(flow.nodes.map(node => node.id));
    const roots = flow.nodes.filter(node => !flow.edges.some(edge => edge.to === node.id));
    assert.strictEqual(roots.length, 1);
    const visited = new Set();
    const visit = (id, ancestors) => {
      assert.ok(!ancestors.has(id), 'Feedback must be unrolled, not a flow cycle');
      visited.add(id);
      const path = new Set([...ancestors, id]);
      flow.edges.filter(edge => edge.from === id).forEach(edge => { assert.ok(ids.has(edge.to)); visit(edge.to, path); });
    };
    visit(roots[0].id, new Set());
    assert.strictEqual(visited.size, ids.size);
    flow.nodes.forEach(node => {
      const outgoing = flow.edges.filter(edge => edge.from === node.id);
      if (node.role === 'decision') {
        assert.ok(outgoing.length >= 2 && outgoing.length <= 3);
        assert.ok(outgoing.every(edge => edge.label));
        assert.strictEqual(new Set(outgoing.map(edge => edge.label)).size, outgoing.length);
      }
      if (node.role === 'process') assert.ok(outgoing.length <= 1);
      if (node.role === 'outcome') assert.strictEqual(outgoing.length, 0);
      assert.match(node.label, /^(Collect|Clean|Create|Split|Train|Evaluate|Publish|Check|Keep)\b/);
    });
  }
  const split = b2Ref(b2Ids[1]), percentages = d.split.weights.map(v => 10 ** 2 * v / b2Sum(d.split.weights));
  assert.deepStrictEqual(d.split.percentages, percentages);
  assert.strictEqual(d.split.totalPercent, b2Sum(percentages));
  assert.strictEqual(b2Sum(percentages), 10 ** 2);
  ['standard', 'deep'].forEach(depth => {
    assert.deepStrictEqual(split.depths[depth].spec.diagram.blocks.map(b => b.dims), percentages.map(v => `${v}%`));
    assert.deepStrictEqual(split.depths[depth].detailSpec.diagram.edges.map(e => e.label), percentages.map(v => `${v}%`));
  });
  assert.ok(split.depths.deep.spec.diagram.caption.includes(`$${percentages.join('+')}=${b2Sum(percentages)}$`));
  assert.ok(split.spec.diagram.caption.includes('not block widths'));
});
test('fit curves and subset errors are independently reconstructed and observations render last', () => {
  const d = data.derived(), rows = data.toyData.rows;
  const labels = [...new Set(rows.map(r => r.at(-1)))];
  const count = rows.filter(r => r.at(-1) === labels[0]).length;
  const xs = [...new Set(rows.map(r => r[0]))].sort((a, b) => a - b);
  const trend = x => 1 + x + x * x / count;
  const observed = xs.map((x, i) => ({ x, y: trend(x) + Math.pow(-1, i) / count }));
  const chord = x => trend(xs[0]) + (trend(xs.at(-1)) - trend(xs[0])) * (x - xs[0]) / (xs.at(-1) - xs[0]);
  const centers = labels.map(label => { const part = rows.filter(r => r.at(-1) === label); return [0, 1].map(c => b2Sum(part.map(r => r[c])) / part.length); });
  const radius = Math.max(...rows.map(r => { const c = centers[labels.indexOf(r.at(-1))]; return Math.hypot(r[0] - c[0], r[1] - c[1]); }));
  const overfit = [];
  observed.forEach((p, i) => {
    overfit.push({ ...p });
    if (i + 1 < observed.length) { const q = observed[i + 1]; overfit.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 + Math.pow(-1, i) * labels.length * radius }); }
  });
  const interpolate = x => {
    for (let i = 1; i < overfit.length; i += 1) {
      const a = overfit[i - 1], b = overfit[i];
      if (x >= a.x && x <= b.x) return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    }
    assert.fail('Input must lie on the generated fit');
  };
  const cutoff = xs[labels.length];
  const window = {
    observed: observed.filter(p => p.x <= cutoff),
    underfit: [xs[0], cutoff].map(x => ({ x, y: chord(x) })),
    goodFit: xs.filter(x => x <= cutoff).map(x => ({ x, y: trend(x) })),
    overfit: overfit.filter(p => p.x <= cutoff),
    bounds: { minX: xs[0], maxX: cutoff, minY: Math.min(0, ...rows.flatMap(r => r.slice(0, 2))), maxY: Math.max(...rows.flatMap(r => r.slice(0, 2))) + 1 }
  };
  b2Close(derived().fitWindow, window);
  const ref = b2Ref(b2Ids[2]);
  ['standard', 'deep'].forEach(depth => {
    const plot = ref.depths[depth].spec.diagram;
    b2Close([plot.x.min, plot.x.max, plot.y.min, plot.y.max], Object.values(window.bounds));
    ['underfit', 'goodFit', 'overfit', 'observed'].forEach((key, i) => {
      b2Close(plot.series[i].samples, { x: window[key].map(p => p.x), y: window[key].map(p => p.y) });
    });
    assert.deepStrictEqual(plot.series.map(s => s.label), ['Underfit', 'Good fit', 'Overfit', 'Observed']);
    assert.strictEqual(plot.series.at(-1).kind, 'scatter');
    assert.ok(plot.series.slice(0, -1).every(s => s.kind === 'line'));
  });
  const subsetCount = window.observed.length;
  const squaredErrorSums = {}, means = {};
  Object.entries({ underfit: chord, goodFit: trend, overfit: interpolate }).forEach(([key, predict]) => {
    squaredErrorSums[key] = b2Sum(window.observed.map(p => (p.y - predict(p.x)) ** 2));
    means[key] = squaredErrorSums[key] / subsetCount;
  });
  b2Close(derived().fitSubset, { count: subsetCount, squaredErrorSums, means });
  const detail = ref.depths.deep.detailSpec.diagram;
  assert.strictEqual(detail.kind, 'matrix');
  assert.deepStrictEqual(detail.columns, ['Squared error sum', 'Mean squared error']);
  ['underfit', 'goodFit', 'overfit'].forEach((key, i) => {
    assert.strictEqual(detail.rows[i].cells[0], String(squaredErrorSums[key]));
    assert.strictEqual(detail.rows[i].cells[1], `$\\frac{${squaredErrorSums[key]}}{${subsetCount}}$`);
    b2Close(derived().fitSubset.means[key] * subsetCount, squaredErrorSums[key]);
  });
  assert.deepStrictEqual(detail.rows.map(r => r.heading), ['Underfit', 'Good fit', 'Overfit']);
  assert.ok(detail.caption.includes('plotted training count'));
  assert.ok(!b2Strings(detail).some(text => /held.out|full generated/i.test(text)));
  const residualSquared = (observed[0].y - trend(observed[0].x)) ** 2;
  b2Close(d.fits.trainingMse.goodFit, residualSquared);
  b2Close(means.goodFit, residualSquared);
  assert.ok(ref.depths.deep.spec.diagram.caption.includes(`$(${observed[0].y}-${trend(observed[0].x)})^2=${residualSquared}$`));
});
test('bias, variance, noise, totals, axes and minimum are recomputed from toy geometry', () => {
  const d = data.derived(), rows = data.toyData.rows;
  const labels = [...new Set(rows.map(r => r.at(-1)))];
  const groups = labels.map(label => rows.filter(r => r.at(-1) === label));
  const centers = groups.map(g => [0, 1].map(c => b2Sum(g.map(r => r[c])) / g.length));
  const radiusSquared = Math.max(...rows.map(r => { const c = centers[labels.indexOf(r.at(-1))]; return (r[0] - c[0]) ** 2 + (r[1] - c[1]) ** 2; }));
  const levels = labels.length + 1;
  const points = Array.from({ length: levels }, (_, i) => {
    const complexity = i + 1, biasSquared = (levels - complexity) ** 2, variance = i ** 2, noise = radiusSquared / groups[0].length;
    return { complexity, biasSquared, variance, noise, total: b2Sum([biasSquared, variance, noise]) };
  });
  b2Close(d.tradeoff.points, points);
  const best = points.reduce((a, b) => a.total <= b.total ? a : b);
  b2Close(d.tradeoff.sweetSpot, best);
  const ref = b2Ref(b2Ids[3]);
  ['standard', 'deep'].forEach(depth => {
    const plot = ref.depths[depth].spec.diagram;
    b2Close([plot.x.min, plot.x.max, plot.y.min, plot.y.max], [points[0].complexity, points.at(-1).complexity, 0, Math.ceil(Math.max(...points.map(p => p.total)))]);
    ['biasSquared', 'variance', 'noise', 'total'].forEach((key, i) => b2Close(plot.series[i].samples, { x: points.map(p => p.complexity), y: points.map(p => p[key]) }));
    b2Close([plot.annotations[0].x, plot.annotations[0].y], [best.complexity, best.total]);
  });
  assert.ok(ref.depths.deep.spec.diagram.caption.includes(`$${best.biasSquared}+${best.variance}+${best.noise}=${best.total}$`));
});
test('each displayed number belongs to shared or batch derived results; every visual is illustrative', () => {
  const available = b2Numbers({ shared: data.derived(), batch: derived() });
  b2Ids.forEach(id => ['overview', 'standard', 'deep'].forEach(depth => {
    const entry = b2Ref(id).depths[depth];
    [entry.spec, entry.detailSpec].filter(Boolean).forEach(visual => {
      assert.ok(visual.diagram.caption.startsWith('Illustrative'));
      b2Numbers(visual).forEach(n => assert.ok(available.includes(n), `${id}: missing numerical field ${n}`));
      b2Strings(visual).forEach(text => {
        for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) assert.ok(available.includes(Number(m[0])), `${id}: missing displayed number ${m[0]}`);
      });
    });
  }));
});
}
{
const wmlTailIds = ['ml-what-is-machine-learning-model-choice', 'ml-what-is-machine-learning-class-centroids', 'ml-what-is-machine-learning-nearest-centroid-predict', 'ml-what-is-machine-learning-centroid-baseline'];
const wmlTailOwn = () => references.filter(ref => wmlTailIds.includes(ref.id));
const wmlTailClose = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} versus ${expected}`);
const wmlTailNumbers = value => typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(wmlTailNumbers) : [];
const wmlTailTexts = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.entries(value).filter(([key]) => key !== 'id').flatMap(([, child]) => wmlTailTexts(child)) : [];

test('final topic references retain their own prompts, learner keywords and lesson origins', () => {
  const own = wmlTailOwn();
  assert.strictEqual(own.length, wmlTailIds.length);
  for (const ref of own) {
    const row = replay.prompts.find(item => item.referenceId === ref.id);
    assert.ok(row);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.strictEqual(replay.prompts.filter(item => item.prompt === row.prompt).length, 1);
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, row.paraphrases.length);
    for (const phrase of row.paraphrases) assert.ok(ref.prompts.includes(phrase));
    assert.ok(ref.keywords.length >= 2 && ref.keywords.length <= 3);
    assert.deepStrictEqual(ref.shortKeywords, ref.keywords);
    for (const keyword of ref.keywords) {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.trim().split(/\s+/).length <= 3);
      assert.ok(ref.prompts.join(' ').toLowerCase().includes(keyword), keyword);
    }
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.topic, data.metadata.topic);
    assert.strictEqual(ref.artifactTopic, data.metadata.artifactTopic);
    assert.strictEqual(ref.origin, 'lesson');
    assert.ok(ref.promptOrigins.some(origin => origin.id === row.id && origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    for (const depth of ['overview', 'standard', 'deep']) assert.ok(ref.depths[depth].spec.diagram);
  }
});

test('centres, radii, boundary and prediction are independently recomputed from the toy rows', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const labels = [...new Set(rows.map(row => row[2]))].sort((a, b) => a - b);
  const centers = labels.map(label => {
    const members = rows.filter(row => row[2] === label);
    const sumX = members.reduce((sum, row) => sum + row[0], 0);
    const sumY = members.reduce((sum, row) => sum + row[1], 0);
    return { label, count: members.length, sumX, sumY, x: sumX / members.length, y: sumY / members.length };
  });
  assert.deepStrictEqual(d.centroids, centers);
  const sq = (p, c) => (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y);
  const ownDistances = rows.map(row => Math.sqrt(sq({ x: row[0], y: row[1] }, centers.find(c => c.label === row[2]))));
  const radius = Math.max(...ownDistances);
  wmlTailClose(d.radius, radius);
  rows.forEach((row, index) => {
    const point = { x: row[0], y: row[1] };
    const squared = centers.map(c => sq(point, c));
    assert.deepStrictEqual(d.distances[index].squared, squared);
    squared.forEach((value, center) => wmlTailClose(d.distances[index].distances[center], Math.sqrt(value)));
    wmlTailClose(d.distances[index].own, ownDistances[index]);
    wmlTailClose(d.distances[index].ownSquared, ownDistances[index] ** 2);
    const other = centers.find(c => c.label !== row[2]);
    wmlTailClose(d.distances[index].otherSquared, sq(point, other));
    wmlTailClose(d.distances[index].other, Math.sqrt(sq(point, other)));
  });
  const coordinates = rows.flatMap(row => row.slice(0, data.toyData.features.length));
  const lower = Math.min(0, ...coordinates);
  const upper = Math.max(...coordinates) + 1;
  assert.deepStrictEqual(d.axis, { min: lower, max: upper });
  const [a, b] = centers;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const constant = dx * midpoint.x + dy * midpoint.y;
  wmlTailClose(d.boundary.dx, dx);
  wmlTailClose(d.boundary.dy, dy);
  wmlTailClose(d.boundary.constant, constant);
  assert.deepStrictEqual(d.boundary.midpoint, midpoint);
  wmlTailClose(d.boundary.squaredDistance, dx * dx + dy * dy);
  wmlTailClose(d.boundary.distance, Math.hypot(dx, dy));
  const endpoints = [lower, upper].map(y => ({ x: (constant - dy * y) / dx, y }));
  assert.deepStrictEqual(d.boundary.endpoints, endpoints);
  for (const point of [...endpoints, midpoint]) {
    wmlTailClose(sq(point, a), sq(point, b));
    wmlTailClose(dx * point.x + dy * point.y, constant);
  }
  const q = { x: b.x - radius, y: a.y };
  const squared = centers.map(c => sq(q, c));
  const winner = squared.indexOf(Math.min(...squared));
  wmlTailClose(d.query.x, q.x);
  wmlTailClose(d.query.y, q.y);
  assert.deepStrictEqual(d.query.squared, squared);
  squared.forEach((value, index) => {
    wmlTailClose(d.query.distances[index], Math.sqrt(value));
    wmlTailClose(d.query.roundedDistances[index], Number(Math.sqrt(value).toFixed(2)));
  });
  assert.strictEqual(d.query.prediction, labels[winner]);
  const projection = dx * q.x + dy * q.y;
  wmlTailClose(d.query.projection, projection);
  wmlTailClose(d.query.margin, constant - projection);
  assert.ok(projection < constant);
  assert.ok(squared[0] < squared[1]);

  const fit = references.find(ref => ref.id === wmlTailIds[1]);
  const plotted = fit.spec.diagram.series.flatMap(series => series.samples.x.map((x, index) => [x, series.samples.y[index]]));
  assert.deepStrictEqual(plotted, rows.map(row => row.slice(0, data.toyData.features.length)));
  fit.spec.diagram.annotations.forEach((point, index) => {
    wmlTailClose(point.x, centers[index].x);
    wmlTailClose(point.y, centers[index].y);
  });
  for (const depth of ['standard', 'deep']) {
    const spokes = fit.depths[depth].detailSpec.diagram.series;
    spokes.forEach((series, index) => {
      const members = rows.filter(row => row[2] === centers[index].label);
      assert.strictEqual(series.samples.x.length, members.length * 2);
      members.forEach((row, member) => {
        const centerIndex = member * 2;
        const pointIndex = centerIndex + 1;
        wmlTailClose(series.samples.x[centerIndex], centers[index].x);
        wmlTailClose(series.samples.y[centerIndex], centers[index].y);
        wmlTailClose(series.samples.x[pointIndex], row[0]);
        wmlTailClose(series.samples.y[pointIndex], row[1]);
        wmlTailClose(Math.hypot(series.samples.x[pointIndex] - series.samples.x[centerIndex], series.samples.y[pointIndex] - series.samples.y[centerIndex]), radius);
      });
    });
  }
  const predict = references.find(ref => ref.id === wmlTailIds[2]);
  const bisector = predict.spec.diagram.series.find(series => series.label === 'Bisector').samples;
  assert.deepStrictEqual(bisector.x, endpoints.map(p => p.x));
  assert.deepStrictEqual(bisector.y, endpoints.map(p => p.y));
});

test('accuracy bars and every shown numerical value have recomputed data provenance', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const labels = [...new Set(rows.map(row => row[2]))];
  const centers = labels.map(label => {
    const part = rows.filter(row => row[2] === label);
    return [part.reduce((sum, row) => sum + row[0], 0) / part.length, part.reduce((sum, row) => sum + row[1], 0) / part.length];
  });
  const predictions = rows.map(row => {
    const distances = centers.map(c => Math.hypot(row[0] - c[0], row[1] - c[1]));
    return labels[distances.indexOf(Math.min(...distances))];
  });
  const correct = predictions.reduce((count, label, index) => count + Number(label === rows[index][2]), 0);
  const percent = 10 ** 2;
  const expected = rows.reduce(sum => sum + 1 / labels.length, 0);
  assert.strictEqual(d.evaluation.total, rows.length);
  assert.strictEqual(d.evaluation.correct, correct);
  wmlTailClose(d.percent, percent);
  wmlTailClose(d.evaluation.accuracyPercent, correct / rows.length * percent);
  wmlTailClose(d.evaluation.randomExpectedCorrect, expected);
  wmlTailClose(d.evaluation.randomProbability, 1 / labels.length);
  wmlTailClose(d.evaluation.randomAccuracyPercent, expected / rows.length * percent);
  const baseline = references.find(ref => ref.id === wmlTailIds[3]);
  for (const depth of ['overview', 'standard', 'deep']) {
    const bars = baseline.depths[depth].spec.diagram.bars;
    wmlTailClose(bars[0].value, correct / rows.length * percent);
    wmlTailClose(bars[1].value, expected / rows.length * percent);
  }
  const pool = new Set(d.displayNumbers);
  for (const ref of wmlTailOwn()) {
    for (const depth of ['overview', 'standard', 'deep']) {
      for (const entry of [ref.depths[depth].spec, ref.depths[depth].detailSpec].filter(Boolean)) {
        for (const number of wmlTailNumbers(entry)) assert.ok(pool.has(number), `Unaccounted numeric field ${number} in ${ref.id}`);
        for (const text of wmlTailTexts(entry.diagram)) {
          for (const match of text.matchAll(/-?\d+(?:\.\d+)?/g)) assert.ok(pool.has(Number(match[0])), `Unaccounted display number ${match[0]} in ${ref.id}`);
        }
      }
    }
  }
});

test('suitability flows have valid labeled gates and detailed arithmetic is additional', () => {
  const choice = references.find(ref => ref.id === wmlTailIds[0]);
  const visible = diagram => diagram.nodes ? diagram.nodes.length + diagram.edges.length : diagram.series ? diagram.series.reduce((sum, series) => sum + (series.points ? series.points.length : series.samples.x.length), 0) + (diagram.annotations || []).length : diagram.bars.length;
  for (const depth of ['overview', 'standard', 'deep']) {
    for (const entry of [choice.depths[depth].spec, choice.depths[depth].detailSpec].filter(Boolean)) {
      const diagram = entry.diagram;
      assert.ok(diagram.caption.startsWith('Illustrative'));
      assert.strictEqual(diagram.nodes.filter(node => !diagram.edges.some(edge => edge.to === node.id)).length, 1);
      for (const node of diagram.nodes) {
        const out = diagram.edges.filter(edge => edge.from === node.id);
        const incoming = diagram.edges.filter(edge => edge.to === node.id);
        if (node.role === 'decision') {
          assert.ok(out.length >= 2 && out.length <= 3);
          assert.strictEqual(new Set(out.map(edge => edge.label)).size, out.length);
          assert.ok(out.every(edge => edge.label));
        }
        if (node.role === 'outcome') assert.strictEqual(out.length, 0);
        if (node.role === 'merge') {
          assert.ok(incoming.length >= 2);
          assert.strictEqual(out.length, 1);
        }
      }
    }
  }
  for (const ref of wmlTailOwn()) {
    const balanced = ref.depths.standard.spec.diagram;
    const brief = ref.depths.overview.spec.diagram;
    if (visible(balanced) > 6) assert.ok(visible(brief) < visible(balanced));
    const allText = entry => wmlTailTexts(entry).join(' ');
    const balancedText = allText(ref.depths.standard);
    const deepText = allText(ref.depths.deep);
    const newFormula = [...deepText.matchAll(/\$([^$]+)\$/g)].some(match => !balancedText.includes(match[0]));
    const oldNumbers = new Set([...balancedText.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => match[0]));
    const newNumber = [...deepText.matchAll(/-?\d+(?:\.\d+)?/g)].some(match => !oldNumbers.has(match[0]));
    assert.ok(newFormula || newNumber, ref.id);
  }
});

test('review repairs keep distance paths straight, scatter markers foremost and captions renderable', () => {
  const d = data.derived();
  const predict = references.find(ref => ref.id === wmlTailIds[2]);
  for (const depth of ['standard', 'deep']) {
    const diagram = predict.depths[depth].spec.diagram;
    const lines = diagram.series.filter(series => series.kind === 'line');
    assert.ok(lines.every(series => series.smooth === false));
    const lastLine = Math.max(...diagram.series.flatMap((series, index) => series.kind === 'line' ? [index] : []));
    const firstScatter = diagram.series.findIndex(series => series.kind === 'scatter');
    assert.ok(lastLine < firstScatter);
    const path = diagram.series.find(series => series.label === 'Distances').samples;
    assert.deepStrictEqual(path.x, [d.centroids[0].x, d.query.x, d.centroids[1].x]);
    assert.deepStrictEqual(path.y, [d.centroids[0].y, d.query.y, d.centroids[1].y]);
    const scatters = diagram.series.filter(series => series.kind === 'scatter');
    assert.deepStrictEqual(scatters.flatMap(series => series.points), [...d.centroids.map(center => ({ x: center.x, y: center.y })), { x: d.query.x, y: d.query.y }]);
    const detail = predict.depths[depth].detailSpec.diagram;
    assert.strictEqual(detail.annotations[0].label, 'Midpoint');
    assert.strictEqual(detail.annotations[0].x, d.boundary.midpoint.x);
    assert.strictEqual(detail.annotations[0].y, d.boundary.midpoint.y);
    assert.strictEqual(detail.series[0].smooth, false);
  }
  assert.strictEqual(predict.depths.standard.detailSpec.diagram.caption, 'Worked example. The midpoint lies halfway between the means.');
  const choice = references.find(ref => ref.id === wmlTailIds[0]);
  assert.ok(choice.depths.deep.spec.diagram.caption.includes('$R=E[L]$'));
  const baseline = references.find(ref => ref.id === wmlTailIds[3]);
  const caption = baseline.depths.deep.spec.diagram.caption;
  assert.ok(!caption.includes(String.fromCharCode(92) + '%'));
  assert.strictEqual((caption.match(/%/g) || []).length, d.classCount);
  for (const span of caption.matchAll(/\$([^$]+)\$/g)) assert.ok(!span[1].includes('%'));
});
}
