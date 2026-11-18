import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACING, assumedHeight, columnWidth, docWords, fixedHeight, learnLayout, orderKey, setSpacingScale, spacing, union } from './learn-position.js';
import * as positionApi from './learn-position.js';

const G = SPACING.card;
const card = (id, sectionId, itemId, role, { order = 0, part = 0, after = null, h = 100, w = 720, box = null, placed = false, pinned = false } = {}) =>
  ({ id, learn: { sectionId, itemId, role, order, part, after, pinned, slot: true }, w, h, box, placed });
const at = (out, id) => out.targets.get(id);

test('a section is one column: lead, card, follow and notes in composition order, card gaps between them, right of the board', () => {
  const cards = [card('f1', '1.1', 'i1', 'follow', { order: 0 }), card('l1', '1.1', 'i1', 'lead', { order: 0 }), card('c1', '1.1', 'i1', 'card', { order: 0, h: 300 }), card('n', '1.1', 'notes', 'card', { order: 9, h: 50 }), card('h', '1', null, 'chapter', { h: 60 })];
  const out = learnLayout({ cards, others: [{ x: 0, y: 100, w: 560, h: 2000 }], W: 720 });
  const x = 560 + SPACING.column;
  assert.deepEqual(out.origin, { x, y: 100 });
  assert.deepEqual(['h', 'l1', 'c1', 'f1', 'n'].map(id => at(out, id)), [
    { x, y: 100 }, { x, y: 100 + 60 + G }, { x, y: 100 + 60 + G + 100 + G }, { x, y: 100 + 60 + G + 100 + G + 300 + G }, { x, y: 100 + 60 + G + 100 + G + 300 + G + 100 + G }]);
});

test('a pair steps sideways once: the explanation beside its passage card, top aligned; the column resumes below the taller of the two', () => {
  const cards = [card('p', '1.2', 'i1', 'card', { order: 0, h: 200 }), card('e', '1.2', 'i2', 'card', { order: 1, after: 'i1', h: 500 }), card('l2', '1.2', 'i2', 'lead', { order: 1, h: 80 })];
  const out = learnLayout({ cards, others: [], W: 720 });
  const p = at(out, 'p');
  assert.deepEqual(at(out, 'e'), { x: p.x + 720 + SPACING.pair, y: p.y });
  assert.equal(at(out, 'l2').y, p.y + 500 + G, 'the next column card is below the taller card of the pair');
  assert.equal(at(out, 'l2').x, p.x);
});

test('an item\'s several cards stand side by side in part order', () => {
  const cards = [card('a', '1.1', 'i1', 'card', { part: 0, h: 300 }), card('b', '1.1', 'i1', 'card', { part: 1, h: 400 }), card('f', '1.1', 'i1', 'follow', { h: 50 })];
  const out = learnLayout({ cards, others: [], W: 720 });
  assert.equal(at(out, 'b').x, at(out, 'a').x + 720 + G);
  assert.equal(at(out, 'b').y, at(out, 'a').y);
  assert.equal(at(out, 'f').y, at(out, 'a').y + 400 + G);
});

test('sections get the section gap, chapters the chapter gap and their heading card', () => {
  const cards = [card('h1', '1', null, 'chapter', { h: 60 }), card('a', '1.1', 'i1', 'card'), card('b', '1.2', 'i1', 'card'), card('h2', '2', null, 'chapter', { h: 60 }), card('c', '2.1', 'i1', 'card')];
  const out = learnLayout({ cards, others: [], W: 720 });
  assert.equal(at(out, 'a').y - at(out, 'h1').y, 60 + G, 'the first section sits a card gap under its chapter heading');
  assert.equal(at(out, 'b').y - at(out, 'a').y, 100 + SPACING.section);
  assert.equal(at(out, 'h2').y - at(out, 'b').y, 100 + SPACING.chapter);
  assert.equal(at(out, 'c').y - at(out, 'h2').y, 60 + G);
});

