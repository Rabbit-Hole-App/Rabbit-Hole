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
  assert.ok(deep.caption.includes('arg'));
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
  assert.strictEqual(brief.kind, 'sample-set');
  assert.ok(brief.samples.every(sample => !Object.hasOwn(sample, 'class')));
  assert.ok(brief.samples.length + brief.groups.length < rows.length + diagram.annotations.length);
  const expectedLabels = partitions.map(part => part[0]).map(row => `$(${row[0]},${row[1]})$`);
  assert.deepStrictEqual(brief.samples.map(sample => sample.label), expectedLabels);
  brief.groups.forEach((group, index) => assert.deepStrictEqual(group.members, [brief.samples[index].id]));
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
  else if (Array.isArray(expected)) { assert.strictEqual(actual.length, expected.length); expected.forEach((value, index) => b2Close(actual[index], value)); }
  else if (expected && typeof expected === 'object') { assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort()); Object.entries(expected).forEach(([key, value]) => b2Close(actual[key], value)); }
  else assert.strictEqual(actual, expected);
}
const b2Numbers = value => typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(b2Numbers) : [];
const b2Strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(b2Strings) : [];

test('batch questions, learner keywords and lesson origin remain attached to their own references', () => {
  for (const id of b2Ids) {
    const ref = b2Ref(id);
    const row = replay.prompts.find(item => item.referenceId === id);
    assert.ok(row);
    assert.strictEqual(replay.prompts.filter(item => item.referenceId === id).length, 1);
    assert.strictEqual(ref.prompts[0], row.prompt);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    row.paraphrases.forEach(phrase => assert.ok(ref.prompts.includes(phrase)));
    assert.ok(ref.keywords.length >= 2 && ref.keywords.length <= 3);
    assert.deepStrictEqual(ref.shortKeywords, ref.keywords);
    for (const keyword of ref.keywords) { assert.strictEqual(keyword, keyword.toLowerCase()); assert.ok(keyword.trim().split(/\s+/).length <= 3); assert.ok(ref.keywords.includes(keyword)); }
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.strictEqual(ref.lesson, data.metadata.lessons[0]);
    assert.ok(ref.promptOrigins.some(origin => origin.prompt === row.prompt && origin.id === row.id && origin.origin === 'lesson' && origin.lesson === ref.lesson));
    for (const depth of ['overview', 'standard', 'deep']) assert.ok(ref.depths[depth].spec.diagram);
  }
});

test('workflow and split labels follow recomputed counts and arithmetic', () => {
  const d = data.derived();
  const workflow = b2Ref(b2Ids[0]);
  const stageCount = d.workflow.stages.reduce(count => count + 1, 0);
  const transitions = d.workflow.stages.slice(1).length;
  assert.strictEqual(d.workflow.stageCount, stageCount);
  assert.strictEqual(d.workflow.forwardTransitions, transitions);
  assert.strictEqual(stageCount - 1, transitions);
  assert.strictEqual(d.workflow.returnCount, d.workflow.feedback.length);
  const cleanRange = [6 / 10, 8 / 10].map(fraction => fraction * 10 ** 2);
  assert.deepStrictEqual(d.workflow.cleanPercentRange, cleanRange);
  const expectedSteps = [...d.workflow.stages.slice(0, -2).map((stage, index) => index === 1 ? `${stage} · ${cleanRange.join('–')}% time` : stage), d.workflow.stages.slice(-2).join(' / ')];
  assert.deepStrictEqual(workflow.spec.diagram.steps, expectedSteps);
  assert.ok(workflow.depths.overview.spec.diagram.steps.length < workflow.spec.diagram.steps.length);
  assert.ok(workflow.depths.deep.spec.diagram.caption.includes(`$${stageCount}-1=${transitions}$`));
  for (const edge of d.workflow.feedback) {
    assert.ok(workflow.spec.diagram.caption.includes(edge.from));
    assert.ok(workflow.spec.diagram.caption.includes(edge.to));
    assert.ok(workflow.spec.diagram.caption.includes(edge.condition));
  }
  const split = b2Ref(b2Ids[1]);
  const weightTotal = b2Sum(d.split.weights);
  const percentages = d.split.weights.map(weight => 10 ** 2 * weight / weightTotal);
  assert.deepStrictEqual(d.split.percentages, percentages);
  assert.strictEqual(d.split.totalPercent, b2Sum(percentages));
  assert.strictEqual(b2Sum(percentages), 10 ** 2);
  for (const depth of ['standard', 'deep']) {
    assert.deepStrictEqual(split.depths[depth].spec.diagram.blocks.map(block => block.dims), percentages.map(value => `${value}%`));
    assert.deepStrictEqual(split.depths[depth].detailSpec.diagram.edges.map(edge => edge.label), percentages.map(value => `${value}%`));
  }
  assert.ok(split.depths.deep.spec.diagram.caption.includes(`$${percentages.join('+')}=${b2Sum(percentages)}$`));
  assert.ok(split.spec.diagram.caption.includes('not block widths'));
});

