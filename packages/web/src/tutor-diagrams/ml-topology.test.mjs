import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layouts as oldLayouts } from './layouts.js';
import { layoutFlow } from './flow.js';
import { textWidth } from './primitives.js';
import { TEACHING } from './teaching-theme.js';

let specModule, layoutModule, referenceModule;
try {
  specModule = await import('./ml-topology-spec.js');
  layoutModule = await import('./ml-topology-layouts.js');
  referenceModule = await import('./ml-topology-references.js');
} catch { /* The first red run reports the missing extension as an assertion. */ }

const text = max => z.string().min(1).max(max);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/);
const numeric = z.number().min(-1e9).max(1e9);
const helpers = { z, text, id, numeric, unit: text(12).optional(),
  titled: { title: text(90), caption: text(140).optional() }, node: { id, label: text(60) },
  axes: z.strictObject({ label: text(36), min: numeric, max: numeric, unit: text(12).optional() }) };
const legacy = { ...oldLayouts, flow: layoutFlow };
function schemas() {
  assert.ok(specModule, 'Topology schema extension is implemented');
  return specModule.createShapes(helpers);
}
function parse(diagram) {
  return z.discriminatedUnion('kind', schemas()).superRefine((d, ctx) =>
    specModule.validate(d, (path, message) => ctx.addIssue({ code: 'custom', path, message }))).parse(diagram);
}
function scene(diagram, width = 320) {
  assert.ok(layoutModule, 'Topology layout extension is implemented');
  return layoutModule.createLayouts({ legacy })[diagram.kind](diagram, width);
}
const walk = values => values.flatMap(e => e && typeof e === 'object' ? [e, ...walk([e.props?.children].flat())] : []);
const tagged = (s, tag) => walk(s.elements).filter(e => e.type === tag);
const marked = (s, key) => walk(s.elements).filter(e => e.props?.[key] !== undefined);
const points = p => p.split(' ').map(pair => pair.split(',').map(Number));
const allText = s => tagged(s, 'tspan').map(e => e.props.children).join(' ');
const rectFor = (s, id) => walk([marked(s, 'data-tutor-node').find(e => e.props['data-tutor-node'] === id)])
  .find(e => e.type === 'rect').props;
const center = r => r.x + r.width / 2;
function fits(s) {
  for (const { props: p } of tagged(s, 'rect')) assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.width <= s.width + 0.01 && p.y + p.height <= s.height + 0.01, JSON.stringify(p));
  for (const { props: p } of [...tagged(s, 'polyline'), ...tagged(s, 'polygon')]) {
    assert.ok(points(p.points).every(([x, y]) => x >= 0 && y >= 0 && x <= s.width + 0.01 && y <= s.height + 0.01), p.points);
  }
  for (const { props: p } of tagged(s, 'text')) {
    for (const { props: span } of [p.children].flat()) {
      const w = textWidth(span.children, p.fontSize);
      const x = p.textAnchor === 'start' ? span.x : p.textAnchor === 'end' ? span.x - w : span.x - w / 2;
      assert.ok(x >= -0.01 && x + w <= s.width + 0.01 && span.y > 0 && span.y <= s.height, String(span.children));
      assert.ok(p.fontSize >= 12, 'text remains readable rather than shrinking to fit');
    }
  }
}
const tree = { kind: 'tree', title: 'Decision', layout: 'binary', nodes: [
  { id: 'r', label: 'x ≤ 4', count: 10, detail: 'Gini = 0.48' },
  { id: 'b', label: 'Class B', parent: 'r', side: 'right', edgeLabel: '> 4', count: 6 },
  { id: 'a', label: 'Class A', parent: 'r', side: 'left', edgeLabel: '≤ 4', count: 4 },
] };
const dendrogram = { kind: 'tree', title: 'Merge distance', layout: 'dendrogram',
  heightAxis: { label: 'Distance', min: 0, max: 10 }, cutoff: { value: 4, label: 'Two clusters' }, nodes: [
    { id: 'root', label: 'All samples', height: 10 },
    { id: 'ab', label: 'A and B', parent: 'root', height: 2 },
    { id: 'a', label: 'A', parent: 'ab', height: 0 }, { id: 'b', label: 'B', parent: 'ab', height: 0 },
    { id: 'c', label: 'C', parent: 'root', height: 0 },
  ] };
const graph = { kind: 'relationship', title: 'Feedback', layout: 'graph',
  nodes: [{ id: 'a', label: 'Model' }, { id: 'b', label: 'User' }, { id: 'c', label: 'Labels' }], edges: [
    { from: 'a', to: 'b', label: 'Predicts' }, { from: 'b', to: 'a', label: 'Requests' },
    { from: 'b', to: 'c', label: 'Corrects' }, { from: 'c', to: 'a', label: 'Retrains' },
  ] };
