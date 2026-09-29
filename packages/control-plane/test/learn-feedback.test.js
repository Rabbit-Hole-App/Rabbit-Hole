import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, feedbackFetch } from '../src/learn-feedback.js';

test('feedback needs a kind and 1-2000 characters; context is trimmed to short strings', () => {
  assert.throws(() => validateFeedback({ kind: 'rant', text: 'x' }), /Bug or Idea/);
  assert.throws(() => validateFeedback({ kind: 'bug', text: '   ' }), /1 to 2000/);
  assert.throws(() => validateFeedback({ kind: 'idea', text: 'x'.repeat(2001) }), /1 to 2000/);
  const report = validateFeedback({ kind: 'bug', text: ' The graph froze ', context: { board: 'b1', path: '/apps/x', viewport: '1440x900', extra: 'dropped' } });
  assert.deepEqual(report, { kind: 'bug', text: 'The graph froze', context: { board: 'b1', path: '/apps/x', viewport: '1440x900', userAgent: null } });
});

test('a report is stored in Learn media with who sent it, after the app access check', async () => {
  const stored = new Map();
  const media = { put: async (key, value) => stored.set(key, JSON.parse(value)) };
  const live = { put: async () => { throw new Error('live bucket touched'); } };
  const post = body => new Request('https://dev.example/api/learn/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const denied = { CONTROL_PLANE: { fetch: async () => Response.json({ error: 'no' }, { status: 403 }) }, LEARN_MEDIA: media, RUNS: live };
  assert.equal((await feedbackFetch(post({ app: 'demo', kind: 'idea', text: 'Dark mode' }), denied)).status, 403);
  assert.equal(stored.size, 0);
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: 'o', email: 'a@b.c' }) }, LEARN_MEDIA: media, RUNS: live };
  const response = await feedbackFetch(post({ app: 'demo', kind: 'idea', text: 'Dark mode', context: { board: 'main' } }), env);
  assert.equal(response.status, 201);
  const [[key, saved]] = [...stored];
  assert.match(key, /^learn-feedback\/\d{4}-\d{2}-\d{2}\/.+\.json$/);
  assert.equal(saved.kind, 'idea');
  assert.equal(saved.email, 'a@b.c');
  assert.equal(saved.context.board, 'main');
  assert.equal((await feedbackFetch(post({ app: 'demo', kind: 'bug', text: '' }), env)).status, 400);
});
