import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { selectDiagramReferences } from '../../../control-plane/src/explanation-references.js';
import { decisionTreesLesson as lesson } from './lesson-decision-trees-data.js';
import { lessonDecisionTreesReferences as references } from './lesson-decision-trees-references.js';
import { parseTutorDiagram } from './spec.js';
import budgets from './lesson-decision-trees-token-budgets.json' with { type: 'json' };

const depths = ['overview', 'standard', 'deep'];
const value = ([numerator, denominator]) => numerator / denominator;
const fraction = ([n, d]) => d === 1 ? String(n) : `${n} over ${d}`;
const visual = (ref, depth) => ref.depths[depth]?.spec ?? ref.spec;
const diagram = (name, depth) => visual(references.find(ref => ref.id === `ml-trees-${name}`), depth).diagram;
const size = counts => counts.reduce((sum, count) => sum + count, 0);
const rule = (split, right = false) => `${split.feature} ${right ? 'above' : 'at most'} ${split.threshold}`;

for (const ref of references) {
  test(`${ref.id} validates, meets the budget and is picked first at all depths`, () => {
    assert.deepEqual(ref.lessons, ['04']);
    assert.ok(ref.prompts.length > 0);
    assert.equal(ref.paraphrases.length, 1);
    for (const depth of depths) {
      const spec = visual(ref, depth);
      const json = JSON.stringify(spec);
      const parsed = parseTutorDiagram(spec);
      assert.deepEqual(parsed, parseTutorDiagram(json));
      assert.deepEqual(lintDiagramContent(spec), []);
      assert.match(spec.diagram.caption, /^Worked example\./);
      const [measured] = budgets.refs[ref.id][depth];
      assert.equal(createHash('sha256').update(json).digest('hex'), measured.sha256);
      assert.ok(measured.tokens > 0 && measured.tokens <= budgets.maxSpecTokens);
      for (const prompt of [...ref.prompts, ...ref.paraphrases]) {
        const selected = selectDiagramReferences({ prompt, depth })[0];
        assert.equal(selected?.id, ref.id, prompt);
        assert.deepEqual(selected.spec, parsed, prompt);
      }
    }
  });
}

test('the pilot has ten measured figures with no stale budget entries', () => {
  assert.equal(references.length, 10);
  assert.equal(budgets.encoding, 'cl100k_base');
  assert.equal(budgets.maxSpecTokens, 300);
  assert.deepEqual(Object.keys(budgets.refs), references.map(ref => ref.id));
});

test('the walkthrough publishes the same ten data rows and three previews per reference', () => {
  const document = new URL('../../../../docs/features/explain-on-canvas/handoff/phase02-library/lesson-walkthroughs/04-decision-trees.md', import.meta.url);
  const markdown = readFileSync(document, 'utf8');
  const rows = markdown.match(/^\| [A-Z] \| .*$/gm);
  assert.deepEqual(rows, lesson.rows.map(row => `| ${row.id} | ${row.x} | ${row.y} | ${row.label} | ${lesson.train.includes(row) ? 'Training' : 'Held out'} |`));
  for (const ref of references) {
    for (const suffix of ['-brief', '', '-detailed']) {
      const path = `../illustrations/${ref.id}${suffix}/408.svg`;
      assert.ok(markdown.includes(`(${path})`), path);
      assert.match(readFileSync(new URL(path, document), 'utf8'), /^<svg /);
    }
  }
});

test('scatter and threshold plots use fixture coordinates and recomputed split scores', () => {
  for (const depth of depths) {
    const plot = diagram('candidate-split', depth);
    const rows = depth === 'overview' ? lesson.train.filter((_, index) => index % 2 === 0) : lesson.train;
    for (const [label, series] of plot.series.entries()) {
      assert.deepEqual(series.points.map(({ x, y }) => [x, y]), rows.filter(row => row.label === label).map(({ x, y }) => [x, y]));
    }
    assert.deepEqual(plot.annotations.map(({ axis, value }) => [axis, value]), [[lesson.tree.split.feature, lesson.tree.split.threshold]]);
    const search = diagram('threshold-search', depth);
    const units = Number(search.y.label.match(/in (\d+)ths$/)[1]);
    const points = search.series[0].points;
    for (const [index, { threshold, weighted: [numerator, denominator] }] of lesson.trials.x.entries()) {
      assert.equal(points[index].x, threshold);
      assert.ok(Number.isInteger(points[index].y));
      assert.equal(points[index].y * denominator, numerator * units);
    }
    if (depth === 'deep') assert.deepEqual(search.series[0].points.map(point => point.label), lesson.trials.x.map(split => fraction(split.weighted)));
    const [best] = search.annotations;
    assert.equal(best.x, lesson.tree.split.threshold);
    assert.equal(best.y * lesson.tree.split.weighted[1], lesson.tree.split.weighted[0] * units);
  }
});