const flow = { kind: 'flow', title: 'Parallel preparation', nodes: [
  { id: 'f', label: 'Preprocess', role: 'fork' }, { id: 'a', label: 'Scale', role: 'process' },
  { id: 'b', label: 'Encode', role: 'process' }, { id: 'm', label: 'Features', role: 'merge' },
  { id: 'o', label: 'Prediction', role: 'outcome' },
], edges: [{ from: 'f', to: 'a' }, { from: 'f', to: 'b' }, { from: 'a', to: 'm' }, { from: 'b', to: 'm' }, { from: 'm', to: 'o' }] };

test('schemas accept semantic topology metadata and reject authored SVG, colors, and positions', () => {
  for (const d of [tree, dendrogram, graph, flow]) assert.deepEqual(parse(d), d);
  for (const extra of [{ x: 20 }, { fill: 'red' }, { svg: '<path />' }, { url: 'https://example.com' }]) {
    assert.throws(() => parse({ ...tree, nodes: [{ ...tree.nodes[0], ...extra }, ...tree.nodes.slice(1)] }));
  }
  assert.throws(() => parse({ ...tree, nodes: [{ ...tree.nodes[0], count: 1.5 }, ...tree.nodes.slice(1)] }));
  assert.throws(() => parse({ ...tree, nodes: [{ ...tree.nodes[0], count: -1 }, ...tree.nodes.slice(1)] }));
});

test('tree metadata preserves binary left/right slots independent of source order', () => {
  const s = scene(tree);
  assert.ok(center(rectFor(s, 'a')) < center(rectFor(s, 'r')));
  assert.ok(center(rectFor(s, 'b')) > center(rectFor(s, 'r')));
  assert.equal(rectFor(s, 'a').y, rectFor(s, 'b').y);
  for (const value of ['Gini = 0.48', 'n = 10', '> 4', '≤ 4']) assert.ok(allText(s).includes(value));
  fits(s);
});

test('ordinary top-down hierarchy keeps three siblings in authored order and uses no binary slots', () => {
  const d = { kind: 'tree', title: 'Folders', layout: 'hierarchy', nodes: [
    { id: 'r', label: 'Project' }, { id: 'a', label: 'Data', parent: 'r' },
    { id: 'b', label: 'Models', parent: 'r' }, { id: 'c', label: 'Reports', parent: 'r' },
  ] };
  const s = scene(parse(d));
  assert.ok(center(rectFor(s, 'a')) < center(rectFor(s, 'b')) && center(rectFor(s, 'b')) < center(rectFor(s, 'c')));
  assert.ok(rectFor(s, 'a').y > rectFor(s, 'r').y + rectFor(s, 'r').height);
  fits(s);
});

test('new tree path uses the shared highlight style and pruning is visible on the actual branch', () => {
  const d = { ...tree, highlightPath: ['r', 'a'], nodes: tree.nodes.map(n => n.id === 'b' ? { ...n, pruned: true } : n) };
  const s = scene(parse(d));
  assert.equal(marked(s, 'data-tutor-path').filter(e => e.props['data-tutor-node']).length, 2);
  assert.ok(tagged(s, 'polyline').some(e => e.props.stroke === TEACHING.blue));
  assert.ok(allText(s).includes('Pruned'));
  assert.ok(tagged(s, 'polyline').some(e => e.props.strokeDasharray));
  assert.throws(() => parse({ ...d, highlightPath: ['r', 'b'] }), /pruned/i);
  assert.throws(() => parse({ ...d, highlightPath: ['a', 'b'] }), /path/i);
  assert.throws(() => parse({ ...tree, highlightPath: ['r', 'missing'] }), /unknown/i);
  assert.throws(() => parse({ ...tree, nodes: tree.nodes.map(n => n.id === 'a' ? { ...n, count: 20 } : n) }), /count/i);
  fits(s);
});

test('extended outline retains hierarchy ordering while drawing edge labels and metadata', () => {
  const { layout, ...d } = tree;
  d.nodes = tree.nodes.map(({ side, ...n }) => n);
  const s = scene(parse(d));
  assert.ok(rectFor(s, 'b').x > rectFor(s, 'r').x);
  assert.ok(allText(s).includes('> 4') && allText(s).includes('n = 10'));
  fits(s);
});

