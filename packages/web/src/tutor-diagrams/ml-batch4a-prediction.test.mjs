import assert from 'node:assert/strict';
import test from 'node:test';
import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { references } from './ml-batch4a-prediction-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const children = element => Children.toArray(element.props.children);
const labelText = element => children(element).map(line => line.props.children).join(' ');

test('the Lesson 01 comparison contrasts a category and an amount for the same inputs', () => {
  assert.equal(references.length, 1);
  const [{ id, lessons, prompts, useWhen, spec }] = references;
  assert.equal(id, 'ml-classification-vs-regression');
  assert.deepEqual(lessons, ['01']);
  assert.deepEqual(prompts, ["What's the difference between classification and regression?"]);
  assert.match(useWhen, /probability.*choosing a class/);
  assert.equal(spec.version, 1);
  assert.deepEqual(parseTutorDiagram(JSON.stringify(spec)), spec);
  assert.deepEqual(lintDiagramContent(spec), []);

  const { kind, layout, columns, rows, caption } = spec.diagram;
  assert.equal(kind, 'matrix');
  assert.equal(layout, 'teaching');
  assert.deepEqual(columns, ['Class label', 'Numeric value']);
  assert.match(caption, /Both predict tomorrow from today’s 18 °C, 82% humidity and falling pressure/);
  assert.deepEqual(rows.map(({ heading, cells }) => [heading, ...cells]), [
    ['Question', 'Will it rain?', 'How much rain?'],
    ['Target', 'Rain or no rain', 'Rainfall in mm'],
    ['Output', 'Rain', '12 mm'],
  ]);
});

test('the questions, targets and outputs remain side by side at 320, 408 and 720 px', () => {
  const [{ spec }] = references;
  const { columns, rows, caption } = spec.diagram;
  const expected = [...columns, ...rows.flatMap(({ heading, cells }) => [heading, ...cells])];
  for (const width of [320, 408, 720]) {
    const { element, width: renderedWidth, height } = renderTutorDiagram(JSON.stringify(spec), width);
    const svg = renderToStaticMarkup(element);
    assert.match(svg, /^<svg .*role="img"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
    assert.equal(renderedWidth, width);
    assert.ok(Number.isFinite(height) && height > 0);
    const frame = children(element);
    const body = frame.find(part => part.type === 'g');
    const labels = children(body).filter(mark => mark.type === 'text');
    assert.deepEqual(labels.map(labelText), expected);
    for (let i = 3; i < labels.length; i += 3) {
      const [left, right] = [labels[i].props, labels[i + 1].props];
      assert.ok(left.x < right.x);
      assert.equal(left.y, right.y);
    }
    assert.equal(labelText(frame.at(-1)), caption);
  }
});
