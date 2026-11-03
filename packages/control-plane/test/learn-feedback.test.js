import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, feedbackFetch, withinLimits, senderContact, HOURLY, DAILY, LIMITED } from '../src/learn-feedback.js';

// A Learn media bucket that keeps what is put and, like R2, answers null to a put that is only allowed when the key is absent.
const bucket = ({ failLimit = false } = {}) => {
  const objects = new Map();
  return {
    objects,
    put: async (key, value, options = {}) => {
      if (failLimit && key.startsWith('learn-feedback-limit/')) throw new Error('bucket unavailable');
      if (options.onlyIf instanceof Headers && options.onlyIf.get('If-None-Match') === '*' && objects.has(key)) return null;
      objects.set(key, value);
      return { key };
    },
    get: async key => (objects.has(key) ? { json: async () => JSON.parse(objects.get(key)) } : null),
    reports: () => [...objects].filter(([key]) => key.startsWith('learn-feedback/')).map(([key, value]) => [key, JSON.parse(value)]),
  };
};
const post = (body, headers = {}) => new Request('https://dev.example/api/learn/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
// The control plane as the app Worker sees it: who is signed in, one app, and the mail request (recorded).
const controlPlane = ({ me = { org: 'o', email: 'a@b.c', user_id: 'u1' }, notify = () => Response.json({ sent: true }), calls = [] } = {}) => ({
  calls,
  fetch: async request => {
    const path = new URL(request.url).pathname;
    if (path === '/api/feedback/notify') { calls.push({ cookie: request.headers.get('cookie'), body: await request.json() }); return notify(); }
    if (path === '/api/me') return Response.json(me);
    return Response.json({ name: 'demo', org: me.org, email: me.email });
  },
});
const identityRows = rows => ({ prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) });

test('feedback needs a kind and 1-2000 characters; context is trimmed to short strings', () => {
  assert.throws(() => validateFeedback({ kind: 'rant', text: 'x' }), /Bug or Idea/);
  assert.throws(() => validateFeedback({ kind: 'bug', text: '   ' }), /1 to 2000/);
  assert.throws(() => validateFeedback({ kind: 'idea', text: 'x'.repeat(2001) }), /1 to 2000/);
  const report = validateFeedback({ kind: 'bug', text: ' The graph froze ', context: { board: 'b1', path: '/apps/x', viewport: '1440x900', extra: 'dropped' } });
  assert.deepEqual(report, { kind: 'bug', text: 'The graph froze', context: { board: 'b1', path: '/apps/x', viewport: '1440x900', userAgent: null } });
});

