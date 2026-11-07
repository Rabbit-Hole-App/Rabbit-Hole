// A Chat context pill goes to what it was made from (owner 2026-11-07): the shared helper per pill kind, a deleted target says so
// and nothing is restored, and the pill markup still has its remove X. Doubles only, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREA_GONE, ON_CANVAS, goToRef, goToSelection, refObjectIds } from './pill-target.js';
import { CARD_GONE } from './canvas-refs-model.js';
import { SOURCE_REF_EVENT } from './source-ref.js';

const canvas = (blocks, { areas = [] } = {}) => {
  const located = [];
  return { located, ops: { blocks: () => blocks, locateObject: id => (blocks.some(b => b.id === id) || ['g1'].includes(id)) && (located.push(id), true), locateArea: id => areas.includes(id) && (located.push(id), true) } };
};
const FS = 'fs_0123456789abcdef01234567', REV = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const card = id => ({ sourceId: `card:${id}`, kind: 'card', name: 'A card', range: null });

test('a card, image and media pill frames its card; a deleted one says so', () => {
  const { ops, located } = canvas([{ id: 'c1' }, { id: 'i1' }]);
  assert.deepEqual(goToRef(card('c1'), ops), { located: 'c1' });
  assert.deepEqual(goToRef({ sourceId: 'image:i1', kind: 'image', range: null }, ops), { located: 'i1' });
  assert.deepEqual(located, ['c1', 'i1']);
  assert.deepEqual(goToRef(card('gone'), ops), { problem: CARD_GONE });
  assert.deepEqual(goToRef({ sourceId: 'media:gone', kind: 'media', range: null }, ops), { problem: CARD_GONE });
});

test('a group pill frames the first member that is still here', () => {
  const { ops, located } = canvas([{ id: 'c2' }]);
  const group = ids => ({ sourceId: `group:${ids[0]}`, kind: 'group', range: { cardIds: ids } });
  assert.deepEqual(goToRef(group(['x', 'c2']), ops), { located: 'c2' });
  assert.deepEqual(goToRef(group(['x', 'y']), ops), { problem: CARD_GONE });
  assert.deepEqual(located, ['c2']);
});

test('a section (ToC) pill is its heading card: it frames that card, and a removed heading says so', () => {
  const { ops } = canvas([{ id: 'h-1', type: 'heading', text: 'Trees' }]);
  assert.deepEqual(goToRef(card('h-1'), ops), { located: 'h-1' });
  assert.deepEqual(goToRef(card('h-2'), ops), { problem: CARD_GONE });
});

test('a file, a PDF and an excerpt pill find their card through the same builders Add to chat used', () => {
  const file = { id: 'f1', type: 'file', label: 'notes.md', fileRef: { source: { id: FS, rev: REV }, meta: { name: 'notes.md' }, family: 'markdown' } };
  const pdf = { id: 'p1', type: 'pdf', assetKey: 'doc:upload-9', label: 'Paper' };
  const { ops } = canvas([file, pdf]);
  assert.deepEqual(refObjectIds({ sourceId: `file:${FS}@${REV}`, kind: 'file' }, [file, pdf]), ['f1']);
  assert.deepEqual(goToRef({ sourceId: `file:${FS}@${REV}`, kind: 'file', name: 'notes.md', range: null }, ops), { located: 'f1' });
  assert.deepEqual(goToRef({ sourceId: `file:fs_ffffffffffffffffffffffff@${REV}`, kind: 'file', range: null }, ops), { problem: CARD_GONE });
  // A PDF card is a doc ref: its reader opens (null here is not a problem when the card is missing) and the card is framed when it is on the canvas.
  assert.deepEqual(goToRef({ sourceId: 'doc:upload-9', kind: 'doc', name: 'Paper', range: null }, ops), { located: 'p1' });
  assert.equal(goToRef({ sourceId: 'doc:other', kind: 'doc', name: 'Gone', range: null }, ops), null);
});