test('no extension preserves legacy tree, relationship and flow SVG exactly', () => {
  const plainTree = { ...tree, nodes: tree.nodes.map(({ id, label, parent, side }) => ({ id, label, ...(parent ? { parent, side } : {}) })) };
  const { layout, ...plainGraph } = graph;
  const plainFlow = { kind: 'flow', title: 'Old flow', nodes: [{ id: 'a', label: 'Start', role: 'process' }, { id: 'b', label: 'Done', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] };
  for (const d of [plainTree, { ...plainTree, layout: undefined, nodes: plainTree.nodes.map(({ side, ...n }) => n) }, plainGraph, plainFlow]) {
    assert.equal(renderToStaticMarkup(h('svg', null, ...scene(d).elements)), renderToStaticMarkup(h('svg', null, ...legacy[d.kind](d, 320).elements)));
    assert.equal(specModule.describe(d), null);
    assert.equal(specModule.visibleText(d), null);
  }
});

test('dendrogram heights and cutoff map proportionally to one numeric scale', () => {
  const s = scene(parse(dendrogram));
  const marks = new Map(marked(s, 'data-tutor-merge-height').map(e => [e.props['data-tutor-node'], e.props]));
  const y = id => marks.get(id).cy;
  assert.ok(y('root') < y('ab') && y('ab') < y('a'));
  assert.ok(Math.abs((y('a') - y('ab')) / (y('a') - y('root')) - 0.2) < 1e-9);
  const cut = marked(s, 'data-tutor-cutoff')[0].props;
  assert.ok(Math.abs((y('a') - cut.y1) / (y('a') - y('root')) - 0.4) < 1e-9);
  assert.ok(allText(s).includes('Two clusters') && allText(s).includes('Distance'));
  fits(s);
});

test('close and tied dendrogram heights keep true merge points while separating index annotations', () => {
  const d = { ...dendrogram, cutoff: { value: 9.995, label: 'Close cutoff' }, nodes: [
    { id: 'root', label: 'All samples', height: 10 },
    { id: 'a', label: 'A', parent: 'root', height: 0 },
    { id: 'middle', label: 'Middle samples', parent: 'root', height: 9.99 },
    { id: 'f', label: 'F', parent: 'root', height: 0 },
    { id: 'b', label: 'B', parent: 'middle', height: 0 },
    { id: 'inner', label: 'Inner samples', parent: 'middle', height: 9.99 },
    { id: 'e', label: 'E', parent: 'middle', height: 0 },
    { id: 'c', label: 'C', parent: 'inner', height: 0 },
    { id: 'd', label: 'D', parent: 'inner', height: 0 },
  ] };
  const s = scene(parse(d));
  const badges = tagged(s, 'text').filter(e => e.props.fontSize === 12).map(e => e.props);
  assert.equal(badges.length, 3);
  for (let i = 0; i < badges.length; i++) for (let j = i + 1; j < badges.length; j++) {
    assert.ok(Math.hypot(badges[i].x - badges[j].x, badges[i].y - badges[j].y) >= 22, 'merge index badges do not overlap');
  }
  const marks = new Map(marked(s, 'data-tutor-merge-height').map(e => [e.props['data-tutor-node'], e.props]));
  const root = marks.get('root'), middle = marks.get('middle'), inner = marks.get('inner');
  assert.equal(root.cx, middle.cx);
  assert.equal(middle.cx, inner.cx);
  assert.equal(middle.cy, inner.cy, 'tied merge heights stay tied');
  assert.ok(Math.abs(middle.cy - root.cy - 0.28) < 1e-9, '10 minus 9.99 maps to 0.28 pixels on the 280-pixel axis');
  const cut = marked(s, 'data-tutor-cutoff')[0].props;
  assert.ok(Math.abs(cut.y1 - root.cy - 0.14) < 1e-9);
  const leaders = marked(s, 'data-tutor-merge-leader');
  assert.equal(leaders.length, 3);
  for (const leader of leaders) {
    const mark = marks.get(leader.props['data-tutor-merge-leader']);
    const route = points(leader.props.points);
    assert.deepEqual(route[0], [mark.cx, mark.cy]);
    assert.ok(badges.some(b => b.x === route.at(-1)[0] && b.y === route.at(-1)[1]));
  }
  for (const edge of marked(s, 'data-tutor-edge')) {
    const [parentId, childId] = edge.props['data-tutor-edge'].split(':');
    const route = points(walk([edge]).find(e => e.type === 'polyline').props.points);
    assert.deepEqual(route[0], [marks.get(childId).cx, marks.get(childId).cy]);
    assert.deepEqual(route.at(-1), [marks.get(parentId).cx, marks.get(parentId).cy]);
  }
  fits(s);
});

test('dendrogram rejects inverted merges, out-of-range cutoffs, missing heights and nonzero leaves', () => {
  for (const change of [
    { heightAxis: { label: 'Distance', min: 1, max: 10 } },
    { cutoff: { label: 'Bad cutoff', value: 11 } },
    { nodes: dendrogram.nodes.map(n => n.id === 'ab' ? { ...n, height: 11 } : n) },
    { nodes: dendrogram.nodes.map(n => n.id === 'a' ? { ...n, height: 3 } : n) },
    { nodes: dendrogram.nodes.map(n => n.id === 'ab' ? { ...n, height: undefined } : n) },
  ]) assert.throws(() => parse({ ...dendrogram, ...change }));
  assert.throws(() => parse({ ...tree, heightAxis: dendrogram.heightAxis }), /dendrogram/i);
});

test('connected relationship graph draws every node once and reciprocal links on distinct routes', () => {
  const s = scene(parse(graph));
  assert.deepEqual(marked(s, 'data-tutor-node').map(e => e.props['data-tutor-node']).sort(), ['a', 'b', 'c']);
  const routes = marked(s, 'data-tutor-edge');
  const route = pair => walk([routes.find(e => e.props['data-tutor-edge'] === pair)]).find(e => e.type === 'polyline').props.points;
  assert.notEqual(route('a:b'), route('b:a'));
  assert.equal(marked(s, 'data-tutor-arrowhead').length, graph.edges.length);
  for (const edge of graph.edges) assert.ok(allText(s).includes(edge.label));
  fits(s);
});

test('graph requires connected relationships even when every node participates in a separate component', () => {
  assert.throws(() => parse({ ...graph, nodes: [...graph.nodes, { id: 'd', label: 'Fourth' }],
    edges: [{ from: 'a', to: 'b', label: 'One' }, { from: 'c', to: 'd', label: 'Two' }] }), /connect/i);
});

test('fork and merge roles reuse flow routing and do not turn simultaneous branches into decisions', () => {
  const s = scene(parse(flow));
  assert.equal(tagged(s, 'polygon').filter(e => !Object.hasOwn(e.props, 'data-tutor-arrowhead')).length, 0);
  assert.equal(marked(s, 'data-tutor-edge').length, 5);
  assert.ok(rectFor(s, 'a').y > rectFor(s, 'f').y && rectFor(s, 'm').y > rectFor(s, 'a').y);
  assert.ok(allText(s).includes('Parallel') && allText(s).includes('Merge'));
  fits(s);
});

test('fork and merge reject ambiguous role topology', () => {
  assert.throws(() => parse({ ...flow, edges: flow.edges.filter(e => !(e.from === 'f' && e.to === 'b')) }), /fork/i);
  assert.throws(() => parse({ ...flow, edges: flow.edges.filter(e => !(e.from === 'b' && e.to === 'm')) }), /merge/i);
  assert.throws(() => parse({ ...flow, edges: [...flow.edges, { from: 'm', to: 'a' }] }), /merge/i);
});

test('descriptions and visible text expose all new semantic labels and numeric metadata', () => {
  parse(tree);
  for (const d of [tree, dendrogram, graph, flow]) {
    const descriptions = specModule.describe(d).join(' ');
    const visible = specModule.visibleText(d).join(' ');
    for (const label of d.nodes.map(n => n.label)) assert.ok(descriptions.includes(label) && visible.includes(label));
  }
  assert.ok(specModule.visibleText(tree).join(' ').includes('Gini = 0.48'));
  assert.ok(specModule.describe(dendrogram).join(' ').includes('4'));
  assert.ok(specModule.describe(flow).join(' ').includes('simultaneous'));
});

test('runnable reference fixtures cover structure operations, nonbinary hierarchies and ML topologies', () => {
  assert.ok(referenceModule, 'Topology references are implemented');
  const refs = referenceModule.references;
  assert.ok(refs.length >= 12);
  assert.equal(new Set(refs.map(r => r.id)).size, refs.length);
  for (const ref of refs) {
    assert.ok(ref.prompts.length && ref.keywords.length && ref.useWhen);
    const d = parse(ref.spec.diagram);
    assert.ok(ref.spec.version === 1);
    const s = scene(d);
    fits(s);
    assert.equal(renderToStaticMarkup(h('svg', null, ...s.elements)).includes('NaN'), false, ref.id);
  }
  for (const term of ['inorder', 'insertion', 'folder', 'family', 'pruning', 'isolation', 'kd', 'dendrogram', 'preprocessing', 'bagging', 'stacking', 'store', 'feedback', 'lineage']) {
    assert.ok(refs.some(r => [r.id, ...r.keywords].join(' ').toLowerCase().includes(term)), term);
  }
  const operations = refs.filter(r => /inorder|insertion/.test(r.id));
  assert.equal(operations.length, 2);
  assert.ok(operations.every(r => r.spec.diagram.kind === 'tree' && r.spec.diagram.layout === 'binary'));
});