test('nothing that is not the plan moves: a slot over another card shifts the whole column right by one slot', () => {
  const cards = [card('a', '1.1', 'i1', 'card', { box: { x: 1000, y: 0, w: 720, h: 100 }, placed: true }), card('b', '1.1', 'i1', 'follow')];
  const other = { x: 1000, y: 150, w: 300, h: 300 }; // under the first card, where b would go
  const out = learnLayout({ cards, others: [other], W: 720 });
  assert.equal(at(out, 'a').x, 1000 + 720 + G);
  assert.equal(at(out, 'b').x, at(out, 'a').x);
});

test('a pinned card (dragged by the learner) keeps its place and the column flows around it', () => {
  const cards = [card('a', '1.1', 'i1', 'lead', { box: { x: 0, y: 0, w: 720, h: 100 }, placed: true }), card('p', '1.1', 'i1', 'card', { pinned: true, box: { x: 0, y: 140, w: 720, h: 300 } }), card('f', '1.1', 'i1', 'follow')];
  const out = learnLayout({ cards, others: [], W: 720 });
  assert.equal(out.targets.has('p'), false, 'the pinned card is not moved');
  assert.notEqual(at(out, 'f').x, 0, 'the follow does not land on the pinned card: the column moved right');
});

test('settle after a measured height and a resize: the cards below follow the real height', () => {
  const before = learnLayout({ cards: [card('a', '1.1', 'i1', 'lead', { h: 160, box: { x: 0, y: 0, w: 720, h: 160 }, placed: true }), card('b', '1.1', 'i1', 'card', { h: 520 })], W: 720 });
  const after = learnLayout({ cards: [card('a', '1.1', 'i1', 'lead', { h: 410, box: { x: 0, y: 0, w: 720, h: 410 }, placed: true }), card('b', '1.1', 'i1', 'card', { h: 520 })], W: 720 });
  assert.equal(at(before, 'b').y, 160 + G);
  assert.equal(at(after, 'b').y, 410 + G, 'b moved down by the growth of a');
  assert.deepEqual(at(after, 'a'), { x: 0, y: 0 }, 'the first placed card defines the column and stays');
});

test('sizes, widths, order and spacing scale', () => {
  assert.equal(columnWidth([440, 480]), 560);
  assert.equal(columnWidth([640, 1200]), 720);
  assert.equal(fixedHeight({ type: 'notebook' }, 720), 720);
  assert.equal(fixedHeight({ type: 'wiki' }, 720), 900);
  assert.equal(fixedHeight({ type: 'video' }, 720), 461);
  assert.equal(fixedHeight({ type: 'repo-code', start: 10, end: 19 }, 720), 28 * 10 + 56);
  assert.equal(fixedHeight({ type: 'doc' }, 720), null);
  assert.equal(docWords([{ content: [{ text: 'one two three' }], children: [{ content: [{ text: 'four' }] }] }]), 4);
  assert.equal(assumedHeight({ type: 'doc', blocks: [{ content: [{ text: Array(80).fill('w').join(' ') }] }] }, 720), 160 + 48);
  assert.ok(orderKey({ sectionId: '1', role: 'chapter' })[1] < orderKey({ sectionId: '1.1', role: 'lead', order: 0 })[1]);
  assert.equal(spacing(1.5).section, 120);
  setSpacingScale(0.75); assert.equal(spacing().card, 30); setSpacingScale(1);
  assert.deepEqual(union([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }]), { x: 0, y: 0, w: 30, h: 15 });
});

test('§7.3 an unmeasured slot card is shown 5 s after it was put down; a measured, placed, pinned or untimed one is left alone; the wait to the next one is given', () => {
  const { lateSlots, LEARN_SHOW_MS } = positionApi;
  const card = (id, since, over = {}) => ({ id, at: null, learn: { slot: true, since, ...over } });
  const now = 100_000;
  const out = lateSlots([card('old', now - LEARN_SHOW_MS), card('new', now - 1000), card('measured', now - 9000), card('placed', now - 9000, { placed: true }), { ...card('pinned', now - 9000), at: { x: 1 } }, card('untimed', undefined)], { measured: { x: 0, y: 0, w: 1, h: 1 } }, now);
  assert.deepEqual(out.late, ['old']);
  assert.equal(out.wait, LEARN_SHOW_MS - 1000);
});

