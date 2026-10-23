// Batch G release gap 1: a generation proposal's persistence, end to end through the real dev worker (packages/web/dev-worker.js)
// on one local LEARN_DB (node:sqlite built from repository-schema.sql), as learn-allowance.test.js runs it. Every request below is
// routed by the worker's own fetch: the chat turn that proposes (POST /api/learn/ask), the card's settings
// (PUT /api/learn/chat/messages/:id/proposal), the thread restore (GET /api/ask/threads/:id), the board save and reload
// (/api/learn/boards/:name/main) and Generate (POST /api/learn/video, the real LearnVideos object and its spend ledger).
// Stubbed: the model (api.anthropic.com answers a scripted propose_generation call) and the Motion orchestrator
// (orchestrator.test: /health, POST /jobs, the job and its final.mp4). Nothing is paid; nothing else is faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { devWorker } from './worker-import.js';
import { liveDb, liveRuns, memoryBucket } from './live-storage-spy.js';
import { LearnVideos } from '../src/learn-video.js';
import { approvedProposal, signProposal, verifyProposal } from '../src/generation-proposal.js';
import { READY } from './motion-ready-env.js';
import { madeFrom, proposalActive, proposalBlock } from '../../web/src/generation-proposal-chat.js';

const worker = (await devWorker()).default;
const CANVAS = 'canvas-0a1b2c3d', OTHER = 'canvas-1b2c3d4e', OWNER = 'owner@test';
const TOKEN = 'm'.repeat(48);
const WATER = 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.';
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [], blocks: [] };
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const sse = text => text.trim().split('\n\n').map(block => ({ event: block.match(/^event: (.*)$/m)[1], data: JSON.parse(block.match(/^data: (.*)$/m)[1]) }));