test('Gini cells show exact values and weights from the chosen split', () => {
  const split = lesson.tree.split;
  for (const depth of depths) {
    const { rows, caption } = diagram('gini-split', depth);
    for (const [side, counts, gini] of [['Left', split.leftCounts, split.leftGini], ['Right', split.rightCounts, split.rightGini]]) {
      const cells = rows.find(row => row.heading === side).cells;
      assert.deepEqual(cells.slice(0, 3), [...counts.map(String), String(value(gini))]);
      if (depth !== 'overview') assert.equal(cells[3], String(size(counts) / lesson.train.length));
    }
    assert.equal(rows.find(row => row.heading === 'After').cells[2], String(value(split.weighted)));
    if (depth === 'deep') {
      const [zeros, ones] = lesson.tree.counts;
      assert.equal(caption, `Worked example. Parent Gini ${2 * zeros * ones / lesson.train.length ** 2} minus ${value(split.weighted)} gives a gain of ${value(split.gain)}.`);
    }
  }
});

test('tree counts, labeled edges and filled regions agree with the classifier', () => {
  function verifyNode(nodes, model, id, parent) {
    const rendered = nodes.find(node => node.id === id);
    assert.equal(rendered.count, size(model.counts));
    assert.equal(rendered.detail, `${model.counts[0]} zeros · ${model.counts[1]} ones`);
    if (parent) assert.equal(rendered.edgeLabel, rule(parent.split, rendered.side === 'right'));
    if (model.split) {
      verifyNode(nodes, model.left, id + 'l', model);
      verifyNode(nodes, model.right, id + 'r', model);
    } else assert.equal(rendered.label, `Predict ${model.prediction} · ${id.slice(4).toUpperCase()}`);
  }
  for (const depth of depths) {
    verifyNode(diagram('grown-tree', depth).nodes, lesson.tree, 'root');
    const plot = diagram('decision-regions', depth);
    if (depth === 'deep') {
      const { id, x, y, label } = lesson.vote.row;
      assert.deepEqual(plot.series.at(-1), { label: `Held out ${id} · class ${label}`, kind: 'scatter', points: [{ x, y }] });
    }
    const regions = plot.annotations.filter(mark => mark.kind === 'rectangle');
    assert.equal(regions.length, 3);
    for (const row of lesson.rows) {
      const region = regions.find(mark => row.x > mark.xMin && row.x <= mark.xMax && row.y > mark.yMin && row.y <= mark.yMax);
      let node = lesson.tree;
      while (node.split) node = row[node.split.feature] <= node.split.threshold ? node.left : node.right;
      assert.equal(region?.label, `Predict ${node.prediction}`, row.id);
    }
  }
});

test('depth curves, bootstrap draws, candidate features, votes and importance use the shared fixture', () => {
  for (const depth of depths) {
    const error = diagram('depth-overfit', depth);
    assert.deepEqual(error.series.map(series => series.points.map(({ x, y }) => [x, y])), [
      lesson.errors.map(step => [step.depth, 100 * step.trainErrors / lesson.train.length]),
      lesson.errors.map(step => [step.depth, 100 * step.heldOutErrors / lesson.holdout.length]),
    ]);
    const bootstrap = diagram('bootstrap-roots', depth);
    assert.deepEqual(bootstrap.groups.map(group => group.members), lesson.forest.map(tree => tree.sample.map(row => row.id)));
    for (const [index, group] of bootstrap.groups.entries()) {
      assert.ok(group.replacement);
      assert.ok(group.label.includes(rule(lesson.forest[index].tree.split)));
      if (depth === 'deep') assert.deepEqual(group.omitted, lesson.train.filter(row => !group.members.includes(row.id)).map(row => row.id));
    }
    const subsets = diagram('feature-subsets', depth);
    for (const [index, row] of subsets.rows.entries()) {
      const { tree, featureDraws } = lesson.forest[index];
      const expect = (path, node) => node.split ? (depth === 'deep' ? rule(node.split) : featureDraws[path][0]) : 'Leaf';
      assert.deepEqual(row.cells, depth === 'overview'
        ? [expect('root', tree), expect('rootr', tree.right)]
        : [expect('root', tree), expect('rootl', tree.left), expect('rootr', tree.right)]);
    }
    const votes = diagram('majority-vote', depth);
    if (depth === 'deep') assert.deepEqual(votes.series.map(series => series.values), lesson.vote.predictions.map(pick => [0, 1].map(label => Number(pick === label))));
    else assert.deepEqual(votes.bars.map(bar => bar.value), lesson.vote.counts);
    const importance = diagram('feature-importance', depth);
    if (depth === 'deep') assert.deepEqual(importance.series.map(series => series.values), lesson.forest.map(tree => ['x', 'y'].map(feature => value(tree.byFeature[feature]))));
    else assert.deepEqual(importance.bars.map(bar => bar.value), ['x', 'y'].map(feature => value(lesson.importance.totals[feature])));
  }
});
