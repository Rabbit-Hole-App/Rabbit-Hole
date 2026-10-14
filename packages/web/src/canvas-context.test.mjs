// Whole-canvas context for every canvas-chat turn (agent-coordination/tasks/canvas-context-SUBLANES.md, A-core):
// boardObjects + buildCanvasContext against contract v1.1 and every server cap. Pure: no browser, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { boardObjects, buildCanvasContext } from './inline-ai-context.js';

// ---------- fixtures: two unrelated subjects, one layout ----------
const filler = (topic, n, from = 0) => Array.from({ length: n }, (_, i) => `${topic} note ${from + i + 1}: a worked example with a short definition and a figure.`).join(' ');
const SUBJECTS = {
  cells: {
    old: ['Citric acid cycle', 'Acetyl-CoA is oxidised to carbon dioxide while NADH and FADH2 carry electrons onward.'],
    request: 'How is acetyl-CoA oxidised to carbon dioxide?',
    cards: ['Membrane transport', 'Enzyme kinetics', 'Protein folding', 'Genetic code', 'Cell signalling', 'Mitosis phases', 'Light reactions'],
    diagram: ['Glucose', 'Pyruvate', 'ATP'], arrow: 'feeds', tag: 'input', heading: 'Respiration notes', group: 'Open questions',
  },
  history: {
    old: ['Treaty of Westphalia', 'The treaty of 1648 ended the Thirty Years War and set state sovereignty as the rule.'],
    request: 'What did the 1648 treaty settle about sovereignty?',
    cards: ['Spinning jenny', 'Storming the Bastille', 'Congress of Vienna', 'Meiji restoration', 'Suez crisis', 'Berlin airlift', 'Marshall plan'],
    diagram: ['Grievance', 'Uprising', 'Charter'], arrow: 'sparks', tag: 'cause', heading: 'Modern era timeline', group: 'Doubts',
  },
};
const rect = (id, text, x, y, w = 150, h = 60, extra = {}) => ({ id, kind: 'rect', x1: x, y1: y, x2: x + w, y2: y + h, text, ...extra });
const arrow = (id, x1, y1, x2, y2) => ({ id, kind: 'arrow', x1, y1, x2, y2 });
const text = (id, words, x, y, w = 60, extra = {}) => ({ id, kind: 'text', x, y, w, text: words, ...extra });
// More than six cards in a column - the oldest (first, top) holds the relevant sentence deep in its body, far from the
// newest - a freeform diagram (shapes, drawn arrows, a short arrow label, a tag on one shape), a stored link, a group in
// a frame, a heading, an equation, code, a chat card and an image.
function studyBoard(subject) {
  const s = SUBJECTS[subject];
  const blocks = [
    { id: 'old', type: 'explanation', title: s.old[0], body: `${filler(s.old[0], 40)} ${s.old[1]} ${filler(s.old[0], 20, 40)}` },
    ...s.cards.map((title, i) => ({ id: `card${i + 1}`, type: 'explanation', title, body: filler(title, 50) })),
    { id: 'img', type: 'file', kind: 'image', label: 'figure.png', assetKey: 'asset:figure.png' },
  ];
  const boxes = Object.fromEntries(blocks.map((block, i) => [block.id, { x: 0, y: i * 500, w: 560, h: 440 }]));
  boxes.chat1 = { x: 1400, y: 3000, w: 400, h: 200 };
  const [a, b, c] = s.diagram;
  return {
    blocks,
    shapes: [rect('dA', a, 1400, 200), rect('dB', b, 1800, 200), { ...rect('dC', c, 1600, 500, 100, 100), kind: 'ellipse' },
      arrow('arr1', 1550, 230, 1800, 230), arrow('arr2', 1875, 260, 1650, 500), rect('frame', s.group, 1380, 2480, 420, 220)],
    items: [text('arrowLabel', s.arrow, 1660, 215, 40), text('tag', s.tag, 1400, 262), text('head', s.heading, 1400, 0, 400, { level: 'h1' }),
      { id: 'eq', kind: 'equation', x: 1400, y: 1200, latex: 'E = m c^2' }, text('code', 'def total(xs):\n    return sum(xs)', 1400, 1500, 380, { mode: 'code' }),
      { id: 'q1', kind: 'sticky', x: 1400, y: 2500, w: 160, text: 'Why this order?', groupId: 'grp' }, { id: 'q2', kind: 'sticky', x: 1600, y: 2500, w: 160, text: 'Which step is slowest?', groupId: 'grp' }],
    links: [{ id: 'link1', from: 'old', to: 'card1', head: true, label: 'builds on' }],
    groups: [{ id: 'grp', label: s.group }],
    exchanges: [{ id: 'chat1', question: 'What does this card mean?', answer: 'It summarises the step before.' }],
    boxes,
  };
}
const ALL_IDS = ['old', 'card1', 'card2', 'card3', 'card4', 'card5', 'card6', 'card7', 'img', 'chat1', 'dA', 'dB', 'dC', 'arr1', 'arr2', 'frame', 'arrowLabel', 'tag', 'head', 'eq', 'code', 'q1', 'q2', 'link1', 'grp'];
const build = (board, options = {}) => buildCanvasContext({ ...boardObjects(board), title: 'An old title', ...options });
const excerpt = (pack, id) => pack.excerpts.find(entry => entry.id === id);
const regionOf = (pack, id) => pack.inventory.items.find(item => item.id === id)?.region;
const status = (pack, id) => pack.coverage.items.find(entry => entry.id === id);
const pairs = list => list.map(r => `${r.from}>${r.to}:${r.kind || ''}:${r.label || ''}`).sort();
const labelsAndExcerpts = pack => pack.inventory.items.reduce((n, item) => n + item.label.length, 0) + pack.excerpts.reduce((n, entry) => n + entry.text.length, 0);