// A Durable Object's state over a storage map that outlives the instance, so a new LearnVideos over the same map is the object
// after an eviction or a deploy.
function durable(id, data) {
  let lock = Promise.resolve();
  return { id, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}

function stack(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  // hooks.beforeRun(sql): awaited before a LEARN_DB statement runs, to interleave another request deterministically.
  const hooks = {};
  // The proposal's canvas, another canvas the learner owns, and the same canvas name in another workspace they belong to.
  for (const [org, name] of [['team', CANVAS], ['team', OTHER], ['lab', CANVAS]]) sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES(?,?,?,'Weather')").run(org, name, OWNER);
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => { await hooks.beforeRun?.(text); return { meta: stmt.run(...args) }; }, now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  // One storage map per object name; actors are the live instances, dropped by restart().
  const stored = new Map(), actors = new Map();
  const actor = name => { if (!actors.has(name)) { if (!stored.has(name)) stored.set(name, new Map()); actors.set(name, new LearnVideos(durable(name, stored.get(name)), env)); } return actors.get(name); };
  // The dev worker's DB (rabbit-hole-dev) is read for one thing here: a course canvas's pinned repository (learn-video.js
  // canvasRepository), which this canvas has none of. Any other DB statement fails the test.
  const live = liveDb(), DB = { calls: live.calls, prepare: sql => (/^SELECT source_version FROM learn_courses /.test(sql) ? { bind: () => ({ first: async () => null }) } : live.prepare(sql)), batch: live.batch };
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB, RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50',
    MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN, MOTION_ESTIMATE_USD: '1.00', MOTION_JOB_RESERVATION_USD: '2', ...READY,
    LEARN_VIDEOS: { idFromName: name => name, get: name => actor(name) },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: req.headers.get('x-small-workspace') || 'team', email: OWNER, orgName: 'Team', user_id: 'u-owner' }) } };
  t.after(() => assert.deepEqual([env.DB.calls, env.RUNS.calls], [[], []], 'touched the control-plane database or the runs bucket'));

  // The stubs: a scripted model, and an orchestrator that accepts each POST /jobs as a new job that is ready at once.
  const model = { replies: [], calls: [] }, orchestrator = { jobs: [], health: 0 };
  const boot = hex(16);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.anthropic.com') {
      model.calls.push(JSON.parse(init.body));
      let reply = model.replies.shift() ?? 'Plain answer.';
      if (typeof reply === 'function') reply = await reply(); // a reply held until the test releases it
      return Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 }, ...(typeof reply === 'string' ? { content: [{ type: 'text', text: reply }], stop_reason: 'end_turn' } : reply) });
    }
    if (u.hostname !== 'orchestrator.test') throw new Error(`unexpected network call: ${u.href}`);
    if (u.pathname === '/health') { orchestrator.health++; return Response.json({ boot }); }
    if (u.pathname === '/jobs' && init.method === 'POST') { const id = hex(16); orchestrator.jobs.push({ id, body: JSON.parse(init.body) }); return Response.json({ job_id: id }, { status: 202 }); }
    const job = orchestrator.jobs.find(j => u.pathname.startsWith(`/jobs/${j.id}`));
    if (!job) return new Response('', { status: 404 });
    if (u.pathname.endsWith('/final.mp4')) return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { headers: { 'Content-Type': 'video/mp4' } });
    return Response.json({ status: 'ready', title: job.body.approved_proposal?.title, render_id: 'a'.repeat(32), motion: { duration_seconds: job.body.approved_proposal?.duration_seconds }, spend: { cost_usd: 0.8, bound_usd: 0.8, calls: 3, in_flight: 0 }, renders: 1, render_states: ['ready'] });
  };

  const send = async (method, path, body, headers = {}) => worker.fetch(new Request(`https://dev.example${path}`, { method, headers: { cookie: 'small_session=s', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  const read = async (method, path, body, headers) => { const res = await send(method, path, body, headers); return { status: res.status, body: await res.json() }; };
  // The Motion reservations the ledger holds (one per admitted attempt) and the jobs the orchestrator was asked to start.
  const reservations = () => sqlite.prepare("SELECT reserved_micros, cost_state, status FROM usage_attempts WHERE attempt_id LIKE 'motion-%' ORDER BY rowid").all().map(r => ({ ...r }));
  const videos = () => [...actors.values()];
  const restart = () => actors.clear();
  return { sqlite, env, model, orchestrator, send, read, reservations, videos, restart, hooks };
}

// The chat turn that proposes: a /motion line, the model calls propose_generation, the answer keeps the signed card.
async function propose(s, settings = { duration_seconds: 10, audio: false }) {
  s.model.replies.push({ content: [{ type: 'tool_use', id: 'tu1', name: 'propose_generation', input: { command: 'motion', title: 'Water cycle: evaporation to rain', description: WATER, settings } }], stop_reason: 'tool_use' },
    'Here is a 10-second video proposal.\n<answer_meta>{}</answer_meta>');
  const res = await s.send('POST', '/api/learn/ask', { scope: { app: CANVAS }, message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: { concept: 'Weather' } } });
  assert.equal(res.status, 200, 'the chat turn streams');
  const events = sse(await res.text());
  const meta = events.find(e => e.event === 'answer_meta').data, done = events.find(e => e.event === 'done').data;
  assert.equal(meta.proposal.version, 1);
  return { threadId: done.threadId, messageId: meta.messageId, proposal: meta.proposal };
}
// The thread as a reload restores it (the Chat's restore call), and its proposal message.
async function restore(s, threadId, messageId) {
  const { status, body } = await s.read('GET', `/api/ask/threads/${threadId}`);
  assert.equal(status, 200);
  const message = body.messages.find(m => String(m.messageId) === String(messageId));
  assert.ok(message?.meta?.proposal, 'the restored answer carries its proposal');
  return { messages: body.messages, proposal: message.meta.proposal };
}
// Generate as the card does (LearningBlocks generate): the proposal's card, its request id made once for the press.
const press = (p, request_id = crypto.randomUUID()) => ({ ...proposalBlock(p).operation, request_id });
const generate = (s, operation, extra = {}, { at = CANVAS, headers } = {}) => s.read('POST', `/api/learn/video?app=${at}`, { operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed: true, ...extra }, headers);
async function untilReady(s, placementId) {
  for (let i = 0; i < 20; i++) {
    for (const v of s.videos()) await v.alarm();
    const shown = (await s.read('GET', `/api/learn/video?app=${CANVAS}`)).body.videos.find(v => v.id === placementId);
    if (shown?.status === 'ready') return shown;
  }
  assert.fail('the video never became ready');
}

test('case a: a proposal saved on its chat message, revised by PUT, comes back from the real thread restore as the latest revision, valid and generatable', async t => {
  const s = stack(t);
  const { threadId, messageId, proposal: first } = await propose(s);
  assert.equal(await verifyProposal(s.env, first, OWNER), null, 'signed for the asker');
  // The card's settings change: the next version, saved over the message's meta.
  const revised = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 20, audio: false }, expected_version: 1 });
  assert.equal(revised.status, 200);
  assert.deepEqual([revised.body.proposal.proposal_id, revised.body.proposal.version, revised.body.proposal.settings], [first.proposal_id, 2, { duration_seconds: 20, aspect_ratio: '16:9', audio: false }]);
  const again = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 25, audio: false }, expected_version: 2 });
  assert.equal(again.body.proposal.version, 3, 'each change is the next version of the stored one');
  // Reload: nothing of the browser survives; the thread is read back through the worker.
  s.restart();
  const { messages, proposal } = await restore(s, threadId, messageId);
  assert.deepEqual(proposal, again.body.proposal, 'the latest revision, exactly as the PUT returned it');
  assert.equal(await verifyProposal(s.env, proposal, OWNER), null, 'its signature is valid for the learner');
  assert.equal(proposalActive(proposal, messages), true, 'the Chat draws it live, with Generate');
  assert.deepEqual(s.sqlite.prepare("SELECT count(*) AS n FROM chat_message_meta WHERE json_extract(meta_json, '$.proposal.proposal_id') = ?").get(first.proposal_id).n, 1, 'one stored proposal, overwritten in place');
  // Actionable: Generate with the restored proposal starts one job, bound to the revised settings.
  const started = await generate(s, press(proposal));
  assert.equal(started.status, 202);
  assert.equal(s.orchestrator.jobs.length, 1);
  assert.deepEqual(s.orchestrator.jobs[0].body.approved_proposal, { title: 'Water cycle: evaporation to rain', duration_seconds: 25, aspect_ratio: '16:9', description: WATER, renderer_config: 'r-test', allowed_complexity: ['simple', 'standard', 'heavy'] });
  assert.deepEqual(s.reservations(), [{ reserved_micros: 2_000_000, cost_state: 'reserved', status: 'running' }], 'one hold, admitted before the job');
  assert.equal((await untilReady(s, started.body.placementId)).status, 'ready');
  assert.deepEqual(s.model.calls.length, 2, 'the proposal and its reply: the revisions and Generate made no model call');
});

