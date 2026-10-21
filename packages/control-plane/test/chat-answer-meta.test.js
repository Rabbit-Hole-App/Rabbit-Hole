// Chat answer metadata (chat-workspace-CONTRACT.md B1, B3, B4): the trailer split and the server's validation of actions and
// follow-ups. The model's word is never trusted: capabilities come from the slash registry, paid and generationRequired are
// computed here, and anything invalid is dropped without an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_META_SYSTEM, splitAnswerMeta, validateAnswerMeta } from '../src/chat-answer-meta.js';

const REFS = [{ sourceId: 'doc:7', kind: 'doc', name: 'Paper', version: 'v1', range: null }];
const act = (capability, extra = {}) => ({ capability, label: `Make ${capability}`, subject: `the ${capability} of caching`, ...extra });
const run = (meta, opts = {}) => validateAnswerMeta(typeof meta === 'string' ? meta : JSON.stringify(meta), { messageId: '812', contextRefs: REFS, ...opts });

test('the prompt asks for the one trailer, names the distinct visual capabilities, and stays compact', () => {
  assert.match(ANSWER_META_SYSTEM, /<answer_meta>\{"actions":\[/);
  for (const c of ['diagram', 'graph', 'image', 'video', 'notebook']) assert.match(ANSWER_META_SYSTEM, new RegExp(`- ${c}:|; ${c}:`), c);
  // /animate is no longer a command (owner, 2026-10-20): a new answer never suggests it.
  assert.doesNotMatch(ANSWER_META_SYSTEM, /animate/);
  assert.match(ANSWER_META_SYSTEM, /canvas title alone/);
  assert.ok(ANSWER_META_SYSTEM.length < 2000, `billed on every answer: ${ANSWER_META_SYSTEM.length} chars`);
});

test('split: the trailer and anything after it are stripped from content; raw is its JSON', () => {
  const r = splitAnswerMeta('Caching keeps hot data close.\n\n<answer_meta>{"actions":[]}</answer_meta>\ntrailing junk');
  assert.deepEqual(r, { content: 'Caching keeps hot data close.', raw: '{"actions":[]}' });
  assert.deepEqual(splitAnswerMeta('No trailer here.'), { content: 'No trailer here.', raw: null });
  assert.deepEqual(splitAnswerMeta(undefined), { content: '', raw: null });
});

test('split on a partial stream: a trailing piece of the open tag is held back, an open trailer never leaks', () => {
  assert.deepEqual(splitAnswerMeta('Answer text <answer_me'), { content: 'Answer text ', raw: null });
  assert.deepEqual(splitAnswerMeta('Answer text <'), { content: 'Answer text ', raw: null });
  assert.equal(splitAnswerMeta('a < b and c').content, 'a < b and c', 'a < mid-text is not held');
  const open = splitAnswerMeta('Answer.<answer_meta>{"actions":[{"capa');
  assert.equal(open.content, 'Answer.');
  assert.deepEqual(validateAnswerMeta(open.raw, { messageId: '1' }), { actions: [], followUps: [] }, 'a cut-off trailer is malformed, so empty');
});

test('malformed or missing JSON gives empty lists, never a throw', () => {
  for (const raw of [null, undefined, '', '{', 'not json', '5', 'null', '[]', '{"actions":"x","followUps":{}}']) {
    assert.deepEqual(validateAnswerMeta(raw, { messageId: '1' }), { actions: [], followUps: [] }, String(raw));
  }
});

test('actions: a valid record carries the server ids, the message refs and server-computed flags', () => {
  const { actions } = run({ actions: [act('diagram')] });
  assert.deepEqual(actions, [{
    id: 'a1', capabilityId: 'diagram', label: 'Make diagram', sourceMessageId: '812', contextRefs: REFS,
    args: { subject: 'the diagram of caching' }, generationRequired: true, paid: false,
  }]);
});

test('actions: unknown, forbidden (in SLASH but not allowlisted) and mode capabilities are dropped', () => {
  const { actions } = run({ actions: [act('rm -rf'), act('whiteboard'), act('3d'), act('deeper'), act('ask'), act('dive'), act('graph')] });
  assert.deepEqual(actions.map(a => a.capabilityId), ['graph']);
  assert.equal(actions[0].id, 'a1', 'ids count kept records only');
});

test('actions: a bare or oversize subject, or a missing or oversize label, is dropped', () => {
  const { actions } = run({ actions: [
    act('diagram', { subject: '' }), act('graph', { subject: '   ' }), act('quiz', { subject: 'x'.repeat(201) }),
    act('code', { label: '' }), act('compare', { label: 'x'.repeat(41) }), { capability: 'practice', label: 'Try it' },
    act('image', { subject: 'x'.repeat(200), label: 'x'.repeat(40) }),
  ] });
  assert.deepEqual(actions.map(a => a.capabilityId), ['image']);
});

test('actions: duplicates dropped, more than 3 trimmed', () => {
  const { actions } = run({ actions: [act('diagram'), act('diagram'), act('graph'), act('quiz'), act('code'), act('compare')] });
  assert.deepEqual(actions.map(a => [a.id, a.capabilityId]), [['a1', 'diagram'], ['a2', 'graph'], ['a3', 'quiz']]);
});

test('actions: paid and generationRequired come from the registry, never the model', () => {
  const { actions } = run({ actions: [act('video', { paid: false, generationRequired: false }), act('graph', { paid: true }), act('animate')] });
  // animate is dropped: /motion replaced it as the animation command (owner, 2026-10-20).
  assert.deepEqual(actions.map(a => [a.capabilityId, a.paid, a.generationRequired]), [['video', true, true], ['graph', false, true]]);
});

test('actions: notebook with the answer s Python code needs no generation; without code, or non-Python, it generates', () => {
  const cells = ['import numpy as np', '', 'print(np.arange(3))'];
  const [withCode] = run({ actions: [act('notebook', { code: { language: 'python', cells } })] }).actions;
  assert.equal(withCode.generationRequired, false);
  assert.deepEqual(withCode.args.code, { language: 'python', cells: ['import numpy as np', 'print(np.arange(3))'] });
  for (const code of [undefined, { language: 'python', cells: [] }, { language: 'javascript', cells: ['1'] }, { cells: [1, 2] }]) {
    const [a] = run({ actions: [act('notebook', { code })] }).actions;
    assert.deepEqual([a.generationRequired, 'code' in a.args], [true, false], JSON.stringify(code));
  }
  const [other] = run({ actions: [act('code', { code: { language: 'python', cells: ['x = 1'] } })] }).actions;
  assert.deepEqual([other.generationRequired, 'code' in other.args], [true, false], 'code rides on notebook only');
});

test('actions: motion only with motionDev, and always paid', () => {
  assert.deepEqual(run({ actions: [act('motion')] }).actions, []);
  const [m] = run({ actions: [act('motion')] }, { motionDev: true }).actions;
  assert.deepEqual([m.capabilityId, m.paid], ['motion', true]);
});

test('followUps: limits, de-duplication, kinds and ids', () => {
  const { followUps } = run({ followUps: [
    { text: 'Why does the cache miss?', kind: 'clarify' },
    { text: '  why  does the CACHE miss? ', kind: 'check' },
    { text: '', kind: 'next' }, { text: 'x'.repeat(141) }, { kind: 'next' }, 'string',
    { text: 'What happens on eviction?', kind: 'bogus' },
    { text: 'How does this connect to CDNs?', kind: 'connect' },
    { text: 'A fourth one', kind: 'next' },
  ] });
  assert.deepEqual(followUps, [
    { id: 'f1', text: 'Why does the cache miss?', kind: 'clarify' },
    { id: 'f2', text: 'What happens on eviction?', kind: 'next' },
    { id: 'f3', text: 'How does this connect to CDNs?', kind: 'connect' },
  ]);
  assert.equal(run({ followUps: [{ text: 'x'.repeat(140), kind: 'implication' }] }).followUps.length, 1);
});
