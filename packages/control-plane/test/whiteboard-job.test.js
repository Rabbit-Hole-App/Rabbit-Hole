// W1.2: the /whiteboard job and routes with their real handlers, storage, ledger and proposal state (explain-fixture.js), on a fake provider
// transport. No model is ever reached: globalThis.fetch is replaced for every test that could call one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WhiteboardJobs, publicWhiteboardJob } from '../src/whiteboard-job.js';
import { whiteboardRoute } from '../src/whiteboard-routes.js';
import { whiteboardReservation } from '../src/whiteboard-policy.js';
import { proposalUsage, verifyProposal } from '../src/generation-proposal.js';
import { CONTEXT_CUT, failureText, planLines, refusalText } from '../src/whiteboard-plan.js';
import { BOARD, OWNER, d1, durable, rows, spent } from './explain-fixture.js';

const OTHER = { ...OWNER, email: 'other@example.com', userId: 'u-2' };
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/whiteboard/${name}`, import.meta.url), 'utf8'));
// The planner's answer for plan-60.json, as the tool returns it (seconds per scene; the server makes frames and ids).
const SUPPORTED = (() => {
  const p = fixture('plan-60.json');
  return { kind: 'supported', title: 'Gradient descent', goal: p.goal, audience: p.audience, substitutions: [], limitations: p.limitations,
    scenes: p.scenes.map(s => ({ seconds: (s.endFrame - s.startFrame) / 30, learningPoint: s.learningPoint, visualIntent: s.visualIntent, narrationSummary: s.narrationSummary, facts: s.facts })) };
})();
const UNSUPPORTED = { kind: 'unsupported', asked: 'be played', alternative: 'explain the rules with one example' };
// Five 12-second scenes for 60 s: over min(8, ceil(60 / 15)) = 4.
const OVER = { ...SUPPORTED, scenes: Array.from({ length: 5 }, () => ({ ...SUPPORTED.scenes[0], seconds: 12 })) };

function provider(t, reply = () => SUPPORTED) {
  const calls = [], original = globalThis.fetch;
  let gate = null;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    calls.push({ host: new URL(url).host, model: body.model, tool: body.tools[0].name, maxTokens: body.max_tokens, effort: body.output_config?.effort, toolChoice: body.tool_choice, content: JSON.parse(body.messages[0].content[0].text) });
    if (gate) await gate;
    const input = reply(calls.length, calls.at(-1));
    return Response.json({ id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name: body.tools[0].name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
  return { calls, hold() { let release; gate = new Promise(r => { release = r; }); return () => { gate = null; release(); }; } };
}

function stack(t, { reply, env: extra = {}, used = 0 } = {}) {
  const { sqlite, LEARN_DB } = d1(t);
  if (used) spent(sqlite, used);
  const env = { SMALL_ENV: 'dev', ANTHROPIC_API_KEY: 'test-key', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_DB, WHITEBOARD_ENABLED: 'true', ...extra };
  const state = durable();
  const object = () => new WhiteboardJobs(state, env);
  const actor = object();
  const model = provider(t, reply);
  const send = async (action, payload = {}, id = null, who = OWNER, on = actor) => {
    const response = await on.fetch(new Request('https://whiteboard/action', { method: 'POST', body: JSON.stringify({ action, id, payload, board: BOARD, user: who, origin: 'https://dev.test' }) }));
    return { status: response.status, body: await response.json() };
  };
  const create = (more = {}) => send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain gradient descent with one worked example.', ...more });
  const stored = id => state.data.get(`job:${id}`);
  const run = async (id, on = actor, max = 10) => {
    for (let i = 0; i < max; i++) { await on.alarm(); const j = stored(id); if (['failed', 'awaiting_approval', 'authoring', 'ready'].includes(j.stage) && !j.inFlight) return j; }
    return stored(id);
  };
  const proposals = id => rows(sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json).proposal).filter(p => p?.input?.job === id);
  const approve = (id, proposal = proposals(id).at(-1), on = actor) => send('approve', { proposal }, id, OWNER, on);
  const messages = () => rows(sqlite, 'messages').map(m => m.content);
  const planned = async (more) => { const { body } = await create(more); return { id: body.job.id, job: await run(body.job.id) }; };
  return { sqlite, env, state, actor, object, model, send, create, stored, run, proposals, approve, messages, planned };
}

test('a request plans once and waits: one Opus 5.5 call, the 1.3 body as the signed proposal, nothing more until Generate', async t => {
  const s = stack(t);
  const { status, body } = await s.create();
  assert.equal(status, 202);
  assert.equal(s.model.calls.length, 0, 'submission alone calls nothing');
  const job = await s.run(body.job.id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.calls.map(c => [c.host, c.model, c.tool, c.maxTokens, c.effort, c.toolChoice.type]), [['api.anthropic.com', 'claude-opus-5-5', 'whiteboard_plan', 6000, 'medium', 'auto']]);
  assert.equal(s.model.calls[0].content.durationSeconds, 60);
  const [p] = s.proposals(body.job.id);
  assert.deepEqual([p.command, p.settings, p.input.job, p.input.plan_hash, p.input.scenes, p.sig.startsWith('v3.'), p.title], ['whiteboard-video', { duration_seconds: 60 }, body.job.id, job.planHash, 4, true, 'Gradient descent']);
  assert.equal(p.description, [job.plan.goal, 'Scene 1 (15 s): We want the lowest point of a curve.', 'Scene 2 (15 s): The slope says which way is downhill.', 'Scene 3 (15 s): One step: new x = x minus rate times slope.', 'Scene 4 (15 s): Repeating the step walks the guess to the minimum.', 'Narrated by one voice; 4 scenes; 60 seconds.'].join('\n'));
  assert.equal(p.description, planLines(job.plan));
  assert.deepEqual(p.limitations, ['The learning rate is fixed for the example.']);
  for (let i = 0; i < 3; i++) await s.actor.alarm();
  assert.equal(s.model.calls.length, 1, 'waiting for Generate spends nothing');
});

test('proposalUsage numbers equal whiteboardReservation for the plan, and the proposal signature round-trips', async t => {
  const s = stack(t);
  const { id, job } = await s.planned();
  const [p] = s.proposals(id), r = whiteboardReservation(job.plan);
  assert.deepEqual(p.usage, { estimate_credits: Math.ceil(r.estimate.generationMicros / 10000), max_credits: Math.ceil(r.generationMicros / 10000), reserve_credits: null });
  assert.deepEqual([p.usage.estimate_credits, p.usage.max_credits], [134, 240]); // author at 8,000 output tokens (owner try, 2026-11-05)
  assert.deepEqual(proposalUsage({}, 'whiteboard-video', { duration_seconds: 10 }, { scenes: 1 }).max_credits, Math.ceil(whiteboardReservation(fixture('plan-10.json')).generationMicros / 10000));
  assert.equal(await verifyProposal(s.env, p, OWNER.email), null);
  assert.match(await verifyProposal(s.env, { ...p, settings: { duration_seconds: 10 } }, OWNER.email), /not made for you, or it was changed/);
  assert.match(await verifyProposal(s.env, p, OTHER.email), /not made for you/);
});

test('selected text is cut at 8,000 characters and the plan says so in its assumptions', async t => {
  const s = stack(t);
  const { id } = await s.planned({ context: 'x'.repeat(8001) });
  assert.equal(s.model.calls[0].content.context.text.length, 8000);
  assert.equal(s.model.calls[0].content.context.cut, true);
  assert.deepEqual(s.proposals(id)[0].assumptions, [CONTEXT_CUT]);
});

test('unsupported: the 1.3 refusal in Chat, no proposal, no Generate; the planner call stays charged', async t => {
  const s = stack(t, { reply: () => UNSUPPORTED });
  const { id, job } = await s.planned();
  assert.deepEqual([job.stage, publicWhiteboardJob(job).outcome], ['failed', 'unsupported']);
  assert.equal(s.proposals(id).length, 0);
  assert.deepEqual(s.messages(), ["Whiteboard makes a narrated video, so it can't be played. It can explain the rules with one example. Edit the request or try /animation for something you can run."]);
  assert.equal(refusalText('be played', ''), "Whiteboard makes a narrated video, so it can't be played. Edit the request or try /animation for something you can run.");
  assert.equal((await s.approve(id, { proposal_id: 'gp-0000000000000000' })).status, 409);
  assert.equal(rows(s.sqlite, 'usage_adjustments').length, 0);
});

test('fit: a plan over policy (scene count, windows) is refused before any proposal; the failure is said once and the plan call refunded by key', async t => {
  for (const reply of [OVER, { ...SUPPORTED, scenes: SUPPORTED.scenes.map(sc => ({ ...sc, seconds: 14 })) }]) {
    const s = stack(t, { reply: () => reply });
    const { id, job } = await s.planned();
    assert.deepEqual([job.stage, job.failure.reason, job.failure.code], ['failed', 'the plan could not be written', 'plan_unfit']);
    assert.equal(s.proposals(id).length, 0);
    assert.deepEqual(s.messages(), [failureText(job.prompt.slice(0, 60), 'the plan could not be written')]);
    assert.match(s.messages()[0], /^"Explain gradient descent with one worked example\." was not finished: the plan could not be written\. Your request and plan are kept; nothing was charged for the part that failed\.$/);
    const paid = rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic');
    assert.equal(paid.length, 1, 'one usage row for the one call');
    const refunds = rows(s.sqlite, 'usage_adjustments');
    assert.equal(refunds.length, 1);
    assert.match(refunds[0].reason, /^whiteboard_failed_refund:1$/);
    assert.equal(refunds[0].micros, -paid[0].cost_micros);
  }
});

test('usage rows per call; no refund on success; refine is one more call, revision + 1, the same proposal id', async t => {
  // 30 s allows min(8, ceil(30 / 15)) = 2 scenes: the planner answers two 15-second scenes for it.
  const t2 = stack(t, { reply: (n, call) => (call.content.durationSeconds === 30 ? { ...SUPPORTED, scenes: SUPPORTED.scenes.slice(0, 2) } : SUPPORTED) });
  const a = await t2.planned();
  assert.equal(a.job.plan.revision, 1);
  assert.equal((await t2.send('refine', { message: 'duration: 45', proposal: t2.proposals(a.id)[0] }, a.id)).body.code, 'duration_invalid');
  await t2.send('refine', { message: 'duration: 30', proposal: t2.proposals(a.id)[0] }, a.id);
  const b = await t2.run(a.id);
  assert.equal(t2.model.calls[1].content.durationSeconds, 30);
  assert.deepEqual([b.stage, b.plan.revision, b.plan.durationSeconds, b.plan.scenes.length], ['awaiting_approval', 2, 30, 2]);
  const [v1, v2] = t2.proposals(a.id);
  assert.deepEqual([v2.proposal_id, v2.version, v2.settings], [v1.proposal_id, 2, { duration_seconds: 30 }]);
  const paid = rows(t2.sqlite, 'usage_attempts').filter(x => x.provider === 'anthropic');
  assert.equal(paid.length, 2, 'one usage row per call');
  assert.deepEqual(paid.map(x => x.cost_state), ['settled', 'settled']);
  assert.equal(rows(t2.sqlite, 'usage_adjustments').length, 0, 'no refund on success');
  // The stale first version cannot be refined or generated any more.
  assert.equal((await t2.send('refine', { message: 'shorter', proposal: v1 }, a.id)).body.code, 'plan_stale');
  assert.equal((await t2.approve(a.id, v1)).status, 409);
});

// W1.3: Generate now leads into authoring (the stages are whiteboard-generation.test.js's); the second press changes nothing.
test('double approve: the second Generate of the same proposal is idempotent; the job enters authoring with its lease', async t => {
  const s = stack(t);
  const { id } = await s.planned();
  const first = await s.approve(id), again = await s.approve(id);
  assert.deepEqual([first.status, again.status, first.body.job.stage, again.body.job.stage], [202, 200, 'authoring', 'authoring']);
  const job = s.stored(id);
  assert.ok(job.approval?.planHash === job.planHash && job.deadline > Date.now());
  assert.equal(s.model.calls.length, 1, 'Generate itself calls nothing');
});

test('two tabs: concurrent Generates consume the proposal once; a second job on the card or canvas is refused', async t => {
  const s = stack(t);
  const { id } = await s.planned();
  const other = s.object(); // the second tab reaches the same object storage
  const [a, b] = await Promise.all([s.approve(id), s.approve(id, undefined, other)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 202]);
  const used = rows(s.sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json).proposalState).filter(Boolean);
  assert.deepEqual(used.map(st => st.used?.key), [id]);
  assert.equal((await s.create({ requestId: 'req-00000002' })).body.code, 'card_busy');
  assert.equal((await s.create({ requestId: 'req-00000003', cardId: 'card-0002' })).body.code, 'canvas_busy');
  // Duplicate submits of the same request make one job; the same id with other words is refused.
  const [x, y] = await Promise.all([s.create({ requestId: 'req-00000001' }), s.create({ requestId: 'req-00000001' })]);
  assert.deepEqual([x.body.job.id, y.body.job.id], [id, id]);
  assert.equal((await s.create({ prompt: 'Something else.' })).body.code, 'request_conflict');
});

test('restart mid-stage resumes from the checkpoint; an in-flight call is never resent and its expired lease fails the job, refunded', async t => {
  const s = stack(t);
  const { body } = await s.create();
  await s.actor.alarm(); // queued -> planning, checkpointed
  assert.equal(s.stored(body.job.id).stage, 'planning');
  const restarted = s.object();
  const resumed = await s.run(body.job.id, restarted);
  assert.equal(resumed.stage, 'awaiting_approval');
  assert.equal(s.model.calls.length, 1);

  const u = stack(t);
  const made = (await u.create()).body.job.id;
  await u.actor.alarm();
  const release = u.model.hold();
  const running = u.actor.alarm(); // the plan call is sent and held
  while (!u.stored(made).inFlight || !u.model.calls.length) await new Promise(r => setTimeout(r, 1));
  const after = u.object(); // the object restarts while the call is out
  await after.alarm();
  assert.equal(u.stored(made).stage, 'planning', 'inside the lease: waits, nothing resent');
  assert.equal(u.model.calls.length, 1);
  u.state.data.set(`job:${made}`, { ...u.stored(made), inFlight: { ...u.stored(made).inFlight, until: Date.now() - 1 } });
  await after.alarm();
  const failed = u.stored(made);
  assert.deepEqual([failed.stage, failed.failure.code, failed.calls[0].status], ['failed', 'call_interrupted', 'unknown']);
  release(); await running; // the old call's late answer is dropped: the lease is gone
  assert.deepEqual([u.stored(made).stage, u.proposals(made).length, u.model.calls.length], ['failed', 0, 1]);
  assert.equal(u.messages().length, 1, 'the failure is said once');
});

test('reportKey dedupe: reloads and repeated alarms write no second Chat message', async t => {
  const s = stack(t, { reply: () => OVER });
  const { id } = await s.planned();
  for (let i = 0; i < 3; i++) { await s.send('get', {}, id); await s.actor.alarm(); }
  const again = s.stored(id);
  await s.object().report({ ...again, reported: null }); // even a lost "reported" mark finds the message by its key
  assert.equal(s.messages().length, 1);
});

test('kill switch: no new job, refine or Generate, and the alarm dispatches nothing', async t => {
  const s = stack(t);
  const { body } = await s.create();
  s.env.WHITEBOARD_EXECUTION_KILL = 'true';
  for (let i = 0; i < 3; i++) await s.actor.alarm();
  assert.deepEqual([s.stored(body.job.id).stage, s.model.calls.length], ['queued', 0]);
  assert.equal((await s.create({ requestId: 'req-00000009', cardId: 'card-0009' })).body.code, 'whiteboard_killed');
  delete s.env.WHITEBOARD_EXECUTION_KILL;
  await s.run(body.job.id);
  s.env.WHITEBOARD_EXECUTION_KILL = 'true';
  assert.equal((await s.approve(body.job.id)).body.code, 'whiteboard_killed');
  assert.equal((await s.send('refine', { message: 'shorter' }, body.job.id)).body.code, 'whiteboard_killed');
});

test('Generate needs the allowance for the generation worst case; a refused Generate consumes nothing', async t => {
  const s = stack(t, { used: 50 * 1e6 - 1_000_000 }); // under the 2,400,000 micro-USD generation worst case left
  const { id } = await s.planned();
  const refused = await s.approve(id);
  assert.equal(refused.status, 429);
  assert.deepEqual(rows(s.sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json).proposalState).filter(Boolean).map(st => st.used), [null]);
  assert.equal(s.stored(id).stage, 'awaiting_approval');
});

test('another learner sees nothing: jobs and results are the owner\'s on their own canvas', async t => {
  const s = stack(t);
  const { id } = await s.planned();
  assert.equal((await s.send('get', {}, id, OTHER)).status, 404);
  assert.equal((await s.send('refine', { message: 'x' }, id, OTHER)).status, 404);
  assert.equal((await s.send('result', {}, 'wa_unknown')).status, 404);
  s.state.data.set('result:wa_1', { owner: OWNER, boardId: BOARD.id, cardId: 'card-0001', result: { schema: 'whiteboard-result/1' } });
  assert.equal((await s.send('result', {}, 'wa_1')).status, 200);
  assert.equal((await s.send('result', {}, 'wa_1', OTHER)).status, 404);
});

// The route: off is absent, the menu switch, 401 for no session, 403 cross-origin, 404 for another learner's canvas.
test('routes: availability switch, 404 when off, 401 unauthorized, 403 cross-origin, the caller\'s own canvas only', async t => {
  const { LEARN_DB } = d1(t);
  const forwarded = [];
  const stub = { fetch: async (url, init) => { forwarded.push(JSON.parse(init.body)); return Response.json({ ok: true }); } };
  const env = { LEARN_DB, WHITEBOARD_ENABLED: 'true', WHITEBOARD_JOBS: { idFromName: name => `id:${name}`, get: () => stub } };
  const signedIn = { identity: async () => OWNER }, signedOut = { identity: async () => Response.json({ error: 'Sign in first' }, { status: 401 }) };
  const req = (method, path, body, headers = {}) => new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const call = async (env_, method, path, body, deps = signedIn, headers) => whiteboardRoute(path, req(method, path, body, headers), env_, deps);
  assert.equal(await call(env, 'GET', '/api/learn/animation/jobs'), null);
  assert.deepEqual(await (await call(env, 'GET', '/api/learn/whiteboard/jobs')).json(), { available: true });
  assert.deepEqual(await (await call({ ...env, WHITEBOARD_ENABLED: 'false' }, 'GET', '/api/learn/whiteboard/jobs')).json(), { available: false });
  assert.deepEqual(await (await call({ ...env, WHITEBOARD_EXECUTION_KILL: 'true' }, 'GET', '/api/learn/whiteboard/jobs')).json(), { available: false });
  assert.equal((await call({ ...env, WHITEBOARD_ENABLED: 'false' }, 'POST', '/api/learn/whiteboard/jobs', { boardId: BOARD.id })).status, 404);
  assert.equal((await call(env, 'POST', '/api/learn/whiteboard/jobs', { boardId: BOARD.id }, signedOut)).status, 401);
  assert.equal((await call(env, 'POST', '/api/learn/whiteboard/jobs', { boardId: BOARD.id }, signedIn, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(env, 'POST', '/api/learn/whiteboard/jobs', { boardId: BOARD.id }, { identity: async () => OTHER })).status, 404);
  assert.equal((await call(env, 'POST', '/api/learn/whiteboard/jobs/wj_1/delete', { boardId: BOARD.id })).status, 404);
  assert.equal((await call(env, 'GET', '/api/learn/whiteboard/assets?board=board-1')).status, 404, 'the asset route is W1.3');
  for (const [method, path, action] of [['POST', '/api/learn/whiteboard/jobs', 'create'], ['GET', '/api/learn/whiteboard/jobs/wj_1?board=board-1', 'get'], ['POST', '/api/learn/whiteboard/jobs/wj_1/approve', 'approve'], ['POST', '/api/learn/whiteboard/jobs/wj_1/refine', 'refine'], ['GET', '/api/learn/whiteboard/results/wa_1?board=board-1', 'result']]) {
    if (method === 'GET') assert.equal((await call(env, method, path.split('?')[0])).status, 400, `${action} needs its board`);
    const response = await whiteboardRoute(path.split('?')[0], req(method, path, method === 'POST' ? { boardId: BOARD.id, prompt: 'p' } : null), env, signedIn);
    assert.equal(response.status, 200, action);
    const sent = forwarded.at(-1);
    assert.deepEqual([sent.action, sent.board.id, sent.user.email, 'boardId' in sent.payload], [action, BOARD.id, OWNER.email, false]);
  }
});

test('a failed whiteboard job writes one job_failed log line: its stage and code, no request words', async t => {
  const lines = [];
  t.mock.method(console, 'log', line => { if (String(line).includes('"event":"job_failed"')) lines.push(String(line)); });
  const s = stack(t, { reply: () => OVER });
  const { id, job } = await s.planned();
  assert.equal(job.stage, 'failed');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.deepEqual([entry.kind, entry.job_id, entry.stop_reason, entry.interrupted], ['whiteboard', id, job.failure.code, false]);
  assert.equal(entry.stage, job.failure.stage);
  assert.doesNotMatch(lines[0], /gradient|Explain|could not be written/);
});