test('duration and aspect ratio: proposed, revised on the card, restored after a reload, and handed to the orchestrator exactly as saved', async t => {
  const s = stack(t);
  const { threadId, messageId, proposal: first } = await propose(s, { duration_seconds: 45, aspect_ratio: '9:16', audio: false });
  assert.deepEqual(first.settings, { duration_seconds: 45, aspect_ratio: '9:16', audio: false });
  // The card changes only the ratio: the duration it already holds is kept.
  const revised = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { ...first.settings, aspect_ratio: '4:3' }, expected_version: 1 });
  assert.equal(revised.status, 200);
  // A value outside the lists is refused on the server, with the reason, and nothing is saved.
  const bad = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 65, aspect_ratio: '4:3', audio: false }, expected_version: 2 });
  assert.deepEqual([bad.status, /from 5 to 60 in steps of 5/.test(bad.body.error)], [400, true]);
  const badRatio = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 45, aspect_ratio: '2:1', audio: false }, expected_version: 2 });
  assert.deepEqual([badRatio.status, /aspect_ratio/.test(badRatio.body.error)], [400, true]);
  s.restart();
  const { proposal } = await restore(s, threadId, messageId);
  assert.deepEqual([proposal.version, proposal.settings], [2, { duration_seconds: 45, aspect_ratio: '4:3', audio: false }], 'the reload shows what was saved');
  const started = await generate(s, press(proposal));
  assert.equal(started.status, 202);
  assert.deepEqual(s.orchestrator.jobs[0].body.approved_proposal, { title: 'Water cycle: evaporation to rain', duration_seconds: 45, aspect_ratio: '4:3', description: WATER, renderer_config: 'r-test', allowed_complexity: ['simple', 'standard', 'heavy'] }, 'the orchestrator is told the saved selection, the renderer configuration and the covered complexity');
});