test('a reader-only pill (a paper, a wiki page) has no canvas card to report: null, never a problem', () => {
  const { ops } = canvas([]);
  assert.equal(goToRef({ sourceId: 'wiki:Tree', kind: 'web', name: 'Tree', range: null }, ops), null);
  assert.equal(goToRef({ sourceId: 'paper:1706.03762', kind: 'web', name: 'Attention', range: null }, ops), null);
  assert.ok(!ON_CANVAS.has('web') && !ON_CANVAS.has('doc') && ON_CANVAS.has('card') && ON_CANVAS.has('group'));
});

test('a quoted passage frames the card and flashes the quote in it once the camera has moved', () => {
  const file = { id: 'f1', type: 'file', fileRef: { source: { id: 'abc', rev: '7' } } }; // the flash reads the card's own source key and revision
  const emitted = [], waits = [];
  const { ops } = canvas([{ id: 'f1', ...file }]);
  const ref = { sourceId: 'card:f1', kind: 'card', name: 'notes.md', range: { quote: 'a leaf has no children' } };
  assert.deepEqual(goToRef(ref, { ...ops, emit: event => emitted.push(event), wait: fn => waits.push(fn) }), { located: 'f1' });
  assert.equal(emitted.length, 0, 'not before the camera moved');
  waits[0]();
  assert.equal(emitted[0].type, SOURCE_REF_EVENT);
  assert.deepEqual(emitted[0].detail, { cardId: 'f1', key: 'abc', rev: '7', quote: { exact: 'a leaf has no children' } });
});

test('a selected-on-the-canvas chip frames its object; an area frames the area, and a removed area says so', () => {
  const { ops, located } = canvas([{ id: 'c1' }], { areas: ['area:k1'] });
  assert.deepEqual(goToSelection({ id: 'c1' }, ops), { located: 'c1' });
  assert.deepEqual(goToSelection({ id: 'area:k1' }, ops), { located: 'area:k1' });
  assert.deepEqual(goToSelection({ id: 'area:k2' }, ops), { problem: AREA_GONE });
  assert.equal(goToSelection({ id: 'page:3' }, ops), null, 'an id the canvas does not know is not reported: the selection exists by definition');
  assert.equal(goToSelection({}, ops), null);
  assert.deepEqual(located, ['c1', 'area:k1']);
});

test('the pills use the helper, tell the learner when a target is gone, keep their remove X, and never restore', () => {
  const chips = readFileSync(new URL('./ContextChips.jsx', import.meta.url), 'utf8');
  assert.match(chips, /goToRef\(ref, ops\)/);
  assert.match(chips, /goToSelection\(selection, ops\)/);
  assert.match(chips, /toast\(result\.problem\)/);
  assert.match(chips, /title=\{!ref\?\.name \? `Go to \$\{name\}`/, 'a card or area selection pill says where it goes');
  assert.match(chips, /\$\{ON_CANVAS\.has\(ref\.kind\) \? 'Go to' : 'Open'\} \$\{ref\.name\}/);
  assert.ok(chips.includes('Remove ${ref.name} from this chat') && chips.includes("'Clear block selection'") && chips.includes('Cancel editing this proposal'), 'every pill keeps its X');
  assert.ok(!/restoreCard|openOutput|insertImported/.test(chips + readFileSync(new URL('./pill-target.js', import.meta.url), 'utf8')), 'a pill never restores a deleted card');
});

test('the canvas exposes the two commands the helper calls, and LearnPage hands them to the Chat', () => {
  const canvasSource = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvasSource, /locateObject: id => \{/);
  assert.match(canvasSource, /locateArea: id => \{/);
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /locateObject: id => !!canvasApi\.current\?\.locateObject\?\.\(id\)/);
  assert.match(page, /locateArea: id => !!canvasApi\.current\?\.locateArea\?\.\(id\)/);
});