// Reviewer 2026-11-18 10:55 §1: React #185 on Build was the Position effect and another writer taking turns. Each measure below is one turn of that effect.
test('a card another writer keeps moving back is moved once more at most, then left where it is (a fight)', () => {
  const { guardLearnMoves, learnGuardMemory } = positionApi;
  const memory = learnGuardMemory(), block = { id: 'c', type: 'doc', dx: 0, dy: 0, learn: { slot: true } };
  let issued = 0, fights = 0;
  for (let turn = 0; turn < 50; turn += 1) {
    const out = guardLearnMoves(new Map([['c', { dx: 40, dy: 300, learn: { placed: true } }]]), [block], memory, 1000 + turn);
    issued += out.moves.size; fights += out.fights.length;
    if (out.moves.size) Object.assign(block, out.moves.get('c'));
    block.dx = 0; block.dy = 0; // the other writer puts it back
  }
  assert.equal(issued, 1);
  assert.equal(fights, 1);
});

test('a card written 10 times within a second is never written again (a loop), and another card still moves', () => {
  const { guardLearnMoves, learnGuardMemory, LEARN_LOOP } = positionApi;
  const memory = learnGuardMemory(), block = { id: 'c', dx: 0, dy: 0, learn: { slot: true } };
  let issued = 0, loops = 0;
  for (let turn = 0; turn < 50; turn += 1) { // a flow that shifts back every time: our offsets stay, so it is not a fight, only a loop
    const out = guardLearnMoves(new Map([['c', { dx: block.dx + 5, dy: block.dy }]]), [block], memory, 1000 + turn);
    issued += out.moves.size; if (out.loop) loops += 1;
    if (out.moves.size) Object.assign(block, out.moves.get('c'));
  }
  assert.equal(issued, LEARN_LOOP.count);
  assert.equal(loops, 1);
  assert.equal(guardLearnMoves(new Map([['c', { dx: 1, dy: 0 }]]), [block], memory, 5000).moves.size, 0);
  const other = guardLearnMoves(new Map([['d', { dx: 1, dy: 1 }]]), [{ id: 'd' }], memory, 2100);
  assert.equal(other.moves.size, 1);
});

test('the brake: at most 10 writes within a second, whatever the cards; the next waits for the window', () => {
  const { guardLearnMoves, learnGuardMemory, LEARN_LOOP } = positionApi;
  const memory = learnGuardMemory();
  let issued = 0, wait = null;
  for (let k = 0; k < 30; k += 1) { // a new card every turn: no card repeats, so only the brake can end the chain
    const out = guardLearnMoves(new Map([[`card${k}`, { dx: k, dy: 0 }]]), [{ id: `card${k}` }], memory, 1000 + k);
    issued += out.moves.size; if (out.wait != null) wait = out.wait;
  }
  assert.equal(issued, LEARN_LOOP.count);
  assert.equal(wait, LEARN_LOOP.ms - 29);
  assert.equal(guardLearnMoves(new Map([['late', { dx: 1, dy: 0 }]]), [{ id: 'late' }], memory, 2100).moves.size, 1);
});

test('moves spread over time are never a loop', () => {
  const { guardLearnMoves, learnGuardMemory } = positionApi;
  const memory = learnGuardMemory(), block = { id: 'c', dx: 0, dy: 0 };
  for (let turn = 0; turn < 30; turn += 1) {
    const out = guardLearnMoves(new Map([['c', { dx: block.dx + 5, dy: 0 }]]), [block], memory, turn * 200);
    assert.equal(out.moves.size, 1);
    Object.assign(block, out.moves.get('c'));
  }
});