test('an old proposal without an aspect ratio still generates, as 16:9', async t => {
  const s = stack(t);
  const { proposal: v1 } = await propose(s);
  const old = await signProposal(s.env, { ...v1, settings: { duration_seconds: 10, audio: false }, input: v1.input }, OWNER, { id: v1.proposal_id, version: 1 });
  assert.equal(await verifyProposal(s.env, old, OWNER), null, 'a proposal signed before the setting existed is still valid');
  assert.equal(approvedProposal(old).aspect_ratio, '16:9');
});

test('case b: a generated proposal and its canvas card restored after a reload: every further Generate is refused or reused server-side, no second job or reservation', async t => {
  const s = stack(t);
  const { threadId, messageId, proposal } = await propose(s);
  // Generate, as the card does, and the card saved on the board with its job (the state a reload restores).
  const operation = press(proposal);
  const started = await generate(s, operation);
  assert.equal(started.status, 202);
  await untilReady(s, started.body.placementId);
  const card = { id: 'b-video', ...proposalBlock(proposal), operation, status: 'ready', placementId: started.body.placementId };
  const saved = await s.read('PUT', `/api/learn/boards/${CANVAS}/main`, { state: { ...BOARD, blocks: [card] }, version: 0 });
  assert.equal(saved.status, 200);
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations()], [1, [{ reserved_micros: 2_000_000, cost_state: 'settled', status: 'settled' }]]);

  // Reload: a new worker request flow and new LearnVideos instances over the same storage and database.
  s.restart();
  const board = await s.read('GET', `/api/learn/boards/${CANVAS}/main`);
  assert.equal(board.status, 200);
  const restoredCard = board.body.state.blocks.find(madeFrom(proposal.proposal_id));
  assert.ok(restoredCard, 'the canvas still has the card this proposal made');
  const { messages, proposal: restored } = await restore(s, threadId, messageId);
  const made = id => board.body.state.blocks.some(madeFrom(id));
  assert.equal(proposalActive(restored, messages, made), false, 'the Chat shows it as Added to the canvas, not live');

  // 1. The restored card's own press again (a resend or a remount): the same job, nothing new started.
  const resend = await generate(s, restoredCard.operation);
  assert.deepEqual([resend.status, resend.body.placementId], [202, started.body.placementId]);
  // 2. Retry on the restored card: its job is ready, not failed, so nothing starts.
  const retry = await generate(s, restoredCard.operation, { retry: true });
  assert.deepEqual([retry.status, retry.body.placementId], [202, started.body.placementId]);
  // 3. A new press of the restored proposal (a second Generate): refused before any hold.
  const second = await generate(s, press(restored));
  assert.deepEqual([second.status, second.body.code], [409, 'proposal_used']);
  // 4. A revision after it was generated is refused (MOT-22: the proposal is consumed), so there is no newer version to start.
  const revised = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 20, audio: false }, expected_version: 1 });
  assert.deepEqual([revised.status, revised.body.code], [409, 'proposal_used']);
  assert.deepEqual((await restore(s, threadId, messageId)).proposal, { ...restored }, 'the stored revision is unchanged');
  for (const v of s.videos()) await v.alarm();
  assert.equal(s.orchestrator.jobs.length, 1, 'no second Motion job');
  assert.deepEqual(s.reservations(), [{ reserved_micros: 2_000_000, cost_state: 'settled', status: 'settled' }], 'no second reservation');
  assert.equal((await s.read('GET', `/api/learn/video?app=${CANVAS}`)).body.videos.length, 1, 'one video card on the server');
});

// ---------- MOT-22: only the current revision, on its own canvas and workspace, may start; once ----------

