// Native diagrams (owner brief 2026-10-13 §6): the model's structure is checked, laid out by app code only, and becomes
// ordinary canvas records with fresh ids. Specs use unrelated subjects; none is special-cased.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGRAM_LIMITS, layoutDiagram, toCanvasObjects, validateDiagram } from './inline-diagram.js';
import { applyTx } from './inline-ai-apply.js';
import { DEFAULT_STYLE } from './inline-placement.js';
import { treeBoard } from './inline-ai-fixtures.js';

const water = {
  layout: { arrange: 'cycle' },
  shapes: [{ id: 'evap', label: 'Evaporation' }, { id: 'cond', label: 'Condensation' }, { id: 'prec', label: 'Precipitation' }, { id: 'coll', label: 'Collection' }],
  connectors: [{ from: 'evap', to: 'cond' }, { from: 'cond', to: 'prec' }, { from: 'prec', to: 'coll' }, { from: 'coll', to: 'evap' }],
};
const compiler = {
  layout: { arrange: 'layered', flow: 'right' },
  shapes: [{ id: 'src', label: 'Source code', kind: 'rect' }, { id: 'lex', label: 'Lexer' }, { id: 'parse', label: 'Parser' }, { id: 'ast', label: 'Syntax tree', kind: 'ellipse', tone: 'accent' }, { id: 'gen', label: 'Code generator' }],
  connectors: [{ from: 'src', to: 'lex' }, { from: 'lex', to: 'parse', label: 'tokens' }, { from: 'parse', to: 'ast' }, { from: 'ast', to: 'gen', direction: 'both' }],
  groups: [{ label: 'Front end', members: ['lex', 'parse'] }],
};
const family = {
  shapes: [{ id: 'a', label: 'Grandparent' }, { id: 'b', label: 'Parent one' }, { id: 'c', label: 'Parent two' }, { id: 'd', label: 'Child' }, { id: 'e', label: 'Cousin' }],
  connectors: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'e', direction: 'none' }],
};
const checked = spec => { const out = validateDiagram(spec); assert.equal(out.ok, true, out.errors.join(' ')); return out.spec; };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('validateDiagram: a sound spec passes with its defaults filled in', () => {
  const spec = checked(family);
  assert.deepEqual(spec.layout, { arrange: 'layered', flow: 'down', spacing: 1 });
  assert.equal(spec.connectors[0].direction, 'forward');
  assert.equal(spec.shapes[0].tone, 'default');
});

test('validateDiagram: references must resolve - connectors, self-loops, group members, duplicate ids', () => {
  const errors = spec => validateDiagram(spec).errors.join(' ');
  assert.match(errors({ ...water, connectors: [{ from: 'evap', to: 'ocean' }] }), /not both shapes/);
  assert.match(errors({ ...water, connectors: [{ from: 'evap', to: 'evap' }] }), /to itself/);
  assert.match(errors({ ...water, groups: [{ label: 'Sky', members: ['cond', 'cloud'] }] }), /cloud is not a shape/);
  assert.match(errors({ ...water, groups: [{ label: 'A', members: ['evap', 'cond'] }, { label: 'B', members: ['cond', 'prec'] }] }), /in two groups/);
  assert.match(errors({ ...water, shapes: [...water.shapes, { id: 'evap', label: 'Again' }] }), /used twice/);
  assert.equal(validateDiagram({ ...water, connectors: [{ from: 'evap', to: 'ocean' }] }).spec, null);
});

