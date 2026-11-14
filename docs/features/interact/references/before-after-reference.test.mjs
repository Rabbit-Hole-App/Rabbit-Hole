// Executes the nine reference HTML files' own scripts and actual event handlers.
// The slim document adapter follows curve-sliders-reference.test.mjs. It is not
// a browser and cannot establish rendered fit, visual legibility or keyboard use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const depths = ['overview', 'standard', 'deep'];
const subjects = ['normalisation', 'tokenization', 'pruning'];
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const fmt = (value, places = 2) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places).replace('-', '−');
const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const script = (html, id) => {
  const value = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(value, `${id} is present`); return value[1];
};
function load(depth, subject) {
  const html = read(`${depth}-before-after-${subject}.html`);
  return { html, model: runInNewContext(`${script(html, 'scene-model')}\nBeforeAfter;`) };
}
function mount(html) {
  const nodes = new Map();
  for (const match of html.slice(0, html.indexOf('<script')).matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    nodes.set(attributes.id, { attributes, value: attributes.value ?? '', textContent: '', innerHTML: '', listeners: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      addEventListener(kind, handler) { this.listeners[kind] = handler; },
    });
  }
  const context = { document: { getElementById: id => nodes.get(id) ?? null } };
  runInNewContext(`${script(html, 'scene-model')}\n${script(html, 'scene-view')}`, context);
  const fire = (id, kind, value) => {
    const node = nodes.get(id); assert.ok(node, `node ${id}`);
    if (value !== undefined) node.value = String(value);
    assert.equal(typeof node.listeners[kind], 'function', `${id} has its own ${kind} handler`);
    node.listeners[kind]({ target: node });
  };
  return { nodes, input: (id, value) => fire(id, 'input', value), change: id => fire(id, 'change'), click: id => fire(id, 'click'), reset: () => fire('reset', 'click'), svg: () => nodes.get('objects').innerHTML };
}
function textValue(svg, id) {
  const match = svg.match(new RegExp(`<text\\b[^>]*id="${regexEscape(id)}"[^>]*>([\\s\\S]*?)<\\/text>`));
  assert.ok(match, id); return match[1];
}
function elements(svg, pattern, tag = 'g') {
  return [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*id="${pattern}"[^>]*)>`, 'g'))].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])));
}

test('all nine reference HTML files exist, with the exact approved font, palette, primitive implementation and card order', () => {
  const approved = read('overview-curve-sliders.html'), toss = read('overview-toss-and-drop.html');
  const font = html => html.match(/@font-face\{[^}]+\}/)[0], palette = html => html.match(/:root\{[^}]+\}/)[0];
  const primitive = script(approved, 'curve-view').match(/\s*([\s\S]*?return \{dot,connector,teachingBox,teachingConnector,TEACHING,render\};\}\)\(\);)/)[1];
  for (const depth of depths) for (const subject of subjects) {
    assert.ok(existsSync(new URL(`${depth}-before-after-${subject}.html`, import.meta.url)));
    const { html, model } = load(depth, subject), ui = mount(html);
    assert.equal(font(html), font(toss)); assert.equal(palette(html), palette(toss));
    assert.ok(script(html, 'scene-view').startsWith(primitive));
    assert.equal(ui.nodes.get('drawing').attributes.width, '640');
    assert.ok(Number(ui.nodes.get('drawing').attributes.height) <= 400);
    assert.match(html, /\.before-after-scene\{[^}]*width:640px;min-width:640px/);
    assert.ok(model.controls.length >= 1 && model.controls.length <= 3);
    const scene = runInNewContext(`${script(html, 'scene-model')}\nScene;`);
    assert.ok(scene.concept.length >= 140 && scene.concept.length <= 180, 'the concept stays within the compact copy budget');
    assert.ok(scene.instructions.length <= 110, 'instructions stay within the compact copy budget');
    if (model.controls.length === 3) {
      assert.match(html, /class="parameters three-parameters"/);
      assert.match(html, /\.three-parameters \.parameter\.wide\{display:block;grid-column:auto\}/);
      assert.match(html, /\.three-parameters \.parameter:last-child\{grid-column:1\/-1\}/);
    }
    assert.ok([...html.matchAll(/<button\b/g)].length <= 5, 'at most two choices per parameter plus the existing Reset');
    assert.ok(html.indexOf('id="concept"') < html.indexOf('id="instructions"'));
    assert.ok(html.indexOf('id="instructions"') < html.indexOf('id="experiment"'));
    assert.ok(html.indexOf('id="drawing"') < html.indexOf('class="experiment-controls'));
    assert.ok(ui.nodes.get('scene-description').textContent.length > 120);
    assert.equal(elements(ui.svg(), 'panel\\.(before|after)').length, 2);
    assert.ok([...ui.svg().matchAll(/font-size="([\d.]+)"/g)].every(m => Number(m[1]) >= 13), 'SVG label floor is 13 native pixels');
    const labels = [...html.matchAll(/<(?:button|label)\b[^>]*>([\s\S]*?)<\/(?:button|label)>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
    for (const label of labels) assert.doesNotMatch(label, /\.\.\.|…/);
  }
});

for (const depth of depths) {
  test(`${depth} normalisation: actual slider handlers draw every sample and the independently calculated readouts across the full domain`, () => {
    const { html } = load(depth, 'normalisation'), ui = mount(html), initial = ui.svg();
    for (let last = 8; last <= 20; last++) {
      ui.input('last', last);
      const raw = [2, 3, 4, 4, 5, 6, 6, 7, last], mean = (37 + last) / 9, sd = Math.sqrt((191 + last * last) / 9 - mean * mean), z = raw.map(x => (x - mean) / sd);
      for (const selected of depth === 'overview' ? [9] : Array.from({ length: 9 }, (_, i) => i + 1)) {
        if (depth !== 'overview') ui.input('selected', selected);
        const svg = ui.svg();
        for (const [side, values, x, axis] of [['before', raw, 20, [0, 20]], ['after', z, 340, [-3, 3]]]) {
          const dots = elements(svg, `${side}\\.sample\\.\\d+`, 'circle');
          assert.equal(dots.length, raw.length);
          const repeated = new Map();
          dots.forEach((dot, i) => {
            near(Number(dot.cx), x + 24 + (values[i] - axis[0]) / (axis[1] - axis[0]) * 232);
            const stack = repeated.get(values[i]) || 0; repeated.set(values[i], stack + 1);
            near(Number(dot.cy), 184 - stack * 15);
            assert.equal(Number(dot.r), i === selected - 1 ? 6 : 5);
          });
          const callout = svg.match(new RegExp(`<g id="callout\\.${side}\\.marked"[\\s\\S]*?<\\/g>`))[0];
          assert.doesNotMatch(callout, /Mean|SD|\d+\.\d+<\/text>/, 'the callout locates; the readout owns the measurements');
        }
        if (depth === 'deep') {
          assert.equal((svg.match(/id="readout\.formula\.value"/g) ?? []).length, 1);
          assert.doesNotMatch(svg, /id="readout\.marked\./, 'the formula alone owns the marked numerical result');
          assert.equal(textValue(svg, 'readout.formula.value'), `(${fmt(raw[selected - 1])} − ${fmt(mean)}) / ${fmt(sd, 3)} ≈ ${fmt(z[selected - 1], 3)}`);
          assert.equal(textValue(svg, 'readout.invariant.value'), '0.000 / 1.000');
        } else {
          assert.equal(textValue(svg, 'readout.mean.value'), `${fmt(mean)} → 0.00`);
          assert.equal(textValue(svg, 'readout.sd.value'), `${fmt(sd)} → 1.00`);
          if (depth === 'standard') assert.equal(textValue(svg, 'readout.marked.value'), `${fmt(raw[selected - 1])} → ${fmt(z[selected - 1])}`);
        }
      }
      assert.equal(ui.nodes.get('last-value').textContent, String(last));
    }
    ui.input('last', -100); assert.equal(Number(ui.nodes.get('last').value), 8);
    ui.input('last', 100); assert.equal(Number(ui.nodes.get('last').value), 20);
    ui.input('last', 11.7); assert.equal(Number(ui.nodes.get('last').value), 12);
    if (depth !== 'overview') {
      ui.input('selected', -3); assert.equal(Number(ui.nodes.get('selected').value), 1);
      ui.input('selected', 99); assert.equal(Number(ui.nodes.get('selected').value), 9);
    }
    ui.change('last'); assert.equal(ui.nodes.get('status').textContent, ui.nodes.get('scene-description').textContent);
    ui.reset(); assert.equal(ui.svg(), initial); assert.match(ui.nodes.get('status').textContent, /^Experiment reset\./);
    assert.equal(Number(ui.nodes.get('last').value), 8);
    if (depth !== 'overview') assert.equal(Number(ui.nodes.get('selected').value), 9);
  });

  test(`${depth} tokenization: real sentence/mode/selection handlers preserve source spans, IDs and computed counts, including changing slider bounds`, () => {
    const { html } = load(depth, 'tokenization'), ui = mount(html), initial = ui.svg();
    const examples = [
      { sentence: 0, mode: 1, text: 'unhelpful cats.', pieces: [['un', 1, 0, 2], ['##help', 2, 2, 6], ['##ful', 3, 6, 9], ['cats', 4, 10, 14], ['.', 6, 14, 15]] },
      { sentence: 1, mode: 1, text: 'cats nap.', pieces: [['cats', 4, 0, 4], ['nap', 5, 5, 8], ['.', 6, 8, 9]] },
      ...(depth === 'overview' ? [] : [
        { sentence: 0, mode: 0, text: 'unhelpful cats.', pieces: [['unhelpful', 1, 0, 9], ['cats', 2, 10, 14], ['.', 4, 14, 15]] },
        { sentence: 1, mode: 0, text: 'cats nap.', pieces: [['cats', 2, 0, 4], ['nap', 3, 5, 8], ['.', 4, 8, 9]] },
      ]),
    ];
    for (const example of examples) {
      ui.click(`sentence-${example.sentence}`);
      if (depth !== 'overview') ui.click(`mode-${example.mode}`);
      assert.equal(ui.nodes.get(`sentence-${example.sentence}`).attributes['aria-pressed'], 'true');
      for (let selected = 1; selected <= (depth === 'deep' ? example.pieces.length : 1); selected++) {
        if (depth === 'deep') ui.input('selected', selected);
        const svg = ui.svg(), chips = elements(svg, 'token\\.\\d+');
        assert.equal(textValue(svg, 'source.literal'), example.text);
        assert.equal(chips.length, example.pieces.length);
        example.pieces.forEach(([piece, id, start, end], index) => {
          assert.equal(textValue(svg, `token.${index + 1}.piece`), piece);
          assert.equal(Number(chips[index]['data-vocabulary-id']), id);
          assert.equal(Number(chips[index]['data-start']), start); assert.equal(Number(chips[index]['data-end']), end);
          assert.equal(chips[index]['data-selected'], String(index === selected - 1));
          if (depth === 'deep') {
            assert.equal(textValue(svg, `token.${index + 1}.id`), `ID ${id}`);
            assert.equal(textValue(svg, `token.${index + 1}.span`), `[${start}, ${end})`);
          }
        });
        const characters = elements(svg, 'source\\.character\\.\\d+');
        assert.equal(characters.length, example.text.length);
        const [, , start, end] = example.pieces[selected - 1];
        characters.forEach((char, index) => assert.equal(char['data-selected'], String(index >= start && index < end)));
        assert.equal(textValue(svg, 'readout.characters.value'), String(example.text.length));
        assert.equal(textValue(svg, 'readout.tokens.value'), String(example.pieces.length));
        assert.equal(textValue(svg, 'readout.spaces.value'), String([...example.text].filter(c => c === ' ').length));
      }
      if (depth === 'deep') {
        assert.equal(ui.nodes.get('selected').max, example.pieces.length);
        ui.input('selected', 99); assert.equal(Number(ui.nodes.get('selected').value), example.pieces.length);
        ui.input('selected', -2); assert.equal(Number(ui.nodes.get('selected').value), 1);
      }
    }
    if (depth === 'deep') {
      ui.click('sentence-0'); ui.click('mode-1'); ui.input('selected', 5); ui.click('mode-0');
      assert.equal(Number(ui.nodes.get('selected').value), 3); assert.equal(ui.nodes.get('selected').max, 3);
      ui.change('selected'); assert.equal(ui.nodes.get('status').textContent, ui.nodes.get('scene-description').textContent);
    }
    ui.reset(); assert.equal(ui.svg(), initial);
    assert.equal(ui.nodes.get('sentence-0').attributes['aria-pressed'], 'true');
    if (depth !== 'overview') assert.equal(ui.nodes.get('mode-1').attributes['aria-pressed'], 'true');
    if (depth === 'deep') { assert.equal(Number(ui.nodes.get('selected').value), 1); assert.equal(ui.nodes.get('selected').max, 5); }
  });

  test(`${depth} pruning: actual controls change subtree predictions, matched-record counts, size, errors and count cost together`, () => {
    const { html } = load(depth, 'pruning'), ui = mount(html), initial = ui.svg();
    const penalties = depth === 'overview' ? [0, 1] : Array.from({ length: 9 }, (_, i) => i / 4);
    for (const p of penalties) {
      if (depth === 'overview') ui.click(`branch-${p}`); else ui.input('alpha', p);
      const pruned = depth === 'overview' ? p === 1 : p >= 1;
      for (const dataset of depth === 'deep' ? [0, 1] : [0]) {
        if (depth === 'deep') ui.click(`dataset-${dataset}`);
        const svg = ui.svg(), before = elements(svg, 'before\\.node\\.[^"]+'), after = elements(svg, 'after\\.node\\.[^"]+');
        assert.equal(before.length, 5); assert.equal(after.length, pruned ? 3 : 5);
        const expected = { root: dataset ? 9 : 10, 'practiced-no': 3, notes: dataset ? 6 : 7, 'notes-no': dataset ? 2 : 3, 'notes-yes': 4, 'practiced-yes': dataset ? 6 : 7 };
        for (const node of [...before, ...after]) {
          const id = node.id.split('.node.')[1];
          assert.equal(Number(node['data-records']), expected[id]);
          assert.equal(textValue(svg, `${node.id}.count`), `n = ${expected[id]}`);
        }
        assert.equal(textValue(svg, 'readout.size.value'), `5 / 3 → ${pruned ? '3 / 2' : '5 / 3'}`);
        assert.equal(textValue(svg, 'readout.mistakes.value'), dataset ? `2 → ${pruned ? 0 : 2}` : `1 → ${pruned ? 2 : 1}`);
        assert.equal(textValue(svg, 'readout.mistakes.label'), `${dataset ? 'Held-out' : 'Training'} mistakes`);
        assert.equal(textValue(svg, 'record-count.label'), `${dataset ? 'Held-out' : 'Training'} records`);
        assert.doesNotMatch(textValue(svg, 'record-count.label'), /\d/, 'node counts already identify the cohort size');
        if (depth !== 'overview') {
          const beforeCost = 1 + 3 * p, afterCost = pruned ? 2 + 2 * p : beforeCost;
          assert.equal(textValue(svg, 'readout.cost.value'), `${fmt(beforeCost)} → ${fmt(afterCost)}`);
          assert.equal(ui.nodes.get('alpha-value').textContent, p.toFixed(2));
          if (depth === 'deep') assert.equal(textValue(svg, 'cost.formula'), `Cost = training mistakes + α × leaves. Root-only cost: ${fmt(5 + p)}.`);
        }
      }
    }
    if (depth !== 'overview') {
      ui.input('alpha', -20); assert.equal(Number(ui.nodes.get('alpha').value), 0);
      assert.equal(elements(ui.svg(), 'after\\.node\\.[^"]+').length, 5);
      ui.input('alpha', 20); assert.equal(Number(ui.nodes.get('alpha').value), 2);
      assert.equal(elements(ui.svg(), 'after\\.node\\.[^"]+').length, 3);
      ui.input('alpha', 1.37); assert.equal(Number(ui.nodes.get('alpha').value), 1.25);
      ui.change('alpha'); assert.equal(ui.nodes.get('status').textContent, ui.nodes.get('scene-description').textContent);
    }
    ui.reset(); assert.equal(ui.svg(), initial);
    if (depth === 'overview') assert.equal(ui.nodes.get('branch-1').attributes['aria-pressed'], 'true');
    else assert.equal(Number(ui.nodes.get('alpha').value), 1.5);
    if (depth === 'deep') assert.equal(ui.nodes.get('dataset-1').attributes['aria-pressed'], 'true');
  });
}
