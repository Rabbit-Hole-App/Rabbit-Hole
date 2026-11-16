// Add as card for a code-explain answer (code-explain-insert.js; code-explain-card-spec.md section 3 step 4): the plan (primary, satellites, connectors), the placement and the step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_EXPLAIN_MAX_CARDS } from '../../control-plane/src/code-explain-contract.js';
import { addCodeExplain, placeCodeExplain, planCodeExplain } from './code-explain-insert.js';
import { askedFrom } from './code-explain-link.js';
import { CODE_CARD } from './code-card.js';
import { CODE_EXPLAIN_SIZE } from './code-explain-text.js';
import { GAP } from './inline-ai-apply.js';

const LINES = { 'model.py': 330, 'configurator.py': 47, 'bench.py': 120, 'a.py': 50, 'b.py': 50, 'c.py': 50, 'd.py': 50 };
const lines = path => LINES[path];
// The meta payload the control plane returns (spec 2a minus files[*].cardId; figure may be absent).
const payload = () => ({
  type: 'codeExplain', title: 'How attention hides later tokens', question: 'how does attention hide later tokens?',
  repo: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291',
  files: [
    { path: 'model.py', ranges: [{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }] },
    { path: 'configurator.py', ranges: [{ id: 'r3', start: 30, end: 34 }] },
  ],
  mentioned: [{ id: 'm1', path: 'bench.py', start: 88, end: 88 }],
  depth: 'standard',
  depths: {
    brief: { prose: 'Attention sets later scores to minus infinity. The softmax gives them zero weight.', anchors: [{ sentence: 0, target: 'r2' }] },
    standard: { prose: 'The model builds a mask. Positions above the diagonal are zero. The mask is applied before the softmax. Softmax zeroes minus infinity. The config can override the block size.', anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'r2' }, { sentence: 4, target: 'r3' }] },
    detailed: { prose: 'Take T equal to 4. The mask is tril of ones. A benchmark exercises this path.', anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'm1' }], trace: { input: 'T = 4', steps: ['mask = tril(ones(4,4))'] } },
  },
  suggestions: ['Why is the mask added before the softmax?', 'What does -inf do to a probability?', 'What changes with flash attention?'],
  evidence: { model: 'claude-sonnet-5-5', sources: ['model.py:52-60', 'model.py:67-70', 'configurator.py:30-34', 'bench.py:88'], createdAt: '2026-11-15T19:20:00Z' },
});

test('the plan is the primary, a satellite code card per further file, and numbered connectors from the primary', () => {
  const plan = planCodeExplain({ id: 'chat-42', payload: payload(), app: 'repo-app', lines });
  assert.equal(plan.ok, true);
  const [primary, satellite] = plan.blocks;
  assert.equal(plan.blocks.length, 2);
  assert.equal(primary.id, 'chat-42');
  assert.equal(primary.type, 'codeExplain');
  assert.equal(primary.app, 'repo-app');
  assert.deepEqual(primary.files.map(f => f.cardId), ['self', 'chat-42-file-1']);
  assert.equal(primary.figure, null, 'an absent figure is saved as null');
  assert.deepEqual(Object.keys(primary).sort(), ['app', 'commit', 'depth', 'depths', 'dx', 'dy', 'evidence', 'figure', 'files', 'id', 'mentioned', 'question', 'repo', 'suggestions', 'title', 'type']);
  // The satellite is repoCodeCard's block over the lines the ranges span, with ranges and from (spec 2b); its id is the primary's files[1].cardId.
  assert.equal(satellite.id, 'chat-42-file-1');
  assert.equal(satellite.type, 'repo-code');
  assert.deepEqual(satellite.source, { kind: 'repository', app: 'repo-app', repo: 'karpathy/nanoGPT', commit: payload().commit, path: 'configurator.py', start: 30, end: 34 });
  assert.deepEqual(satellite.ranges, [{ id: 'r3', start: 30, end: 34 }]);
  assert.equal(satellite.from, 'codeExplain:chat-42');
  assert.deepEqual(plan.links.map(l => [l.id, l.from, l.to, l.label, l.fromSide, l.toSide]), [['chat-42-link-1', 'chat-42', 'chat-42-file-1', '1', 'right', 'left']]);
});

