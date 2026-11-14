// Card archive: every request that reaches the author leaves one JSON at explain-archive/<day>/<id>.json (success, validation failure, thrown error);
// a failed archive write never changes the answer; the record holds the user id, never the email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactFetch, generateArtifact } from '../src/learn-artifact.js';
import { archiveExplanation } from '../src/learn-storage.js';
import { OWNER } from './explain-fixture.js';

const bucket = () => { const puts = []; return { puts, async put(key, body) { puts.push({ key, record: JSON.parse(body) }); } }; };
const envWith = LEARN_MEDIA => ({ LEARN_MEDIA, RELEASE_SHA: 'abc123', CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: OWNER.org, user_id: OWNER.userId, email: 'private@example.test' }) } });
const post = (env, generate, body) => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', ...body }) }), env, generate);
const reply = input => async () => Response.json({ content: [{ type: 'tool_use', id: 't1', name: 'ask_clarifying_question', input }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } });

test('a card request is archived with its trace, release and user id (no email); the answer is unchanged', async t => {
  const media = bucket(), env = envWith(media);
  const res = await post(env, (e, input, options) => generateArtifact(e, input, { ...options, callModel: reply({ question: 'Which part?' }) }), { command: 'explanation', args: 'how does a decision tree split', context: 'x', depth: 'detailed', board: 'main' });
  assert.deepEqual([res.status, (await res.json()).result], [200, 'clarification']);
  assert.equal(media.puts.length, 1);
  const { key, record } = media.puts[0];
  assert.match(key, new RegExp(`^explain-archive/\\d{4}-\\d{2}-\\d{2}/${record.id}\\.json$`));
  assert.deepEqual([record.outcome, record.release, record.userId, record.app, record.board], ['clarification', 'abc123', OWNER.userId, 'demo', 'main']);
  assert.deepEqual(record.request, { command: 'explanation', args: 'how does a decision tree split', selection: null, hasContext: true, depth: 'detailed', sourceRefId: null });
  assert.equal(record.answers, 1);
  assert.ok(Array.isArray(record.references) && 'shapeId' in record && 'plannerKind' in record && record.models.author, 'what the author was given is recorded');
  assert.ok(!JSON.stringify(record).includes('private@example.test'), 'no email in the archive');
});

test('a thrown generation error and a validation failure are archived too', async t => {
  const media = bucket(), env = envWith(media);
  const thrown = await post(env, async () => { throw Object.assign(new Error('boom'), { code: 'x' }); }, { command: 'explanation', args: 'how a tree splits' });
  assert.equal(thrown.status, 502);
  await post(env, async () => ({ result: 'validation_error', error: 'bad card' }), { command: 'explanation', args: 'how a tree splits' });
  assert.deepEqual(media.puts.map(p => [p.record.outcome, p.record.error]), [['error', 'boom'], ['validation_error', 'bad card']]);
});

test('a failed archive write is logged and the card is still returned', async t => {
  const logs = [], log = console.log; console.log = line => { logs.push(String(line)); }; t.after(() => { console.log = log; });
  const env = envWith({ async put() { throw new Error('r2 down'); } });
  const res = await post(env, async () => ({ result: 'clarification', question: 'Which?' }), { command: 'explanation', args: 'how a tree splits' });
  assert.deepEqual([res.status, (await res.json()).result], [200, 'clarification']);
  assert.ok(logs.some(l => l.includes('explain_archive_failed') && l.includes('r2 down')));
  await archiveExplanation({}, { id: 'none' }); // no bucket: nothing written, nothing thrown
});