test('validateDiagram: only supported properties - no coordinates, colours or unknown kinds from the model', () => {
  const errors = spec => validateDiagram(spec).errors.join(' ');
  assert.match(errors({ shapes: [{ id: 'a', label: 'A', x: 10, y: 20 }] }), /Unsupported shape property x/);
  assert.match(errors({ shapes: [{ id: 'a', label: 'A', color: '#ff0000' }] }), /Unsupported shape property color/);
  assert.match(errors({ shapes: [{ id: 'a', label: 'A', kind: 'cloud' }] }), /Unknown shape kind/);
  assert.match(errors({ shapes: [{ id: 'a', label: 'A' }], connectors: [{ from: 'a', to: 'a', style: 'dashed' }] }), /Unsupported connector property style/);
  assert.match(errors({ shapes: [{ id: 'a', label: 'A' }], script: 'alert(1)' }), /Unsupported property script/);
  assert.match(errors({ shapes: [{ id: 'a', label: 'A' }], layout: { arrange: 'spiral' } }), /Unknown arrangement/);
});

test('validateDiagram: numbers must be finite and in range', () => {
  for (const spacing of [NaN, Infinity, -Infinity, 0, 99, '2']) {
    assert.match(validateDiagram({ ...family, layout: { spacing } }).errors.join(' '), /spacing must be a finite number/, String(spacing));
  }
  assert.equal(validateDiagram({ ...family, layout: { spacing: 1.5 } }).ok, true);
});