test('satellites and connectors are numbered in walk order, 1 2 3', () => {
  const p = payload();
  p.files = ['a.py', 'b.py', 'c.py', 'd.py'].map((path, i) => ({ path, ranges: [{ id: `x${i}`, start: 1 + i, end: 5 + i }] }));
  p.mentioned = [];
  p.depths = { brief: { prose: 'A.', anchors: [{ sentence: 0, target: 'x1' }] }, standard: { prose: 'A.', anchors: [] }, detailed: { prose: 'A.', anchors: [] } };
  p.evidence.sources = p.files.map((f, i) => `${f.path}:${1 + i}-${5 + i}`);
  const plan = planCodeExplain({ id: 'chat-1', payload: p, lines });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.blocks.length, CODE_EXPLAIN_MAX_CARDS);
  assert.deepEqual(plan.blocks.slice(1).map(b => b.source.path), ['b.py', 'c.py', 'd.py']);
  assert.deepEqual(plan.links.map(l => [l.label, l.to]), [['1', 'chat-1-file-1'], ['2', 'chat-1-file-2'], ['3', 'chat-1-file-3']]);
  assert.equal('app' in plan.blocks[0], false);
});

test('a payload the contract refuses is not planned: the caller falls back to the chat card', () => {
  const bad = (change, match) => { const p = payload(); change(p); const plan = planCodeExplain({ id: 'chat-42', payload: p, lines }); assert.equal(plan.ok, false); assert.match(plan.errors.join('\n'), match); };
  bad(p => { p.depths.standard.anchors.push({ sentence: 0, target: 'nope' }); }, /not a range or mention id/);
  bad(p => { p.files[0].ranges[0].end = 9999; }, /past the 330 lines/);
  bad(p => { p.suggestions = ['one?', 'two?']; }, /exactly three/);
  bad(p => { p.files.push(...['a.py', 'b.py', 'c.py'].map((path, i) => ({ path, ranges: [{ id: `q${i}`, start: 1, end: 2 }] }))); }, /at most 4/);
  bad(p => { p.evidence.sources = ['model.py:52-60']; }, /evidence\.sources is missing/);
  bad(p => { delete p.depths.detailed; }, /depths\.detailed is missing/);
  assert.equal(planCodeExplain({ id: '', payload: payload() }).ok, false);
  assert.equal(planCodeExplain({ id: 'chat-1', payload: null }).ok, false);
});

test('the model never wrote a cardId; the client sets them (a payload that carries one is refused by the server-side rule, not trusted here)', () => {
  const p = payload();
  p.files[1].cardId = 'someone-elses-card';
  const plan = planCodeExplain({ id: 'chat-42', payload: p, lines });
  assert.equal(plan.ok, true);
  assert.equal(plan.blocks[0].files[1].cardId, 'chat-42-file-1');
});

test('with no line counts known the ranges are not bounded here (the server checked them)', () => {
  const p = payload();
  p.files[0].ranges[0].end = 9999;
  p.evidence.sources[0] = 'model.py:52-9999';
  assert.equal(planCodeExplain({ id: 'chat-42', payload: p }).ok, true);
});

const box = (x, y, w, h) => ({ x, y, w, h });
const sizes = [CODE_EXPLAIN_SIZE, CODE_CARD, CODE_CARD, CODE_CARD];
const env = (over = {}) => ({ source: box(0, 0, 400, 300), obstacles: [], visible: null, point: { x: 500, y: 500 }, column: 560, flowY: 1000, ...over });