test('a report is stored in Learn media with who sent it, after the app access check', async () => {
  const media = bucket();
  const live = { put: async () => { throw new Error('live bucket touched'); } };
  const denied = { CONTROL_PLANE: { fetch: async () => Response.json({ error: 'no' }, { status: 403 }) }, LEARN_MEDIA: media, RUNS: live };
  assert.equal((await feedbackFetch(post({ app: 'demo', kind: 'idea', text: 'Dark mode' }), denied)).status, 403);
  assert.equal(media.objects.size, 0, 'nothing stored, not even a limit slot, before access');
  const env = { CONTROL_PLANE: controlPlane(), LEARN_MEDIA: media, RUNS: live };
  const response = await feedbackFetch(post({ app: 'demo', kind: 'idea', text: 'Dark mode', context: { board: 'main' } }), env);
  assert.equal(response.status, 201);
  const [[key, saved]] = media.reports();
  assert.match(key, /^learn-feedback\/\d{4}-\d{2}-\d{2}\/.+\.json$/);
  assert.equal(saved.kind, 'idea');
  assert.equal(saved.email, 'a@b.c');
  assert.equal(saved.userId, 'u1');
  assert.equal(saved.context.board, 'main');
  assert.match((await response.json()).ref, /^RH-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal((await feedbackFetch(post({ app: 'demo', kind: 'bug', text: '' }), env)).status, 400);
});

test('a report from outside an app (Home, Library) needs only a signed-in member, and stays off the live bucket', async () => {
  const media = bucket();
  const live = { put: async () => { throw new Error('live bucket touched'); } };
  const signedOut = { CONTROL_PLANE: { fetch: async () => new Response('login', { status: 302 }) }, LEARN_MEDIA: media, RUNS: live };
  assert.equal((await feedbackFetch(post({ kind: 'idea', text: 'A dark theme' }), signedOut)).status, 401);
  assert.equal(media.objects.size, 0);
  const member = { CONTROL_PLANE: controlPlane(), LEARN_MEDIA: media, RUNS: live };
  const response = await feedbackFetch(post({ app: null, kind: 'idea', text: 'A dark theme', context: { path: '/apps' } }), member);
  assert.equal(response.status, 201);
  const [[key, saved]] = media.reports();
  assert.match(key, /^learn-feedback\//);
  assert.equal(saved.app, null);
  assert.equal(saved.email, 'a@b.c');
});

test('reports go to the bucket LEARN_MEDIA names (production: rabbit-hole-prod-learn-media); RUNS is only the fallback where nothing is bound', async () => {
  const bound = bucket(), runs = bucket();
  await feedbackFetch(post({ kind: 'bug', text: 'one' }), { CONTROL_PLANE: controlPlane(), LEARN_MEDIA: bound, RUNS: runs });
  assert.equal(bound.reports().length, 1);
  assert.equal(runs.objects.size, 0);
  await feedbackFetch(post({ kind: 'bug', text: 'two' }), { CONTROL_PLANE: controlPlane(), RUNS: runs });
  assert.equal(runs.reports().length, 1);
});

test('an OAuth-only account stores its internal principal, and its real address is resolved server-side, never from the request', async () => {
  const principal = `user@${'a'.repeat(32)}.rabbithole.invalid`;
  const media = bucket();
  const me = { org: 'abc-rabbithole-invalid', email: principal, user_id: 'u-google' };
  const env = { CONTROL_PLANE: controlPlane({ me }), LEARN_MEDIA: media, DB: identityRows([{ provider: 'google', provider_email: 'Yudhist@Example.com' }]),
    LEARN_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ handle: 'yuvish_demo' }) }) }) } };
  const sent = await feedbackFetch(post({ kind: 'bug', text: 'It broke', contact: { email: 'attacker@evil.test', verified: true }, email: 'attacker@evil.test', userId: 'someone-else' }), env);
  assert.equal(sent.status, 201);
  const [[, saved]] = media.reports();
  assert.equal(saved.email, principal, 'the stored principal is unchanged');
  assert.equal(saved.userId, 'u-google');
  assert.deepEqual(saved.contact, { email: 'yudhist@example.com', verified: true, provider: 'google' });
  assert.equal(saved.handle, 'yuvish_demo');
  assert.equal(JSON.stringify(saved).includes('attacker'), false, 'nothing identity-like is taken from the request body');
});

test('sender address: email sign-in is itself proven; Google beats GitHub; GitHub is kept but not verified; none, .invalid and a missing database give none', async () => {
  assert.deepEqual(await senderContact({}, 'u1', 'a@b.c'), { email: 'a@b.c', verified: true, provider: 'email' });
  const principal = 'user@abc.rabbithole.invalid';
  const rows = list => ({ DB: identityRows(list) });
  assert.deepEqual(await senderContact(rows([{ provider: 'github', provider_email: 'gh@example.com' }, { provider: 'google', provider_email: 'g@example.com' }]), 'u1', principal), { email: 'g@example.com', verified: true, provider: 'google' });
  assert.deepEqual(await senderContact(rows([{ provider: 'github', provider_email: 'gh@example.com' }]), 'u1', principal), { email: 'gh@example.com', verified: false, provider: 'github' });
  assert.equal(await senderContact(rows([{ provider: 'google', provider_email: 'user@x.rabbithole.invalid' }, { provider: 'github', provider_email: 'two words@x.com' }]), 'u1', principal), null);
  assert.equal(await senderContact(rows([]), 'u1', principal), null);
  assert.equal(await senderContact({}, 'u1', principal), null, 'no database');
  assert.equal(await senderContact(rows([{ provider: 'google', provider_email: 'g@example.com' }]), null, principal), null, 'no user id');
  assert.equal(await senderContact({ DB: { prepare: () => { throw new Error('down'); } } }, 'u1', principal), null, 'a database error is no address');
});

