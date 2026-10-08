import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EXAMPLES, mayConfirmPaid, pickerSections, runLearnCommand, searchSections } from './learn-slash.js';
import { CHAT_EXAMPLES, ILLUSTRATIONS, SAMPLES, demoOf, sheetCards } from './slash-sheet.js';
import { filterSections } from './command-search.js';
import { SLASH } from './agent/slash.js';
import { exampleFor, modesFor, resultFor, shortcutsFor } from './agent/bar.js';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';
import { validSources } from './card-sources.js';

const commands = pickerSections('/').flatMap(section => section.items);
// A development build (VITE_MOTION_DEV) also offers /motion.
const devCommands = pickerSections('/', { motionDev: true }).flatMap(section => section.items);
const names = sections => sections.flatMap(section => section.items.map(item => item.name));
const asset = path => existsSync(new URL(`../public${path}`, import.meta.url));

test('every command in the sheet has a demo: a card, the card /source opens, or an example exchange', () => {
  assert.equal(commands.length, 23);
  assert.deepEqual(devCommands.map(({ name }) => name).filter(name => !commands.some(command => command.name === name)), ['motion']);
  for (const { name } of devCommands) {
    const demo = demoOf(name);
    assert.ok(demo, `/${name} has a demo`);
    assert.ok(EXAMPLES[name]?.startsWith(`/${name}`), `/${name} has an e.g. line`);
    if (demo === 'chat') assert.ok(CHAT_EXAMPLES[name].about && CHAT_EXAMPLES[name].answer, `/${name} exchange`);
    if (demo === 'cards') assert.ok(sheetCards(name).length, `/${name} cards`);
  }
  assert.deepEqual(commands.filter(({ name }) => demoOf(name) === 'chat').map(({ name }) => name), ['deeper', 'dive', 'simplify', 'example', 'ask', 'teach']);
  assert.equal(demoOf('source'), 'sources');
  assert.ok(validSources(SAMPLES.source.explanation.sources).length === SAMPLES.source.explanation.sources.length, '/source shows only valid sources');
});

