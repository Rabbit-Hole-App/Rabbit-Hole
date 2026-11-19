// REL-1: the relationship graph fills its boxes from their place in the graph, draws a label that fits on its arrow, shares one note between arrows that carry the same sentence,
// and keeps the numbered list for the labels that do not fit (never restating the node names).
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from './TutorDiagram.js';
import { FILLS } from './theme/palette.js';
import { TEACHING_ROLE_FILL } from './teaching-theme.js';
import kindGallery from './kind-gallery.json' with { type: 'json' };
import { diagramReferences } from './reference-library.js';
import { illustrationSpecs } from '../../scripts/illustration-previews.mjs';
import { labelDistances, relationshipGeometry } from './test-relationship-geometry.mjs';

const draw = (diagram, width = 408) => { const r = renderTutorDiagram({ version: 1, diagram: { kind: 'relationship', layout: 'graph', title: 'Graph', ...diagram } }, width); return { svg: renderToStaticMarkup(r.element), width: r.width }; };
const badges = svg => [...svg.matchAll(/<circle[^>]*r="10"[^>]*\/?>(?:<\/circle>)?<text[^>]*><tspan[^>]*>(\d+)<\/tspan>/g)].map(match => Number(match[1]));
// the text the card shows (its tspans, a wrapped line joined with a space); the aria-label and the title are not part of it
const shown = svg => [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(match => match[1]).join(' ');
const nodes = [{ id: 'a', label: 'Input' }, { id: 'b', label: 'Middle' }, { id: 'c', label: 'Result' }];

test('boxes are filled by their place in the graph: no arrow leaves it, an outcome (teal); none enters it, an input (the scene theme operator lavender); the rest, a process (blue); never white', () => {
  const { svg } = draw({ nodes, edges: [{ from: 'a', to: 'b', label: 'Feeds' }, { from: 'b', to: 'c', label: 'Becomes' }] });
  const fills = [...svg.matchAll(/<g data-tutor-node="[^"]*"[^>]*><rect[^>]* fill="([^"]*)"/g)].map(match => match[1].toUpperCase());
  assert.deepEqual(fills, [FILLS.lavender, FILLS.blue, FILLS.teal]);
  assert.equal(FILLS.lavender, TEACHING_ROLE_FILL.operator, 'the input fill is the scene theme operator fill');
  // the schema refuses a box with no arrow at all ("Every relationship node needs a link"), so there is no isolated-box case
  assert.doesNotMatch(svg, /#fff(fff)?"|fill="white"/i);
});

test('a label that fits stands on its arrow: no badge and no list line', () => {
  const { svg } = draw({ nodes, edges: [{ from: 'a', to: 'b', label: 'Feeds' }, { from: 'b', to: 'c', label: 'Becomes' }] });
  assert.match(svg, />Feeds</);
  assert.match(svg, />Becomes</);
  assert.deepEqual(badges(svg), []);
  assert.doesNotMatch(svg, />\d\. /);
});

test('arrows that carry the same sentence share one note: the same badge number on each, one list line, no node names', () => {
  const { svg } = draw({ nodes: [...nodes, { id: 'd', label: 'Copy' }], edges: [{ from: 'a', to: 'b', label: 'Passes it on' }, { from: 'c', to: 'd', label: 'Passes it on' }, { from: 'b', to: 'c', label: 'Becomes' }] });
  assert.deepEqual(badges(svg), [1, 1]);
  assert.equal((svg.match(/>1\. Passes it on</g) ?? []).length, 1, 'the sentence is printed once');
  assert.doesNotMatch(shown(svg), /→/);
});

test('a label that does not fit anywhere still shows, in the numbered list, without the node names', () => {
  const long = 'Carries the whole earlier context forward unchanged';
  const crowded = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, label: `Step ${i + 1}` }));
  const edges = [...crowded.slice(1).map((n, i) => ({ from: crowded[i].id, to: n.id, label: `${long} ${i + 1}`.slice(0, 48) })), { from: 'n0', to: 'n7', label: long.slice(0, 48) }, { from: 'n1', to: 'n6', label: 'Skips ahead by a long way round the others' }];
  const { svg } = draw({ nodes: crowded, edges }, 320);
  const text = shown(svg);
  assert.ok(badges(svg).length > 0, 'some labels do not fit at 320 px and get a badge and a list line');
  assert.match(text, /\d\. Carries the whole earlier context/);
  assert.doesNotMatch(text, /Step \d → /);
  // every label is on the card: on its arrow or in the list
  for (const edge of edges) assert.ok(text.includes(edge.label), edge.label);
});

