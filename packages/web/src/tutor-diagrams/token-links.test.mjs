import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { createTokenLinksShape, validateTokenLinks, tokenLinksText, describeTokenLinks } from './token-links-spec.js';
import { layoutTokenLinks, tokenLinksNaturalWidth } from './token-links-layout.js';
import { tokenLinksReferences } from './illustration-token-links-reference.js';
import { layouts } from './layouts.js';
import { tutorDiagramSchema } from './spec.js';

const text = limit => z.string().min(1).max(limit);
const schema = createTokenLinksShape({ z, titled: { title: text(90), caption: text(140).optional() }, text, numeric: z.number() })
  .superRefine((diagram, ctx) => validateTokenLinks(diagram, (path, message) => ctx.addIssue({ code: 'custom', path, message })));

const repeated = {
  kind: 'token-links', title: 'Weights by token position', normalized: true,
  source: ['the', 'cat', 'the'], target: ['the', 'the', 'cat', 'sat'],
  queries: [{ index: 0, weights: [0, 0.1, 0.3, 0.6] }, { index: 2, weights: [0.4, 0.4, 0.2, 0] }],
};

const render = (diagram, width) => {
  const layout = layoutTokenLinks(schema.parse(diagram), width);
  return renderToStaticMarkup(createElement('svg', { width: layout.width, height: layout.height }, ...layout.elements));
};

test('token links accept bounded, position-indexed tokens and reject ambiguous or invalid links', () => {
  assert.deepEqual(schema.parse(repeated), repeated);
  for (const invalid of [
    { ...repeated, extra: 'unsupported' },
    { ...repeated, source: ['the'] },
    { ...repeated, target: Array(9).fill('the') },
    { ...repeated, source: ['x'.repeat(25), 'cat'] },
    { ...repeated, queries: [] },
    { ...repeated, queries: Array(4).fill(repeated.queries[0]) },
    { ...repeated, queries: [{ index: 3, weights: [0, 0.1, 0.3, 0.6] }] },
    { ...repeated, queries: [{ index: 0.5, weights: [0, 0.1, 0.3, 0.6] }] },
    { ...repeated, queries: [repeated.queries[0], repeated.queries[0]] },
    { ...repeated, queries: [{ index: 0, weights: [0, 0.1, 0.9] }] },
    { ...repeated, queries: [{ index: 0, weights: [-0.1, 0, 0.6, 0.5] }] },
    { ...repeated, queries: [{ index: 0, weights: [0, 0, 0, 1.01] }] },
    { ...repeated, queries: [{ index: 0, weights: [0, 0, 0, 1], extra: true }] },
  ]) assert.equal(schema.safeParse(invalid).success, false, JSON.stringify(invalid));
});

test('normalization includes both tolerance boundaries and permits arbitrary valid weights when unset', () => {
  const spec = (weights, normalized) => ({ ...repeated, normalized, queries: [{ index: 0, weights }] });
  for (const weights of [[0.49, 0.49, 0, 0], [0.51, 0.51, 0, 0], [0.06, 0.57, 0.35, 0], [0.01, 0.34, 0.56, 0.11]]) {
    assert.ok(schema.safeParse(spec(weights, true)).success, weights.join(', '));
  }
  for (const weights of [[0.49, 0.4899, 0, 0], [0.51, 0.5101, 0, 0], [0, 0, 0, 0]]) {
    assert.equal(schema.safeParse(spec(weights, true)).success, false, weights.join(', '));
    assert.ok(schema.safeParse(spec(weights)).success);
    assert.ok(schema.safeParse(spec(weights, false)).success);
  }
});

