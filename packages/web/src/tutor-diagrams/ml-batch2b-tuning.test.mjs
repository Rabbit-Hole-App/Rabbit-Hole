import assert from 'node:assert/strict';
import test from 'node:test';
import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch2b-tuning-references.js';
import { describeTutorDiagram, parseTutorDiagram } from './spec.js';
import { TEACHING } from './teaching-theme.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const diagramFor = id => {
  const reference = references.find(reference => reference.id === id);
  assert.ok(reference, `${id} must be available as an author reference`);
  return reference.spec.diagram;
};

test('Bayesian acquisition recomputes UCB from the four surrogate predictions', () => {
  const { rows, columns, emphasis, caption } = diagramFor('ml-bayesian-acquisition-choice');
  assert.deepEqual(columns, [String.raw`$\mu,\sigma$`, 'UCB']);
  assert.deepEqual(rows.map(row => row.heading), ['A · $d=2$', 'B · $d=4$', 'C · $d=6$', 'D · $d=8$']);
  const predictions = rows.map(row => row.cells[0].slice(1, -1).split(',').map(Number));
  assert.deepEqual(predictions, [[0.70, 0.02], [0.76, 0.02], [0.73, 0.10], [0.68, 0.08]]);
  const scores = predictions.map(([mean, deviation]) => (mean + deviation).toFixed(2));
  assert.deepEqual(scores, ['0.72', '0.78', '0.83', '0.76']);
  assert.deepEqual(rows.map(row => row.cells[1]), scores);
  const best = values => rows[values.indexOf(Math.max(...values))].id;
  assert.equal(best(predictions.map(([mean]) => mean)), 'b');
  assert.equal(best(scores.map(Number)), 'c');
  assert.deepEqual(emphasis.cells, [{ row: 'c', column: 1 }]);
  assert.match(caption, /one standard deviation/);
  assert.match(caption, /B has the best mean\. Try C next\./);
});

test('successive halving advances only the top trials and charges only added epochs', () => {
  const { rows, columns, emphasis, caption } = diagramFor('ml-successive-halving-rounds');
  assert.deepEqual(columns, ['Accuracy', 'Decision']);
  const byBudget = new Map();
  for (const { id, heading, cells: [score, decision] } of rows) {
    const match = heading.match(/^([A-D]) · (\d+) ep$/);
    assert.ok(match, 'each row identifies a trial and its cumulative budget');
    const [, trial, epochs] = match;
    const budget = Number(epochs);
    assert.equal(id, `${trial.toLowerCase()}-${budget}`);
    if (!byBudget.has(budget)) byBudget.set(budget, []);
    byBudget.get(budget).push({ id, trial, score: Number(score), decision });
  }
  const budgets = [...byBudget.keys()];
  assert.deepEqual(budgets, [1, 2, 4]);
  assert.deepEqual([...byBudget.values()].map(round => round.map(({ trial, score }) => [trial, score])), [
    [['A', 0.72], ['B', 0.69], ['C', 0.75], ['D', 0.60]],
    [['A', 0.80], ['C', 0.78]],
    [['A', 0.85]],
  ]);
  let previousBudget = 0;
  const spend = budgets.map((budget, index) => {
    const round = byBudget.get(budget);
    const next = byBudget.get(budgets[index + 1]);
    const ranked = [...round].sort((a, b) => b.score - a.score);
    const advance = next ? ranked.slice(0, round.length / 2) : [];
    assert.deepEqual(next?.map(row => row.trial).sort() ?? [], advance.map(row => row.trial).sort());
    assert.deepEqual(ranked.map(row => row.decision), next
      ? ranked.map(row => advance.includes(row) ? 'Advance' : 'Stop')
      : ['Winner']);
    const cost = round.length * (budget - previousBudget);
    previousBudget = budget;
    return cost;
  });
  assert.deepEqual(spend, [4, 2, 2]);
  const total = spend.reduce((sum, cost) => sum + cost, 0);
  assert.equal(total, 8);
  assert.ok(caption.includes(`$${spend.join(' + ')} = ${total}$ trial-epochs`));
  assert.match(caption, /held-out accuracy.*Epochs are cumulative.*Total spend when resuming/);
  assert.deepEqual(emphasis.cells, rows.filter(row => row.cells[1] !== 'Stop')
    .map(row => ({ row: row.id, column: 1 })));
});

test('lesson 12 tuning references round-trip and render every numeric label at 320, 408 and 720 px', () => {
  assert.deepEqual(references.map(reference => [reference.id, reference.prompts]), [
    ['ml-bayesian-acquisition-choice', ['How does Bayesian optimization decide which setting to try next?']],
    ['ml-successive-halving-rounds', ['How does successive halving decide which trials get more training?']],
  ]);
  for (const { lessons, keywords, useWhen, spec } of references) {
    assert.deepEqual(lessons, ['12']);
    assert.ok(keywords.length >= 4 && useWhen.length > 40);
    assert.equal(spec.version, 1);
    assert.equal(spec.diagram.kind, 'matrix');
    assert.equal(spec.diagram.layout, 'teaching');
    const saved = JSON.stringify(spec);
    const parsed = parseTutorDiagram(saved);
    assert.deepEqual(parsed, spec);
    assert.ok(describeTutorDiagram(parsed).includes(spec.diagram.caption));
    const expected = Object.fromEntries(spec.diagram.rows.flatMap(row => [
      [row.id, row.heading], ...row.cells.map((value, column) => [`${row.id}:${column}`, value]),
    ]));
    for (const width of [320, 408, 720]) {
      const rendered = renderTutorDiagram(saved, width);
      assert.equal(rendered.width, width);
      assert.ok(Number.isFinite(rendered.height) && rendered.height > 0);
      const svg = renderToStaticMarkup(rendered.element);
      assert.match(svg, /^<svg .*role="img"/);
      assert.ok(svg.includes(TEACHING.blue));
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));

      const body = Children.toArray(rendered.element.props.children).find(element => element.type === 'g');
      const elements = Children.toArray(body.props.children);
      const visible = Object.fromEntries(elements.flatMap((element, index) => {
        const key = element.props['data-tutor-matrix-row'] ?? element.props['data-tutor-matrix-cell'];
        if (!key) return [];
        const label = elements[index + 1];
        const lines = Children.toArray(label.props.children);
        assert.equal(lines.length, 1, `${key} must stay on one line at ${width} px`);
        const [line] = lines;
        if (label.type === 'text') return [[key, line.props.children]];
        assert.equal(line.type, 'foreignObject');
        const runs = Children.toArray(line.props.children.props.children);
        return [[key, runs.map(run => typeof run === 'string' ? run : run.props['data-tutor-tex']).join('')]];
      }));
      assert.deepEqual(visible, expected);
    }
  }
});
