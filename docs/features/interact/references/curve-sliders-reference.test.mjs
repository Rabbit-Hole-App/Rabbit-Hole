// Deliverable 1 only. Executes the reference HTML's own JavaScript in Node, without
// a browser, model, network, application build or change to the family pipeline.
// A small document adapter records the real reference script's output and handlers;
// it cannot establish rendered layout, focus behavior or the clone's window fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const depths = ['overview', 'standard', 'deep'];
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const near = (a, b, eps = 1e-10) => assert.ok(Math.abs(a - b) <= eps, `${a} differs from ${b}`);
const script = (html, id) => {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(match, `the reference contains ${id}`);
  return match[1];
};
function load(name) {
  const html = read(`${name}-curve-sliders.html`);
  const Curve = runInNewContext(`${script(html, 'curve-model')}\nCurve;`);
  return { html, Curve };
}
function mount(html) {
  const nodes = new Map();
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    nodes.set(attributes.id, { attributes, value: attributes.value ?? '', textContent: '', innerHTML: '', listeners: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      addEventListener(kind, handler) { this.listeners[kind] = handler; },
    });
  }
  const document = { getElementById: id => nodes.get(id) ?? null };
  const context = { document };
  runInNewContext(`${script(html, 'curve-model')}\n${script(html, 'curve-view')}`, context);
  const change = (id, value) => {
    const node = nodes.get(id); assert.ok(node, id); node.value = String(value);
    node.listeners.input({ target: node });
  };
  return { nodes, change, reset: () => nodes.get('reset').listeners.click() };
}

test('the three required reference files exist before the reviewer gate', () => {
  for (const name of depths) assert.ok(existsSync(new URL(`${name}-curve-sliders.html`, import.meta.url)), `${name} is missing`);
});