test('each query has a separate panel, ordered weights, exact arrow endpoints and strongest labels', () => {
  const { elements } = layoutTokenLinks(schema.parse(repeated), 408);
  const panels = elements.filter(element => 'data-tutor-token-panel' in element.props);
  assert.deepEqual(panels.map(panel => panel.props['data-tutor-token-panel']), [0, 2]);
  assert.notEqual(panels[0].props.transform, panels[1].props.transform);
  const first = panels[0].props.children;
  const arrows = first.filter(element => element && 'data-tutor-token-link' in element.props);
  const boxes = new Map(first.filter(element => element && 'data-tutor-token' in element.props)
    .map(element => [element.props['data-tutor-token'], element.props.children[0].props]));
  assert.deepEqual(arrows.map(arrow => arrow.props['data-tutor-token-link']), ['0:0', '0:1', '0:2', '0:3']);
  assert.ok(boxes.get('target:0').x < boxes.get('target:1').x, 'Identical target text retains two positions');
  let previousWidth = 0;
  let previousOpacity = 0;
  const center = box => box.x + box.width / 2;
  for (const arrow of arrows) {
    const [, wire, tip] = arrow.props.children;
    assert.ok(wire.props.strokeWidth > previousWidth);
    assert.ok(arrow.props.opacity > previousOpacity);
    previousWidth = wire.props.strokeWidth;
    previousOpacity = arrow.props.opacity;
    const target = boxes.get(`target:${arrow.props['data-tutor-token-link'].split(':')[1]}`);
    const source = boxes.get('source:0');
    const [from, to] = wire.props.points.split(' ').map(pair => pair.split(',').map(Number));
    assert.equal(wire.props.points.split(' ').length, 2);
    assert.equal(from[0], center(source));
    assert.ok(from[1] >= source.y + source.height);
    assert.equal(to[0], center(target));
    assert.ok(to[1] <= target.y && to[1] > from[1]);
    assert.equal(tip.props.points.split(' ')[0], to.join(','));
  }
  const svg = render(repeated, 408);
  assert.match(svg, /data-tutor-token-largest-weight="0\.6"/);
  assert.match(svg, /Equal largest weights at targets 1, 2/);
  assert.match(svg, /data-tutor-token-link="2:0"/);
  assert.match(svg, /data-tutor-token-link="0:0" data-tutor-token-weight="0"/);
  const zero = render({ ...repeated, normalized: false, queries: [{ index: 0, weights: [0, 0, 0, 0] }] }, 408);
  assert.match(zero, /All weights are 0/);
  assert.equal((zero.match(/data-tutor-token-link=/g) ?? []).length, 4);
  assert.doesNotMatch(zero, /data-tutor-token-largest-weight=/);
});

test('the attention reference keeps exact positions, an exact unit sum and the cat as the strongest link', () => {
  assert.equal(tokenLinksReferences.length, 1);
  const [reference] = tokenLinksReferences;
  assert.equal(reference.id, 'ml-self-attention-token-links');
  assert.deepEqual(lintDiagramContent(reference.spec), []);
  const diagram = schema.parse(reference.spec.diagram);
  assert.deepEqual(diagram.source, ['the', 'cat', 'sat', 'on', 'the', 'mat']);
  assert.deepEqual(diagram.target, diagram.source);
  const [{ index, weights }] = diagram.queries;
  assert.equal(index, 2);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 1);
  assert.equal(weights.indexOf(Math.max(...weights)), 1);
  assert.equal(diagram.normalized, true);
  assert.deepEqual(tokenLinksText(diagram), [diagram.title, diagram.caption, ...diagram.source, ...diagram.target]);
  const accessible = describeTokenLinks(diagram).join('\n');
  assert.match(accessible, /sat.*source position 3/);
  assert.match(accessible, /the.*target position 1.*the.*target position 5/);
  assert.match(accessible, /cat.*target position 2.*0\.45/);
});