test('validateDiagram: limits on counts and text', () => {
  const many = Array.from({ length: DIAGRAM_LIMITS.shapes + 1 }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` }));
  assert.match(validateDiagram({ shapes: many }).errors.join(' '), /At most 40 shapes/);
  assert.match(validateDiagram({ shapes: [{ id: 'a', label: 'x'.repeat(DIAGRAM_LIMITS.label + 1) }] }).errors.join(' '), /needs a label/);
  assert.match(validateDiagram({ shapes: [{ id: 'a', label: '   ' }] }).errors.join(' '), /needs a label/);
  assert.match(validateDiagram({ shapes: [] }).errors.join(' '), /at least one shape/);
  const wordy = Array.from({ length: 35 }, (_, i) => ({ id: `n${i}`, label: 'w'.repeat(75) }));
  assert.match(validateDiagram({ shapes: wordy }).errors.join(' '), /text is longer/);
  assert.equal(validateDiagram(null).ok, false);
});

test('layoutDiagram: deterministic, with no overlapping nodes, in every arrangement', () => {
  for (const spec of [water, compiler, family, { ...family, layout: { arrange: 'grid' } }, { ...family, layout: { arrange: 'row' } }, { ...family, layout: { arrange: 'column' } }, { ...family, layout: { flow: 'up' } }, { ...compiler, layout: { flow: 'left' } }]) {
    const one = layoutDiagram(checked(spec), DEFAULT_STYLE), two = layoutDiagram(checked(structuredClone(spec)), DEFAULT_STYLE);
    assert.deepEqual(one, two);
    for (const [i, a] of one.nodes.entries()) {
      assert.ok([a.x, a.y, a.w, a.h].every(Number.isFinite));
      for (const b of one.nodes.slice(i + 1)) assert.equal(overlap(a, b), false, `${a.id} overlaps ${b.id}`);
    }
    assert.ok(one.nodes.every(node => node.x >= 0 && node.y >= 0 && node.x + node.w <= one.bounds.w && node.y + node.h <= one.bounds.h));
  }
});

test('layoutDiagram: layers follow the connectors and the flow; spacing follows the region style and the hint', () => {
  const at = layout => Object.fromEntries(layout.nodes.map(node => [node.id, node]));
  const down = at(layoutDiagram(checked(family)));
  assert.ok(down.a.y < down.b.y && down.b.y < down.d.y, 'each layer below its parent');
  assert.equal(down.b.y, down.c.y);
  const right = at(layoutDiagram(checked(compiler)));
  assert.ok(right.src.x < right.lex.x && right.lex.x < right.parse.x && right.parse.x < right.gen.x);
  const up = at(layoutDiagram(checked({ ...family, layout: { flow: 'up' } })));
  assert.ok(up.a.y > up.b.y);
  const tight = layoutDiagram(checked(family), { ...DEFAULT_STYLE, layerGap: 30 }), airy = layoutDiagram(checked({ ...family, layout: { spacing: 2 } }), { ...DEFAULT_STYLE, layerGap: 30 });
  assert.ok(airy.bounds.h > tight.bounds.h);
  // A cycle with a back edge still lays out (the back edge is skipped for ranking only).
  assert.equal(layoutDiagram(checked({ ...water, layout: { arrange: 'layered' } })).nodes.length, 4);
  // Junk style numbers fall back to the defaults instead of producing NaN.
  assert.ok(layoutDiagram(checked(family), { gap: NaN, layerGap: Infinity, fontSize: -3, nodeW: 'wide' }).nodes.every(node => Number.isFinite(node.x + node.y + node.w + node.h)));
});

test('toCanvasObjects: fresh ids, the canvas\'s own shape and connector records, and nothing existing touched', () => {
  const spec = checked(compiler), layout = layoutDiagram(spec);
  const board = treeBoard();
  const before = structuredClone(board);
  const taken = new Set([...board.shapes, ...board.links, ...board.items].map(entry => entry.id));
  const tx = toCanvasObjects(spec, layout, { requestId: 'req-42', at: { x: 1000, y: 500 }, style: { ...DEFAULT_STYLE, color: '#2383e2', route: 'straight' }, taken });
  assert.equal(tx.kind, 'diagram');
  const ids = [...tx.shapes, ...tx.links, ...tx.groups].map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id.startsWith('inline-req-42-') && !taken.has(id)));
  assert.ok(!ids.some(id => spec.shapes.some(shape => shape.id === id)), 'the model\'s ids never reach the canvas');
  const shape = tx.shapes[0];
  assert.deepEqual(Object.keys(shape).sort(), ['align', 'color', 'dash', 'fill', 'font', 'fontSize', 'id', 'kind', 'opacity', 'round', 'text', 'textColor', 'valign', 'width', 'x1', 'x2', 'y1', 'y2'].sort());
  assert.equal(shape.x1, 1000 + layout.nodes[0].x);
  assert.equal(shape.color, '#2383e2');
  assert.equal(tx.shapes[3].color, '#2383e2'); // accent tone
  const tokens = tx.links[1];
  assert.deepEqual([tokens.from, tokens.to, tokens.label, tokens.route, tokens.head], [tx.shapes[1].id, tx.shapes[2].id, 'tokens', 'straight', true]);
  assert.equal(tx.links[3].startHead, 'arrow');
  assert.deepEqual(tx.groups, [{ id: 'inline-req-42-g0', label: 'Front end' }]);
  assert.deepEqual(tx.shapes.filter(entry => entry.groupId).map(entry => entry.text), ['Lexer', 'Parser']);
  // Internal layout kept: every node moved by the same offset.
  tx.shapes.forEach((entry, i) => assert.deepEqual([entry.x1 - layout.nodes[i].x, entry.y1 - layout.nodes[i].y], [1000, 500]));
  const next = applyTx(board, tx);
  assert.deepEqual(board, before);
  assert.deepEqual(next.shapes.slice(0, before.shapes.length), before.shapes);
  assert.deepEqual(next.links.slice(0, before.links.length), before.links);
  assert.equal(next.shapes.length, before.shapes.length + 5);
  assert.equal(next.groups.length, 1);
  // A second Accept adds nothing.
  assert.deepEqual(applyTx(next, tx), next);
  const none = toCanvasObjects(checked(family), layoutDiagram(checked(family)), { requestId: 'r2', at: { x: 0, y: 0 } });
  assert.equal(none.links[3].head, false);
});

test('toCanvasObjects: an id already on the canvas, or a non-finite position, refuses instead of overwriting', () => {
  const spec = checked(water), layout = layoutDiagram(spec);
  assert.throws(() => toCanvasObjects(spec, layout, { requestId: 'r9', at: { x: 0, y: 0 }, taken: new Set(['inline-r9-s2']) }), /already on the canvas/);
  assert.throws(() => toCanvasObjects(spec, layout, { requestId: 'r9', at: { x: NaN, y: 0 } }), /not a finite number/);
});
