// The Table of contents tab (R4 redesign; TableOfContents.jsx): bundled with esbuild and rendered with react-dom/server,
// as answer-footer.test.mjs renders its footer. Clicks, drags and the guide line's geometry need a browser:
// e2e/toc-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { outlineFrom, outlineRevision, outlineTree } from './learn-outline-model.js';

const dir = mkdtempSync(join(tmpdir(), 'toc-')), outfile = join(dir, 'toc.cjs');
await esbuild.build({
  stdin: { contents: "export { default as TableOfContents } from './TableOfContents.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const h = (id, level, text, extra = {}) => ({ id, type: 'heading', level, text, done: false, ...extra });
const blocks = [
  h('t1', 1, 'Kitchen chemistry', { description: 'Why heat and acid change food.' }),
  { id: 'c1', type: 'explanation' },
  h('s1', 2, 'Maillard browning', { description: 'Sugars and amino acids above 140 C.', done: true }),
  h('s1a', 3, 'Temperature'),
  h('s2', 2, 'Acids and proteins'),
  h('t2', 1, 'Baking'),
];
const outline = outlineFrom(blocks);
const render = (props = {}) => B.renderToStaticMarkup(B.createElement(B.TableOfContents, { outline, canvasApi: { current: null }, onShow: () => {}, ...props }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('numbering follows the order and hierarchy: Topic 1, 1.1, 1.1.1; ids stay the keys', () => {
  const tree = outlineTree(outline);
  const flat = nodes => nodes.flatMap(node => [[node.entry.id, node.number], ...flat(node.children)]);
  assert.deepEqual(flat(tree), [['t1', '1'], ['s1', '1.1'], ['s1a', '1.1.1'], ['s2', '1.2'], ['t2', '2']]);
  const moved = outlineTree(outlineFrom([blocks[5], ...blocks.slice(0, 5)]));
  assert.deepEqual(flat(moved).map(([id, number]) => `${id}=${number}`), ['t2=1', 't1=2', 's1=2.1', 's1a=2.1.1', 's2=2.2'], 'a reorder renumbers; nothing else moves with the number');
});

test('entries before the first topic stay unnumbered: no invented Topic 0', () => {
  const tree = outlineTree(outlineFrom([h('o', 2, 'Orphan'), h('oo', 3, 'Deeper'), h('a', 1, 'First')]));
  assert.deepEqual([tree[0].number, tree[0].children[0].number, tree[1].number], [null, null, '1']);
  assert.doesNotMatch(render({ outline: outlineFrom([h('o', 2, 'Orphan'), h('a', 1, 'First')]) }), /Topic 0/);
});

test('multi-digit numbers: Topic 10 and 10.12', () => {
  const many = [...Array.from({ length: 10 }, (_, i) => h(`t${i}`, 1, `T${i}`)), ...Array.from({ length: 12 }, (_, i) => h(`s${i}`, 2, `S${i}`))];
  const tree = outlineTree(outlineFrom(many));
  assert.equal(tree[9].number, '10');
  assert.equal(tree[9].children[11].number, '10.12');
  assert.match(render({ outline: outlineFrom(many) }), /tabular-nums[^>]*>10\.12</);
});

test('a topic reads "Topic 1: title" with its description beneath; a sub-section has its number, title and description', () => {
  const html = render();
  assert.match(text(html), /Topic 1: Kitchen chemistry Why heat and acid change food\./);
  assert.match(text(html), /1\.1 Maillard browning Sugars and amino acids above 140 C\./);
  assert.match(text(html), /1\.1\.1 Temperature/);
  assert.match(text(html), /Topic 2: Baking/);
  assert.doesNotMatch(text(html), /Subtopic/, 'never the literal word');
});

test('a heading without a description renders no empty line or filler', () => {
  const html = render();
  const row = html.slice(html.indexOf('data-toc-entry="s2"'), html.indexOf('data-toc-entry="t2"'));
  assert.doesNotMatch(row, /<p /);
  assert.doesNotMatch(text(html), /No description|Add a description/);
});

test('round controls keep checkbox semantics: a real checkbox per entry with its status label, done ones checked', () => {
  const html = render();
  const boxes = [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(boxes.length, 5);
  assert.ok(boxes.every(tag => /aria-label="[^"]+ done"/.test(tag) && /rounded-full/.test(tag)));
  assert.deepEqual(boxes.map(tag => / checked=""/.test(tag)), [false, true, false, false, false]);
  assert.doesNotMatch(html, /type="radio"/);
});

test('the active section is marked apart from completion, and marking it changes no checkbox', () => {
  const html = render({ activeId: 's2' });
  assert.match(html, /data-toc-entry="s2"[^>]*data-active="true"/);
  assert.match(html, /aria-current="location"[^>]*>Acids and proteins</);
  assert.deepEqual([...html.matchAll(/<input type="checkbox"[^>]*>/g)].map(([tag]) => / checked=""/.test(tag)), [false, true, false, false, false]);
});

test('the guide line joins the topic markers and stops at the last topic', () => {
  const html = render();
  const topics = [...html.matchAll(/<li(?: class="([^"]*)")?><div data-toc-entry="(t1|t2)"/g)].map(([, cls = '', id]) => [id, /before:w-px/.test(cls)]);
  assert.deepEqual(topics, [['t1', true], ['t2', false]]);
});

test('a read-only viewer sees titles and descriptions, and nothing edits, drags or ticks', () => {
  const html = render({ readOnly: true, proposal: { ops: [{ op: 'add', text: 'X', level: 1 }], base: null } });
  assert.match(text(html), /Why heat and acid change food\./);
  assert.doesNotMatch(html, /draggable="true"/);
  assert.doesNotMatch(html, /aria-label="(Edit|Delete|Add a) /);
  assert.ok([...html.matchAll(/<input type="checkbox"[^>]*>/g)].every(([tag]) => / disabled=""/.test(tag)));
  assert.doesNotMatch(html, /data-toc-proposal/, 'no proposal card for a viewer');
});

test('an editor renders entries draggable, with edit and delete per entry and the add buttons', () => {
  const html = render();
  assert.equal([...html.matchAll(/draggable="true"/g)].length, 5);
  assert.match(html, /aria-label="Edit Kitchen chemistry"/);
  assert.match(html, /aria-label="Delete Kitchen chemistry"/);
  assert.match(html, /aria-label="Add a sub-section"/);
  assert.ok([...html.matchAll(/<label data-no-drag/g)].length === 5, 'the circles never start a drag');
});

test('the proposal card groups adds under their parents and shows descriptions', () => {
  const proposal = { base: outlineRevision(outline), source: 'syllabus', ops: [
    { op: 'add', key: 'k1', text: 'Fermentation', level: 1, description: 'Microbes at work.' },
    { op: 'add', text: 'Yeast', level: 2, parent: 'k1', description: 'How bread rises.' },
    { op: 'add', text: 'Emulsions', level: 2, parent: 't1' },
    { op: 'describe', id: 't2', description: 'Flour, water, heat.' },
  ] };
  const html = render({ proposal });
  assert.match(text(html), /Proposed: 4 changes/);
  assert.match(html, /\+ Fermentation<span[^>]*>Microbes at work\.<\/span><ul[^>]*><li[^>]*>\+ Yeast<span[^>]*>How bread rises\./, 'Yeast under Fermentation');
  assert.match(text(html), /Under "Kitchen chemistry" \+ Emulsions/);
  assert.match(text(html), /Describe "Baking" Flour, water, heat\./);
  assert.doesNotMatch(html, /role="alert"/, 'a current, valid proposal has no warning');
  assert.match(html, /data-toc-proposal-list[^>]*overflow-y-auto/, 'a long proposal scrolls inside the card');
});

test('a stale proposal says so before Apply; an invalid one says why', () => {
  assert.match(render({ proposal: { ops: [{ op: 'add', text: 'X', level: 1 }], base: '00000000' } }), /role="alert"[^>]*>The contents changed since this proposal\. Ask the Tutor again\.</);
  assert.match(render({ proposal: { ops: [{ op: 'add', text: 'X', level: 3, parent: 't1' }], base: outlineRevision(outline) } }), /role="alert"[^>]*>This proposal cannot be applied: a subtopic sits one level below its parent\.</);
});

test('a bare ops array (an older emitter) still shows as a proposal', () => {
  assert.match(text(render({ proposal: [{ op: 'add', text: 'Plain', level: 1 }] })), /Proposed: 1 change \+ Plain/);
});