test('natural token widths keep the full rows and bound long labels at 960 px', () => {
  const [{ spec: { diagram } }] = tokenLinksReferences;
  const long = { ...repeated, source: Array(8).fill('W'.repeat(24)), target: Array(8).fill('W'.repeat(24)),
    queries: [{ index: 7, weights: [0.2, 0, 0.3, 0, 0.4, 0, 0.1, 0] }] };
  const natural = tokenLinksNaturalWidth(diagram);
  assert.ok(natural > 408 && natural < 960);
  assert.equal(tokenLinksNaturalWidth(long), 960);
  for (const specimen of [diagram, long]) for (const width of [408, tokenLinksNaturalWidth(specimen), 960]) {
    const svg = render(specimen, width);
    assert.equal(svg, render(specimen, width));
    assert.match(svg, new RegExp(`^<svg width="${Math.max(width, tokenLinksNaturalWidth(specimen))}"`));
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
  }
  const atCap = layoutTokenLinks(long, 1200);
  assert.equal(atCap.width, 960);
  const tokens = atCap.elements[0].props.children.filter(element => element?.props['data-tutor-token']);
  const target = tokens.filter(element => element?.props['data-tutor-token'].startsWith('target:'));
  assert.equal(target.length, 8);
  const boxes = target.map(element => element.props.children[0].props);
  assert.ok(boxes.every((box, index) => box.x >= 0 && box.x + box.width <= 960 &&
    (index === 0 || boxes[index - 1].x + boxes[index - 1].width < box.x)));
});

function sixTokenComparison() {
  const [{ spec: { diagram } }] = tokenLinksReferences;
  const { caption, ...head } = diagram;
  return { kind: 'comparison', title: 'Two attention heads', variant: 'panels', panels: [
    { heading: 'Head A', diagram: { ...head, title: 'Head A' } },
    { heading: 'Head B', diagram: { ...head, title: 'Head B', queries: [{ index: 2, weights: [0.4, 0.15, 0.2, 0.1, 0.05, 0.1] }] } },
  ] };
}

const comparisonChildren = scene => scene.elements.filter(element => 'data-tutor-composition-child' in element.props);
const translation = child => child.props.transform.match(/translate\(([-.\d]+) ([-.\d]+)\)/).slice(1).map(Number);
const tokensInChild = child => [child.props.children].flat()[0].props.children.filter(element => element?.props['data-tutor-token']);

test('six-token head panels fit in a row from 912 px and keep at least 56 px token boxes', () => {
  const comparison = sixTokenComparison();
  for (const width of [408, 911, 912, 959, 960]) {
    const scene = layouts.comparison(comparison, width);
    const children = comparisonChildren(scene);
    assert.equal(children.length, 2);
    const [[x1, y1], [x2, y2]] = children.map(translation);
    if (width < 912) {
      assert.equal(x1, x2);
      assert.ok(y2 > y1);
    } else {
      assert.equal(y1, y2, `${width}px keeps the heads side by side`);
      assert.ok(x2 > x1);
      assert.ok(scene.width <= width);
    }
    for (const child of children) {
      const tokens = tokensInChild(child);
      assert.equal(tokens.length, 12);
      assert.ok(tokens.every(token => token.props.children[0].props.width >= 56));
    }
  }
  assert.equal(tokenLinksNaturalWidth(comparison.panels[0].diagram, { compact: true }), 434);
});

test('compact head panels wrap long labels at the native font size', () => {
  const comparison = sixTokenComparison();
  comparison.panels[0].diagram.target = ['long text here', ...comparison.panels[0].diagram.target.slice(1)];
  const [first, second] = comparisonChildren(layouts.comparison(comparison, 960));
  assert.equal(translation(first)[1], translation(second)[1]);
  const token = tokensInChild(first).find(element => element.props['data-tutor-token'] === 'target:0');
  const name = token.props.children[1];
  assert.equal(name.type, 'text');
  assert.equal(name.props.fontSize, 14);
  assert.ok(name.props.children.length > 1);
  assert.equal(name.props.children.map(span => span.props.children).join(' '), 'long text here');
});

test('token link children retain normalization validation inside a comparison', () => {
  const comparison = sixTokenComparison();
  assert.ok(tutorDiagramSchema.safeParse({ version: 1, diagram: comparison }).success);
  comparison.panels[1].diagram.queries[0].weights[0] = 0;
  const invalid = tutorDiagramSchema.safeParse({ version: 1, diagram: comparison });
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.some(issue => issue.path.join('.') === 'diagram.panels.1.diagram.queries.0.weights'));
});