// Every server cap (Toolbar answers a 400 past any of them).
const KEY = /^[a-z][a-z0-9_-]{0,39}$/;
function assertValid(pack) {
  assert.equal(pack.version, 1);
  assert.ok(pack.built_at.length <= 40);
  assert.ok(pack.title === null || pack.title.length <= 200);
  assert.ok(JSON.stringify(pack).length <= 64000, `package JSON ${JSON.stringify(pack).length} > 64,000`);
  const counts = Object.entries(pack.inventory.counts);
  assert.ok(counts.length <= 40 && counts.every(([key, n]) => KEY.test(key) && Number.isInteger(n)));
  assert.ok(pack.inventory.items.length <= 300);
  for (const item of pack.inventory.items) {
    assert.ok(item.id.length >= 1 && item.id.length <= 120 && KEY.test(item.type) && typeof item.label === 'string' && item.label.length <= 80, JSON.stringify(item));
    assert.ok((item.kind ?? '').length <= 40 && (item.group_id ?? '').length <= 120 && (item.region ?? '').length <= 40);
  }
  assert.ok(pack.excerpts.length <= 200);
  for (const entry of pack.excerpts) {
    assert.ok(entry.id.length <= 120 && KEY.test(entry.type) && entry.text.length >= 1 && entry.text.length <= 8000);
    assert.ok(['relevant', 'structural', 'recent'].includes(entry.reason) && ['full', 'partial'].includes(entry.inclusion) && Number.isInteger(entry.omitted_chars));
    assert.equal(entry.inclusion === 'partial', entry.omitted_chars > 0);
    assert.equal(!!entry.passages, entry.inclusion === 'partial', 'passages only for partial');
  }
  assert.ok(labelsAndExcerpts(pack) <= 16000 && pack.coverage.budget_chars <= 16000 && pack.coverage.used_chars <= pack.coverage.budget_chars);
  assert.ok(pack.relations.explicit.length <= 600 && pack.relations.explicit.every(r => r.from && r.to && (r.label ?? '').length <= 80));
  assert.ok(pack.relations.inferred.length <= 600 && pack.relations.inferred.every(r => ['contains', 'grouped', 'near', 'aligned', 'labels'].includes(r.kind) && r.basis.length >= 1 && r.basis.length <= 120));
  assert.ok(pack.coverage.items.length <= 300);
  assert.ok(pack.coverage.summary.length <= 200 && !/\bread\b/i.test(pack.coverage.summary) && !/whole canvas/i.test(pack.coverage.summary));
}