const putSettings = (s, messageId, duration_seconds, expected_version) => s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds, audio: false }, expected_version });
const nothingStarted = (s, why) => assert.deepEqual([s.orchestrator.jobs.length, s.orchestrator.health, s.reservations().length], [0, 0, 0], why);
const CLOUDS = 'Sunlight warms the sea and water evaporates. The vapour rises and cools into tiny droplets. The droplets gather into clouds that grow darker. The clouds release rain over the land.';
// A chat refinement from a tab holding `current`: the model revises whatever proposal the server says is current.
async function refine(s, threadId, current) {
  s.model.replies.push({ content: [{ type: 'tool_use', id: 'tu2', name: 'propose_generation', input: { command: 'motion', title: 'Water cycle: clouds', description: CLOUDS, settings: { duration_seconds: 15, audio: false } } }], stop_reason: 'tool_use' },
    'Updated.\n<answer_meta>{}</answer_meta>');
  const res = await s.send('POST', '/api/learn/ask', { scope: { app: CANVAS }, thread_id: threadId, message: 'focus more on clouds', mode: 'auto', generation: { motion: { concept: 'Weather' }, current } });
  assert.equal(res.status, 200);
  const meta = sse(await res.text()).find(e => e.event === 'answer_meta').data;
  return { messageId: meta.messageId, proposal: meta.proposal };
}

test('MOT-22 owner repro: v1 revised to v2 and v3, then v1 from a stale tab is refused before any hold or job; v3 still starts, once', async t => {
  const s = stack(t);
  const { threadId, messageId, proposal: v1 } = await propose(s);
  const v2 = (await putSettings(s, messageId, 20, 1)).body.proposal;
  const v3 = (await putSettings(s, messageId, 25, 2)).body.proposal;
  assert.deepEqual([v2.version, v3.version], [2, 3]);
  for (const stale of [v1, v2]) {
    const refused = await generate(s, press(stale));
    assert.deepEqual([refused.status, refused.body.code], [409, 'proposal_stale'], `v${stale.version} is superseded`);
  }
  nothingStarted(s, 'a stale version reserves nothing and calls no orchestrator');
  // Reload: the restored card is v3, and it is still usable.
  s.restart();
  const { proposal } = await restore(s, threadId, messageId);
  assert.deepEqual(proposal, v3);
  const operation = press(proposal);
  const [x, y] = await Promise.all([generate(s, operation), generate(s, operation)]);
  assert.deepEqual([x.status, y.status, x.body.placementId], [202, 202, y.body.placementId], 'a double click is one press');
  assert.equal(s.orchestrator.jobs[0].body.approved_proposal.duration_seconds, 25);
  await untilReady(s, x.body.placementId);
  assert.equal((await generate(s, press(v1))).status, 409, 'v1 after v3 made its video: still refused');
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length], [1, 1], 'one job, one reservation');
});

test('MOT-22 two tabs: a settings change and a chat refinement, out-of-order and concurrent saves, and stale-versus-current Generate races', async t => {
  const s = stack(t);
  const { threadId, messageId: first, proposal: v1 } = await propose(s);
  // Tab B changes the duration on the card; tab A, still showing v1, refines in chat: the server revises v2, not A's v1.
  const v2 = (await putSettings(s, first, 20, 1)).body.proposal;
  const { messageId: second, proposal: v3 } = await refine(s, threadId, v1);
  assert.deepEqual([v3.proposal_id, v3.version, v3.description], [v1.proposal_id, 3, CLOUDS]);
  // Tab B saves again on its old card (out of order): refused, nothing written.
  const late = await putSettings(s, first, 30, 2);
  assert.deepEqual([late.status, late.body.code, late.body.current], [409, 'proposal_stale', v3], 'the current revision comes back with the refusal');
  // Both tabs change the current card at once, each from v3: exactly one save lands; the others conflict and change nothing.
  const saves = await Promise.all([putSettings(s, second, 10, 3), putSettings(s, second, 15, 3), putSettings(s, second, 35, 3)]);
  const won = saves.filter(r => r.status === 200).map(r => r.body.proposal);
  assert.equal(won.length, 1, 'one save from v3 lands');
  for (const r of saves.filter(r => r.status !== 200)) assert.deepEqual([r.status, r.body.code], [409, 'proposal_stale']);
  assert.deepEqual(won.map(p => p.version).sort(), won.map((_, i) => 4 + i), 'distinct consecutive versions');
  const { proposal: current } = await restore(s, threadId, second);
  assert.equal(current.version, 3 + won.length);
  for (const stale of [v1, v2, v3, ...won.filter(p => p.version !== current.version)]) {
    const refused = await generate(s, press(stale));
    assert.deepEqual([refused.status, refused.body.code], [409, 'proposal_stale'], `v${stale.version}`);
  }
  nothingStarted(s, 'no stale version reserved or started anything');
  // Stale and current presses at once, with a double click of the current one and a second tab's own press.
  const pressed = press(current);
  const race = await Promise.all([generate(s, press(v2)), generate(s, pressed), generate(s, pressed), generate(s, press(current)), generate(s, press(v3))]);
  assert.deepEqual([race[1].status, race[2].status, race[1].body.placementId], [202, 202, race[2].body.placementId]);
  for (const i of [0, 3, 4]) assert.equal(race[i].status, 409, `press ${i} is refused`);
  await untilReady(s, race[1].body.placementId);
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length], [1, 1], 'one job, one reservation');
  assert.equal(s.orchestrator.jobs[0].body.approved_proposal.duration_seconds, current.settings.duration_seconds);
  // A chat refinement of the generated proposal proposes anew (a new id), never a version of the used one.
  const { proposal: fresh } = await refine(s, threadId, current);
  assert.notEqual(fresh.proposal_id, v1.proposal_id);
  assert.equal(fresh.version, 1);
});

