import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EXAMPLES, cardsFor, mayConfirmPaid, pickerSections, runLearnCommand } from './learn-slash.js';
import { CHAT_EXAMPLES, ILLUSTRATIONS, SAMPLES, demoOf, filterSections } from './slash-sheet.js';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';
import { validSources } from './card-sources.js';

const commands = pickerSections('/').flatMap(section => section.items);
const names = sections => sections.flatMap(section => section.items.map(item => item.name));
const asset = path => existsSync(new URL(`../public${path}`, import.meta.url));

test('every command in the sheet has a demo: a card, the card /source opens, or an example exchange', () => {
  assert.equal(commands.length, 23);
  for (const { name } of commands) {
    const demo = demoOf(name);
    assert.ok(demo, `/${name} has a demo`);
    if (demo === 'chat') assert.ok(CHAT_EXAMPLES[name].about && CHAT_EXAMPLES[name].answer && EXAMPLES[name], `/${name} exchange`);
    if (demo === 'cards') assert.ok(cardsFor(name).length, `/${name} cards`);
  }
  assert.deepEqual(commands.filter(({ name }) => demoOf(name) === 'chat').map(({ name }) => name), ['deeper', 'dive', 'simplify', 'example', 'ask', 'teach']);
  assert.equal(demoOf('source'), 'sources');
  assert.ok(validSources(SAMPLES.source.explanation.sources).length === SAMPLES.source.explanation.sources.length, '/source shows only valid sources');
});

test('paid media always shows a finished example: a committed clip or a labelled picture, never a Generate card', () => {
  const paid = commands.filter(({ name }) => mayConfirmPaid(name)).map(({ name }) => name);
  assert.deepEqual(paid, ['animate', 'video', '3d']);
  for (const name of paid) {
    for (const { card } of cardsFor(name)) {
      const finished = SAMPLES[name]?.[card];
      assert.ok(finished?.status === 'ready' || ILLUSTRATIONS[card], `/${name} ${card} is finished`);
      assert.ok(asset(finished?.status === 'ready' ? finished.src : ILLUSTRATIONS[card].src), `/${name} ${card} asset is committed`);
    }
  }
});

test('the demos keep one thread and match their e.g. line', () => {
  // /animate's clip is softmax; its example asks for exactly that.
  assert.match(EXAMPLES.animate, /softmax/);
  assert.match(SAMPLES.animate.mathAnimation.title, /^Softmax/);
  // /compare sigmoid vs tanh: every representation the tutor may pick compares those two.
  assert.match(EXAMPLES.compare, /sigmoid vs tanh/);
  assert.deepEqual(Object.keys(SAMPLES.compare), cardsFor('compare').map(entry => entry.card));
  for (const sample of Object.values(SAMPLES.compare)) assert.match(sample.title, /^Sigmoid vs tanh/);
  validateGraph(SAMPLES.compare.graph.spec);
  validateGraph(SAMPLES.compare.plot.spec);
  // Descriptions share one form: a short imperative in sentence case, no full stop.
  for (const { name, desc } of commands) assert.match(desc, /^[A-Z][a-z]+(?: [^ ]+){0,5}$/, `/${name}: ${desc}`);
});

test('the sheet search filters by name and description, ignores a leading /, and can match nothing', () => {
  const all = pickerSections('/');
  assert.equal(filterSections(all, ''), all);
  assert.equal(filterSections(all, ' / '), all);
  assert.deepEqual(names(filterSections(all, '/gra')), ['graph', 'diagram']);
  assert.deepEqual(names(filterSections(all, 'FLASH')), ['flashcards']);
  assert.deepEqual(names(filterSections(all, 'plot')), ['graph']);
  assert.deepEqual(names(filterSections(all, 'evidence')), ['source']);
  assert.deepEqual(filterSections(all, 'zzz'), []);
  // A section with no match is dropped; the rest keep their titles.
  assert.deepEqual(filterSections(all, 'notebook').map(section => section.title), ['Create']);
});

test('the sheet wires its search: focused on open, Enter takes the first match, Esc clears before it closes', () => {
  const sheet = readFileSync(new URL('./SlashCommandsSheet.jsx', import.meta.url), 'utf8');
  assert.match(sheet, /<Input type="search" autoFocus data-slash-search/);
  assert.match(sheet, /event\.key === 'Enter' && shown\.length\) \{ event\.preventDefault\(\); choose\(shown\[0\]\.items\[0\]\.name\)/);
  assert.match(sheet, /if \(query\) setQuery\(''\); else onClose\(\);/);
  assert.match(sheet, />No commands match</);
});

test('/source opens the selected card through the page, and says so when the page cannot', async () => {
  const opened = [];
  const canvas = { openSources: id => { opened.push(id); return {}; } };
  assert.deepEqual(await runLearnCommand('/source', { app: 'demo', target: { id: 'card-1', title: 'An id' }, canvas, post: async () => ({}) }), {});
  await runLearnCommand('/source', { app: 'demo', canvas, post: async () => ({}) });
  assert.deepEqual(opened, ['card-1', null]);
  assert.match((await runLearnCommand('/source', { app: 'demo', canvas: {}, post: async () => ({}) })).notice.text, /not available/);
});