test('fit curves, displayed window, residual and error bars are independently reconstructed', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const labels = [...new Set(rows.map(row => row.at(-1)))];
  const firstClassSize = rows.filter(row => row.at(-1) === labels[0]).length;
  const xs = [...new Set(rows.map(row => row[0]))].sort((a, b) => a - b);
  const trend = x => 1 + x + x * x / firstClassSize;
  const observed = xs.map((x, index) => ({ x, y: trend(x) + Math.pow(-1, index) / firstClassSize }));
  const chord = x => trend(xs[0]) + (trend(xs.at(-1)) - trend(xs[0])) * (x - xs[0]) / (xs.at(-1) - xs[0]);
  const centers = labels.map(label => { const part = rows.filter(row => row.at(-1) === label); return [0, 1].map(column => b2Sum(part.map(row => row[column])) / part.length); });
  const radius = Math.max(...rows.map(row => { const center = centers[labels.indexOf(row.at(-1))]; return Math.hypot(row[0] - center[0], row[1] - center[1]); }));
  const overfit = [];
  observed.forEach((point, index) => {
    overfit.push({ ...point });
    if (index + 1 < observed.length) { const next = observed[index + 1]; overfit.push({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 + Math.pow(-1, index) * labels.length * radius }); }
  });
  const interpolate = x => {
    for (let index = 1; index < overfit.length; index += 1) {
      const a = overfit[index - 1]; const b = overfit[index];
      if (x >= a.x && x <= b.x) return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    }
    assert.fail('Input must lie on the generated fit');
  };
  const cutoff = xs[labels.length];
  const expectedWindow = {
    observed: observed.filter(p => p.x <= cutoff),
    underfit: [xs[0], cutoff].map(x => ({ x, y: chord(x) })),
    goodFit: xs.filter(x => x <= cutoff).map(x => ({ x, y: trend(x) })),
    overfit: overfit.filter(p => p.x <= cutoff),
    bounds: { minX: xs[0], maxX: cutoff, minY: Math.min(0, ...rows.flatMap(row => row.slice(0, 2))), maxY: Math.max(...rows.flatMap(row => row.slice(0, 2))) + 1 }
  };
  b2Close(derived().fitWindow, expectedWindow);
  const fit = b2Ref(b2Ids[2]);
  const keys = ['observed', 'underfit', 'goodFit', 'overfit'];
  for (const depth of ['standard', 'deep']) {
    const diagram = fit.depths[depth].spec.diagram;
    b2Close([diagram.x.min, diagram.x.max, diagram.y.min, diagram.y.max], Object.values(expectedWindow.bounds));
    keys.forEach((key, index) => { b2Close(diagram.series[index].samples.x, expectedWindow[key].map(p => p.x)); b2Close(diagram.series[index].samples.y, expectedWindow[key].map(p => p.y)); });
  }
  const heldX = b2Sum(centers.map(center => center[0])) / centers.length;
  const heldY = trend(heldX);
  const models = { underfit: chord, goodFit: trend, overfit: interpolate };
  const expectedErrors = Object.entries(models).map(([key, predict]) => {
    const training = b2Sum(observed.map(p => (p.y - predict(p.x)) ** 2)) / observed.length;
    const held = (heldY - predict(heldX)) ** 2;
    b2Close(d.fits.trainingMse[key], training);
    b2Close(d.fits.heldOut.squaredErrors[key], held);
    return [training, held];
  });
  b2Close(fit.depths.deep.detailSpec.diagram.series.map(series => series.values), expectedErrors);
  const residualSquared = (observed[0].y - trend(observed[0].x)) ** 2;
  b2Close(d.fits.trainingMse.goodFit, residualSquared);
  assert.ok(fit.depths.deep.spec.diagram.caption.includes(`$(${observed[0].y}-${trend(observed[0].x)})^2=${residualSquared}$`));
});