test('a study board: every object listed, the old relevant card excerpted, drawn arrows inferred, the stored link explicit, the image not inspected', () => {
  const board = studyBoard('cells');
  const { objects } = boardObjects(board);
  const typeOf = id => objects.find(o => o.id === id)?.type;
  assert.deepEqual(['old', 'img', 'chat1', 'dA', 'arr1', 'arrowLabel', 'head', 'eq', 'code', 'q1'].map(typeOf), ['card', 'image', 'chat', 'shape', 'connector', 'text', 'heading', 'equation', 'code', 'sticky']);
  const pack = build(board, { request: SUBJECTS.cells.request });
  assertValid(pack);
  assert.deepEqual(pack.inventory.items.map(item => item.id).sort(), [...ALL_IDS].sort(), 'the inventory lists every object, link and group');
  assert.equal(pack.coverage.objects_total, ALL_IDS.length);
  assert.equal(pack.coverage.listed, ALL_IDS.length);
  const old = excerpt(pack, 'old');
  assert.ok(old && old.reason === 'relevant', 'the oldest card, about the request, gets an excerpt');
  assert.equal(old.inclusion, 'partial', 'bounded: a 4,000-char card is never sent whole');
  assert.ok(old.text.includes(SUBJECTS.cells.old[1]), 'its relevant sentence, deep in the body, is the passage sent');
  assert.ok(old.text.startsWith(SUBJECTS.cells.old[0]), 'with its opening passage');
  assert.deepEqual(pack.relations.explicit, [{ from: 'old', to: 'card1', label: 'builds on' }], 'stored links only');
  const near = pack.relations.inferred.filter(r => r.kind === 'near');
  assert.deepEqual(pairs(near), ['dA>dB:near:', 'dB>dC:near:'], 'drawn arrows land in inferred, near');
  assert.match(near.find(r => r.from === 'dA').basis, /^drawn arrow "feeds" \(ends matched by position, confidence [\d.]+\)$/);
  assert.ok(pack.relations.inferred.some(r => r.kind === 'labels' && r.from === 'tag' && r.to === 'dA'), 'a short text touching one shape labels it');
  assert.deepEqual(pairs(pack.relations.inferred.filter(r => r.kind === 'contains')), ['frame>q1:contains:', 'frame>q2:contains:'], 'a closed frame holds the group');
  assert.deepEqual(status(pack, 'img'), { id: 'img', type: 'image', status: 'unavailable', reason: 'media' });
  assert.match(pack.coverage.summary, /^25 objects listed; \d+ included in full, \d+ partially; 1 image not inspected$/);
  assert.equal(pack.coverage.unavailable_or_omitted, 1);
  // The same image whose pixels ride in this request (A-wire marks it): inspected.
  const shown = buildCanvasContext({ ...boardObjects(board), objects: objects.map(o => (o.id === 'img' ? { ...o, inspected: true } : o)) });
  assert.equal(status(shown, 'img').status, 'media');
  assert.equal(shown.coverage.media_inspected, 1);
  assert.match(shown.coverage.summary, /1 image inspected$/);
});

test('budget pressure: a 20,000-char selection cannot starve the older relevant object elsewhere or its stored link', () => {
  const big = filler('Selected draft', 270);
  assert.ok(big.length >= 20000);
  const board = {
    blocks: [{ id: 'oldR', type: 'explanation', title: 'Ribosome assembly', body: `${filler('Ribosome assembly', 10)} Ribosome subunits join on the messenger RNA at the start codon. ${filler('Ribosome assembly', 10, 10)}` },
      { id: 'next', type: 'explanation', title: 'Elongation', body: filler('Elongation', 12) }],
    items: [text('big', big, 0, 0, 600), { id: 's1', kind: 'sticky', x: 900, y: 0, w: 160, text: 'Check the figures' }, { id: 's2', kind: 'sticky', x: 900, y: 300, w: 160, text: 'Ask about tRNA' }],
    shapes: [], links: [{ id: 'l1', from: 'oldR', to: 'next', head: true, label: 'leads to' }], groups: [], exchanges: [],
    boxes: { oldR: { x: 4000, y: 4000, w: 560, h: 440 }, next: { x: 4000, y: 4500, w: 560, h: 440 } },
  };
  for (const request of ['Across the whole board, how do ribosome subunits join?', 'Look over everything here and tell me what is weak.']) {
    const pack = build(board, { request, selection: ['big'] });
    assertValid(pack);
    assert.ok(labelsAndExcerpts(pack) <= 16000 && pack.coverage.used_chars <= 16000);
    assert.ok(pack.coverage.reserved_chars <= 6000, 'the reserved share is honoured');
    assert.ok(pack.inventory.items.some(item => item.id === 'oldR'), 'the older object is listed');
    assert.ok(['full', 'partial'].includes(status(pack, 'oldR').status), `and at least partially included (${request})`);
    assert.deepEqual(pack.relations.explicit, [{ from: 'oldR', to: 'next', label: 'leads to' }], 'its explicit connection is kept');
    const selected = excerpt(pack, 'big');
    assert.equal(selected.inclusion, 'partial');
    assert.ok(selected.omitted_chars > 0 && selected.text.length <= 3000, 'the selection is bounded and says what it left out');
    assert.deepEqual(status(pack, 'big'), { id: 'big', type: 'text', status: 'partial', reason: 'budget', omitted_chars: selected.omitted_chars });
    // The passages are offsets into the full text; the excerpt is exactly them, joined.
    let last = -1;
    for (const { start, end } of selected.passages) { assert.ok(start > last && end > start && end <= big.length); last = end; }
    assert.equal(selected.text, selected.passages.map(({ start, end }) => big.slice(start, end)).join('\n…\n'));
    assert.match(pack.coverage.summary, /^6 objects listed; \d+ included in full, [1-9]\d* partially$/);
  }
});

