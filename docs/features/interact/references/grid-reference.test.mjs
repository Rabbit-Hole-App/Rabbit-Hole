// Deliverable 1 source QA only. Runs the actual standalone HTML handlers with a
// small document adapter. No browser, app build, deployment or model calls.
// ponytail: visual fit, keyboard/focus and real browser SVG rendering remain unverified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DEPTHS, serializeSubject } from './grid-reference-kit.mjs';
import * as attention from './grid-attention.mjs';
import * as confusion from './grid-confusion-matrix.mjs';
import * as convolution from './grid-convolution.mjs';

const subjects = [['attention', attention], ['confusion-matrix', confusion], ['convolution', convolution]];
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, eps = 1e-11) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} differs from ${expected}`);
const fixed = (value, places = 3) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places).replace('-', '−');
const percent = value => `${(100 * value).toFixed(1)}%`;
const reEscape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const script = (html, id) => {
  const found = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(found, `${id} exists`); return found[1];
};
const textAt = (svg, id) => {
  const found = svg.match(new RegExp(`<text id="${reEscape(id)}"[^>]*>([^<]*)<\\/text>`));
  assert.ok(found, `${id} is rendered`); return found[1];
};
const cellAt = (svg, id) => {
  const found = svg.match(new RegExp(`<g id="${reEscape(id)}"([^>]*)>([\\s\\S]*?)<\\/g>`));
  assert.ok(found, `${id} is rendered`);
  const attrs = Object.fromEntries([...found[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  return { ...attrs, label: textAt(found[2], `${id}.value`), value: Number(attrs['data-value']) };
};
function assertLeaderClearsCells(svg) {
  const leader = svg.match(/<polyline\b[^>]*id="callout.anchor"[^>]*>/)?.[0];
  assert.ok(leader, 'the actual SVG contains a callout leader');
  const points = leader.match(/points="([^"]+)"/)[1].split(' ').map(value => value.split(',').map(Number));
  for (const match of svg.matchAll(/<g id="([^"]+)"[^>]*data-value="[^"]*"[^>]*>([\s\S]*?)<\/g>/g)) {
    const rect = match[2].match(/<rect\b([^>]*)>/)[1];
    const attrs = Object.fromEntries([...rect.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const left = Number(attrs.x), right = left + Number(attrs.width), top = Number(attrs.y), bottom = top + Number(attrs.height);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      assert.ok(a[0] === b[0] || a[1] === b[1], 'the callout uses orthogonal segments');
      const crosses = a[1] === b[1]
        ? a[1] > top && a[1] < bottom && Math.max(a[0], b[0]) > left && Math.min(a[0], b[0]) < right
        : a[0] > left && a[0] < right && Math.max(a[1], b[1]) > top && Math.min(a[1], b[1]) < bottom;
      assert.equal(crosses, false, `callout segment ${i} crosses ${match[1]} interior`);
    }
  }
}
function load(name, subject) {
  const html = read(`${name}-grid-${subject}.html`);
  const model = runInNewContext(`${script(html, 'grid-model')}\n({ Grid, Scene });`);
  return { html, ...model };
}
function mount(html) {
  const nodes = new Map();
  // Initial DOM only; script source is executed below, never treated as markup.
  const markup = html.slice(0, html.indexOf('<script'));
  for (const match of markup.matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    nodes.set(attributes.id, { attributes, value: attributes.value ?? '', textContent: '', innerHTML: '', listeners: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      addEventListener(kind, handler) { this.listeners[kind] = handler; },
    });
  }
  runInNewContext(`${script(html, 'grid-model')}\n${script(html, 'grid-view')}`, { document: { getElementById: id => nodes.get(id) ?? null } });
  const click = id => { const node = nodes.get(id); assert.ok(node?.listeners.click, `${id} has a real click handler`); node.listeners.click(); };
  const change = value => { const node = nodes.get('index'); node.value = String(value); node.listeners.input({ target: node }); };
  return { nodes, change, click, svg: () => nodes.get('objects').innerHTML, reset: () => click('reset') };
}

// Independent, explicit oracles. These do not call the generator's arithmetic.
const tokens = ['the', 'cat', 'sat'];
const queries = [[1, 0], [0, 1], [1, 1]], keys = [[1, 0], [0, 1], [0, 2]];
function expectedAttention(index, temperature) {
  const dots = keys.map(k => queries[index][0] * k[0] + queries[index][1] * k[1]);
  const logits = dots.map(value => value / Math.sqrt(2) / temperature);
  const exponentials = logits.map(Math.exp), sum = exponentials[0] + exponentials[1] + exponentials[2];
  return { dots, logits, weights: exponentials.map(value => value / sum) };
}
const counts = [[7, 2, 1], [1, 4, 1], [0, 2, 6]], classNames = ['Cat', 'Dog', 'Bird'];
const rowTotals = [10, 6, 8], columnTotals = [8, 8, 8];
const image = [[0, 0, 1, 1, 1], [0, 1, 2, 2, 1], [1, 2, 4, 2, 1], [1, 2, 2, 1, 0], [1, 1, 1, 0, 0]];
const meanNumerators = [[11, 15, 15], [15, 18, 15], [15, 15, 11]], edgeOutputs = [[8, 3, -5], [9, 0, -9], [5, -3, -8]];
const kernelCoefficients = { mean: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], edge: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]] };
function expectedConvolution(index, option) {
  const row = Math.floor(index / 3), column = index % 3, divisor = option === 'mean' ? 9 : 1;
  const patch = image.slice(row, row + 3).map(values => values.slice(column, column + 3));
  const numerators = patch.map((values, i) => values.map((value, j) => value * kernelCoefficients[option][i][j]));
  return { row, column, patch, numerators, products: numerators.map(values => values.map(value => value / divisor)), value: option === 'mean' ? meanNumerators[row][column] / 9 : edgeOutputs[row][column] };
}

test('all nine HTML files reproduce exactly from the doc-only generators', () => {
  let count = 0;
  for (const [subject, module] of subjects) for (const [name, depth] of DEPTHS) {
    const scene = module.buildScene(depth);
    assert.equal(read(`${name}-grid-${subject}.html`), serializeSubject(name, scene, module.createModel, module.drawPicture)); count++;
  }
  assert.equal(count, 9);
});

for (const [name, depth] of DEPTHS) {
  test(`${name} attention: independent dot products, normalization and temperature effects`, () => {
    const { Grid } = load(name, 'attention');
    assert.deepEqual(clone(Grid.data.queries), queries); assert.deepEqual(clone(Grid.data.keys), keys);
    assert.deepEqual(clone(Grid.data.tokens), tokens); assert.equal(Grid.dimension, 2);
    for (let index = 0; index < 3; index++) for (const temperature of [1, 2]) {
      const actual = Grid.row(index, temperature), expected = expectedAttention(index, temperature);
      expected.weights.forEach((value, j) => { near(actual.dots[j], expected.dots[j]); near(actual.logits[j], expected.logits[j]); near(actual.weights[j], value); assert.ok(actual.weights[j] > 0); });
      near(actual.sum, 1); assert.ok(Math.max(...Grid.row(index, 2).weights) < Math.max(...Grid.row(index, 1).weights));
    }
    // An all-zero query gives equal scores, hence exactly uniform weights.
    const scene = attention.buildScene(depth); scene.data.queries[0] = [0, 0];
    attention.createModel(scene).row(0, 1).weights.forEach(value => near(value, 1 / 3));
  });

  test(`${name} confusion: cases give the declared counts, orientation and metrics`, () => {
    const { Grid } = load(name, 'confusion-matrix');
    assert.deepEqual(clone(Grid.counts), counts); assert.deepEqual(clone(Grid.rowTotals), rowTotals); assert.deepEqual(clone(Grid.columnTotals), columnTotals);
    assert.equal(Grid.total, 24); assert.equal(Grid.correct, 17); near(Grid.correct / Grid.total, 17 / 24);
    for (let i = 0; i < 3; i++) {
      const actual = Grid.metrics(i);
      assert.equal(actual.tp, counts[i][i]); assert.equal(actual.fn, rowTotals[i] - counts[i][i]); assert.equal(actual.fp, columnTotals[i] - counts[i][i]);
      near(actual.recall, counts[i][i] / rowTotals[i]); near(actual.precision, counts[i][i] / columnTotals[i]);
      near(counts[i].reduce((sum, value) => sum + value / rowTotals[i], 0), 1);
    }
    // The asymmetric Cat→Dog / Dog→Cat pair makes transposing observable.
    assert.equal(Grid.counts[0][1], 2); assert.equal(Grid.counts[1][0], 1);
  });

  test(`${name} convolution: independent valid cross-correlation outputs and products`, () => {
    const { Grid } = load(name, 'convolution');
    assert.deepEqual(clone(Grid.data.image), image); assert.equal(Grid.outputRows, 3); assert.equal(Grid.outputColumns, 3); assert.equal(Grid.length, 9);
    assert.equal(Grid.data.stride, 1); assert.equal(Grid.data.padding, 0);
    for (const kernel of Grid.data.kernels) for (let index = 0; index < 9; index++) {
      const actual = Grid.at(index, kernel), expected = expectedConvolution(index, kernel.id);
      assert.deepEqual(clone(actual.patch), expected.patch); assert.deepEqual(clone(actual.numerators), clone(expected.numerators));
      actual.products.forEach((values, i) => values.forEach((value, j) => near(value, expected.products[i][j])));
      near(actual.products.flat().reduce((sum, value) => sum + value, 0), expected.value); near(actual.value, expected.value);
      near(Grid.output(kernel)[expected.row][expected.column], expected.value);
    }
    near(Grid.at(0, Grid.data.kernels[0]).value, 11 / 9);
    assert.equal(Grid.at(0, Grid.data.kernels[1]).value, 8, 'a reversed edge kernel would incorrectly give −8');
  });
}

for (const [subject] of subjects) for (const [name] of DEPTHS) {
  test(`${name} ${subject}: actual HTML handlers render every selection and option, then reset`, () => {
    const { html, Grid, Scene } = load(name, subject), ui = mount(html), initial = ui.svg();
    assert.equal(ui.nodes.get('previous').disabled, true); assert.equal(ui.nodes.get('next').disabled, false);
    assert.equal(ui.nodes.get('index-value').textContent, `1 of ${Grid.length}`);
    const options = Scene.parameter?.options.map(option => option.id) ?? [Grid.defaults().option];
    for (const option of options) {
      if (Scene.parameter) ui.click(`option-${option}`);
      for (let index = 0; index < Grid.length; index++) {
        ui.change(index);
        const svg = ui.svg(), frame = Grid.frame({ index, option });
        assert.equal(Number(ui.nodes.get('index').value), index);
        assert.equal(ui.nodes.get('scene-state').textContent, frame.state);
        assert.equal(ui.nodes.get('scene-description').textContent, frame.description);
        assert.equal(ui.nodes.get('index').attributes['aria-valuetext'], `${frame.selectionLabel}, ${index + 1} of ${Grid.length}`);
        assert.equal(textAt(svg, 'callout.selected.title'), frame.callout.title);
        for (const readout of frame.readouts) {
          assert.equal(textAt(svg, `readout.${readout.id}.value`), readout.value);
          assert.equal((svg.match(new RegExp(`id="readout\\.${reEscape(readout.id)}\\.value"`, 'g')) ?? []).length, 1);
        }
        if (subject === 'attention') {
          const expected = expectedAttention(index, option === 't2' ? 2 : 1);
          assert.equal(textAt(svg, 'query.label'), tokens[index]);
          expected.weights.forEach((value, j) => { const cell = cellAt(svg, `weight.${j}`); near(cell.value, value); assert.equal(cell.label, fixed(value)); assert.equal(Number(cell['data-row']), index); assert.equal(textAt(svg, `key.${j}.label`), tokens[j]); });
          assert.equal(textAt(svg, 'readout.sum.value'), '1.000');
          assert.equal(textAt(svg, 'readout.sum.label'), 'Sum before rounding');
          assert.equal([...svg.matchAll(/id="weight\.\d"[^>]*data-selected="true"/g)].length, 1);
          if (name !== 'overview') {
            const other = expectedAttention(index, option === 't2' ? 1 : 2), difference = Math.max(...expected.weights) - Math.max(...other.weights);
            assert.equal(textAt(svg, 'readout.peak-change.value'), `${difference >= 0 ? '+' : '−'}${fixed(Math.abs(difference) * 100, 1)} pp`);
          }
          if (name === 'standard') {
            const other = expectedAttention(index, option === 't2' ? 1 : 2);
            other.weights.forEach((value, j) => { near(cellAt(svg, `comparison.${j}`).value, value); assert.equal(cellAt(svg, `comparison.${j}`).label, fixed(value)); });
          }
          if (name === 'deep') {
            expected.logits.forEach((value, j) => { near(cellAt(svg, `logit.${j}`).value, value); assert.equal(textAt(svg, `key.${j}.vector`), `[${keys[j].join(', ')}]`); });
            assert.equal(textAt(svg, 'dot-products'), `q = [${queries[index].join(', ')}]     q·Kᵀ = [${expected.dots.join(', ')}]`);
            assert.equal(textAt(svg, 'score.formula'), `zⱼ = (q·kⱼ) / (√2 × ${option === 't2' ? 2 : 1})`);
          }
        } else if (subject === 'confusion-matrix') {
          classNames.forEach((label, i) => { assert.equal(textAt(svg, `predicted.${i}.label`), label); assert.equal(textAt(svg, `actual.${i}.label`), label); });
          for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
            const cell = cellAt(svg, `count.${row}.${column}`), expected = option === 'row-rate' ? counts[row][column] / rowTotals[row] : counts[row][column];
            near(cell.value, expected); assert.equal(cell.label, option === 'row-rate' ? percent(expected) : String(expected));
            assert.equal(cell['data-selected'], String(index === row * 3 + column));
          }
          if (name === 'deep') {
            const row = Math.floor(index / 3);
            assert.equal(textAt(svg, 'readout.class-counts.label'), `FN / FP · ${classNames[row]}`);
            assert.equal(textAt(svg, 'readout.class-counts.value'), `${rowTotals[row] - counts[row][row]} / ${columnTotals[row] - counts[row][row]}`);
            assert.equal(textAt(svg, 'readout.recall.value'), percent(counts[row][row] / rowTotals[row]));
            assert.equal(textAt(svg, 'readout.precision.value'), percent(counts[row][row] / columnTotals[row]));
          } else {
            assert.equal(textAt(svg, 'readout.correct.value'), '17 / 24'); assert.equal(textAt(svg, 'readout.accuracy.value'), '70.8%');
          }
        } else {
          const expected = expectedConvolution(index, option);
          image.forEach((values, row) => values.forEach((value, column) => { const cell = cellAt(svg, `image.${row}.${column}`); near(cell.value, value); assert.equal(cell.label, String(value)); }));
          for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
            const coefficient = kernelCoefficients[option][row][column], kernel = cellAt(svg, `kernel.${row}.${column}`);
            near(kernel.value, coefficient / (option === 'mean' ? 9 : 1));
            assert.equal(kernel.label, option === 'mean' ? `${coefficient}/9` : String(coefficient).replace('-', '−'));
            near(cellAt(svg, `product.${row}.${column}`).value, expected.products[row][column]);
            const label = option === 'mean' ? `${expected.numerators[row][column]}/9` : String(expected.numerators[row][column]).replace('-', '−');
            assert.equal(cellAt(svg, `product.${row}.${column}`).label, label);
            const output = cellAt(svg, `output.${row}.${column}`), value = option === 'mean' ? meanNumerators[row][column] / 9 : edgeOutputs[row][column];
            near(output.value, value); assert.equal(output.label, Number.isInteger(value) ? String(value).replace('-', '−') : fixed(value, 2));
          }
          assert.equal(textAt(svg, 'readout.kernel-weight.value'), option === 'mean' ? '1.000' : '0.000');
          assert.doesNotMatch(svg, /id="readout\.output\.value"/, 'the selected output is quantified only in its cell');
          assert.equal(textAt(svg, 'image.heading'), 'Image 5×5'); assert.equal(textAt(svg, 'output.heading'), 'Output 3×3');
          if (name === 'overview') assert.equal(textAt(svg, 'readout.pixels.value'), String(expected.patch.flat().reduce((sum, value) => sum + value, 0)));
          if (name === 'deep') {
            const rows = expected.numerators.map(values => values.reduce((sum, value) => sum + value, 0));
            assert.equal(textAt(svg, 'formula.label'), 'Add 9 products');
            assert.equal(textAt(svg, 'formula.sum'), option === 'mean' ? `y = (${rows.join(' + ')}) / 9` : `y = ${rows.join(' + ').replaceAll('+ -', '− ')}`);
          }
          const patch = svg.match(/<rect id="patch.selected"[^>]*>/)[0];
          assert.match(patch, new RegExp(`x="${20 + expected.column * 34}"`)); assert.match(patch, new RegExp(`y="${48 + expected.row * 34}"`));
          if (name !== 'overview') assert.equal(textAt(svg, 'readout.comparison.value'), fixed(expectedConvolution(index, option === 'mean' ? 'edge' : 'mean').value));
        }
        const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length, 'rendered IDs are unique');
        assertLeaderClearsCells(svg);
      }
      if (Scene.parameter) for (const candidate of Scene.parameter.options) assert.equal(ui.nodes.get(`option-${candidate.id}`).attributes['aria-pressed'], String(candidate.id === option));
    }
    ui.reset(); assert.equal(ui.svg(), initial); assert.equal(ui.nodes.get('status').textContent, 'Experiment reset.');
    assert.equal(Number(ui.nodes.get('index').value), 0);
    if (Scene.parameter) assert.equal(ui.nodes.get(`option-${Scene.parameter.default}`).attributes['aria-pressed'], 'true');
  });

  test(`${name} ${subject}: real range and step handlers bound and coerce invalid values`, () => {
    const { html, Grid } = load(name, subject), ui = mount(html), initial = ui.svg();
    ui.click('previous'); assert.equal(ui.svg(), initial);
    ui.click('next'); assert.equal(Number(ui.nodes.get('index').value), 1);
    ui.click('previous'); assert.equal(ui.svg(), initial);
    for (const [input, expected] of [[-100, 0], [1000, Grid.length - 1], [1.8, 2], ['not-a-number', 0], [Infinity, 0], [-Infinity, 0], ['', 0]]) {
      ui.change(input); assert.equal(Number(ui.nodes.get('index').value), expected);
      assert.equal(ui.nodes.get('previous').disabled, expected === 0); assert.equal(ui.nodes.get('next').disabled, expected === Grid.length - 1);
    }
    ui.change(1000); const last = ui.svg(); ui.click('next'); assert.equal(ui.svg(), last);
    assert.deepEqual(clone(Grid.coerce({ index: 1000, option: 'invalid' })), { index: Grid.length - 1, option: Grid.defaults().option });
    ui.reset(); assert.equal(ui.svg(), initial);
  });
}

test('every mounted card keeps the approved shell, bounded native grid and card order', () => {
  const approved = read('overview-curve-sliders.html');
  const font = html => html.match(/@font-face\{[^}]+\}/)[0], palette = html => html.match(/:root\{[^}]+\}/)[0];
  for (const [subject] of subjects) for (const [name] of DEPTHS) {
    const { html, Scene } = load(name, subject), ui = mount(html), svg = ui.svg();
    assert.equal(font(html), font(approved)); assert.equal(palette(html), palette(approved));
    assert.equal((html.match(/<input\b[^>]*type="range"/g) ?? []).length, 1);
    assert.equal((html.match(/<button\b/g) ?? []).length, name === 'overview' ? 3 : 5);
    assert.equal(Scene.height <= 400, true); assert.ok(Scene.height >= Scene.readoutY + 48);
    assert.match(html, /width="640"/); assert.match(html, /\.grid-scene\{[^}]*min-width:640px/);
    for (const match of svg.matchAll(/font-size="([\d.]+)"/g)) assert.ok(Number(match[1]) >= 13);
    for (const match of svg.matchAll(/<g id="[^"]+"[^>]*data-value="[^"]*"[^>]*>([\s\S]*?)<\/g>/g)) {
      const rect = match[1].match(/<rect\b([^>]*)>/)[1];
      const attrs = Object.fromEntries([...rect.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      assert.ok(Number(attrs.width) >= 28 && Number(attrs.height) >= 28, 'cells never shrink below the admitted native size');
      assert.ok(Number(attrs.x) >= 0 && Number(attrs.x) + Number(attrs.width) <= 640);
      assert.ok(Number(attrs.y) >= 0 && Number(attrs.y) + Number(attrs.height) <= Scene.height);
    }
    assert.ok(ui.nodes.get('scene-description').textContent.length > 100);
    assert.ok(html.indexOf('id="concept"') < html.indexOf('id="instructions"'));
    assert.ok(html.indexOf('id="instructions"') < html.indexOf('id="experiment"'));
    assert.ok(html.indexOf('id="drawing"') < html.indexOf('class="experiment-controls'));
    assert.doesNotMatch(html.slice(0, html.indexOf('<script')), /<img\b|<image\b|<iframe\b|src="https?:/);
  }
});
