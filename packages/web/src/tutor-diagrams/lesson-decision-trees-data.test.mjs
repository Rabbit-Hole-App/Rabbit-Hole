import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionTreesLesson as lesson } from './lesson-decision-trees-data.js';

const features = ['x', 'y'];
const valueOf = ([numerator, denominator]) => numerator / denominator;
const frequencies = rows => [0, 1].map(label => rows.filter(row => row.label === label).length);
const impurity = rows => 1 - frequencies(rows).reduce((sum, count) => sum + (count / rows.length) ** 2, 0);
const thresholds = (rows, feature) => {
  const values = [...new Set(rows.map(row => row[feature]))].sort((a, b) => a - b);
  return values.slice(1).map((value, index) => (values[index] + value) / 2);
};

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);
}

function splitGroups(rows, { feature, threshold }) {
  return [rows.filter(row => row[feature] <= threshold), rows.filter(row => row[feature] > threshold)];
}

function weighted(rows, split) {
  return splitGroups(rows, split).reduce((sum, group) => sum + impurity(group) * group.length / rows.length, 0);
}

function verifySplit(rows, split) {
  const [left, right] = splitGroups(rows, split);
  assert.ok(left.length && right.length);
  assert.deepEqual(split.leftCounts, frequencies(left));
  assert.deepEqual(split.rightCounts, frequencies(right));
  close(valueOf(split.leftGini), impurity(left));
  close(valueOf(split.rightGini), impurity(right));
  close(valueOf(split.weighted), weighted(rows, split));
  close(valueOf(split.gain), impurity(rows) - weighted(rows, split));
}

function verifyTree(node, rows, candidatesAtNode, depth = 0, path = 'root') {
  const counts = frequencies(rows);
  assert.deepEqual(node.counts, counts);
  assert.equal(node.prediction, counts[1] > counts[0] ? 1 : 0);
  if (!node.split) {
    assert.ok(depth === 2 || counts.includes(0));
    return;
  }
  assert.ok(depth < 2 && counts.every(count => count > 0));
  const { feature, threshold } = node.split;
  const candidates = candidatesAtNode(path).flatMap(name => thresholds(rows, name)
    .map(at => ({ feature: name, threshold: at })));
  const best = candidates.reduce((first, candidate) =>
    weighted(rows, candidate) < weighted(rows, first) - 1e-12 ? candidate : first);
  assert.deepEqual({ feature, threshold }, best);
  verifySplit(rows, node.split);
  const [left, right] = splitGroups(rows, node.split);
  verifyTree(node.left, left, candidatesAtNode, depth + 1, `${path}l`);
  verifyTree(node.right, right, candidatesAtNode, depth + 1, `${path}r`);
}

function splitPaths(node, path = 'root') {
  return node.split ? [path, ...splitPaths(node.left, `${path}l`), ...splitPaths(node.right, `${path}r`)] : [];
}

function prediction(tree, row, maxDepth = Infinity) {
  let node = tree;
  for (let depth = 0; node.split && depth < maxDepth; depth++) {
    const { feature, threshold } = node.split;
    node = row[feature] <= threshold ? node.left : node.right;
  }
  return node.prediction;
}

function gains(node, rows, rootSize, byFeature) {
  if (!node.split) return;
  const [left, right] = splitGroups(rows, node.split);
  byFeature[node.split.feature] += (impurity(rows) - weighted(rows, node.split)) * rows.length / rootSize;
  gains(node.left, left, rootSize, byFeature);
  gains(node.right, right, rootSize, byFeature);
}

test('the root trials and grown tree agree with counts from the same training rows', () => {
  assert.ok(lesson.rows.length <= 10);
  assert.deepEqual([...lesson.train, ...lesson.holdout], lesson.rows);
  assert.equal(new Set(lesson.rows.map(row => row.id)).size, lesson.rows.length);
  for (const row of lesson.rows) {
    assert.ok(Number.isFinite(row.x) && Number.isFinite(row.y));
    assert.ok(row.label === 0 || row.label === 1);
  }
  for (const feature of features) {
    assert.deepEqual(lesson.trials[feature].map(split => split.threshold), thresholds(lesson.train, feature));
    for (const split of lesson.trials[feature]) {
      assert.equal(split.feature, feature);
      verifySplit(lesson.train, split);
    }
  }
  verifyTree(lesson.tree, lesson.train, () => features);
});

test('depth errors count misclassified rows and expose the held-out error increase', () => {
  assert.deepEqual(lesson.errors.map(entry => entry.depth), [0, 1, 2]);
  for (const { depth, trainErrors, heldOutErrors } of lesson.errors) {
    const countErrors = rows => rows.filter(row => prediction(lesson.tree, row, depth) !== row.label).length;
    assert.equal(trainErrors, countErrors(lesson.train));
    assert.equal(heldOutErrors, countErrors(lesson.holdout));
  }
  const [, stump, deep] = lesson.errors;
  assert.ok(deep.trainErrors < stump.trainErrors && deep.heldOutErrors > stump.heldOutErrors);
});

test('bootstrap roots, votes and feature importance follow the fitted trees', () => {
  assert.equal(lesson.forest.length, 3);
  const totals = { x: 0, y: 0 };
  for (const { sample, tree, byFeature, featureDraws } of lesson.forest) {
    assert.equal(sample.length, lesson.train.length);
    assert.ok(sample.every(row => lesson.train.includes(row)));
    assert.ok(new Set(sample).size < sample.length);
    assert.deepEqual(Object.keys(featureDraws).sort(), splitPaths(tree).sort());
    assert.ok(Object.values(featureDraws).every(draw => draw.length === 1 && features.includes(draw[0])));
    verifyTree(tree, sample, path => featureDraws[path]);
    const expected = { x: 0, y: 0 };
    gains(tree, sample, sample.length, expected);
    for (const feature of features) {
      close(valueOf(byFeature[feature]), expected[feature]);
      totals[feature] += expected[feature];
    }
  }
  const roots = lesson.forest.map(({ tree }) => `${tree.split.feature}/${tree.split.threshold}`);
  assert.equal(new Set(roots).size, lesson.forest.length);
  const treeVotes = row => lesson.forest.map(({ tree }) => prediction(tree, row));
  const winningLabel = votes => Number(votes.filter(vote => vote === 1).length > votes.length / 2);
  const votes = treeVotes(lesson.vote.row);
  assert.ok(lesson.holdout.includes(lesson.vote.row));
  assert.deepEqual(lesson.vote.predictions, votes);
  assert.deepEqual(lesson.vote.counts, [0, 1].map(label => votes.filter(vote => vote === label).length));
  assert.ok(lesson.vote.counts.every(count => count > 0));
  assert.equal(lesson.vote.winner, winningLabel(votes));
  for (const feature of features) close(valueOf(lesson.importance.totals[feature]), totals[feature]);

  const [first, second] = lesson.holdout;
  const correct = rows => rows.filter(row => winningLabel(treeVotes(row)) === row.label).length;
  const afterSwap = feature => correct([{ ...first, [feature]: second[feature] }, { ...second, [feature]: first[feature] }]);
  assert.deepEqual(lesson.importance.permutation, {
    baselineCorrect: correct(lesson.holdout), xCorrect: afterSwap('x'), yCorrect: afterSwap('y'),
  });
});
