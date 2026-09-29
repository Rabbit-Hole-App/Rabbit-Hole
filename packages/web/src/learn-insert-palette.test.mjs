import test from 'node:test';
import assert from 'node:assert/strict';
import { INSERT_GROUPS, MORE_ITEMS, DEV_ONLY_ITEMS, paletteSections, insertName } from './learn-insert-palette.js';

// A stand-in for BLOCK_TYPES: every canvas block type the palette names.
const TYPES = Object.fromEntries([...INSERT_GROUPS.flatMap(group => group.items), ...MORE_ITEMS, ...DEV_ONLY_ITEMS, 'pipeline', 'animationAxis']
  .filter(id => id !== 'notebook').map(id => [id, { label: id === 'knowledge' ? 'Graph' : id }]));

test('the palette is grouped the way learners think, with Notebook under Code', () => {
  const sections = paletteSections(TYPES);
  assert.deepEqual(sections.map(section => section.title), ['Check understanding', 'Explain', 'Code', 'Visualize', 'Sources', 'More']);
  assert.deepEqual(sections.find(section => section.title === 'Code').items, ['snippet', 'code', 'notebook']);
});

test('paid generation, narration and the reference animation stay dev-only; retired types never show', () => {
  const visible = paletteSections(TYPES).flatMap(section => section.items);
  for (const id of DEV_ONLY_ITEMS) assert.ok(!visible.includes(id), `${id} is hidden in production`);
  const dev = paletteSections(TYPES, { dev: true }).flatMap(section => section.items);
  for (const id of DEV_ONLY_ITEMS) assert.ok(dev.includes(id), `${id} is there in dev`);
  for (const id of ['pipeline', 'animationAxis']) assert.ok(!dev.includes(id));
});

test('search filters across the visible tools by their learner-facing names', () => {
  assert.deepEqual(paletteSections(TYPES, { filter: 'knowledge' }).flatMap(section => section.items), ['knowledge']);
  assert.equal(insertName('knowledge', TYPES), 'Knowledge graph');
  assert.deepEqual(paletteSections(TYPES, { filter: 'zzz' }), []);
});
