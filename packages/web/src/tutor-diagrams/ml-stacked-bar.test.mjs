// bar-chart variant "stacked" with bars: one bar split into parts in order, optionally with a stated total.
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseTutorDiagram, describeTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const stacked = (extra = {}) => ({ version: 1, diagram: { kind: 'bar-chart', variant: 'stacked', title: 'Probabilities add up to one', unit: 'probability',
  bars: [{ label: 'Class 0', value: 0.66 }, { label: 'Class 1', value: 0.24 }, { label: 'Class 2', value: 0.1 }], total: 1, ...extra } });
const svg = (spec, width = 408) => renderToStaticMarkup(renderTutorDiagram(spec, width).element);
const parts = markup => [...markup.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"[^>]*data-tutor-stacked-part="([^"]+)"/g)]
  .map(m => ({ y: Number(m[1]), height: Number(m[2]), value: Number(m[3]) }));

test('a stacked bar takes 2 to 8 positive parts and checks them against the stated total within rounding', () => {
  assert.doesNotThrow(() => parseTutorDiagram(stacked()));
  assert.doesNotThrow(() => parseTutorDiagram(stacked({ total: undefined })), 'the total is optional');
  assert.doesNotThrow(() => parseTutorDiagram(stacked({ bars: [{ label: 'A', value: 0.33 }, { label: 'B', value: 0.33 }, { label: 'C', value: 0.33 }] })), 'rounded thirds still add up to 1');
  assert.throws(() => parseTutorDiagram(stacked({ bars: [{ label: 'A', value: 0.5 }, { label: 'B', value: 0.3 }] })), 'parts add up to 0.8, not 1');
  assert.throws(() => parseTutorDiagram(stacked({ bars: [{ label: 'A', value: 1 }] })), 'one part');
  assert.throws(() => parseTutorDiagram(stacked({ bars: [{ label: 'A', value: 1.5 }, { label: 'B', value: -0.5 }] })), 'a negative part');
  assert.throws(() => parseTutorDiagram(stacked({ bars: [{ label: 'A', value: 0.5 }, { label: 'A', value: 0.5 }] })), 'a repeated label');
  assert.throws(() => parseTutorDiagram(stacked({ total: 0 })), 'total must be positive');
  const nine = Array.from({ length: 9 }, (_, i) => ({ label: `P${i}`, value: 1 }));
  assert.throws(() => parseTutorDiagram(stacked({ bars: nine, total: 9 })), 'nine parts');
});

test('a total belongs only to one stacked bar, and the series form is unchanged', () => {
  const basic = { version: 1, diagram: { kind: 'bar-chart', title: 'Loans', unit: 'books', bars: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }], total: 3 } };
  assert.throws(() => parseTutorDiagram(basic), 'a total on a basic chart');
  const series = { version: 1, diagram: { kind: 'bar-chart', variant: 'stacked', title: 'Mix', unit: 'books', categories: ['Mon', 'Tue'],
    series: [{ label: 'New', values: [1, 2] }, { label: 'Old', values: [2, 1] }], total: 3 } };
  assert.throws(() => parseTutorDiagram(series), 'a total on category series');
  delete series.diagram.total;
  assert.doesNotThrow(() => parseTutorDiagram(series));
  series.diagram.bars = [{ label: 'A', value: 1 }, { label: 'B', value: 2 }];
  assert.throws(() => parseTutorDiagram(series), 'bars beside categories and series');
  assert.throws(() => parseTutorDiagram({ version: 1, diagram: { kind: 'bar-chart', variant: 'grouped', title: 'G', unit: 'x', bars: basic.diagram.bars } }), 'grouped with bars');
});

test('the bar height is the stated total: parts keep their share of it, in order, and fill the bar', () => {
  const found = parts(svg(stacked()));
  assert.deepEqual(found.map(part => part.value), [0.66, 0.24, 0.1]);
  const whole = found.reduce((all, part) => all + part.height, 0);
  assert.ok(Math.abs(whole - 200) < 0.01, `total height ${whole}`);
  assert.ok(Math.abs(found[0].height / whole - 0.66) < 1e-6 && Math.abs(found[2].height / whole - 0.1) < 1e-6);
  assert.ok(found[0].y < found[1].y && found[1].y < found[2].y, 'first part on top');
});

test('each part is labelled beside it, labels never overlap, and every width renders cleanly', () => {
  for (const width of [320, 408, 720]) {
    const { element, width: drawn, height } = renderTutorDiagram(stacked(), width);
    const markup = renderToStaticMarkup(element);
    assert.ok(drawn >= width && height > 0);
    for (const text of ['Class 0: 0.66', 'Class 1: 0.24', 'Class 2: 0.10', 'Whole bar: 1 probability']) assert.ok(markup.includes(text), `${text} at ${width}`);
    assert.doesNotMatch(markup, /NaN|Infinity|undefined/);
  }
  const ys = [...svg(stacked()).matchAll(/<text[^>]*y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?Class \d/g)].map(m => Number(m[1]));
  assert.equal(ys.length, 3);
  assert.ok(ys[1] - ys[0] >= 14 && ys[2] - ys[1] >= 14, `labels apart: ${ys}`);
});

test('a stacked bar describes its parts and counts its words once', () => {
  const spec = parseTutorDiagram(stacked());
  assert.match(describeTutorDiagram(spec), /One stacked bar \(probability\), total 1: Class 0 0\.66; Class 1 0\.24; Class 2 0\.1/);
  const words = tutorDiagramVisibleText(spec);
  assert.deepEqual(words.filter(word => /^Class/.test(word)), ['Class 0', 'Class 1', 'Class 2']);
});
