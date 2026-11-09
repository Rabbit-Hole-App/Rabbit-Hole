import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { monotoneLinePath } from './plot-lines.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function segments(path) {
  const [move, ...curves] = path.split('C');
  let start = move.slice(1).split(',').map(Number);
  return curves.map(curve => {
    const controls = curve.split(' ').map(pair => pair.split(',').map(Number));
    const segment = [start, ...controls];
    start = controls.at(-1);
    return segment;
  });
}

function sampleY(segment, t) {
  const [a, b, c, d] = segment.map(point => point[1]);
  const u = 1 - t;
  return u ** 3 * a + 3 * u ** 2 * t * b + 3 * u * t ** 2 * c + t ** 3 * d;
}

function assertMonotoneBetweenSamples(points, path) {
  const curves = segments(path);
  assert.equal(curves.length, points.length - 1);
  for (const [i, curve] of curves.entries()) {
    assert.deepEqual(curve[0], points[i]);
    assert.deepEqual(curve[3], points[i + 1]);
    const direction = Math.sign(curve[3][1] - curve[0][1]);
    let previous = curve[0][1];
    for (let n = 1; n <= 100; n++) {
      const value = sampleY(curve, n / 100);
      assert.ok(direction * (value - previous) >= -1e-12);
      assert.ok(value >= Math.min(curve[0][1], curve[3][1]) - 1e-12);
      assert.ok(value <= Math.max(curve[0][1], curve[3][1]) + 1e-12);
      previous = value;
    }
  }
}

test('two points form a straight line and vertical or backtracking points keep their order', () => {
  assert.equal(monotoneLinePath([[0, 1], [5, 7]]), 'M0,1L5,7');
  assert.equal(monotoneLinePath([[0, 0], [0, 2], [1, 3]]), 'M0,0L0,2L1,3');
  assert.equal(monotoneLinePath([[0, 0], [2, 2], [1, 3]]), 'M0,0L2,2L1,3');
});

test('unevenly spaced monotone data stay monotone in either x direction', () => {
  const points = [[0, 0], [1, 0.1], [1.1, 0.45], [4, 0.46], [8, 0.9]];
  for (const data of [points, points.toReversed()]) assertMonotoneBetweenSamples(data, monotoneLinePath(data));
});

test('a peaked curve passes through every sample without exceeding the peak', () => {
  const points = [0, 0.1, 0.4, 0.9, 0.7, 0.3, 0].map((y, x) => [x, y]);
  assertMonotoneBetweenSamples(points, monotoneLinePath(points));
});

test('the line stays inside a narrow linear uncertainty band', () => {
  const points = [[0, 0], [1, 0.8], [2, 0.9]];
  const bounds = points.map(([, y]) => [y - 0.001, y + 0.001]);
  const path = monotoneLinePath(points, bounds);
  assertMonotoneBetweenSamples(points, path);
  for (const [i, curve] of segments(path).entries()) {
    for (let n = 0; n <= 100; n++) {
      const t = n / 100;
      const center = points[i][1] * (1 - t) + points[i + 1][1] * t;
      assert.ok(Math.abs(sampleY(curve, t) - center) <= 0.001 + 1e-12);
    }
  }
});

test('basic and Phase 02 plots smooth lines by default and preserve straight segments on opt-out', () => {
  for (const extended of [false, true]) {
    const points = [0, 0.1, 0.4, 0.9, 0.7, 0.3, 0].map((y, x) => ({ x, y,
      ...(extended && x === 3 ? { label: 'Peak' } : {}),
    }));
    const series = { kind: 'line', label: 'Samples', points };
    const spec = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Sampled curve',
      x: { label: 'X', min: 0, max: 6 }, y: { label: 'Y', min: 0, max: 1 }, series: [series],
    } };
    const render = () => renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
    const svg = render();
    assert.match(svg, /<path d="M[^"]+C[^"]+"/);
    assert.deepEqual([...svg.matchAll(/data-tutor-coordinate-point="([^"]+)"/g)].map(match => match[1]),
      extended ? ['0,0', '3,0.9', '6,0'] : ['0,0', '6,0']);
    series.smooth = false;
    const straight = render();
    assert.doesNotMatch(straight, /<path d="M[^"]+C[^"]+"/);
    assert.match(straight, /<polyline points="(?:[\d.,]+ ){6}[\d.,]+"/);
  }
});

test('integer axis ticks show each depth when space allows and reject noninteger bounds', () => {
  const spec = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Depth and error',
    x: { label: 'Depth', min: 1, max: 8, integerTicks: true }, y: { label: 'Error', min: 0, max: 100 },
    series: [{ kind: 'line', label: 'Model', points: [{ x: 1, y: 41 }, { x: 8, y: 15 }] }],
  } };
  const render = () => renderToStaticMarkup(renderTutorDiagram(parseTutorDiagram(spec), 408).element);
  let svg = render();
  for (let depth = 1; depth <= 8; depth++) assert.match(svg, new RegExp(`>${depth}</tspan>`));

  spec.diagram.x.min = 0;
  spec.diagram.x.max = 2;
  spec.diagram.series[0].points[1].x = 2;
  svg = render();
  assert.match(svg, />1<\/tspan>/);
  assert.doesNotMatch(svg, />0\.5<\/tspan>|>1\.5<\/tspan>/);
  spec.diagram.x.max = 2.5;
  assert.throws(() => parseTutorDiagram(spec));
});

test('compact sample grids keep all 25 coordinates while preserving the stored spec', () => {
  const series = { label: 'Samples', kind: 'line',
    samples: { x: { start: 0, step: 1, divisor: 24 }, y: Array.from({ length: 25 }, (_, index) => index), divisor: 24 } };
  const spec = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Compact samples',
    x: { label: 'X', min: 0, max: 1 }, y: { label: 'Y', min: 0, max: 1 }, series: [series],
  } };
  assert.deepEqual(parseTutorDiagram(spec), spec);
  const svg = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
  const [curve] = svg.match(/<path d="M[^"]+C[^"]+"/) ?? [];
  assert.equal(curve?.split('C').length, 25);
  assert.match(svg, /\(0\.5, 0\.5\)/);
});

test('compact steps match explicit coordinates and label only the leaf starts', () => {
  const series = { label: 'Leaf means', kind: 'step',
    samples: { x: [0, 2, 5], y: [125, 500, 500], divisor: 1000, showValues: true } };
  const spec = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Step means',
    x: { label: 'X', min: 0, max: 5 }, y: { label: 'Y', min: 0, max: 1 }, series: [series],
  } };
  const explicit = { ...spec, diagram: { ...spec.diagram, series: [{ label: series.label, kind: series.kind,
    points: [{ x: 0, y: 0.125, label: '0.125' }, { x: 2, y: 0.5, label: '0.5' }, { x: 5, y: 0.5 }],
  }] } };
  const render = diagram => renderToStaticMarkup(renderTutorDiagram(parseTutorDiagram(diagram), 408).element);
  assert.equal(render(spec), render(explicit));
  assert.throws(() => parseTutorDiagram({ ...spec, diagram: { ...spec.diagram,
    series: [{ ...series, points: explicit.diagram.series[0].points }],
  } }));
  for (const x of [[0, 2], [0, 2, 6], [0, 2, 2]]) {
    assert.throws(() => parseTutorDiagram({ ...spec, diagram: { ...spec.diagram,
      series: [{ ...series, samples: { ...series.samples, x } }],
    } }));
  }
});
