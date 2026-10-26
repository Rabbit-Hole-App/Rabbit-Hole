// IMG-01 controlled OWNER-ONLY path (owner 2026-10-25), modelled on Motion's motion-acceptance-path.test.js. While IMAGE_GENERATE_ENABLED is
// "false", only a caller whose VERIFIED identity is listed in IMAGE_ACCEPTANCE_EMAILS may use image generation. Here the identity is the REAL
// one (repositoryIdentity -> the control plane's /api/me, by session cookie); only the canvas lookup and the file reader are injected. Every
// refusal is checked to leave nothing behind: no thread, no job object, no ledger row, no provider request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { imageJobsRoute } from '../src/image-jobs.js';
import { imageAllowed, imageOperatorAllowed, imageOperatorEmails } from '../src/image-settings.js';
import { decideChat } from '../src/chat-capability-route.js';
import { APP, FOX, stack } from './image-int-stack.mjs';

const PRINCIPAL = 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid', GMAIL = 'yudhisteer.chin@gmail.com';
const LIST = `${PRINCIPAL} ${GMAIL}`;
const LOOKALIKES = ['yudhisteer.chin01@gmail.com', 'user@ffffffffffffffffffffffffffffffff.rabbithole.invalid', `${PRINCIPAL}.evil.test`, `x${PRINCIPAL}`, `${GMAIL}.evil.test`,
  'yudhisteer.chin+x@gmail.com', 'y.udhisteer.chin@gmail.com', 'yudhisteer.chin@googlemail.com', 'chin@gmail.com', 'owner@example.test', 'user@rabbithole.invalid'];
const ORG = 'org-1';
// The control plane's /api/me, by session cookie: sid=<email>. No cookie is no session.
const session = req => { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.get('cookie') || ''); return m ? decodeURIComponent(m[1]) : null; };
const controlPlane = { fetch: async req => {
  const email = session(req);
  if (new URL(req.url).pathname !== '/api/me') return new Response('{}', { status: 404 });
  return email ? Response.json({ email, org: ORG, user_id: `u-${email.length}` }) : Response.json({ error: 'Sign in' }, { status: 401 });
} };
const owned = (e, patch = {}) => ({ ...e, CONTROL_PLANE: controlPlane, ...patch });

function world(t, patch = {}) {
  const h = stack(t, { IMAGE_GENERATE_ENABLED: 'false', IMAGE_ACCEPTANCE_EMAILS: LIST, ...patch });
  h.env.CONTROL_PLANE = controlPlane;
  const board = async req => ({ owner: { org: ORG, email: session(req) }, row: { id: 'board-1' } });
  const routeDeps = { board, source: h.routeDeps.source };
  const proposeDeps = { owner: async req => ({ org: ORG, email: session(req) }), authorize: h.proposalDeps.authorize };
  const as = (email, extra = {}) => ({ headers: { cookie: email ? `sid=${encodeURIComponent(email)}` : '', ...extra } });
  const post = (path, email, body, extra = {}) => new Request(`https://app${path}`, { method: 'POST', body: JSON.stringify(body), ...as(email, extra) });
  const api = {
    capability: async email => imageJobsRoute('/api/learn/image-jobs', new Request('https://app/api/learn/image-jobs', as(email)), h.env, routeDeps),
    propose: async (email, extra = {}, body = {}, hdr = {}) => chatProposalFetch(post('/api/learn/chat/image-proposals', email, { app: APP, thread_id: 'canvaschat-11111111-2222-3333-4444-555555555555', prompt: FOX, settings: h.model, ...body }, hdr), h.env, { ...proposeDeps, ...extra }),
    create: async (email, proposal, id, extra = {}, hdr = {}) => imageJobsRoute('/api/learn/image-jobs', post('/api/learn/image-jobs', email, { generationId: id, proposal, app: APP, ...extra }, hdr), h.env, routeDeps),
    read: async (email, id, suffix = '') => imageJobsRoute(`/api/learn/image-jobs/${id}${suffix}`, new Request(`https://app/api/learn/image-jobs/${id}${suffix}`, as(email)), h.env, routeDeps),
  };
  const counts = () => ({ threads: h.sqlite.prepare('SELECT count(*) n FROM threads').get().n, messages: h.sqlite.prepare('SELECT count(*) n FROM messages').get().n, ops: h.sqlite.prepare('SELECT count(*) n FROM usage_operations').get().n, sources: h.sqlite.prepare('SELECT count(*) n FROM file_sources').get().n });
  return { h, api, counts, as };
}
const nothingBehind = (w, before = { threads: 0, messages: 0, ops: 0, sources: 0 }) => { assert.deepEqual(w.counts(), before); assert.equal(w.h.calls.length, 0, 'no provider request'); };

