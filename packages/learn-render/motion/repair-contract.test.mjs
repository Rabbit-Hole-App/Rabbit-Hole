// M7B (owner decision 2026-10-06): the shared repair contract. After a Director revision the CURRENT
// storyboard is the only semantic truth, for both renderers: an object the revision adds is built,
// an object it removes is gone, kept objects keep their ids, and nothing outside the inventory is
// invented. M7B Run B failed because the repair kept round 0's object set (chance_strip missing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorRequest, inventoryChange, repairSection, storyboardObjects } from './author.js';
import { rendererGate } from './renderers.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const text = f => readFileSync(join(FIX, f), 'utf8');
const brief = json('m2/softmax-15s-attention.brief.json');

// Each renderer's known-good composition of its storyboard, and one object a revision removes.
const CASES = {
  remotion: { storyboard: json('m3/softmax-15s-attention.storyboard.json'), source: text('m4/softmax-reference.composition.jsx'), removed: 'flash_lane',
    invent: s => s.replace(/(<[A-Za-z][^<>]*data-object="row_arrow"[^<>]*?)(\/?>)/, (m, open, end) => (end === '/>' ? `${open}><span data-object="ghost" /></${open.match(/^<([A-Za-z.]+)/)[1]}>` : `${open}><span data-object="ghost" />`)) },
  hyperframes: { storyboard: json('m3/softmax-15s-attention.real.storyboard.json'), source: text('m7b/softmax-control.hyperframes.html'), removed: 'future_marker',
    invent: s => s.replace('<div class="caption cap-b2">', '<div data-object="ghost" style="position: absolute;"></div><div class="caption cap-b2">') },
};
const ADDED = 'chance_marker';
// The Director's revision: one object out, one object in (no label, so only the inventory changes).
const revise = (storyboard, removed) => ({
  ...storyboard,
  beats: storyboard.beats.map((b, i, all) => ({
    ...b,
    visible_objects: [...b.visible_objects.filter(o => o.id !== removed), ...(i === all.length - 1 ? [{ id: ADDED, description: 'a marker on the slot the draw lands in' }] : [])],
  })),
});
const inventoryErrors = (renderer, source, storyboard) => rendererGate(renderer).contract(source, brief, storyboard).errors.filter(e => /data-object/.test(e));

for (const [renderer, c] of Object.entries(CASES)) {
  test(`${renderer}: the repair is checked against the revised inventory (A add, B remove, C keep, D no invention)`, () => {
    assert.deepEqual(inventoryErrors(renderer, c.source, c.storyboard), [], 'the round-0 composition fits the original storyboard');
    const revised = revise(c.storyboard, c.removed);
    const change = inventoryChange(c.storyboard, revised);
    assert.deepEqual([change.added, change.removed], [[ADDED], [c.removed]]);
    assert.deepEqual(change.kept, storyboardObjects(c.storyboard).filter(id => id !== c.removed));
    // Keeping round 0's object set no longer fits: the added object is required, the removed one may not survive.
    const stale = inventoryErrors(renderer, c.source, revised);
    assert.ok(stale.some(e => e.includes(`data-object "${ADDED}": no element`)), `A: ${stale.join('; ')}`);
    assert.ok(stale.some(e => e.includes(`data-object "${c.removed}" is not a storyboard object`)), `B: ${stale.join('; ')}`);
    // Reconciled: the removed object's element now carries the added one; every kept id is untouched.
    const reconciled = c.source.replace(`data-object="${c.removed}"`, `data-object="${ADDED}"`);
    assert.deepEqual(inventoryErrors(renderer, reconciled, revised), [], 'A + B: the reconciled composition fits');
    for (const id of change.kept) assert.equal((reconciled.match(new RegExp(`data-object="${id}"`, 'g')) || []).length, 1, `C: ${id} keeps its one element`);
    // An object the revised storyboard does not list is refused.
    const invented = inventoryErrors(renderer, c.invent(reconciled), revised);
    assert.ok(invented.some(e => e.includes('data-object "ghost" is not a storyboard object')), `D: ${invented.join('; ')}`);
  });
}

test('E: both renderers\' repair prompts state the current inventory and, after a revision, what changed; no "keep the same objects"', () => {
  for (const [renderer, c] of Object.entries(CASES)) {
    const revised = revise(c.storyboard, c.removed);
    const revision = inventoryChange(c.storyboard, revised);
    const ask = authorRequest(brief, revised, { renderer, repair: { source: c.source, findings: [{ reviewer: 'pedagogical', category: 'unsupported_claim', description: 'x' }], revision } }).messages[0].content;
    assert.ok(ask.includes(`object_inventory = ${JSON.stringify(storyboardObjects(revised))}`), `${renderer}: the current inventory`);
    assert.ok(ask.includes(`storyboard_revision = ${JSON.stringify(revision)}`), `${renderer}: what the revision changed`);
    assert.ok(ask.includes('The storyboard in the input is the CURRENT validated storyboard and the only semantic truth.'), renderer);
    assert.ok(ask.includes('An id not in it gets no element, even if the previous composition had one. Never add an object the current storyboard does not list.'), renderer);
    assert.ok(!ask.includes('the same timeline, text, objects'), `${renderer}: no instruction to keep round 0's objects after a revision`);
    // The same request input carries the revised storyboard itself.
    assert.deepEqual(JSON.parse(ask.split('input = ')[1].split('\n\nREPAIR ROUND')[0]).storyboard.beats.at(-1).visible_objects.at(-1).id, ADDED);
  }
  // Without a revision the inventory is the same storyboard's, and the composition keeps its objects.
  const plain = repairSection({ source: 'S', findings: [], storyboard: CASES.hyperframes.storyboard });
  assert.ok(plain.includes(`object_inventory = ${JSON.stringify(storyboardObjects(CASES.hyperframes.storyboard))}`));
  assert.ok(plain.includes('the same timeline, text, objects and layout'));
  assert.ok(!plain.includes('storyboard_revision'));
});