test('no phrase switches: unseen paraphrases and an unrelated request get the same inventory, relations and coverage counts, with the spread, on two subjects', () => {
  const requests = ['Is anything missing from this board?', 'Have I left out an important piece?', 'Which gaps remain in what I wrote?', 'Did I cover everything I should?',
    'Look over my notes and critique them', 'Does any part disagree with another part?', 'Where should I dig in next?', 'Suggest a quick pasta recipe for dinner', ''];
  for (const subject of Object.keys(SUBJECTS)) {
    const board = studyBoard(subject);
    const packs = [...requests, SUBJECTS[subject].request].map(request => build(board, { request }));
    const shape = pack => JSON.stringify([pack.inventory, pairs(pack.relations.explicit), pairs(pack.relations.inferred), pack.coverage.listed, pack.coverage.objects_total]);
    for (const pack of packs) {
      assertValid(pack);
      assert.equal(shape(pack), shape(packs[0]), `${subject}: same inventory, relations and counts`);
      // The spread: every region and group with text beyond its labels keeps at least one excerpt.
      const items = new Map(pack.inventory.items.map(item => [item.id, item]));
      const needs = pack.coverage.items.filter(entry => entry.status === 'partial' || (entry.status === 'listed' && entry.reason) || excerpt(pack, entry.id)).map(entry => items.get(entry.id));
      const kept = pack.excerpts.map(entry => items.get(entry.id));
      for (const key of ['region', 'group_id']) for (const value of new Set(needs.map(item => item[key]).filter(Boolean))) {
        assert.ok(kept.some(item => item[key] === value), `${subject}: ${key} ${value} keeps a representative`);
      }
    }
    // A selection never removes other objects from the inventory.
    const selected = build(board, { request: requests[0], selection: ['card3'] });
    assert.equal(JSON.stringify(selected.inventory), JSON.stringify(packs[0].inventory));
    assert.ok(excerpt(selected, 'card3'), 'the selection gets an excerpt');
    assert.ok(new Set(selected.excerpts.map(entry => regionOf(selected, entry.id))).size >= 3, 'and other regions keep representatives');
  }
});

test('a follow-up keeps what earlier turns cited, at a lower weight than the request', () => {
  const board = studyBoard('history');
  const pack = build(board, { request: 'and how does that compare?', history: [{ role: 'user', text: 'Tell me about the Congress of Vienna', refs: ['card3'] }, { role: 'assistant', text: 'It redrew borders.' }] });
  assert.equal(excerpt(pack, 'card3')?.reason, 'recent', 'the card cited in turn 1 is excerpted in turn 2');
});

test('deletion and edits: a removed object is absent from the next package; a changed text is what is sent', () => {
  const board = studyBoard('cells');
  const before = build(board, { request: SUBJECTS.cells.request });
  const after = build({ ...board, blocks: board.blocks.filter(block => block.id !== 'old'),
    items: board.items.map(item => (item.id === 'q1' ? { ...item, text: 'Why does the order matter so much here?' } : item)) }, { request: SUBJECTS.cells.request });
  assert.ok(before.inventory.items.some(item => item.id === 'old'));
  const json = JSON.stringify(after);
  assert.ok(!json.includes('"old"'), 'the deleted card: no item, excerpt, coverage entry or relation');
  assert.equal(after.relations.explicit.length, 0, 'its stored link went with it');
  assert.equal(after.inventory.items.find(item => item.id === 'q1').label, 'Why does the order matter so much here?');
  assert.ok(!json.includes('Why this order?'), 'the old words are gone');
});