test('MOT-22 a revision racing Generate: exactly one wins, and the proposal still makes exactly one video', async t => {
  for (let round = 0; round < 4; round++) {
    await t.test(`round ${round}`, async t => {
      const s = stack(t);
      const { threadId, messageId, proposal } = await propose(s);
      const [saved, started] = await Promise.all([putSettings(s, messageId, 20, 1), generate(s, press(proposal))]);
      assert.ok((saved.status === 200) !== (started.status === 202), `one winner: PUT ${saved.status}, Generate ${started.status}`);
      if (started.status === 202) assert.deepEqual([saved.status, ['proposal_used', 'proposal_stale'].includes(saved.body.code)], [409, true]);
      else {
        assert.deepEqual([started.status, started.body.code], [409, 'proposal_stale']);
        nothingStarted(s, 'the losing Generate reserved nothing');
        const { proposal: latest } = await restore(s, threadId, messageId);
        assert.equal((await generate(s, press(latest))).status, 202, 'the revision that won starts');
      }
      assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length], [1, 1]);
    });
  }
});

test('MOT-22 canvas binding: replay to another owned canvas, another workspace, a tampered proposal or a forged destination is refused with no hold or job', async t => {
  const s = stack(t);
  const { proposal } = await propose(s);
  assert.deepEqual([proposal.input.org, proposal.input.app], ['team', CANVAS], 'signed for the canvas and workspace it was asked on');
  const other = await generate(s, press(proposal), {}, { at: OTHER });
  assert.deepEqual([other.status, other.body.code], [409, 'proposal_canvas'], 'another canvas the learner owns');
  const lab = await generate(s, press(proposal), {}, { at: `${CANVAS}&workspace=lab` });
  assert.deepEqual([lab.status, lab.body.code], [409, 'proposal_canvas'], 'the same canvas name in another workspace');
  const tampered = await generate(s, press({ ...proposal, input: { ...proposal.input, app: OTHER } }), {}, { at: OTHER });
  assert.deepEqual([tampered.status, tampered.body.code], [409, 'proposal_refused'], 'a changed binding breaks the signature');
  const forged = await generate(s, press(proposal), {}, { at: OTHER, headers: { 'x-rh-lesson-app': JSON.stringify({ org: 'team', app: CANVAS }) } });
  assert.deepEqual([forged.status, forged.body.code], [409, 'proposal_canvas'], 'the destination is the server\'s, never the browser\'s');
  nothingStarted(s, 'no refusal reserved or started anything');
  const own = await generate(s, press(proposal));
  assert.equal(own.status, 202);
  await untilReady(s, own.body.placementId);
  assert.equal((await generate(s, press(proposal), {}, { at: OTHER })).status, 409, 'and still refused elsewhere after it made its video');
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length], [1, 1]);
});

