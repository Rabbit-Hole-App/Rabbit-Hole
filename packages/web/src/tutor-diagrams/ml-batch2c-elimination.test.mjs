import test from 'node:test';
import assert from 'node:assert/strict';
import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch2c-elimination-references.js';
import { describeTutorDiagram, parseTutorDiagram } from './spec.js';
import { TEACHING } from './teaching-theme.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const reference = references.find(({ id }) => id === 'ml-recursive-feature-elimination');

test('RFE refits and reranks the remaining features before the next drop', () => {
  assert.ok(reference);
  const { rows } = parseTutorDiagram(reference.spec).diagram;
  assert.deepEqual(rows.map(({ id, heading }) => [id, heading]), [
    ['fit-4', 'Fit 4'], ['refit-3', 'Refit 3'], ['refit-2', 'Refit 2'],
  ]);
  const rankings = rows.map(({ cells: [scores] }) => scores.split(', ').map(pair => {
    const [feature, score] = pair.split('=');
    return [feature, Number(score)];
  }));
  assert.deepEqual(rankings, [
    [['A', 0.80], ['B', 0.60], ['C', 0.30], ['D', 0.10]],
    [['A', 0.75], ['C', 0.40], ['B', 0.22]],
    [['A', 0.77], ['C', 0.45]],
  ]);
  for (const [index, ranking] of rankings.slice(0, -1).entries()) {
    assert.equal(rows[index].cells[1], `Drop ${ranking.at(-1)[0]}`);
    assert.deepEqual(rankings[index + 1].map(([feature]) => feature).sort(),
      ranking.slice(0, -1).map(([feature]) => feature).sort());
  }
  assert.equal(rows.at(-1).cells[1], 'Keep A, C');
});

test('the Lesson 18 RFE reference round-trips and renders every stage at 320, 408 and 720 px', () => {
  assert.ok(reference);
  const { lessons, prompts, spec } = reference;
  assert.deepEqual(lessons, ['18']);
  assert.deepEqual(prompts, ['Why does recursive feature elimination refit after each drop?']);
  assert.equal(spec.version, 1);
  assert.equal(spec.diagram.kind, 'matrix');
  assert.equal(spec.diagram.layout, 'teaching');
  const saved = JSON.stringify(spec);
  const parsed = parseTutorDiagram(saved);
  assert.deepEqual(parsed, spec);
  const expected = Object.fromEntries([
    ...parsed.diagram.columns.map((heading, index) => [`column:${index}`, heading]),
    ...parsed.diagram.rows.flatMap(({ id, heading, cells }) => [
      [id, heading], ...cells.map((cell, index) => [`${id}:${index}`, cell]),
    ]),
  ]);

  for (const width of [320, 408, 720]) {
    const rendered = renderTutorDiagram(saved, width);
    assert.equal(rendered.width, width);
    assert.ok(Number.isFinite(rendered.height) && rendered.height > 0);
    const svg = renderToStaticMarkup(rendered.element);
    assert.match(svg, /^<svg .*role="img"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
    assert.equal(rendered.element.props['aria-label'], describeTutorDiagram(parsed));
    assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));

    const group = Children.toArray(rendered.element.props.children).find(element => element.type === 'g');
    const elements = Children.toArray(group.props.children);
    const visible = {};
    const highlighted = [];
    for (const [index, element] of elements.entries()) {
      const column = element.props['data-tutor-matrix-column'];
      const key = column === undefined
        ? element.props['data-tutor-matrix-row'] ?? element.props['data-tutor-matrix-cell']
        : `column:${column}`;
      if (!key) continue;
      const label = elements[index + 1];
      assert.equal(label.type, 'text');
      visible[key] = Children.toArray(label.props.children).map(line => line.props.children).join(' ');
      if (element.props['data-emphasis']) {
        assert.equal(element.props.stroke, TEACHING.blue);
        highlighted.push(key);
      }
    }
    assert.deepEqual(visible, expected);
    assert.deepEqual(highlighted, ['fit-4:0', 'refit-3:0', 'refit-2:1']);
  }
});
