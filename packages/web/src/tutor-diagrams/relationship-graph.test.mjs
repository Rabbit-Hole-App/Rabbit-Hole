// REL-1: the relationship graph fills its boxes from their place in the graph, draws a label that fits on its arrow, shares one note between arrows that carry the same sentence,
// and keeps the numbered list for the labels that do not fit (never restating the node names).
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from './TutorDiagram.js';
import { FILLS } from './theme/palette.js';

const draw = (diagram, width = 408) => { const r = renderTutorDiagram({ version: 1, diagram: { kind: 'relationship', layout: 'graph', title: 'Graph', ...diagram } }, width); return { svg: renderToStaticMarkup(r.element), width: r.width }; };
const badges = svg => [...svg.matchAll(/<circle[^>]*r="10"[^>]*\/?>(?:<\/circle>)?<text[^>]*><tspan[^>]*>(\d+)<\/tspan>/g)].map(match => Number(match[1]));
// the text the card shows (its tspans, a wrapped line joined with a space); the aria-label and the title are not part of it
const shown = svg => [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(match => match[1]).join(' ');
const nodes = [{ id: 'a', label: 'Input' }, { id: 'b', label: 'Middle' }, { id: 'c', label: 'Result' }];

test('boxes are filled by their place in the graph: no arrow leaves it, an outcome (teal); the rest, an input included, a process (blue); never white', () => {
  const { svg } = draw({ nodes, edges: [{ from: 'a', to: 'b', label: 'Feeds' }, { from: 'b', to: 'c', label: 'Becomes' }] });
  const fills = [...svg.matchAll(/<g data-tutor-node="[^"]*"[^>]*><rect[^>]* fill="([^"]*)"/g)].map(match => match[1].toUpperCase());
  assert.deepEqual(fills, [FILLS.blue, FILLS.blue, FILLS.teal]);
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