test('MOT-22 an old unbound proposal needs a refresh: Generate is refused, its next revision binds it, and the made video plays', async t => {
  const s = stack(t);
  // A proposal saved before MOT-22 (no org or app in its input), on an answer in this canvas's chat.
  const old = await signProposal(s.env, { command: 'motion', title: 'Water cycle: evaporation to rain', description: WATER, settings: { duration_seconds: 10, audio: false }, source_refs: [], input: { request: '/motion explain the water cycle', concept: 'Weather' } }, OWNER);
  const thread = 'canvaschat-00000000-0000-4000-8000-000000000001';
  s.sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref, commit_sha) VALUES (?, 'team', ?, ?, '')").run(thread, OWNER, CANVAS);
  const id = Number(s.sqlite.prepare("INSERT INTO messages (thread_id, role, content) VALUES (?, 'assistant', 'Here is a proposal.')").run(thread).lastInsertRowid);
  s.sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (?, ?, 'assistant', ?)").run(id, thread, JSON.stringify({ version: 1, kind: 'answer', proposal: old }));
  const refused = await generate(s, press(old));
  assert.deepEqual([refused.status, refused.body.code], [409, 'proposal_canvas']);
  assert.match(refused.body.error, /needs refreshing/);
  nothingStarted(s, 'an unbound proposal starts nothing');
  const refreshed = (await putSettings(s, id, 10, 1)).body.proposal;
  assert.deepEqual([refreshed.version, refreshed.input.org, refreshed.input.app], [2, 'team', CANVAS], 'the next revision binds it to its canvas');
  const started = await generate(s, press(refreshed));
  assert.equal(started.status, 202);
  const ready = await untilReady(s, started.body.placementId);
  // Playback reads the stored clip by its job key; it never consults the proposal.
  const key = [...(await s.videos()[0].state.storage.list({ prefix: 'job:' })).keys()][0].slice(4);
  const clip = await s.send('GET', `/api/learn/video?app=${CANVAS}&asset=${key}`);
  assert.deepEqual([ready.status, clip.status, clip.headers.get('content-type')], ['ready', 200, 'video/mp4']);
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length], [1, 1]);
});

// ---------- MOT-22 reopened: one atomic state per proposal; deterministic interleavings through hooks ----------

const CAS = /^UPDATE chat_message_meta SET meta_json = \? WHERE message_id = \? AND meta_json = \?$/;
const gate = () => { let open; const opened = new Promise(r => { open = r; }); return { open, wait: reply => async () => { await opened; return reply; } }; };
const toolCall = (id, description) => ({ content: [{ type: 'tool_use', id, name: 'propose_generation', input: { command: 'motion', title: `Water cycle: ${id}`, description, settings: { duration_seconds: 15, audio: false } } }], stop_reason: 'tool_use' });
const RIVERS = 'Rain falls on hills and runs downhill. Streams join into rivers. Rivers carry the water to the sea. The sea warms and the water evaporates again.';

test('MOT-22 a chat refinement published between Generate\'s read and its consume: the stale Generate is refused with no hold or job, then v2 generates once', async t => {
  const s = stack(t);
  const { threadId, proposal: v1 } = await propose(s);
  let v2 = null;
  // The first compare-and-swap of the Generate below is its consume: before it runs, a whole chat refinement lands.
  s.hooks.beforeRun = async sql => { if (!CAS.test(sql)) return; s.hooks.beforeRun = null; v2 = (await refine(s, threadId, v1)).proposal; };
  const refused = await generate(s, press(v1));
  assert.equal(v2?.version, 2, 'the refinement was published inside the window');
  assert.deepEqual([refused.status, refused.body.code], [409, 'proposal_stale']);
  nothingStarted(s, 'the stale Generate held and started nothing');
  const started = await generate(s, press(v2));
  assert.equal(started.status, 202);
  await untilReady(s, started.body.placementId);
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length, s.orchestrator.jobs[0].body.approved_proposal.description], [1, 1, CLOUDS]);
  assert.equal((await generate(s, press(v2))).status, 409, 'a second press of v2: used');
});