test('the list: whole lower-cased addresses; entries without an @ are dropped; empty or unset is nobody; a domain, wildcard or prefix matches nothing', () => {
  assert.deepEqual(imageOperatorEmails({ IMAGE_ACCEPTANCE_EMAILS: ` ${PRINCIPAL.toUpperCase()},${GMAIL};junk ` }), [PRINCIPAL, GMAIL]);
  assert.deepEqual(imageOperatorEmails({}), []); assert.deepEqual(imageOperatorEmails({ IMAGE_ACCEPTANCE_EMAILS: '' }), []);
  for (const env of [{}, { IMAGE_ACCEPTANCE_EMAILS: '' }, { IMAGE_ACCEPTANCE_EMAILS: 'gmail.com, *@gmail.com, yudhisteer@' }]) for (const email of [PRINCIPAL, GMAIL, null, undefined, '']) assert.equal(imageOperatorAllowed(env, email), false);
  const env = { IMAGE_ACCEPTANCE_EMAILS: LIST };
  assert.equal(imageOperatorAllowed(env, PRINCIPAL), true); assert.equal(imageOperatorAllowed(env, GMAIL), true); assert.equal(imageOperatorAllowed(env, `  ${GMAIL.toUpperCase()} `), true);
  for (const email of [...LOOKALIKES, null, undefined, '', 42, ['yudhisteer.chin@gmail.com'], {}]) assert.equal(imageOperatorAllowed(env, email), false, String(email));
  assert.equal(imageAllowed({ IMAGE_GENERATE_ENABLED: 'true' }, 'anyone@example.test'), true, 'the public flag admits everyone');
  for (const v of ['false', '', 'TRUE', 'True', '1', undefined]) assert.equal(imageAllowed({ IMAGE_GENERATE_ENABLED: v }, 'anyone@example.test'), false, String(v));
});

for (const owner of [PRINCIPAL, GMAIL]) {
  test(`the listed owner (${owner.includes('rabbithole') ? 'application principal' : 'Gmail address'}) uses the whole path while the public flag is "false"`, async t => {
    const w = world(t);
    const cap = await (await w.api.capability(owner)).json();
    assert.equal(cap.available, true); assert.equal(cap.operatorOnly, true); assert.ok(cap.models.length === 4);
    const made = await w.api.propose(owner);
    assert.equal(made.status, 201, JSON.stringify(await made.clone().json()));
    const { proposal } = await made.json();
    const created = await w.api.create(owner, proposal, `img-${proposal.proposal_id}`);
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    await w.h.object(`image-job:${ORG}|${owner}|img-${proposal.proposal_id}`).alarm();
    const status = await (await w.api.read(owner, `img-${proposal.proposal_id}`)).json();
    assert.equal(status.job.stage, 'ready'); assert.equal(w.h.calls.length, 1);
    assert.equal((await w.api.read(owner, `img-${proposal.proposal_id}`, '/inspect')).status, 200, 'an operator may inspect (dollars)');
    // Duplicate submission: the same generation id is the same job, and the provider was called once.
    const again = await w.api.create(owner, proposal, `img-${proposal.proposal_id}`);
    assert.equal(again.status, 200); assert.equal(w.h.calls.length, 1);
  });
}

test('a signed-in person who is not listed: capability off, no plan, no job, nothing behind, for every look-alike including yudhisteer.chin01@gmail.com', async t => {
  const w = world(t);
  for (const email of LOOKALIKES) {
    const cap = await (await w.api.capability(email)).json();
    assert.equal(cap.available, false, email); assert.equal(cap.operatorOnly, undefined, email);
    const plan = await w.api.propose(email);
    assert.equal(plan.status, 503, email); assert.equal((await plan.json()).code, 'image_generation_disabled');
    // A real, correctly signed plan made by the owner cannot be turned into a job by anyone else either.
    const create = await w.api.create(email, { command: 'generate-image' }, 'img-direct-call-000001');
    assert.equal(create.status, 503, email); assert.equal((await create.json()).code, 'image_generation_disabled');
    assert.equal((await w.api.read(email, 'img-direct-call-000001')).status, 404);
    assert.equal((await w.api.read(email, 'img-direct-call-000001', '/inspect')).status, 404);
    assert.equal((await w.api.read(email, 'img-direct-call-000001', '/retry-save')).status, 405);
  }
  nothingBehind(w);
});