test('the owner is mailed after storage, as the sender, with only the report key', async () => {
  const media = bucket();
  const cp = controlPlane();
  const response = await feedbackFetch(post({ kind: 'bug', text: 'Mail me' }, { cookie: 'small_session=abc' }), { CONTROL_PLANE: cp, LEARN_MEDIA: media });
  assert.equal(response.status, 201);
  const [[key]] = media.reports();
  assert.deepEqual(cp.calls, [{ cookie: 'small_session=abc', body: { key } }]);
});

test('a mail failure of any kind never loses or fails the report', async () => {
  for (const notify of [() => Response.json({ sent: false }, { status: 502 }), () => { throw new Error('network'); }]) {
    const media = bucket();
    const response = await feedbackFetch(post({ kind: 'idea', text: 'Still kept' }), { CONTROL_PLANE: controlPlane({ notify }), LEARN_MEDIA: media });
    assert.equal(response.status, 201);
    assert.equal(media.reports().length, 1);
    assert.equal(media.reports()[0][1].text, 'Still kept');
  }
});

test('a sender whose limit cannot be checked is still stored, but not mailed', async () => {
  const media = bucket({ failLimit: true });
  const cp = controlPlane();
  const response = await feedbackFetch(post({ kind: 'bug', text: 'Bucket hiccup' }), { CONTROL_PLANE: cp, LEARN_MEDIA: media });
  assert.equal(response.status, 201);
  assert.equal(media.reports().length, 1);
  assert.equal(cp.calls.length, 0);
});

test(`one account may send ${HOURLY} reports an hour: the next is a friendly 429, stores nothing and mails nothing`, async () => {
  const media = bucket();
  const cp = controlPlane();
  const env = { CONTROL_PLANE: cp, LEARN_MEDIA: media };
  for (let n = 0; n < HOURLY; n += 1) assert.equal((await feedbackFetch(post({ kind: 'bug', text: `report ${n}` }), env)).status, 201);
  const refused = await feedbackFetch(post({ kind: 'bug', text: 'one too many' }), env);
  assert.equal(refused.status, 429);
  assert.equal((await refused.json()).error, LIMITED);
  assert.equal(media.reports().length, HOURLY);
  assert.equal(cp.calls.length, HOURLY);
  const other = { CONTROL_PLANE: controlPlane({ me: { org: 'o', email: 'x@y.z', user_id: 'u2' } }), LEARN_MEDIA: media };
  assert.equal((await feedbackFetch(post({ kind: 'bug', text: 'someone else' }), other)).status, 201, 'another account is unaffected');
});

test(`the limits are ${HOURLY} per UTC hour and ${DAILY} per UTC day, per sender, and a burst of parallel requests cannot exceed them`, async () => {
  const media = bucket();
  const results = [];
  for (let hour = 0; hour < 5; hour += 1) for (let n = 0; n < HOURLY + 1; n += 1) results.push(await withinLimits(media, 'u1', `2026-11-03T${String(hour).padStart(2, '0')}:30:00.000Z`));
  assert.equal(results.slice(0, HOURLY + 1).join(), 'ok,ok,ok,ok,ok,limited');
  assert.equal(results.filter(result => result === 'ok').length, DAILY, 'five hours of five is capped by the day');
  assert.equal(await withinLimits(media, 'u1', '2026-11-04T00:00:00.000Z'), 'ok', 'a new day starts again');
  const shared = bucket();
  const parallel = await Promise.all(Array.from({ length: 12 }, () => withinLimits(shared, 'u9', '2026-11-03T09:00:00.000Z')));
  assert.equal(parallel.filter(result => result === 'ok').length, HOURLY);
  assert.equal([...shared.objects.keys()].some(key => key.includes('u9')), false, 'the sender id is hashed in the key');
});
