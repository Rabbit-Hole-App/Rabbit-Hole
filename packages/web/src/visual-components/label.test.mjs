import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../animation-scene.js';
import { compileVisual } from './compile.js';
import { plainLabel, wrapLabel } from './label.js';

const spec = (components, extra = {}) => ({ version: 1, id: 'labels', title: 'Labels', components, presentation: { mode: 'static' }, ...extra });
const mod = (id, label, extra = {}) => ({ id, component: 'module', version: 1, params: { label }, ...extra });
const math = tex => ({ kind: 'math', tex });
const text = value => ({ kind: 'text', text: value });
const withRuns = compiled => compiled.scene.objects.filter(object => object.initialState.runs);

test('the pendulum regression: a real pi and radical, typed as math, not text that looks like it', () => {
  const law = { runs: [text('Period depends on the square root of length: '), math('T = 2\\pi\\sqrt{L/g}')] };
  const compiled = compileVisual(spec([{ id: 'law', component: 'callout', version: 1, params: { text: law } }]));
  const lines = withRuns(compiled);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].initialState.runs.at(-1), math('T = 2\\pi\\sqrt{L/g}'));
  assert.match(lines[0].initialState.text, /T = 2π√\(?L\/g\)?/, 'the plain fallback reads the formula, for search and accessibility');
  assert.ok(validateScene(structuredClone(compiled.scene)));
  assert.deepEqual(compiled.diagnostics, []);
});

test('fractions, subscripts, superscripts and mixed labels compile in every label-bearing component', () => {
  const compiled = compileVisual(spec([
    { id: 's', component: 'section', version: 1, params: { title: { runs: [text('Softmax over '), math('x_i')] } } },
    mod('ratio', { runs: [math('\\frac{a}{b}')] }, { parent: 's' }),
    { id: 'f', component: 'flow', version: 1, parent: 's', params: { steps: [{ label: { runs: [text('score '), math('q \\cdot k^{T}')] } }, 'normalise'] } },
    { id: 'key', component: 'legend', version: 1, params: { entries: [{ label: { runs: [math('e^{i\\pi}'), text(' Euler')] }, role: 'input' }] } },
    mod('out', 'Output'),
  ], { connections: [{ from: 'ratio.bottom', to: 'out.top', label: { runs: [text('scaled by '), math('\\sqrt{d_k}')] } }] }));
  const tex = withRuns(compiled).flatMap(object => object.initialState.runs.filter(run => run.kind === 'math').map(run => run.tex));
  assert.deepEqual(tex.sort(), ['\\frac{a}{b}', '\\sqrt{d_k}', 'e^{i\\pi}', 'q \\cdot k^{T}', 'x_i'].sort());
  assert.ok(compiled.scene.objects.find(object => object.id === 'link0-label').initialState.runs);
  assert.ok(validateScene(structuredClone(compiled.scene)));
});

test('code and non-Latin prose stay text; a string that looks like maths is never converted', () => {
  for (const value of ['def period(L, g): return 2 * math.pi * math.sqrt(L / g)', 'T = 2*pi*sqrt(L/g)', '周期は長さの平方根に比例する', 'x^2 + y_1']) {
    const compiled = compileVisual(spec([mod('a', value, { hints: { maxWidth: 640 } })]));
    assert.deepEqual(withRuns(compiled), [], value);
    assert.equal(compiled.scene.objects.map(object => object.initialState.label ?? object.initialState.text).filter(Boolean).join(' '), value);
  }
});

test('a formula KaTeX cannot typeset is refused, not drawn as raw syntax', () => {
  assert.throws(() => compileVisual(spec([mod('a', { runs: [math('\\frac{a}{')] })])), /cannot be typeset/);
  assert.throws(() => compileVisual(spec([mod('a', { runs: [math('\\href{https://x}{y}')] })])), /unsupported LaTeX/);
});

test('wrapping keeps every word and never splits a formula', () => {
  const label = { runs: [text('When the string is four times longer the swing takes twice as long because '), math('T \\propto \\sqrt{L}'), text(' and nothing else about the bob matters here')] };
  const lines = wrapLabel(label, 200);
  assert.ok(lines.length > 2);
  assert.equal(lines.filter(line => line.runs?.some(run => run.tex === 'T \\propto \\sqrt{L}')).length, 1);
  assert.equal(lines.map(line => line.plain).join(' ').replace(/\s+/g, ' '), plainLabel(label).replace(/\s+/g, ' ').trim());
  for (const line of lines) assert.ok(!line.runs || line.runs.length <= 16);
  assert.throws(() => wrapLabel({ runs: [math('a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p')] }, 80), /wider than its 80px line/);
});

test('a math line in a wrapped box carries its runs; plain lines carry none', () => {
  const label = { runs: [text('A long module description that will need several lines before the formula '), math('\\sum_i w_i x_i'), text(' closes it.')] };
  const compiled = compileVisual(spec([mod('m', label)]));
  const lines = compiled.scene.objects.filter(object => object.type === 'text');
  assert.ok(lines.length > 1);
  assert.equal(lines.filter(line => line.initialState.runs).length, 1);
  assert.deepEqual(compiled.diagnostics, []);
});

test('a wrapped line holding math gets extra height so a radical clears the line above', () => {
  const label = { runs: [text('Period depends on the square root of length: '), math('T = 2\\pi\\sqrt{L/g}')] };
  const compiled = compileVisual(spec([{ id: 'law', component: 'callout', version: 1, params: { text: label } }]));
  const [first, second] = compiled.scene.objects.filter(object => object.type === 'text').map(object => object.initialState.y);
  const plain = compileVisual(spec([{ id: 'law', component: 'callout', version: 1, params: { text: 'Period depends on the square root of length: and a second line of text' } }]));
  const [a, b] = plain.scene.objects.filter(object => object.type === 'text').map(object => object.initialState.y);
  assert.ok(second - first > b - a, `${second - first} > ${b - a}`);
});
