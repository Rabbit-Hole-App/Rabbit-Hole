import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch3a-correlation-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const referenceSpec = () => {
  const reference = references.find(item => item.id === 'ml-acf-vs-pacf');
  assert.ok(reference, 'The worked ACF and PACF comparison is available');
  return reference.spec;
};

test('the same AR(1) has a decaying population ACF and a population PACF that cuts off after lag one', () => {
  const diagram = parseTutorDiagram(referenceSpec()).diagram;
  const [acf, pacf] = diagram.panels.map(panel => panel.diagram);
  assert.deepEqual(diagram.sharedAxes, ['x', 'y']);
  assert.deepEqual(acf.x, pacf.x);
  assert.deepEqual(acf.y, pacf.y);

  const lagValues = plot => plot.series[0].points.map(({ x, y }) => [x, y]);
  assert.deepEqual(lagValues(acf), [[1, 0.6], [2, 0.36], [3, 0.216], [4, 0.1296]]);
  assert.deepEqual(lagValues(pacf), [[1, 0.6], [2, 0], [3, 0], [4, 0]]);
  const [rho1, rho2] = acf.series[0].points.map(point => point.y);
  assert.equal((rho2 - rho1 ** 2) / (1 - rho1 ** 2), pacf.series[0].points[1].y);
});

test('saved plots preserve matching frames, visible zero markers and the worked lag-two formula', () => {
  const spec = referenceSpec();
  const saved = JSON.stringify(spec);
  assert.deepEqual(parseTutorDiagram(saved), spec);

  for (const width of [320, 408, 720]) {
    const rendered = renderTutorDiagram(saved, width);
    const svg = renderToStaticMarkup(rendered.element);
    assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
    assert.match(svg, /<tspan [^>]*>Population ACF<\/tspan>/);
    assert.match(svg, /<tspan [^>]*>Population PACF<\/tspan>/);
    assert.match(svg, /white-noise innovations/);
    assert.ok(svg.includes(String.raw`data-tutor-tex="$X_t=0.6X_{t-1}+\varepsilon_t$"`));
    assert.ok(svg.includes(String.raw`data-tutor-tex="$\frac{0.36-0.6^2}{1-0.6^2}=0$"`));

    const areas = svg.match(/<rect [^>]*data-tutor-plot-area=""[^>]*>/g);
    assert.equal(areas?.length, 2);
    assert.equal(areas[0], areas[1], 'Both panels have the same plot geometry');
    assert.equal(svg.match(/data-tutor-plot-stem=/g)?.length, 8);
    for (const lag of [2, 3, 4]) {
      const stem = svg.match(new RegExp(`<line [^>]*data-tutor-plot-stem="${lag},0"[^>]*>`))?.[0];
      const mark = svg.match(new RegExp(`<circle [^>]*data-tutor-coordinate-point="${lag},0"[^>]*>`))?.[0];
      assert.ok(stem && mark, `Lag ${lag} has a visible zero marker at ${width}px`);
      assert.ok(Number(mark.match(/\br="([^"]+)"/)?.[1]) > 0);
      assert.equal(mark.match(/\bcy="([^"]+)"/)?.[1], stem.match(/\by1="([^"]+)"/)?.[1]);
    }
  }
});
