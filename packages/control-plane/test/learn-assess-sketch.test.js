// POST /api/learn/assess with an Explain Back sketch (docs/features/explain-back-sketch.md): the typed text and the
// drawing are one learner response - one model call, the picture and the instruction in one user message - and a
// text-only grade is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';
import { assessAnswer, validateAssessBody } from '../src/learn-grade-routes.js';
import { challengePrompt } from '../src/agents/learn-grade.js';

function recordFetch(t) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ model: 'claude-opus-5', content: [{ type: 'text', text: 'VERDICT: partial\nYou drew the lookup.' }], stop_reason: 'end_turn' });
  };
  return calls;
}
function world(t) {
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')");
  const env = { LEARN_DB, DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane({ apps: {} }), ANTHROPIC_API_KEY: 'k' };
  return body => assessAnswer(new Request('https://dev.test/api/learn/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sketch = { image: PNG, text: 'Marks: 2 boxes, 1 arrow. Written in the sketch: box: "embedding row"; arrow label: "add".' };
const body = (overrides = {}) => ({ app: 'canvas-0a1b2c3d', mode: 'explain_back', prompt: 'What happens to token id 2?', expects: ['the id selects an embedding row'], answer: 'the id picks a row', attempt_id: 'attempt-0001', sketch, ...overrides });

test('text and sketch are one grade: one call, the picture then the instruction in one user message', async t => {
  const calls = recordFetch(t), post = world(t);
  const response = await post(body());
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const [message] = calls[0].messages;
  assert.equal(calls[0].messages.length, 1);
  assert.equal(message.role, 'user');
  assert.deepEqual(message.content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.slice('data:image/png;base64,'.length) } });
  assert.deepEqual(message.content[1], { type: 'text', text: challengePrompt({ mode: 'explain_back', prompt: 'What happens to token id 2?', expects: ['the id selects an embedding row'] }, 'the id picks a row', sketch) });
  assert.match(message.content[1].text, /together as ONE explanation/);
});

test('a sketch alone is an answer; without a picture its words still go, in the plain instruction', async t => {
  const calls = recordFetch(t), post = world(t);
  assert.equal((await post(body({ answer: '' }))).status, 200);
  assert.match(calls[0].messages[0].content[1].text, /typed nothing: their explanation is the sketch alone/);
  assert.equal((await post(body({ sketch: { image: null, text: sketch.text } }))).status, 200);
  assert.equal(typeof calls[1].messages[0].content, 'string');
  assert.match(calls[1].messages[0].content, /arrow label: "add"/);
});

test('a text-only grade is unchanged: no sketch, no attempt id, a one-string message', async t => {
  const calls = recordFetch(t), post = world(t);
  const { attempt_id: _a, sketch: _s, ...plain } = body();
  assert.equal((await post(plain)).status, 200);
  assert.equal(calls[0].messages[0].content, challengePrompt({ mode: 'explain_back', prompt: plain.prompt, expects: plain.expects }, plain.answer));
  assert.deepEqual(validateAssessBody(plain), { value: { mode: 'explain_back', prompt: plain.prompt, expects: plain.expects, answer: plain.answer } });
  assert.equal(validateAssessBody({ ...plain, answer: '' }).error, 'answer must be 1-4000 characters', 'text-only still needs words');
});

test('the sketch is checked at the edge: explain-back only, a real PNG under 600 KB, its words bounded, an attempt id', () => {
  assert.equal(validateAssessBody(body({ mode: 'challenge' })).error, 'only an explain_back answer carries a sketch');
  for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA', `${PNG}<script>`, `data:image/png;base64,iVBORw0KGgo${'A'.repeat(600000)}`, 42]) {
    assert.match(validateAssessBody(body({ sketch: { image, text: 'Marks: 1 box.' } })).error, /PNG data URL/, String(image).slice(0, 30));
  }
  assert.match(validateAssessBody(body({ sketch: { image: PNG, text: '' } })).error, /sketch.text/);
  assert.match(validateAssessBody(body({ sketch: { image: PNG, text: 'x'.repeat(2001) } })).error, /sketch.text/);
  assert.match(validateAssessBody(body({ sketch: [] })).error, /sketch must be an object/);
  assert.match(validateAssessBody(body({ attempt_id: undefined })).error, /attempt_id/);
});