test('no session at all: refused by the identity path, nothing behind', async t => {
  const w = world(t);
  assert.equal((await w.api.capability(null)).status, 401);
  assert.equal((await w.api.propose(null)).status, 401);
  assert.equal((await w.api.create(null, {}, 'img-anonymous-000001')).status, 401);
  assert.equal((await w.api.read(null, 'img-anonymous-000001')).status, 401);
  nothingBehind(w);
});

test('forged identity: headers, body fields and query strings never name the caller', async t => {
  const w = world(t);
  const forged = { 'x-small-payer': JSON.stringify({ email: PRINCIPAL, userId: 'u-1' }), 'x-small-workspace': ORG, 'x-forwarded-email': GMAIL, 'x-user-email': PRINCIPAL, 'cf-access-authenticated-user-email': GMAIL, 'x-auth-request-email': GMAIL };
  const stranger = 'yudhisteer.chin01@gmail.com';
  const plan = await w.api.propose(stranger, {}, { email: PRINCIPAL, user: { email: GMAIL }, identity: { email: PRINCIPAL } }, forged);
  assert.equal(plan.status, 503);
  const create = await w.api.create(stranger, { command: 'generate-image' }, 'img-forged-identity-001', { email: PRINCIPAL, requester: { email: GMAIL }, identity: { org: ORG, email: PRINCIPAL } }, forged);
  assert.equal(create.status, 503);
  const cap = await imageJobsRoute('/api/learn/image-jobs', new Request(`https://app/api/learn/image-jobs?email=${encodeURIComponent(PRINCIPAL)}`, { headers: { cookie: `sid=${stranger}`, ...forged } }), w.h.env, { board: async () => null });
  assert.equal((await cap.json()).available, false);
  nothingBehind(w);
});

test('a stranger cannot read or inspect the owner\'s job; another operator cannot either; only the requester asks', async t => {
  const w = world(t);
  const { proposal } = await (await w.api.propose(PRINCIPAL)).json();
  const id = `img-${proposal.proposal_id}`;
  assert.equal((await w.api.create(PRINCIPAL, proposal, id)).status, 201);
  for (const email of ['yudhisteer.chin01@gmail.com', GMAIL]) {
    assert.equal((await w.api.read(email, id)).status, 404, email);
    assert.equal((await w.api.read(email, id, '/inspect')).status, 404, email);
  }
  assert.equal((await w.api.read(PRINCIPAL, id)).status, 200);
});

test('a listed operator is not a way around the plan: the other operator cannot start the owner\'s signed plan', async t => {
  const w = world(t);
  const { proposal } = await (await w.api.propose(PRINCIPAL)).json();
  const out = await w.api.create(GMAIL, proposal, `img-${proposal.proposal_id}`);
  assert.equal(out.status, 409); assert.equal((await out.json()).code, 'proposal_refused'); // signed for another person
  assert.equal(w.h.calls.length, 0);
});

test('public flag "true": everyone is offered it, but dollars (inspect) and failure injection stay operator-only', async t => {
  const w = world(t, { IMAGE_GENERATE_ENABLED: 'true' });
  const learner = 'learner@example.test';
  const cap = await (await w.api.capability(learner)).json();
  assert.equal(cap.available, true); assert.equal(cap.operatorOnly, undefined);
  const { proposal } = await (await w.api.propose(learner)).json();
  const id = `img-${proposal.proposal_id}`;
  const bad = await w.api.create(learner, proposal, id, { fault: 'provider_400' });
  assert.equal(bad.status, 400); assert.equal((await bad.json()).code, 'fault_not_allowed');
  assert.equal(w.h.calls.length, 0);
  assert.equal((await w.api.create(learner, proposal, id)).status, 201);
  assert.equal((await w.api.read(learner, id)).status, 200);
  assert.equal((await w.api.read(learner, id, '/inspect')).status, 404, 'dollars are for operators');
  const status = JSON.stringify((await (await w.api.read(learner, id)).json()));
  assert.doesNotMatch(status, /estimateUsd|reserveUsd|costUsd|measuredUsd|estimatedUpperBoundUsd|usd/i, 'a learner sees credits only');
});

