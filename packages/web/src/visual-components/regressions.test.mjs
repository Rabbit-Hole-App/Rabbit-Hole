import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextBox } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { compileVisual } from './compile.js';
import { lineHeight } from './text.js';
import { EXAMPLES } from './examples/index.js';
import regressions from './examples/regressions.json' with { type: 'json' };

// The shared checks: each guards a failure class seen in a render review,
// and runs on every minimal spec and every bundled example, so one fix is
// proven on all the cases it touches, not only the one that showed it.
const boxesOf = scene => scene.objects.filter(object => object.type === 'box').map(object => ({ id: object.id, part: object.part, ...object.initialState }));
const samePart = (p, q) => p.part === undefined || q.part === undefined || p.part === q.part;
const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const apart = (p, q) => p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;

const CHECKS = {
  'labels-clear-of-boxes'(scene) {
    for (const label of scene.objects.filter(object => /^link\d+-label$/.test(object.id))) {
      const s = label.initialState;
      const box = estimateTextBox({ text: s.text, x: s.x, y: s.y, fontSize: textStyle(s.typography).fontSize, anchor: 'start', baseline: 'auto' });
      for (const other of boxesOf(scene).filter(item => !/\.frame$/.test(item.id) && samePart(item, label))) {
        assert.ok(apart({ x: box.xMin, y: box.yMin, w: box.xMax - box.xMin, h: box.yMax - box.yMin }, other), `${label.id} overlaps ${other.id}`);
      }
    }
  },
  'math-lines-have-room'(scene) {
    const lines = scene.objects.filter(object => object.type === 'text' && /(-line|\.title)\d+$/.test(object.id));
    for (const line of lines.filter(object => object.initialState.runs?.some(run => run.kind === 'math'))) {
      const [, stem, n] = line.id.match(/^(.*?)(\d+)$/);
      const previous = lines.find(object => object.id === `${stem}${Number(n) - 1}`);
      if (!previous) continue;
      const gap = line.initialState.y - previous.initialState.y;
      assert.ok(gap >= Math.ceil(lineHeight(line.initialState.typography) * 1.4) - 1, `${line.id} is ${gap}px below the line above`);
    }
  },
  'boxes-nest-or-apart'(scene) {
    const boxes = boxesOf(scene);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        if (!samePart(p, q)) continue;
        assert.ok(apart(p, q) || inside(p, q) || inside(q, p), `${p.id} and ${q.id} partly overlap`);
      }
    }
  },
  'arrow-tips-distinct'(scene) {
    const tips = new Map();
    for (const arrow of scene.objects.filter(object => object.type === 'arrow')) {
      const key = `${arrow.part ?? ''}:${Math.round(arrow.initialState.to.x)},${Math.round(arrow.initialState.to.y)}`;
      assert.ok(!tips.has(key), `${arrow.id} and ${tips.get(key)} land on the same point`);
      tips.set(key, arrow.id);
    }
  },
  'flow-rows-even'(scene) {
    const rows = new Map();
    for (const step of scene.objects.filter(object => object.type === 'box' && /\.step\d+$/.test(object.id))) {
      const key = `${step.id.split('.')[0]}:${step.initialState.y + step.initialState.h / 2}`;
      rows.set(key, [...(rows.get(key) || []), step.initialState.h]);
    }
    for (const [key, heights] of rows) assert.equal(new Set(heights).size, 1, `${key}: steps of one row differ in height`);
  },
};

test('every regression record names a real check, a fix and the cases it affected', () => {
  const ids = new Set();
  for (const record of regressions.records) {
    assert.ok(!ids.has(record.id), record.id);
    ids.add(record.id);
    assert.ok(record.check in CHECKS, record.check);
    assert.match(record.fixedBy, /^[0-9a-f]{8}$/);
    assert.ok(record.affected.length && record.signature);
  }
});

test('each minimal failing spec now passes its check', () => {
  for (const record of regressions.records) CHECKS[record.check](compileVisual(record.spec).scene);
});

test('every check passes on every minimal spec and every bundled example', () => {
  const specs = [...regressions.records.map(record => [record.id, record.spec]), ...Object.entries(EXAMPLES)];
  for (const [name, spec] of specs) {
    const scene = compileVisual(spec).scene;
    for (const [check, run] of Object.entries(CHECKS)) {
      try { run(scene); } catch (error) { assert.fail(`${name} / ${check}: ${error.message}`); }
    }
  }
});

test('the checks catch the failures they were written for', () => {
  const scene = compileVisual(regressions.records.find(record => record.id === 'ghost-show-through').spec).scene;
  const frame = scene.objects.find(object => object.id === 's.frame').initialState;
  const ghost = { id: 's.ghost-1', type: 'box', initialState: { x: frame.x + 8, y: frame.y - 8, w: frame.w, h: frame.h } };
  assert.throws(() => CHECKS['boxes-nest-or-apart']({ ...scene, objects: [...scene.objects, ghost] }), /partly overlap/);
  const feeds = compileVisual(regressions.records.find(record => record.id === 'arrowheads-pile-up').spec).scene;
  const piled = feeds.objects.map(object => (object.type === 'arrow' && /\.into/.test(object.id) ? { ...object, initialState: { ...object.initialState, to: { x: 1, y: 1 } } } : object));
  assert.throws(() => CHECKS['arrow-tips-distinct']({ ...feeds, objects: piled }), /same point/);
});