test('bias, variance, noise, totals, axes and minimum are recomputed from toy geometry', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const labels = [...new Set(rows.map(row => row.at(-1)))];
  const groups = labels.map(label => rows.filter(row => row.at(-1) === label));
  const centers = groups.map(group => [0, 1].map(column => b2Sum(group.map(row => row[column])) / group.length));
  const radiusSquared = Math.max(...rows.map(row => { const center = centers[labels.indexOf(row.at(-1))]; return (row[0] - center[0]) ** 2 + (row[1] - center[1]) ** 2; }));
  const levels = labels.length + 1;
  const expected = Array.from({ length: levels }, (_, index) => {
    const complexity = index + 1;
    const biasSquared = (levels - complexity) ** 2;
    const variance = index ** 2;
    const noise = radiusSquared / groups[0].length;
    return { complexity, biasSquared, variance, noise, total: b2Sum([biasSquared, variance, noise]) };
  });
  b2Close(d.tradeoff.points, expected);
  const best = expected.reduce((a, b) => a.total <= b.total ? a : b);
  b2Close(d.tradeoff.sweetSpot, best);
  const ref = b2Ref(b2Ids[3]);
  for (const depth of ['standard', 'deep']) {
    const diagram = ref.depths[depth].spec.diagram;
    b2Close([diagram.x.min, diagram.x.max, diagram.y.min, diagram.y.max], [expected[0].complexity, expected.at(-1).complexity, 0, Math.ceil(Math.max(...expected.map(p => p.total)))]);
    ['biasSquared', 'variance', 'noise', 'total'].forEach((key, index) => { b2Close(diagram.series[index].samples.x, expected.map(p => p.complexity)); b2Close(diagram.series[index].samples.y, expected.map(p => p[key])); });
    b2Close([diagram.annotations[0].x, diagram.annotations[0].y], [best.complexity, best.total]);
  }
  assert.ok(ref.depths.deep.spec.diagram.caption.includes(`$${best.biasSquared}+${best.variance}+${best.noise}=${best.total}$`));
});

test('each displayed number belongs to shared or batch derived results; every visual is illustrative', () => {
  const available = b2Numbers({ shared: data.derived(), batch: derived() });
  for (const id of b2Ids) {
    const ref = b2Ref(id);
    for (const depth of ['overview', 'standard', 'deep']) {
      const entry = ref.depths[depth];
      for (const visual of [entry.spec, entry.detailSpec].filter(Boolean)) {
        assert.ok(visual.diagram.caption.startsWith('Illustrative'));
        for (const number of b2Numbers(visual)) assert.ok(available.includes(number), `${id}: missing numerical field ${number}`);
        for (const text of b2Strings(visual)) {
          for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) assert.ok(available.includes(Number(match[0])), `${id}: missing displayed number ${match[0]}`);
        }
      }
    }
  }
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
}
