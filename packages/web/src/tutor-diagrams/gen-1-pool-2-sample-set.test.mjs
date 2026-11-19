import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { derived, drawnSlips, trays } from './gen-1-pool-2-sample-set-data.js';
import { references } from './gen-1-pool-2-sample-set-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const counts = new Map(trays.map(({ id }) => [id, 0]));
for (const id of drawnSlips) {
  assert.ok(counts.has(id), id);
  counts.set(id, counts.get(id) + 1);
}
const neverDrawn = [...counts.keys()].filter(id => counts.get(id) === 0);

test('bakery tickets independently account for every draw and unpicked tray', () => {
  const tally = derived();
  assert.equal(tally.draws, [...counts.values()].reduce((a, b) => a + b, 0));
  assert.equal(tally.trayCount, counts.size);
  assert.equal(tally.inspected, [...counts.values()].filter(count => count > 0).length);
  assert.equal(tally.unpicked, neverDrawn.length);
  assert.deepEqual(tally.omitted, neverDrawn);
  assert.ok(tally.inspected < tally.draws);
  assert.match(references[0].depths.deep.spec.diagram.caption,
    new RegExp(`^${tally.draws} draws reached ${tally.inspected} of ${tally.trayCount} trays\\. The complement holds the other ${tally.unpicked}\\.$`));
});

test('code fills only the undrawn group and draws each member at every depth', () => {
  for (const [level, { spec }] of Object.entries(references[0].depths)) {
    const [draw, complement] = spec.diagram.groups;
    assert.equal(complement.members, undefined, level);
    assert.equal(complement.outOfBagFor, draw.id, level);
    assert.deepEqual(draw.members, drawnSlips, level);
    assert.deepEqual(draw.omitted, level === 'overview' ? undefined : neverDrawn, level);
    const parsed = parseTutorDiagram(spec);
    assert.deepEqual(parsed.diagram.groups[1].members, neverDrawn, level);
    const svg = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
    for (const id of neverDrawn) assert.ok(svg.includes(`data-tutor-sample-member="unpicked:${id}"`), level);
  }
});