test('the primary stands beside its source and the satellites to its right in walk order, each one gap beyond the last', () => {
  const at = placeCodeExplain(env(), sizes);
  // Absolute spots from the offsets: x = dx + (column - w) / 2, y = dy + flow; the first flow place is flowY, each next adds the card's height and 20.
  const spots = []; let flow = 1000;
  at.forEach((o, i) => { spots.push({ x: o.dx + (560 - sizes[i].w) / 2, y: o.dy + flow, w: sizes[i].w, h: sizes[i].h }); flow += sizes[i].h + 20; });
  assert.equal(spots[0].x, 400 + GAP);
  assert.equal(spots[0].y, 0);
  assert.equal(spots[1].x, spots[0].x + spots[0].w + GAP);
  assert.equal(spots[2].x, spots[1].x + spots[1].w + GAP);
  assert.equal(spots[3].x, spots[2].x + spots[2].w + GAP);
  assert.deepEqual(spots.map(s => s.y), [0, 0, 0, 0], 'one row, level with the primary');
});

test('a satellite never lands on a card that is in the way: it moves on right', () => {
  const blocker = box(400 + GAP + CODE_EXPLAIN_SIZE.w + GAP, 0, 200, 200);
  const at = placeCodeExplain(env({ obstacles: [blocker] }), sizes.slice(0, 2));
  const x1 = at[1].dx + (560 - CODE_CARD.w) / 2;
  assert.ok(x1 >= blocker.x + blocker.w, `satellite at ${x1} clears the blocker ending at ${blocker.x + blocker.w}`);
});

test('with no source the primary takes free space near the view\'s centre', () => {
  const at = placeCodeExplain(env({ source: null, point: { x: 2000, y: 2000 } }), sizes.slice(0, 1));
  assert.equal(at.length, 1);
  assert.equal(Number.isFinite(at[0].dx) && Number.isFinite(at[0].dy), true);
});

test('Add as card hands the canvas the blocks, the connectors and a placer, in one call', () => {
  askedFrom(null);
  const calls = [];
  const ops = { insertCodeExplain: input => { calls.push(input); return input.blocks[0].id; }, hasBlock: () => true, repositoryContext: () => null };
  const out = addCodeExplain(ops, { id: 'chat-42', payload: payload() });
  assert.deepEqual(out, { ok: true, id: 'chat-42' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].blocks.length, 2);
  assert.equal(calls[0].links.length, 1);
  assert.equal(calls[0].beside, null);
  assert.equal(calls[0].place(env()).length, 2);
});

test('the open repository at the same commit bounds the ranges and names the app; at another commit it is not trusted', () => {
  const ops = (commit) => ({ insertCodeExplain: input => input.blocks[0].id, repositoryContext: () => ({ app: 'repo-app', repo: 'karpathy/nanoGPT', commit, lines: path => ({ 'model.py': 60, 'configurator.py': 47 })[path] }) });
  const here = addCodeExplain(ops(payload().commit), { id: 'chat-42', payload: payload() });
  assert.equal(here.ok, false, 'model.py has 60 lines in this snapshot, the range ends at 70');
  assert.match(here.errors.join('\n'), /past the 60 lines/);
  assert.equal(addCodeExplain(ops('f'.repeat(40)), { id: 'chat-42', payload: payload() }).ok, true);
});

test('a canvas that cannot take it (read-only, a copy, none) says so and nothing is half-inserted', () => {
  assert.deepEqual(addCodeExplain(null, { id: 'chat-42', payload: payload() }).ok, false);
  assert.equal(addCodeExplain({ insertCodeExplain: () => null }, { id: 'chat-42', payload: payload() }).ok, false);
  assert.equal(addCodeExplain({}, { id: 'chat-42', payload: payload() }).ok, false);
});

test('an answer to a suggestion asked from a card stands beside that card', () => {
  const seen = [];
  const ops = { insertCodeExplain: input => { seen.push(input.beside); return input.blocks[0].id; }, hasBlock: id => id === 'chat-1' };
  askedFrom('chat-1', 'how does attention hide later tokens?');
  addCodeExplain(ops, { id: 'chat-2', payload: payload() });
  addCodeExplain(ops, { id: 'chat-3', payload: payload() });
  assert.deepEqual(seen, ['chat-1', null], 'consumed once');
});
