// UI-15.1: the thin client API of a generation proposal's review. A fake api stands in for web/src/api.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canGenerate, confirmProposal, fetchProposal, forgetPress, problemOf, saveProposal } from './generation-review-client.js';

const proposal = (over = {}) => ({ proposal_id: 'gp-0123456789abcdef', version: 2, schema_version: 1, command: 'motion', title: 'Water', description: 'Water rises.', prompt: 'Water rises.', settings: { duration_seconds: 10, audio: false },
  input: { request: '/motion water' }, references: [], usage: { estimate_credits: 40 }, ...over });
const fail = (status, data) => Object.assign(new Error(data.error || 'x'), { status, data });

test('fetchProposal and saveProposal call the proposal route and return a view the card draws', async () => {
  const calls = [];
  const api = async (path, opts) => { calls.push([path, opts?.method || 'GET', opts?.body && JSON.parse(opts.body)]); return { proposal: proposal(), message_id: '40', used: false, references: [{ id: 'r1', label: 'Card', state: 'unsupported', message: 'No.' }] }; };
  const got = await fetchProposal(api, 40);
  assert.deepEqual(calls[0], ['/api/learn/chat/messages/40/proposal', 'GET', undefined]);
  assert.equal(got.view.status, 'awaiting_review'); assert.equal(got.view.revision, 2);
  assert.deepEqual(got.view.validation_errors, [{ path: 'references.r1', message: 'No.' }]);
  assert.ok(!got.view.allowed_actions.includes('generate'), 'a blocked reference blocks Generate');
  const saved = await saveProposal(api, 40, { version: 2 }, { description: 'New text.' });
  assert.deepEqual(calls[1], ['/api/learn/chat/messages/40/proposal', 'PUT', { expected_version: 2, description: 'New text.' }]);
  assert.equal(saved.view.title, 'Water');
  const used = await fetchProposal(async () => ({ proposal: proposal(), used: true, references: [] }), 40);
  assert.equal(used.view.status, 'completed'); assert.deepEqual(used.view.allowed_actions, []);
});

test('problemOf names what a refusal means and keeps the draft in every case', () => {
  assert.deepEqual(problemOf(fail(409, { code: 'reference_blocked', error: 'Gone.', references: [{ id: 'r1', state: 'deleted' }] })), { kind: 'references', states: [{ id: 'r1', state: 'deleted' }], message: 'Gone.' });
  assert.equal(problemOf(fail(409, { code: 'proposal_used', error: 'Used.' })).kind, 'used');
  const stale = problemOf(fail(409, { code: 'proposal_stale', error: 'New.', current: proposal({ version: 3 }), current_message_id: 41 }));
  assert.deepEqual([stale.kind, stale.current.version, stale.currentMessageId], ['stale', 3, 41]);
  for (const code of ['proposal_canvas', 'proposal_refused', 'brief_stale', 'proposal_invalid']) assert.equal(problemOf(fail(409, { code })).kind, 'refused', code);
  const invalid = problemOf(fail(400, { error: 'Bad.', errors: [{ path: 'prompt', message: 'Bad.' }], code: 'prompt_syntax' }));
  assert.deepEqual([invalid.kind, invalid.errors[0].path, invalid.code], ['invalid', 'prompt', 'prompt_syntax']);
  assert.equal(problemOf(fail(500, {})).kind, 'failed'); assert.equal(problemOf(new Error('offline')).message, 'offline');
});

test('Generate is for the saved, current, valid revision only', () => {
  const view = { command: 'motion', title: 'Water', description: 'Water rises.', settings: { duration_seconds: 10, audio: false }, references: [], allowed_actions: ['edit', 'save', 'generate'] };
  assert.equal(canGenerate(view), true);
  assert.equal(canGenerate(view, {}), true);
  assert.equal(canGenerate(view, { description: 'Water rises.', settings: { duration_seconds: 10 } }), true, 'an unchanged draft is not an unsaved edit');
  assert.equal(canGenerate(view, { description: 'Different.' }), false, 'unsaved edits block Generate');
  assert.equal(canGenerate(view, { settings: { duration_seconds: 15 } }), false);
  assert.equal(canGenerate({ ...view, allowed_actions: ['edit', 'save'] }), false);
});

test('confirmProposal starts a revision once: a double click shares the first call, a failed start can be pressed again', async () => {
  const p = proposal({ proposal_id: 'gp-aaaaaaaaaaaaaaaa' });
  let starts = 0;
  const start = async () => { starts++; return 'card-1'; };
  const [a, b] = await Promise.all([confirmProposal(p, start), confirmProposal(p, start)]);
  assert.deepEqual([a, b, starts], ['card-1', 'card-1', 1]);
  assert.equal(await confirmProposal(p, start), 'card-1'); assert.equal(starts, 1, 'after it started, a press finds the same result');
  assert.equal(await confirmProposal({ ...p, version: 3 }, start), 'card-1'); assert.equal(starts, 2, 'another revision is its own start');
  const q = proposal({ proposal_id: 'gp-bbbbbbbbbbbbbbbb' });
  let tries = 0;
  const flaky = async () => { if (++tries === 1) throw fail(409, { code: 'reference_blocked' }); return 'ok'; };
  await assert.rejects(confirmProposal(q, flaky));
  assert.equal(await confirmProposal(q, flaky), 'ok'); assert.equal(tries, 2);
  forgetPress(q); assert.equal(await confirmProposal(q, flaky), 'ok'); assert.equal(tries, 3);
});
