import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DOMParser } from 'linkedom';
import { references } from './ml-batch1-svm-references.js';
import { parseTutorDiagram, describeTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { textWidth } from './primitives.js';
import { TEACHING, TEACHING_SERIES } from './teaching-theme.js';

const get = id => references.find(reference => reference.id === id);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${message}: expected ${expected}, received ${actual}`);
const samples = diagram => diagram.series.flatMap(series => series.points.map(point => ({
  ...point, classLabel: series.label.match(/^Class ([AB]|−1|\+1)/)?.[1],
})));
const labelled = diagram => samples(diagram).map(point => ({
  ...point, target: point.classLabel === '−1' ? -1 : point.classLabel === '+1' ? 1 : NaN,
}));
const hingeSum = (points, w, b = 0) => points.reduce((sum, p) => sum + Math.max(0, 1 - p.target * (w * p.x + b)), 0);
const objective = (points, C, w) => 0.5 * w * w + C * hingeSum(points, w);

// Independently minimize the piecewise quadratic over every hinge interval,
// including negative weights. This reads the example's actual x/class pairs.
function exactMinimizer(points, C) {
  const slopes = points.map(p => p.target * p.x);
  const knots = [...new Set(slopes.filter(Boolean).map(a => 1 / a))].sort((a, b) => a - b);
  const bounds = [-Infinity, ...knots, Infinity];
  const candidates = [...knots];
  for (let i = 1; i < bounds.length; i++) {
    const [lo, hi] = [bounds[i - 1], bounds[i]];
    const probe = !Number.isFinite(lo) ? hi - 1 : !Number.isFinite(hi) ? lo + 1 : (lo + hi) / 2;
    const stationary = C * slopes.filter(a => 1 - a * probe > 0).reduce((sum, a) => sum + a, 0);
    if (stationary >= lo && stationary <= hi) candidates.push(stationary);
  }
  return candidates.reduce((best, w) => objective(points, C, w) < objective(points, C, best) ? w : best);
}

test('the two lesson-05 references round-trip through the production semantic schema', () => {
  assert.deepEqual(references.map(r => r.id).sort(), ['ml-svm-c-tradeoff', 'ml-svm-feature-map']);
  for (const reference of references) {
    assert.deepEqual(reference.lessons, ['05']);
    assert.ok(reference.prompts.some(prompt => prompt.endsWith('?')));
    assert.ok(reference.keywords.length && reference.useWhen);
    const parsed = parseTutorDiagram(reference.spec);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(parsed)), parsed);
    assert.ok(JSON.stringify(parsed).length < 16384);
    assert.ok(tutorDiagramVisibleText(parsed).includes(parsed.diagram.title));
    assert.ok(describeTutorDiagram(parsed).includes(parsed.diagram.title));
  }
});

test('C panels depict global soft-margin optima and the same two classification errors', () => {
  const diagram = get('ml-svm-c-tradeoff').spec.diagram;
  assert.equal(diagram.kind, 'comparison');
  assert.equal(diagram.variant, 'panels');
  assert.deepEqual(diagram.sharedAxes, ['x', 'y']);
  const plots = diagram.panels.map(panel => panel.diagram);
  assert.deepEqual(plots[0].x, plots[1].x);
  assert.deepEqual(plots[0].y, plots[1].y);
  assert.deepEqual([plots[0].x.min, plots[0].x.max], [-5, 5]);
  assert.deepEqual(labelled(plots[0]), labelled(plots[1]));
  const points = labelled(plots[0]);
  assert.deepEqual(points.map(p => [p.x, p.target]).sort((a, b) => a[0] - b[0]),
    [[-2, -1], [-1, -1], [-0.5, 1], [0.5, -1], [1, 1], [2, 1]]);
  assert.ok(points.every(p => p.y === 0));
  // Each (x,y) has (-x,-y). Convex paired hinges are minimized at b = 0
  // for every w, so minimizing the b=0 objective also gives a global optimum.
  assert.ok(points.every(p => points.some(q => q.x === -p.x && q.target === -p.target)));
  const results = diagram.panels.map(({ heading, diagram: plot }) => {
    const C = Number(heading.match(/C = ([\d.]+)/)?.[1]);
    assert.ok(C > 0);
    const lines = plot.annotations.filter(a => a.kind === 'reference-line').sort((a, b) => a.value - b.value);
    assert.equal(lines.length, 3);
    assert.ok(lines.every(a => a.axis === 'x'));
    const [negative, boundary, positive] = lines.map(line => line.value);
    close(boundary, 0, 'shared decision boundary');
    close(positive - boundary, boundary - negative, 'symmetric margin lines');
    const w = 1 / (positive - boundary);
    const b = -w * boundary;
    close(w, exactMinimizer(points, C), `global minimizer for C=${C}`);
    close(Number(plot.caption.match(/w = (\d+(?:\.\d+)?)/)?.[1]), w, 'displayed weight');
    close(Number(plot.caption.match(/b = (\d+(?:\.\d+)?)/)?.[1]), b, 'displayed intercept');
    close(w * negative + b, -1, 'negative margin score');
    close(w * positive + b, 1, 'positive margin score');
    close(b, 0, 'intercept');
    const mistakes = points.filter(p => p.target * (w * p.x + b) < 0).length;
    assert.equal(mistakes, 2, 'a narrower margin does not promise fewer classification errors');
    const loss = hingeSum(points, w, b);
    close(Number(plot.caption.match(/Hinge sum \$([\d.]+)\$/)?.[1]), loss, 'displayed hinge sum');
    close(Number(plot.caption.match(/objective \$([\d.]+)\$/)?.[1]), objective(points, C, w), 'displayed objective');
    return { C, w, margin: positive - negative, loss };
  }).sort((a, b) => a.C - b.C);
  assert.deepEqual(results.map(r => [r.C, r.w, r.margin, r.loss]), [[0.05, 0.25, 8, 4.75], [2, 1, 2, 3]]);
});

test('the quadratic feature map preserves classes and IDs while making a linear separator possible', () => {
  const diagram = get('ml-svm-feature-map').spec.diagram;
  assert.equal(diagram.kind, 'transformation');
  assert.equal(diagram.variant, 'visual');
  assert.equal(diagram.identity.mode, 'preserved');
  const before = samples(diagram.before.diagram).sort((a, b) => a.x - b.x);
  const after = samples(diagram.after.diagram);
  assert.deepEqual(before.map(p => [p.x, p.y, p.classLabel]), [[-2, 0, 'A'], [-1, 0, 'B'], [1, 0, 'B'], [2, 0, 'A']]);
  assert.equal(new Set(before.map(p => p.id)).size, 4);
  assert.deepEqual(after.map(p => p.id).sort(), before.map(p => p.id).sort());
  for (const p of before) {
    const mapped = after.find(q => q.id === p.id);
    assert.equal(mapped.classLabel, p.classLabel);
    close(mapped.x, p.x, `${p.id}: first coordinate`);
    close(mapped.y, p.x ** 2, `${p.id}: squared coordinate`);
  }
  const thresholds = [-Infinity, ...before.slice(1).map((p, i) => (p.x + before[i].x) / 2), Infinity];
  for (const threshold of thresholds) for (const greaterClass of ['A', 'B']) {
    assert.ok(before.some(p => (p.x > threshold ? greaterClass : greaterClass === 'A' ? 'B' : 'A') !== p.classLabel),
      'no raw-x threshold in either direction separates A, B, B, A');
  }
  const separator = diagram.after.diagram.annotations.find(a => a.kind === 'reference-line');
  assert.equal(separator.axis, 'y');
  const low = Math.max(...after.filter(p => p.classLabel === 'B').map(p => p.y));
  const high = Math.min(...after.filter(p => p.classLabel === 'A').map(p => p.y));
  close(separator.value, (low + high) / 2, 'mid-gap feature-space separator');
  assert.equal(separator.value, 2.5);
  assert.ok(after.every(p => (p.y > separator.value ? 'A' : 'B') === p.classLabel));
});

test('production validation catches broken shared axes, lost identities and out-of-range mapped values', () => {
  const comparison = structuredClone(get('ml-svm-c-tradeoff').spec);
  comparison.diagram.panels[1].diagram.x.max += 1;
  assert.throws(() => parseTutorDiagram(comparison), /Shared axes/);
  const lost = structuredClone(get('ml-svm-feature-map').spec);
  lost.diagram.after.diagram.series[0].points[0].id = 'unknown';
  assert.throws(() => parseTutorDiagram(lost), /same input and output IDs/);
  const outOfRange = structuredClone(get('ml-svm-feature-map').spec);
  outOfRange.diagram.after.diagram.series[0].points[0].y = 6;
  assert.throws(() => parseTutorDiagram(outOfRange), /bounds/);
});

function translation(node) {
  const transform = node.getAttribute('transform');
  if (!transform) return [0, 0];
  assert.match(transform, /^translate\([-\d.]+ [-\d.]+\)$/);
  return transform.match(/[-\d.]+/g).map(Number);
}
function offset(node) {
  const result = [0, 0];
  for (let current = node; current?.getAttribute; current = current.parentNode) {
    const [x, y] = translation(current);
    result[0] += x; result[1] += y;
  }
  return result;
}
function assertRenderedGeometry(svg, plots) {
  const children = [...svg.querySelectorAll('[data-tutor-composition-child]')];
  assert.equal(children.length, plots.length);
  for (const [i, child] of children.entries()) {
    const plot = plots[i];
    const area = child.querySelector('[data-tutor-plot-area]');
    const left = Number(area.getAttribute('x')), top = Number(area.getAttribute('y'));
    const width = Number(area.getAttribute('width')), height = Number(area.getAttribute('height'));
    const x = value => left + (value - plot.x.min) / (plot.x.max - plot.x.min) * width;
    const y = value => top + height - (value - plot.y.min) / (plot.y.max - plot.y.min) * height;
    const marks = [...child.querySelectorAll('[data-tutor-coordinate-point]')];
    assert.equal(marks.length, samples(plot).length);
    for (const p of samples(plot)) {
      const mark = marks.find(node => node.getAttribute('data-tutor-sample-id') === p.id);
      assert.ok(mark, p.id);
      const cx = mark.tagName === 'circle' ? Number(mark.getAttribute('cx')) : Number(mark.getAttribute('x')) + Number(mark.getAttribute('width')) / 2;
      const cy = mark.tagName === 'circle' ? Number(mark.getAttribute('cy')) : Number(mark.getAttribute('y')) + Number(mark.getAttribute('height')) / 2;
      close(cx, x(p.x), `${p.id}: rendered x`);
      close(cy, y(p.y), `${p.id}: rendered y`);
      assert.ok(TEACHING_SERIES.includes(mark.getAttribute('fill')));
    }
    for (const annotation of plot.annotations ?? []) {
      const mark = child.querySelector(`[data-tutor-plot-reference="${annotation.axis}:${annotation.value}"]`);
      assert.ok(mark, annotation.label);
      if (annotation.axis === 'x') {
        close(Number(mark.getAttribute('x1')), x(annotation.value), annotation.label);
        close(Number(mark.getAttribute('x2')), x(annotation.value), annotation.label);
      } else {
        close(Number(mark.getAttribute('y1')), y(annotation.value), annotation.label);
        close(Number(mark.getAttribute('y2')), y(annotation.value), annotation.label);
      }
    }
  }
}

for (const reference of references) {
  test(`${reference.id}: actual SVG stays bounded and readable at narrow, 440px-card and wide widths`, () => {
    const diagram = reference.spec.diagram;
    const plots = diagram.panels?.map(p => p.diagram) ?? [diagram.before.diagram, diagram.after.diagram];
    for (const available of [320, 440, 720]) {
      const rendered = renderTutorDiagram(reference.spec, available);
      const markup = renderToStaticMarkup(rendered.element);
      const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      assert.equal(markup, renderToStaticMarkup(renderTutorDiagram(JSON.stringify(reference.spec), available).element));
      assert.doesNotMatch(markup, /NaN|Infinity|undefined/);
      assert.equal(svg.getAttribute('role'), 'img');
      assert.equal(svg.getAttribute('viewBox'), `0 0 ${rendered.width} ${rendered.height}`);
      assert.equal(svg.querySelectorAll('svg').length, 0);
      assert.ok(rendered.width <= Math.max(444, available), 'existing 420px plot plus 24px composition padding');
      assert.ok(markup.includes(`--viz-surface:${TEACHING.surface}`));
      assertRenderedGeometry(svg, plots);
      const formulas = [...svg.querySelectorAll('foreignObject')];
      assert.ok(formulas.length > 0, 'authored formulas use the existing KaTeX renderer');
      assert.doesNotMatch(markup, /katex-error/);
      const renderedTex = new Set([...svg.querySelectorAll('[data-tutor-tex]')].map(node => node.getAttribute('data-tutor-tex')));
      for (const label of tutorDiagramVisibleText(reference.spec).filter(Boolean)) {
        for (const [formula] of label.matchAll(/\$[^$]+\$/g)) assert.ok(renderedTex.has(formula), `missing typeset formula: ${formula}`);
      }
      for (const formula of formulas) {
        const [dx, dy] = offset(formula);
        const x = Number(formula.getAttribute('x')) + dx, y = Number(formula.getAttribute('y')) + dy;
        const width = Number(formula.getAttribute('width')), height = Number(formula.getAttribute('height'));
        assert.ok(x >= 0 && x + width <= rendered.width, 'typeset formula stays inside SVG width');
        assert.ok(y >= 0 && y + height <= rendered.height, 'typeset formula stays inside SVG height');
      }
      for (const span of svg.querySelectorAll('tspan')) {
        const text = span.parentNode;
        const size = Number(text.getAttribute('font-size'));
        assert.ok(size >= 12, 'native readable font size');
        const [dx, dy] = offset(span);
        const x = Number(span.getAttribute('x')) + dx, y = Number(span.getAttribute('y')) + dy;
        const width = textWidth(span.textContent, size);
        const anchor = text.getAttribute('text-anchor');
        const left = x - (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0);
        assert.ok(left >= -0.5 && left + width <= rendered.width + 0.5, `text clipped horizontally: ${span.textContent}`);
        assert.ok(y - size >= 0 && y <= rendered.height, `text clipped vertically: ${span.textContent}`);
      }
    }
  });
}