test('MOT-22 two simultaneous chat refinements: exactly one becomes current, the other conflicts and its text comes back to the learner', async t => {
  const s = stack(t);
  const { threadId, messageId, proposal: v1 } = await propose(s);
  // Both turns read v1 as current before either model answers; then both propose at once.
  const g = gate();
  s.model.replies.push(g.wait(toolCall('a', CLOUDS)), g.wait(toolCall('b', RIVERS)), 'First.\n<answer_meta>{}</answer_meta>', 'Second.\n<answer_meta>{}</answer_meta>');
  const turn = () => s.send('POST', '/api/learn/ask', { scope: { app: CANVAS }, thread_id: threadId, message: 'change it', mode: 'auto', generation: { motion: { concept: 'Weather' }, current: v1 } });
  const calls = s.model.calls.length;
  const pending = [turn(), turn()];
  for (let i = 0; i < 200 && s.model.calls.length < calls + 2; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(s.model.calls.length, calls + 2, 'both turns are waiting on the model');
  g.open();
  const metas = await Promise.all(pending.map(async p => sse(await (await p).text()).find(e => e.event === 'answer_meta').data));
  const winners = metas.filter(m => m.proposal), losers = metas.filter(m => m.proposalConflict);
  assert.deepEqual([winners.length, losers.length], [1, 1], 'one current, one conflict');
  assert.equal(winners[0].proposal.version, 2);
  const lost = losers[0].proposalConflict.draft.description;
  assert.ok([CLOUDS, RIVERS].includes(lost) && lost !== winners[0].proposal.description, 'the losing text is returned, not dropped');
  // Reload: the thread keeps both, and the winner is the one current revision.
  s.restart();
  const { messages } = await restore(s, threadId, messageId);
  assert.ok(messages.some(m => m.meta?.proposalConflict?.draft?.description === lost), 'the conflict survives a reload');
  for (const stale of [v1]) assert.deepEqual((await generate(s, press(stale))).body.code, 'proposal_stale');
  assert.equal((await generate(s, press(winners[0].proposal))).status, 202);
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length], [1, 1]);
});

test('MOT-22 delayed and out-of-order settings saves from an old revision: 409 with the current proposal, nothing overwritten; the latest still starts once', async t => {
  const s = stack(t);
  const { threadId, messageId, proposal: v1 } = await propose(s);
  const v2 = (await putSettings(s, messageId, 20, 1)).body.proposal;
  // A delayed save from a tab still on v1 arrives after v2: refused, v2 stays.
  const delayed = await putSettings(s, messageId, 30, 1);
  assert.deepEqual([delayed.status, delayed.body.code, delayed.body.current], [409, 'proposal_stale', v2]);
  assert.deepEqual((await restore(s, threadId, messageId)).proposal, v2, 'not overwritten');
  // Out of order: a refinement makes v3 on a new answer; a save on the old card, even from v2, is refused.
  const { messageId: second, proposal: v3 } = await refine(s, threadId, v2);
  const old = await putSettings(s, messageId, 15, 2);
  assert.deepEqual([old.status, old.body.code, old.body.current], [409, 'proposal_stale', v3]);
  // A save with no expected revision is refused outright.
  assert.equal((await s.read('PUT', `/api/learn/chat/messages/${second}/proposal`, { settings: { duration_seconds: 15, audio: false } })).status, 400);
  // A save on a card that is not the root (the refinement's) lands through the root's state, from v3.
  const v4 = (await putSettings(s, second, 45, 3)).body.proposal;
  assert.equal(v4.version, 4);
  assert.deepEqual((await restore(s, threadId, second)).proposal, v4);
  for (const stale of [v1, v2, v3]) assert.equal((await generate(s, press(stale))).body.code, 'proposal_stale');
  nothingStarted(s, 'no stale version started anything');
  const started = await generate(s, press(v4));
  assert.equal(started.status, 202);
  await untilReady(s, started.body.placementId);
  assert.deepEqual([s.orchestrator.jobs.length, s.reservations().length, s.orchestrator.jobs[0].body.approved_proposal.duration_seconds], [1, 1, 45]);
  const after = await putSettings(s, second, 50, 4);
  assert.deepEqual([after.status, after.body.code], [409, 'proposal_used']);
});