for (const name of depths) {
  test(`${name}: the displayed marker and derivative are computed from the logistic`, () => {
    const { Curve } = load(name), p = Curve.defaults(), a = Curve.at(p);
    // At the selected default x=1, k=1, x0=0: e/(1+e).
    // Differentiation gives k*e/(1+e)^2; these are independent closed forms.
    near(a.y, Math.E / (1 + Math.E));
    near(a.slope, Math.E / (1 + Math.E) ** 2);
    near(Curve.y(p.x0, p.k, p.x0), 1 / 2);
    near(Curve.slope(p.x0, p.k, p.x0), p.k / 4);
    const h = 1e-5;
    near(a.slope, (Curve.y(p.xMarker + h, p.k, p.x0) - Curve.y(p.xMarker - h, p.k, p.x0)) / (2 * h), 1e-8);
    near(Curve.y(-p.xMarker, p.k, -p.x0) + a.y, 1);
  });

  test(`${name}: axes enclose the full slider domain, with a stable scale`, () => {
    const { Curve } = load(name), b = Curve.bounds(), x = Curve.domain, r = Curve.ranges;
    // k in [.5,3], x in [-6,6], x0 in [-2,2] gives -k(x-x0) in [-24,24].
    // Brief fixes x0=0, so its corresponding extremal exponent is 18.
    const extent = r.k.max * (x.max + (name === 'overview' ? 0 : r.x0.max));
    near(b.min, 1 / (1 + Math.exp(extent)));
    near(b.max, 1 / (1 + Math.exp(-extent)));
    for (const k of [r.k.min, r.k.default, r.k.max]) for (const x0 of name === 'overview' ? [0] : [r.x0.min, r.x0.default, r.x0.max]) {
      for (let i = 0; i <= 24; i++) {
        const value = Curve.y(x.min + (x.max - x.min) * i / 24, k, x0);
        assert.ok(value >= b.min - 1e-15 && value <= b.max + 1e-15);
        assert.ok(value > 0 && value < 1, 'the bounds are approached, never attained on the admitted finite domain');
      }
    }
    assert.deepEqual(Array.from(Curve.axes.y), [0, 1]);
    assert.equal(Curve.width, 640);
  });

  test(`${name}: plotted samples and marker stay on the same function within sdk-8's point cap`, () => {
    const { Curve } = load(name), r = Curve.ranges;
    for (const k of [r.k.min, r.k.default, r.k.max]) for (const x0 of name === 'overview' ? [0] : [r.x0.min, r.x0.max]) {
      for (const xMarker of name === 'deep' ? [-6, -2, 0, 1, 2, 6] : [1]) {
        const points = Curve.sample({ k, x0, xMarker });
        assert.ok(points.length <= 24 && points.length >= 2);
        assert.equal(points[0].x, Curve.domain.min); assert.equal(points.at(-1).x, Curve.domain.max);
        assert.ok(points.some(p => p.x === xMarker), 'the marker is an actual sample, never floating off a chord');
        for (const p of points) near(p.y, Curve.y(p.x, k, x0));
        if (name !== 'overview') {
          const [a, b] = Curve.tangent({ k, x0, xMarker });
          for (const p of [a, b]) {
            assert.ok(p.x >= Curve.domain.min && p.x <= Curve.domain.max);
            assert.ok(p.y >= Curve.axes.y[0] - 1e-15 && p.y <= Curve.axes.y[1] + 1e-15);
          }
          near((b.y - a.y) / (b.x - a.x), Curve.slope(xMarker, k, x0), 1e-10);
        }
        for (let j = 1; j < points.length; j++) {
          const a = points[j - 1], b = points[j]; assert.ok(a.x < b.x);
          for (const f of [0.25, 0.5, 0.75]) {
            const actual = Curve.y(a.x + (b.x - a.x) * f, k, x0);
            assert.ok(Math.abs(actual - (a.y + (b.y - a.y) * f)) * Curve.plotHeight < 2, 'sampled curve stays within two scene pixels of the analytic curve');
          }
        }
      }
    }
  });

  test(`${name}: real reference handlers update computed values and Reset restores all defaults`, () => {
    const { html, Curve } = load(name), ui = mount(html), initial = ui.nodes.get('objects').innerHTML;
    assert.ok(initial.includes('ball.marker'), 'the script draws the marker');
    assert.ok(initial.includes('0.731'), 'e/(1+e) rounds to the displayed 0.731');
    const changed = { ...Curve.defaults(), k: 2 };
    ui.change('k', changed.k);
    assert.notEqual(ui.nodes.get('objects').innerHTML, initial);
    assert.equal(ui.nodes.get('k-value').textContent, '2.0');
    if (name !== 'overview') { changed.x0 = 1; ui.change('x0', changed.x0); }
    if (name !== 'overview') {
      near(Curve.at(changed).y, 1 / 2);
      near(Curve.at(changed).slope, 2 / 4);
      const svg = ui.nodes.get('objects').innerHTML;
      assert.ok(name === 'standard' ? svg.includes('y = 0.500') : /id="readout.y.value"[^>]*>0.500<\/text>/.test(svg));
      assert.ok(name === 'standard' ? svg.includes('Slope = 0.500') : /id="readout.slope.value"[^>]*>0.500<\/text>/.test(svg));
    }
    if (name === 'deep') {
      changed.xMarker = -1; ui.change('xMarker', changed.xMarker);
      assert.equal(ui.nodes.get('xMarker-value').textContent, '−1.0');
      near(Curve.at(changed).y, 1 / (1 + Math.E ** 4));
    }
    assert.ok(ui.nodes.get('objects').innerHTML.includes(Curve.at(changed).y.toFixed(3)));
    if (name === 'deep') assert.ok(ui.nodes.get('objects').innerHTML.includes(Curve.at(changed).slope.toFixed(3)));
    ui.reset(); assert.equal(ui.nodes.get('objects').innerHTML, initial);
    for (const id of Curve.adjustable) assert.equal(Number(ui.nodes.get(id).value), Curve.ranges[id].default);
  });
}

test('steepness and midpoint have their declared effects across the admitted range', () => {
  const { Curve } = load('deep'), r = Curve.ranges;
  for (const x0 of [r.x0.min, 0, r.x0.max]) {
    assert.ok(Curve.slope(x0, r.k.max, x0) > Curve.slope(x0, r.k.min, x0));
    near(Curve.y(x0, r.k.min, x0), 1 / 2); near(Curve.y(x0, r.k.max, x0), 1 / 2);
  }
  for (const x of [-6, -1, 0, 1, 6]) assert.ok(Curve.y(x, 1, r.x0.max) < Curve.y(x, 1, r.x0.min), 'a right shift lowers y at any fixed x');
});

test('all depths retain the toss font, palette and chrome, with the specified control counts and card order', () => {
  const toss = read('overview-toss-and-drop.html');
  const font = html => html.match(/@font-face\{[^}]+\}/)?.[0];
  const palette = html => html.match(/:root\{[^}]+\}/)?.[0];
  for (const [i, name] of depths.entries()) {
    const { html } = load(name), ui = mount(html);
    assert.equal(font(html), font(toss)); assert.equal(palette(html), palette(toss));
    assert.equal([...html.matchAll(/<input\b[^>]*type="range"/g)].length, i + 1);
    assert.equal([...html.matchAll(/<button\b/g)].length, 1, 'only the existing Reset action');
    assert.ok(ui.nodes.get('scene-description').textContent.length > 80);
    assert.ok(html.indexOf('id="concept"') < html.indexOf('id="instructions"'));
    assert.ok(html.indexOf('id="instructions"') < html.indexOf('id="experiment"'));
    assert.ok(html.indexOf('id="drawing"') < html.indexOf('class="experiment-controls'));
  }
});