test('paid media always shows a finished example: a committed clip or a labelled picture, never a Generate card', () => {
  const paid = devCommands.filter(({ name }) => mayConfirmPaid(name)).map(({ name }) => name);
  assert.deepEqual(paid, ['animate', 'video', '3d', 'motion']);
  // /motion's clip is the landing page's /motion explainer: its e.g. line asks for its 25 s.
  assert.match(EXAMPLES.motion, /25s explain softmax/);
  assert.equal(SAMPLES.motion.videoGenerate.motion.duration_seconds, 25);
  // A picture stands in only where the sample has no clip of its own: /motion plays its clip on the video card /video pictures.
  assert.match(readFileSync(new URL('./SlashCommandsSheet.jsx', import.meta.url), 'utf8'), /: ILLUSTRATIONS\[type\] && !block\.src\s/);
  for (const name of paid) {
    for (const { card } of sheetCards(name)) {
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
  assert.deepEqual(Object.keys(SAMPLES.compare), sheetCards('compare').map(entry => entry.card));
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

test('both sheets share the search: focused on open, Enter takes the first match, Esc clears before it closes', () => {
  const list = readFileSync(new URL('./CommandList.jsx', import.meta.url), 'utf8');
  assert.match(list, /<Input type="search" autoFocus data-slash-search/);
  assert.match(list, /event\.key === 'Enter' && shown\.length\) \{ event\.preventDefault\(\); onChoose\(shown\[0\]\.items\[0\]\.name\)/);
  assert.match(list, /if \(query\) setQuery\(''\); else onClose\(\);/);
  assert.match(list, />No commands match</);
  const learn = readFileSync(new URL('./SlashCommandsSheet.jsx', import.meta.url), 'utf8');
  const bar = readFileSync(new URL('./agent/BarCommandsSheet.jsx', import.meta.url), 'utf8');
  assert.match(learn, /<CommandList sections=\{sections\} current=\{name\} onChoose=\{choose\} onClose=\{onClose\} row="data-slash-help"/);
  assert.match(bar, /<CommandList sections=\{sections\} current=\{name\} onChoose=\{setName\} onClose=\{onClose\} row="data-bar-command" capture/);
  // The Agent Bar's sheet loads nothing of Learn's: the search is its own module.
  assert.doesNotMatch(list + bar, /slash-sheet\.js|learn-slash\.js|LearningBlocks/);
});

test('Auto opens each composer palette on a search field: the sheets\' search, More learning tools included, keys kept in the field', () => {
  // The canvas palette searches the bare / menu by name and description; a More learning tools match shows open, under its title.
  assert.deepEqual(searchSections('/walk').map(section => [section.title, section.collapsible, section.items.map(item => item.name)]), [['More learning tools', false, ['walkthrough']]]);
  assert.deepEqual(names(searchSections('plot')), ['graph']);
  assert.deepEqual(searchSections('zzz'), []);
  const palette = readFileSync(new URL('./LearnSlash.jsx', import.meta.url), 'utf8');
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  const bar = readFileSync(new URL('./agent/AgentBar.jsx', import.meta.url), 'utf8');
  // Auto (not a typed /) opens the field; it is the sheets' own field (CommandSearch: autoFocus, type="search").
  assert.match(ask, /const openPalette = \(\) => \{[^\n]*slashRef\.current\?\.search\(\); \};/);
  assert.match(bar, /else \{ setPicker\(true\); setQuery\(''\); \}/);
  for (const source of [palette, bar]) assert.match(source, /<CommandSearch className="flex-1" value=\{query\}/);
  assert.match(palette, /const sections = busy \? null : query \? searchSections\(query\) : pickerSections\(input, \{ catalog \}\);/);
  // Up/down and Enter run the palette's own keys; Esc clears a typed search before it closes; an empty search says so.
  assert.match(palette, /if \(event\.key !== 'Escape'\) return apiRef\.current\.onKeyDown\(event\);/);
  assert.match(palette, /if \(query\) setQuery\(''\); else \{ setInput\(''\); composerRef\?\.current\?\.focus\(\); \}/);
  assert.match(bar, /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); if \(entries\.length\) pick\(entries\[hiIndex\]\); \}/);
  assert.match(bar, /if \(e\.key === 'Escape' && query\) \{ e\.stopPropagation\(\); setQuery\(''\); \}/);
  assert.match(palette, /'No commands match'/);
  assert.match(bar, />No commands match</);
  // No layout jump while filtering: the canvas palette is a fixed height while searching; the bar's list keeps its opening height.
  assert.match(palette, /query === null \? 'max-h-80' : 'h-80'/);
  assert.match(bar, /style=\{\{ minHeight: listHeight \?\? undefined \}\}/);
});

test('/source opens the selected card through the page, and says so when the page cannot', async () => {
  const opened = [];
  const canvas = { openSources: id => { opened.push(id); return {}; } };
  assert.deepEqual(await runLearnCommand('/source', { app: 'demo', target: { id: 'card-1', title: 'An id' }, canvas, post: async () => ({}) }), {});
  await runLearnCommand('/source', { app: 'demo', canvas, post: async () => ({}) });
  assert.deepEqual(opened, ['card-1', null]);
  assert.match((await runLearnCommand('/source', { app: 'demo', canvas: {}, post: async () => ({}) })).notice.text, /not available/);
});

// r28 audit (owner, 2026-10-08: "make sure all /slash commands exist and if we missed any or if we need to remove any"):
// every command in the registry is offered by a picker with a demo in that picker's sheet, or named here with the reason
// it is not. A command cannot be offered without a demo, nor vanish silently.
const NOT_OFFERED = {
  research: 'refused on every scope (reviewOff: it would call the live model) and unwired in AgentBar.jsx; kept for when it is',
  more: 'opens the full list of learning tools: the picker\'s own section, never a row, and the sheet is that list',
};
const SCOPES = [{ kind: 'workspace', slug: null }, { kind: 'project', slug: 'repo-1' }, { kind: 'app', slug: 'job-1' }];
const JOB = [{ name: 'job-1', kind: 'job' }];

test('registry, pickers and sheets agree: every offered command has a demo; every other command is excluded by name', () => {
  const learn = new Set(devCommands.map(({ name }) => name));
  const bar = new Map();
  for (const scope of SCOPES) {
    const place = scope.kind === 'project' ? 'project' : 'home';
    for (const [name] of [...modesFor(scope), ...shortcutsFor(scope, JOB)]) bar.set(`${name}@${place}`, name);
  }
  const offered = new Set([...learn, ...bar.values()]);
  for (const { name } of SLASH) assert.ok(offered.has(name) !== !!NOT_OFFERED[name], `/${name}: ${offered.has(name) ? 'offered, but listed as not offered' : 'not offered and not listed with a reason'}`);
  // The Learn sheet lists exactly the Learn picker (pickerSections), each with a demo (test above).
  for (const name of learn) assert.ok(demoOf(name), `/${name}`);
  // The Agent Bar's sheet lists exactly the bar's picker (modesFor, shortcutsFor), each with its example and what it does.
  for (const [key, name] of bar) {
    const place = key.split('@')[1];
    assert.ok(exampleFor(name, place).startsWith(`/${name} `), `${key}: ${exampleFor(name, place)}`);
    assert.ok(resultFor(name, place).length > 20, `${key}: what it does`);
  }
  assert.deepEqual([...new Set(bar.values())], ['ask', 'teach', 'do', 'find', 'open', 'new', 'connect', 'run']);
});