test('every cap: 400 uuid objects, a 50,000-char object, ids past 120 chars, 300 links - a valid package under 64,000 chars', () => {
  const ids = Array.from({ length: 400 }, () => randomUUID()), groupIds = Array.from({ length: 5 }, () => randomUUID());
  const long = i => `${'x'.repeat(130)}-${i}`;
  const board = {
    blocks: ids.slice(0, 100).map((id, i) => ({ id, type: 'explanation', title: `Card ${i} on a subject`, body: filler(`Card ${i}`, 6), groupId: groupIds[i % 5] })),
    items: [...ids.slice(100, 400).map((id, i) => text(id, `A note number ${i} that says "quoted" things\twith tabs and more words`, (i % 20) * 200, Math.floor(i / 20) * 120, 180)),
      text('huge', filler('Huge', 800), 9000, 9000, 600), ...[0, 1, 2].map(i => ({ id: long(i), kind: 'sticky', x: 0, y: 5000 + i * 200, w: 160, text: 'Lost id' }))],
    shapes: [], groups: groupIds.map((id, i) => ({ id, label: `Group ${i}` })), exchanges: [],
    links: Array.from({ length: 300 }, (_, i) => ({ id: randomUUID(), from: ids[i], to: ids[(i * 7 + 1) % 400], head: true, label: `relation ${i}` })),
    boxes: Object.fromEntries(ids.slice(0, 100).map((id, i) => [id, { x: 6000, y: i * 500, w: 560, h: 440 }])),
  };
  assert.ok(board.items.find(item => item.id === 'huge').text.length >= 50000);
  const pack = build(board, { request: 'What connects card 3 to the huge note?', selection: ['huge', long(0)], title: 'T'.repeat(500) });
  assertValid(pack);
  assert.equal(pack.title.length, 200);
  assert.ok(!JSON.stringify(pack.inventory).includes('x'.repeat(121)), 'an id past 120 chars is never listed');
  assert.equal(pack.coverage.objects_total, 400 + 1 + 3 + 300 + 5);
  assert.ok(pack.coverage.listed < pack.coverage.objects_total);
  assert.ok(excerpt(pack, 'huge').text.length <= 3000, 'the 50,000-char object is bounded');
  assert.ok(pack.coverage.items.length > 0 && pack.coverage.items[0].status === 'omitted', 'links cannot crowd out coverage.items; the omitted come first');
  assert.ok(pack.relations.explicit.length > 0);
  assert.match(pack.coverage.summary, new RegExp(`^${pack.coverage.listed} of 709 objects listed; `));
});

test('an inventory past its cap says so: 300 of 412 listed, the overflow recorded as omitted (cap), counts exact, JSON under 64,000', () => {
  const notes = Array.from({ length: 412 }, (_, i) => ({ id: randomUUID(), kind: 'sticky', x: (i % 30) * 200, y: Math.floor(i / 30) * 200, w: 160, text: `Sticky note ${i}`, groupId: null }));
  const pack = build({ items: notes, shapes: [], blocks: [], links: [], groups: [], exchanges: [] }, { request: 'Is this complete?' });
  assertValid(pack);
  assert.equal(pack.coverage.objects_total, 412);
  assert.equal(pack.coverage.listed, 300);
  assert.equal(pack.inventory.omitted_items, 112);
  assert.equal(pack.coverage.included_full, 300, 'each listed label holds its whole text');
  assert.equal(pack.coverage.unavailable_or_omitted, 112);
  const omitted = pack.coverage.items.filter(entry => entry.status === 'omitted');
  assert.equal(omitted.length, 112, 'the overflow comes first in coverage.items');
  assert.ok(omitted.every(entry => entry.reason === 'cap'));
  assert.ok(pack.coverage.items.length <= 300);
  assert.match(pack.coverage.summary, /^300 of 412 objects listed; 300 included in full, 0 partially; 112 omitted for space$/);
  // Longer texts: labels shorten to 24 chars first, then the reserve caps the list - and says so.
  const wordy = notes.map((note, i) => ({ ...note, text: `Sticky note ${i} with a much longer sentence that cannot fit in the label at all` }));
  const tight = build({ items: wordy, shapes: [], blocks: [], links: [], groups: [], exchanges: [] }, { request: '' });
  assertValid(tight);
  assert.ok(tight.inventory.items.every(item => item.label.length <= 24));
  assert.ok(tight.coverage.reserved_chars <= 6000 && tight.coverage.listed < 300);
  assert.equal(tight.coverage.listed + tight.coverage.items.filter(entry => entry.status === 'omitted').length, 412);
  assert.match(tight.coverage.summary, new RegExp(`^${tight.coverage.listed} of 412 objects listed; `));
});