test('the card at 408 never passes 720 px wide', () => {
  const { width } = draw({ nodes: [...nodes, { id: 'd', label: 'Fourth step' }], edges: [{ from: 'a', to: 'b', label: 'Sends the first message along' }, { from: 'b', to: 'c', label: 'Sends the second message along' }, { from: 'c', to: 'd', label: 'Sends the third message along' }, { from: 'a', to: 'd', label: 'Skips straight to the end of the line' }] });
  assert.ok(width <= 720, `width ${width}`);
});

// A label stands on an arrow only when that arrow's own wire is the nearest wire to it: within NEAR px of the label box and every other edge's wire at least CLEAR px farther.
const NEAR = 6, CLEAR = 24;
const relationshipSpecs = () => {
  const specs = new Map(), illustrated = new Map([...illustrationSpecs()].map(({ id, spec }) => [id, spec]));
  for (const { id, spec } of [...diagramReferences, ...kindGallery.map(spec => ({ id: `shape-${spec.diagram.kind}`, spec }))]) if (!illustrated.has(id)) specs.set(id, spec);
  for (const [id, spec] of illustrated) specs.set(id, spec);
  return [...specs].filter(([, { diagram: d }]) => d.kind === 'relationship' && (d.layout === 'graph' || d.nodes?.some(n => n.tensor)));
};
const ownsLabel = (edges, edge) => { const { own, other } = labelDistances(edges, edge); return own <= NEAR && other - own >= CLEAR; };
const drawn = (spec, width) => { const r = renderTutorDiagram(spec, width); return { edges: relationshipGeometry(r.element), text: shown(renderToStaticMarkup(r.element)) }; };

test('the rule rejects a label that stands as the old placements did: 7 to 8 px from its wire, a foreign wire 7 px away or 19 px away', () => {
  const edge = (x, label) => ({ segments: [{ x1: x, y1: 0, x2: x, y2: 300 }], label });
  const box = (x1, y1) => ({ text: 't', box: { x1, y1, x2: x1 + 80, y2: y1 + 17 } });
  const old = edge(300, box(212, 100)), flush = edge(300, box(216, 100));
  const run = { segments: [{ x1: 100, y1: 90, x2: 400, y2: 90 }], label: null };           // a foreign run 7 px above the label
  assert.equal(ownsLabel([old, run], old), false);
  assert.equal(ownsLabel([flush, { segments: [{ x1: 100, y1: 60, x2: 400, y2: 60 }], label: null }], flush), true, 'flush and 33 px from the foreign run');
  assert.equal(ownsLabel([edge(300, box(212, 100))], edge(300, box(212, 100))), false, 'a label 8 px from its own wire is not near enough');
  assert.equal(ownsLabel([flush, { segments: [{ x1: 100, y1: 79, x2: 400, y2: 79 }], label: null }], flush), false, 'a foreign wire 19 px from the label is not a clear margin');
});

test('all 57 relationship specs: every label on an arrow stands within 6 px of its own wire and 24 px nearer to it than to any other edge (320, 408, 720 and 960 px)', () => {
  const specs = relationshipSpecs();
  assert.equal(specs.length, 57);
  let checked = 0;
  for (const width of [320, 408, 720, 960]) for (const [id, spec] of specs) {
    const { edges } = drawn(spec, width);
    for (const edge of edges.filter(e => e.label)) { checked++; assert.ok(ownsLabel(edges, edge), `${id} @ ${width}: "${edge.label.text}" ${JSON.stringify(labelDistances(edges, edge))}`); }
  }
  assert.ok(checked > 500, `${checked} labels checked`);
});

test('the named failures: a label that is not the nearest to its own arrow is in the notes, else it stands on its own arrow', () => {
  const named = [['d2l-regularized-forward-graph', 'Sets the penalty'], ['d2l-regularized-forward-graph', 'Adds fitting error'], ['d2l-dense-hidden-layer-activations', 'Supplies a new weighted input']];
  const specs = new Map(relationshipSpecs());
  for (const width of [408, 720]) for (const [id, sentence] of named) {
    const { edges, text } = drawn(specs.get(id), width);
    const edge = edges.find(e => e.label?.text === sentence);
    if (edge) assert.ok(ownsLabel(edges, edge), `${id} @ ${width}: ${sentence}`);
    else assert.match(text, new RegExp(`\d\. ${sentence}`), `${sentence} is in the numbered list`);
  }
});
