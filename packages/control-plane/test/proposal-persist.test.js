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
import { verifyProposal } from '../src/generation-proposal.js';
import { madeFrom, proposalActive, proposalBlock } from '../../web/src/generation-proposal-chat.js';

const worker = (await devWorker()).default;
const CANVAS = 'canvas-0a1b2c3d', OWNER = 'owner@test';
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
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,?,'Weather')").run(CANVAS, OWNER);
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }), now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  // One storage map per object name; actors are the live instances, dropped by restart().
  const stored = new Map(), actors = new Map();
  const actor = name => { if (!actors.has(name)) { if (!stored.has(name)) stored.set(name, new Map()); actors.set(name, new LearnVideos(durable(name, stored.get(name)), env)); } return actors.get(name); };
  // The dev worker's DB (rabbit-hole-dev) is read for one thing here: a course canvas's pinned repository (learn-video.js
  // canvasRepository), which this canvas has none of. Any other DB statement fails the test.
  const live = liveDb(), DB = { calls: live.calls, prepare: sql => (/^SELECT source_version FROM learn_courses /.test(sql) ? { bind: () => ({ first: async () => null }) } : live.prepare(sql)), batch: live.batch };
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB, RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50',
    MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN, MOTION_ESTIMATE_USD: '1.00', MOTION_JOB_RESERVATION_USD: '2',
    LEARN_VIDEOS: { idFromName: name => name, get: name => actor(name) },
    CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: OWNER, orgName: 'Team', user_id: 'u-owner' }) } };
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
      const reply = model.replies.shift() ?? 'Plain answer.';
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

  const send = async (method, path, body) => worker.fetch(new Request(`https://dev.example${path}`, { method, headers: { cookie: 'small_session=s', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  const read = async (method, path, body) => { const res = await send(method, path, body); return { status: res.status, body: await res.json() }; };
  // The Motion reservations the ledger holds (one per admitted attempt) and the jobs the orchestrator was asked to start.
  const reservations = () => sqlite.prepare("SELECT reserved_micros, cost_state, status FROM usage_attempts WHERE attempt_id LIKE 'motion-%' ORDER BY rowid").all().map(r => ({ ...r }));
  const videos = () => [...actors.values()];
  const restart = () => actors.clear();
  return { sqlite, env, model, orchestrator, send, read, reservations, videos, restart };
}

// The chat turn that proposes: a /motion line, the model calls propose_generation, the answer keeps the signed card.
async function propose(s) {
  s.model.replies.push({ content: [{ type: 'tool_use', id: 'tu1', name: 'propose_generation', input: { command: 'motion', title: 'Water cycle: evaporation to rain', description: WATER, settings: { duration_seconds: 10, audio: false } } }], stop_reason: 'tool_use' },
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
const generate = (s, operation, extra = {}) => s.read('POST', `/api/learn/video?app=${CANVAS}`, { operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed: true, ...extra });
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
  const revised = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 20, audio: false } });
  assert.equal(revised.status, 200);
  assert.deepEqual([revised.body.proposal.proposal_id, revised.body.proposal.version, revised.body.proposal.settings], [first.proposal_id, 2, { duration_seconds: 20, audio: false }]);
  const again = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 25, audio: false } });
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
  assert.deepEqual(s.orchestrator.jobs[0].body.approved_proposal, { title: 'Water cycle: evaporation to rain', duration_seconds: 25, description: WATER });
  assert.deepEqual(s.reservations(), [{ reserved_micros: 2_000_000, cost_state: 'reserved', status: 'running' }], 'one hold, admitted before the job');
  assert.equal((await untilReady(s, started.body.placementId)).status, 'ready');
  assert.deepEqual(s.model.calls.length, 2, 'the proposal and its reply: the revisions and Generate made no model call');
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
  // 4. A revision saved after it was generated, then Generate: the proposal already made its video.
  const revised = await s.read('PUT', `/api/learn/chat/messages/${messageId}/proposal`, { settings: { duration_seconds: 20, audio: false } });
  assert.equal(revised.body.proposal.version, 2);
  const third = await generate(s, press(revised.body.proposal));
  assert.deepEqual([third.status, third.body.code], [409, 'proposal_used']);
  for (const v of s.videos()) await v.alarm();
  assert.equal(s.orchestrator.jobs.length, 1, 'no second Motion job');
  assert.deepEqual(s.reservations(), [{ reserved_micros: 2_000_000, cost_state: 'settled', status: 'settled' }], 'no second reservation');
  assert.equal((await s.read('GET', `/api/learn/video?app=${CANVAS}`)).body.videos.length, 1, 'one video card on the server');
});
