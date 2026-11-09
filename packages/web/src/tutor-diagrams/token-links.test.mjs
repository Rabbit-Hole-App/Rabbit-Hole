import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { createTokenLinksShape, validateTokenLinks, tokenLinksText, describeTokenLinks } from './token-links-spec.js';
import { layoutTokenLinks, tokenLinksNaturalWidth } from './token-links-layout.js';
import { tokenLinksReferences } from './illustration-token-links-reference.js';

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