test('flag "false" and nobody listed: refused before any identity is read (the old behaviour, unchanged)', async t => {
  const w = world(t, { IMAGE_ACCEPTANCE_EMAILS: '' });
  w.h.env.CONTROL_PLANE = { fetch: async () => { throw new Error('identity must not be read'); } };
  assert.equal((await w.api.propose(PRINCIPAL)).status, 503);
  assert.equal((await w.api.create(PRINCIPAL, {}, 'img-nobody-listed-0001')).status, 503);
  nothingBehind(w);
});

test('switching the list off after a job was queued releases it without contacting the provider', async t => {
  const w = world(t);
  const { proposal } = await (await w.api.propose(PRINCIPAL)).json();
  const id = `img-${proposal.proposal_id}`;
  assert.equal((await w.api.create(PRINCIPAL, proposal, id)).status, 201);
  w.h.env.IMAGE_ACCEPTANCE_EMAILS = '';
  await w.h.object(`image-job:${ORG}|${PRINCIPAL}|${id}`).alarm();
  const job = (await (await w.api.read(PRINCIPAL, id)).json()).job;
  assert.equal(job.stage, 'cancelled'); assert.equal(w.h.calls.length, 0);
});

test('the chat router offers /generate-image to the listed owner only (the server decides, not the build)', async t => {
  const fields = { text: '/generate-image a fox', mode: 'ask' };
  const decide = (email, env = {}) => decideChat({ IMAGE_ACCEPTANCE_EMAILS: LIST, IMAGE_GENERATE_ENABLED: 'false', ROUTER_KEY: 'x'.repeat(40), ...env }, { email, app: 'canvas-1', requestId: 'r-1', fields, capability: 'generate-image', enabled: ['generate-image'] }, { ask: () => { throw new Error('no model call for an explicit command'); } });
  for (const email of [PRINCIPAL, GMAIL]) assert.equal((await decide(email)).route, 'capability:generate-image', email);
  for (const email of [...LOOKALIKES, null]) { const out = await decide(email); assert.equal(out.route, 'unsupported', String(email)); assert.match(out.message, /not available/i); }
  assert.equal((await decide('learner@example.test', { IMAGE_GENERATE_ENABLED: 'true' })).route, 'capability:generate-image', 'public');
});

// Deterministic failure injection (operators only): the real adapter and the real job, a transport that answers instead of the provider.
const FAULTS = [
  ['provider_400', 'failed', 'provider_rejected', null], ['provider_429', 'failed', 'provider_rejected', 0], ['network', 'unknown', 'outcome_unknown', null], ['invalid_output', 'failed', 'invalid_output', null],
];
for (const [fault, stage, reason, cost] of FAULTS) {
  test(`failure injection ${fault}: ${stage} / ${reason}, no provider request, settled as the real path settles it`, async t => {
    const w = world(t);
    const { proposal } = await (await w.api.propose(PRINCIPAL)).json();
    const id = `img-${proposal.proposal_id}`;
    assert.equal((await w.api.create(PRINCIPAL, proposal, id, { fault })).status, 201);
    await w.h.object(`image-job:${ORG}|${PRINCIPAL}|${id}`).alarm();
    const job = (await (await w.api.read(PRINCIPAL, id)).json()).job;
    assert.equal(job.stage, stage); assert.equal(job.reason, reason);
    assert.equal(w.h.calls.length, 0, 'the fixture provider was never reached');
    const inspect = (await (await w.api.read(PRINCIPAL, id, '/inspect')).json()).job;
    assert.equal(inspect.settlement.done, true); assert.equal(inspect.settlement.costKnown, cost !== null, 'the cost is known (0) or unknown (null); the inspect view carries no dollar amount (credits-finish)');
    assert.equal(w.h.sqlite.prepare('SELECT count(*) n FROM file_sources').get().n, 0, 'no image saved');
    // A second press is the same job; the plan is spent.
    assert.equal((await w.api.create(PRINCIPAL, proposal, id)).status, 200);
    assert.equal(w.h.calls.length, 0);
  });
}
test('an unknown fault name is refused even for the owner', async t => {
  const w = world(t);
  const { proposal } = await (await w.api.propose(PRINCIPAL)).json();
  const out = await w.api.create(PRINCIPAL, proposal, `img-${proposal.proposal_id}`, { fault: 'free_images' });
  assert.equal(out.status, 400); nothingBehind(w, { threads: 1, messages: 2, ops: 0, sources: 0 });
});
