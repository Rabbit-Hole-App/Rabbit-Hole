// learn-section-store.js: the plan's section ids, and the learn_sections row written with its revision guard (learn-migrations 0046).
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { planSections, readSection, readSections, updateSection, withStatus } from '../src/learn-section-store.js';

const ACTOR = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };

test('planSections numbers the accepted plan as the contents do and reads the [files: ...] suffix and (background)', () => {
  const ops = [
    { op: 'add', level: 1, key: 'c0', text: 'Where it starts' },
    { op: 'add', level: 2, parent: 'c0', text: 'Reading the input', description: 'What comes in. [files: src/a.js, src/b.js]' },
    { op: 'add', level: 2, parent: 'c0', text: 'Why it exists', description: 'The idea behind it (background)' },
    { op: 'add', level: 1, key: 'c1', text: 'Where it ends' },
    { op: 'add', level: 2, parent: 'c1', text: 'Writing the output', description: 'What goes out. [files: src/c.js]' },
  ];
  const sections = planSections({ ops });
  assert.deepEqual(sections.map(s => [s.id, s.title, s.files, s.background]), [['1.1', 'Reading the input', ['src/a.js', 'src/b.js'], false], ['1.2', 'Why it exists', [], true], ['2.1', 'Writing the output', ['src/c.js'], false]]);
  assert.equal(sections[0].description, 'What comes in.');
  assert.deepEqual(sections[2].chapter, { n: 2, title: 'Where it ends' });
  assert.deepEqual(withStatus([{ id: '2.1', status: 'briefed' }], '1.1', 'made', sections.map(s => s.id)), [{ id: '1.1', status: 'made' }, { id: '2.1', status: 'briefed' }]);
});

test('updateSection inserts, then updates under the revision, and keeps the fields it was not given', async t => {
  const { LEARN_DB } = learnDb(t);
  const env = { LEARN_DB };
  assert.equal(await readSection(env, ACTOR, '1.1'), null);
  const first = await updateSection(env, ACTOR, '1.1', () => ({ brief: { beats: [] } }));
  assert.deepEqual([first.revision, first.brief, first.composition, first.made], [1, { beats: [] }, null, []]);
  const second = await updateSection(env, ACTOR, '1.1', current => ({ made: [...current.made, { itemId: 'i1' }] }));
  assert.deepEqual([second.revision, second.brief, second.made], [2, { beats: [] }, [{ itemId: 'i1' }]]);
  await updateSection(env, ACTOR, '2.1', () => ({ brief: { beats: [1] } }));
  await updateSection(env, { ...ACTOR, board: 'other' }, '1.2', () => ({ brief: {} }));
  assert.deepEqual((await readSections(env, ACTOR)).map(s => s.sectionId), ['1.1', '2.1'], 'one board only, in plan order');
});
