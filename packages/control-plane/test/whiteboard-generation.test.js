// W1.3: Generate to a ready video through the real job object, ledger, proposal state and the stages, on stubbed providers: the model (plan and
// scene tools), Fish (a real recorded MP3) and the renderer (wb-render's request gate when it can be loaded). An in-memory R2. No real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WhiteboardJobs } from '../src/whiteboard-job.js';
import { whiteboardRoute } from '../src/whiteboard-routes.js';
import { validateResult, validateTimings } from '../src/whiteboard-schema.js';
import { ORPHAN_MS } from '../src/whiteboard-assets.js';
import { BOARD, OWNER, d1, durable, rows } from './explain-fixture.js';

const OTHER = { ...OWNER, email: 'other@example.com', userId: 'u-2' };
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/whiteboard/${name}`, import.meta.url), 'utf8'));
const MP3 = new Uint8Array(readFileSync(new URL('../../web/public/audio/nanogpt-l1-p1-0.mp3', import.meta.url))); // 3.788 s (114 frames)
const LONG = new Uint8Array([...MP3, ...MP3, ...MP3, ...MP3, ...MP3]); // 18.94 s: over a 15 s window
const PLAN = (() => {
  const p = fixture('plan-60.json');
  return { kind: 'supported', title: 'Gradient descent', goal: p.goal, audience: p.audience, substitutions: [], limitations: [],
    scenes: p.scenes.map(s => ({ seconds: 15, learningPoint: s.learningPoint, visualIntent: s.visualIntent, narrationSummary: s.narrationSummary, facts: s.facts })) };
})();
const SCENE = (() => { const s = fixture('scene-1.json'); return { primitives: s.primitives, beats: s.beats.map(({ narration, reveals, pauseFrames }) => ({ narration, reveals, pauseFrames })) }; })();
const BAD_SCENE = { ...SCENE, beats: [{ ...SCENE.beats[0], reveals: ['ghost'] }] };

// wb-render's request gate (packages/learn-render/whiteboard/contracts.mjs): in this tree once both lanes are merged, else read from their
// branch; null when neither is available (the gate assertions are skipped then, never faked).
async function renderGate() {
  const local = new URL('../../learn-render/whiteboard/contracts.mjs', import.meta.url);
  if (existsSync(local)) return (await import(local.href)).validateRenderRequest;
  try {
    const text = execFileSync('git', ['show', 'rabbit-hole/feat/w1-render:packages/learn-render/whiteboard/contracts.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const file = join(mkdtempSync(join(tmpdir(), 'wb-gate-')), 'contracts.mjs');
    writeFileSync(file, text);
    return (await import(pathToFileURL(file).href)).validateRenderRequest;
  } catch { return null; }
}
const GATE = await renderGate();

function bucket() {
  const data = new Map();
  const object = (key, range) => { const v = data.get(key); if (!v) return null; const bytes = range ? v.bytes.slice(range.offset, range.offset + range.length) : v.bytes;
    return { key, size: v.bytes.length, httpEtag: `"${key.length}-${v.bytes.length}"`, body: bytes, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), uploaded: v.at }; };
  return { data,
    put: async (key, value) => { data.set(key, { bytes: typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value), at: new Date() }); },
    get: async (key, options) => object(key, options?.range), head: async key => object(key),
    list: async ({ prefix }) => ({ objects: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }),
    delete: async keys => { for (const k of [].concat(keys)) data.delete(k); } };
}

// One fetch for every provider. options: author(n) -> tool input; fish(n, text) -> Response; render(request) -> Response | handler result.
function providers(t, { author = () => SCENE, fish = () => new Response(MP3), render } = {}) {
  const calls = { model: [], fish: [], render: [] }, original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const renderId = 'c'.repeat(32);
  const defaultRender = ({ method, path, body }) => {
    if (path === '/health') return Response.json({ whiteboard: 'whiteboard-renderer-1' });
    if (method === 'POST') return Response.json({ render_id: renderId, poll: `/whiteboard/${renderId}` }, { status: 202 });
    if (path === `/whiteboard/${renderId}`) return Response.json({ status: 'ready', frame_count: calls.render.find(r => r.method === 'POST').body.manifest.timing.totalFrames, duration_seconds: 60, output_bytes: 5 });
    return new Response(new Uint8Array([0, 0, 0, 24, 102]));
  };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === 'api.anthropic.com') {
      const body = JSON.parse(init.body), tool = body.tools[0].name;
      calls.model.push({ tool, content: JSON.parse(body.messages[0].content[0].text) });
      calls.model.at(-1).maxTokens = body.max_tokens;
      const input = tool === 'whiteboard_plan' ? PLAN : author(calls.model.filter(c => c.tool === tool).length, calls.model.at(-1).content);
      // An author answer of { cut: true } is a reply stopped at max_tokens (the owner try of 2026-11-05).
      const cut = input?.cut === true;
      return Response.json({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'tool_use', id: 't', name: tool, input: cut ? {} : input }], stop_reason: cut ? 'max_tokens' : 'tool_use', usage: { input_tokens: 1000, output_tokens: cut ? body.max_tokens : 500 } });
    }
    if (u.host === 'api.fish.audio') { const body = JSON.parse(init.body); calls.fish.push(body); return fish(calls.fish.length, body.text); }
    if (u.host === 'renderer.test') {
      const r = { method: init.method || 'GET', path: u.pathname, key: init.headers?.['Idempotency-Key'], bytes: init.body?.length ?? 0, body: init.body ? JSON.parse(init.body) : null };
      calls.render.push(r);
      return (render ? render(r, defaultRender) : null) ?? defaultRender(r);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return calls;
}

function stack(t, options = {}) {
  const { sqlite, LEARN_DB } = d1(t);
  const media = bucket();
  const env = { SMALL_ENV: 'dev', ANTHROPIC_API_KEY: 'test-key', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_DB, LEARN_MEDIA: media,
    WHITEBOARD_ENABLED: 'true', FISH_AUDIO_API_KEY: 'fish-key', WHITEBOARD_RENDERER_URL: 'https://renderer.test', WHITEBOARD_RENDERER_TOKEN: 'renderer-token', ...options.env };
  const state = durable(), actor = new WhiteboardJobs(state, env), calls = providers(t, options);
  const send = async (action, payload = {}, id = null, who = OWNER) => {
    const response = await actor.fetch(new Request('https://whiteboard/action', { method: 'POST', body: JSON.stringify({ action, id, payload, board: BOARD, user: who, origin: 'https://dev.test' }) }));
    return { status: response.status, body: await response.json() };
  };
  const stored = id => state.data.get(`job:${id}`);
  const run = async (id, until = ['failed', 'awaiting_approval', 'ready', 'cancelled'], max = 120) => {
    for (let i = 0; i < max; i++) {
      await actor.alarm();
      const j = stored(id);
      if (j.resumeAt) state.data.set(`job:${id}`, { ...j, resumeAt: 0 }); // a renderer wait passes without the wall clock
      if (until.includes(stored(id).stage) && !stored(id).inFlight) return stored(id);
    }
    return stored(id);
  };
  const proposal = id => rows(sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json).proposal).filter(p => p?.input?.job === id).at(-1);
  const generate = async () => {
    const { body } = await send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain gradient descent with one worked example.' });
    await run(body.job.id);
    const pressed = await send('approve', { proposal: proposal(body.job.id) }, body.job.id);
    return { id: body.job.id, pressed, done: await run(body.job.id) };
  };
  return { sqlite, env, media, state, actor, calls, send, stored, run, proposal, generate };
}
const messages = s => rows(s.sqlite, 'messages').map(m => m.content);

test('Generate makes a ready video: one author call per scene, one Fish call per narrated beat, one render, the result, captions and timings', async t => {
  const s = stack(t);
  const { id, pressed, done } = await s.generate();
  assert.equal(pressed.status, 202);
  assert.equal(done.stage, 'ready', JSON.stringify(done.errors ?? done.failure));
  assert.deepEqual(s.calls.model.map(c => c.tool), ['whiteboard_plan', 'whiteboard_scene', 'whiteboard_scene', 'whiteboard_scene', 'whiteboard_scene']);
  assert.equal(s.calls.fish.length, 8, 'two narrated beats in each of four scenes');
  assert.ok(s.calls.fish.every(b => b.reference_id === '802e3bc2b27e49c2995d23ef70e6ac89' && b.mp3_bitrate === 64 && b.prosody.speed === 0.92));
  // The render: one POST, the key, the timing the renderer requires, under 16 MiB.
  const post = s.calls.render.find(r => r.method === 'POST');
  assert.equal(s.calls.render.filter(r => r.method === 'POST').length, 1);
  assert.deepEqual([post.path, post.key, post.body.segment, post.body.illustrations], ['/whiteboard/render', `${id}:1:0`, { index: 0, of: 1, startFrame: 0, endFrame: 1800 }, []]);
  assert.ok(post.bytes <= 16 * 1024 * 1024);
  assert.deepEqual(post.body.audio.map(a => a.beat), post.body.manifest.timing.beats.filter(b => b.audioFrames > 0).map(b => b.audioKey));
  assert.deepEqual(post.body.manifest.timing.beats.slice(0, 2).map(b => [b.id, b.sceneId, b.startFrame, b.audioFrames, b.audioKey]), [['b1', 's1', 0, 114, 'audio/s1-b1.mp3'], ['b2', 's1', 114, 114, 'audio/s1-b2.mp3']]);
  if (GATE) assert.deepEqual(GATE(post.body), [], 'the request passes wb-render\'s whiteboard-render/1 gate');
  else t.diagnostic('wb-render contracts.mjs not available: gate check skipped');
  // The result, its timings line and the block fields.
  const view = await s.send('get', {}, id);
  const r = view.body.job.result;
  assert.deepEqual(validateResult(r), []);
  assert.deepEqual(validateTimings(r.timings), []);
  assert.deepEqual(Object.keys(r.timings), ['video_seconds', 'plan', 'author', 'narration', 'timing_fit', 'render', 'pull_store', 'total']);
  assert.equal(r.timings.video_seconds, 60);
  assert.deepEqual(view.body.block, { artifactId: done.artifactId, revision: 1, planHash: done.planHash, measured: { seconds: 60, frames: 1800, bytes: 5 }, status: 'ready' });
  assert.deepEqual(r.keys.mp4, `learn-whiteboard/acme/canvas-a/main/${done.artifactId}/final.mp4`);
  const vtt = new TextDecoder().decode(s.media.data.get(r.keys.captions).bytes);
  assert.match(vtt, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:03\.800\nHere is our guess at x equals 3 on the curve\./);
  assert.equal(vtt.split(' --> ').length - 1, 8, 'one cue per narrated beat');
  assert.equal(JSON.parse(new TextDecoder().decode(s.media.data.get(r.keys.transcript).bytes)).beats.length, 8);
  assert.ok(s.media.data.has(`learn-whiteboard/acme/canvas-a/main/${done.artifactId}/audio/s4-b2.mp3`), 'narration checkpoints are kept');
  // Money: author calls and Fish on the generation key, nothing refunded on success.
  const actions = rows(s.sqlite, 'usage_actions'), generation = actions.find(a => a.client_key === done.actionKey);
  const attempts = rows(s.sqlite, 'usage_attempts').filter(a => a.action_id === generation.action_id);
  assert.deepEqual([attempts.filter(a => a.provider === 'anthropic').length, attempts.filter(a => a.provider === 'fish').length], [4, 8]);
  assert.equal(rows(s.sqlite, 'usage_adjustments').length, 0);
  // The result is read through the results route by its owner only.
  assert.equal((await s.send('result', {}, done.artifactId)).status, 200);
  assert.equal((await s.send('result', {}, done.artifactId, OTHER)).status, 404);
});

test('a scene whose narration overruns its window is rewritten once and narrated again', async t => {
  const s = stack(t, { fish: n => new Response(n <= 2 ? LONG : MP3) });
  const { done } = await s.generate();
  assert.equal(done.stage, 'ready', JSON.stringify(done.errors));
  assert.equal(s.calls.model.filter(c => c.tool === 'whiteboard_scene').length, 5, 'four scenes and one rewrite');
  assert.ok(s.calls.model.at(-1).content.rewrite, 'the last author call is the rewrite');
  assert.deepEqual([done.rewritten, done.corrections, s.calls.fish.length], [['s1'], 1, 10]);
});

test('two overruns of the same scene fail the job with the narration reason, refunded by key', async t => {
  const s = stack(t, { fish: () => new Response(LONG) });
  const { done } = await s.generate();
  assert.deepEqual([done.stage, done.failure.reason, done.failure.code], ['failed', 'the narration could not be made', 'narration_overrun']);
  assert.equal(s.calls.render.length, 0, 'nothing is rendered');
  assert.deepEqual(messages(s).at(-1), '"Gradient descent" was not finished: the narration could not be made. Your request and plan are kept; nothing was charged for the part that failed.');
  const refunds = rows(s.sqlite, 'usage_adjustments');
  assert.ok(refunds.length >= 1 && refunds.every(a => a.reason === 'whiteboard_failed_refund:1'));
});

test('a scene over its checks is corrected once; still failing, the job fails with the plan reason and refunds the generation key', async t => {
  const fixed = stack(t, { author: n => (n === 1 ? BAD_SCENE : SCENE) });
  const ok = await fixed.generate();
  assert.equal(ok.done.stage, 'ready');
  assert.ok(fixed.calls.model.filter(c => c.tool === 'whiteboard_scene')[1].content.correction, 'the second call carries the issues');
  const bad = stack(t, { author: () => BAD_SCENE });
  const { done } = await bad.generate();
  assert.deepEqual([done.stage, done.failure.reason, done.failure.code], ['failed', 'the plan could not be written', 'scene_unfit']);
  assert.equal(bad.calls.model.filter(c => c.tool === 'whiteboard_scene').length, 2);
  assert.equal(bad.calls.fish.length, 0);
  const generation = rows(bad.sqlite, 'usage_actions').find(a => a.client_key === done.actionKey);
  const refunded = rows(bad.sqlite, 'usage_adjustments');
  assert.ok(refunded.length === 2 && refunded.every(a => a.action_id === generation.action_id), 'both author calls given back, the plan call kept');
});

// Owner try 2026-11-05: a scene whose author reply stopped at max_tokens. No retry: the job fails, and every generation call is given back.
test('an author reply cut at max_tokens ends the job with output_limit and the plan reason, refunded by the generation key; the scene is recorded', async t => {
  const s = stack(t, { author: n => (n === 2 ? { cut: true } : SCENE) });
  const { done } = await s.generate();
  assert.deepEqual([done.stage, done.failure.code, done.failure.reason], ['failed', 'output_limit', 'the plan could not be written']);
  assert.equal(s.calls.model.filter(c => c.tool === 'whiteboard_scene').length, 2, 'no retry of the cut call');
  assert.ok(s.calls.model.filter(c => c.tool === 'whiteboard_scene').every(c => c.maxTokens === 8000));
  assert.deepEqual([done.errors.at(-1).code, done.errors.at(-1).sceneId], ['output_limit', 's2']);
  const generation = rows(s.sqlite, 'usage_actions').find(a => a.client_key === done.actionKey);
  const paid = rows(s.sqlite, 'usage_attempts').filter(a => a.action_id === generation.action_id);
  const refunds = rows(s.sqlite, 'usage_adjustments');
  assert.equal(paid.length, 2, 'both author calls were billed');
  assert.deepEqual([refunds.length, refunds.every(a => a.action_id === generation.action_id && a.reason === 'whiteboard_failed_refund:1')], [2, true]);
  assert.equal(refunds.reduce((n, a) => n + a.micros, 0), -paid.reduce((n, a) => n + a.cost_micros, 0));
  assert.equal(rows(s.sqlite, 'messages').map(m => m.content).at(-1), '"Gradient descent" was not finished: the plan could not be written. Your request and plan are kept; nothing was charged for the part that failed.');
});

test('a Fish failure fails the job with the narration reason; a renderer that lost the render twice with the drawing reason', async t => {
  const fish = stack(t, { fish: () => new Response('no', { status: 500 }) });
  const f = await fish.generate();
  assert.deepEqual([f.done.stage, f.done.failure.reason], ['failed', 'the narration could not be made']);
  const lost = stack(t, { render: ({ method, path }) => (path.startsWith('/whiteboard/c') ? new Response('{}', { status: 404 }) : path.startsWith('/render/by-key/') ? new Response('{}', { status: 404 }) : null) });
  const l = await lost.generate();
  assert.deepEqual([l.done.stage, l.done.failure.reason, l.done.failure.code], ['failed', 'the drawing could not be rendered', 'render_lost']);
  assert.deepEqual(lost.calls.render.filter(r => r.method === 'POST').map(r => r.key), [`${l.id}:1:0`, `${l.id}:1:0:r1`]);
  const old = stack(t, { render: ({ path }) => (path === '/health' ? Response.json({ whiteboard: 'whiteboard-renderer-0' }) : null) });
  const o = await old.generate();
  assert.deepEqual([o.done.failure.code, old.calls.render.filter(r => r.method === 'POST').length], ['renderer_version', 0]);
  assert.ok(rows(old.sqlite, 'usage_adjustments').length >= 12, 'every author and Fish call of the failed generation is given back');
});

test('cancel: before Generate it ends the job and frees the slot, twice is a no-op; after Generate it is refused and the job goes on', async t => {
  const s = stack(t);
  const { body } = await s.send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain gradient descent.' });
  const waiting = await s.run(body.job.id);
  const first = await s.send('cancel', {}, body.job.id), again = await s.send('cancel', {}, body.job.id);
  assert.deepEqual([first.status, first.body.job.stage, again.status, again.body.job.stage], [200, 'cancelled', 200, 'cancelled']);
  assert.equal((await s.send('approve', { proposal: s.proposal(waiting.id) }, waiting.id)).body.code, 'plan_stale', 'a cancelled job cannot be generated');
  assert.equal((await s.send('create', { requestId: 'req-00000002', cardId: 'card-0001', prompt: 'Explain momentum.' })).status, 202, 'the card is free again');
  const g = stack(t);
  const { body: made } = await g.send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain gradient descent.' });
  await g.run(made.job.id);
  await g.send('approve', { proposal: g.proposal(made.job.id) }, made.job.id);
  const refused = await g.send('cancel', {}, made.job.id);
  assert.deepEqual([refused.status, refused.body.code], [409, 'generation_started']);
  assert.equal((await g.run(made.job.id)).stage, 'ready');
  assert.equal((await g.send('cancel', {}, made.job.id, OTHER)).status, 404);
});

test('restart while a Fish call is out: it is never sent again and its expired lease fails the job with the narration reason', async t => {
  let release;
  const held = new Promise(r => { release = r; });
  const s = stack(t, { fish: n => (n === 1 ? held.then(() => new Response(MP3)) : new Response(MP3)) });
  const { body } = await s.send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain gradient descent.' });
  await s.run(body.job.id);
  await s.send('approve', { proposal: s.proposal(body.job.id) }, body.job.id);
  while (s.stored(body.job.id).stage !== 'narrating') await s.actor.alarm();
  const out = s.actor.alarm();
  while (!s.stored(body.job.id).inFlight) await new Promise(r => setTimeout(r, 1));
  const after = new WhiteboardJobs(s.state, s.env);
  await after.alarm();
  assert.equal(s.calls.fish.length, 1, 'inside the lease nothing is resent');
  s.state.data.set(`job:${body.job.id}`, { ...s.stored(body.job.id), inFlight: { ...s.stored(body.job.id).inFlight, until: 0 } });
  await after.alarm();
  release(); await out;
  const j = s.stored(body.job.id);
  assert.deepEqual([j.stage, j.failure.reason, j.calls.find(c => c.role === 'fish').status, s.calls.fish.length], ['failed', 'the narration could not be made', 'unknown', 1]);
});

test('asset route: owner only, ranges, 416, HEAD, the download name; a failed job\'s leftovers are swept after 24 h', async t => {
  const s = stack(t);
  const { done } = await s.generate();
  const env = { ...s.env, WHITEBOARD_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) } };
  const as = who => ({ authorize: async (req, env_, app) => (app === BOARD.app ? { org: who.org, email: who.email, name: app } : Response.json({ error: 'App required' }, { status: 400 })) });
  const asset = (query, headers = {}, method = 'GET', who = OWNER) => whiteboardRoute('/api/learn/whiteboard/assets', new Request(`https://dev.test/api/learn/whiteboard/assets?${query}`, { method, headers }), env, as(who));
  const q = `app=${BOARD.app}&artifact=${done.artifactId}`;
  const full = await asset(`${q}&kind=final`);
  assert.deepEqual([full.status, full.headers.get('content-type'), full.headers.get('cache-control'), full.headers.get('accept-ranges'), full.headers.get('content-length')], [200, 'video/mp4', 'private, max-age=3600', 'bytes', '5']);
  const part = await asset(`${q}&kind=final`, { range: 'bytes=1-2' });
  assert.deepEqual([part.status, part.headers.get('content-range'), [...new Uint8Array(await part.arrayBuffer())]], [206, 'bytes 1-2/5', [0, 0]]);
  const past = await asset(`${q}&kind=final`, { range: 'bytes=9-12' });
  assert.deepEqual([past.status, past.headers.get('content-range')], [416, 'bytes */5']);
  const head = await asset(`${q}&kind=final`, {}, 'HEAD');
  assert.deepEqual([head.status, head.headers.get('content-length'), head.headers.get('etag') !== null], [200, '5', true]);
  const download = await asset(`${q}&kind=final&download=1`);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="Gradient descent.mp4"');
  assert.equal((await asset(`${q}&kind=captions`)).headers.get('content-type'), 'text/vtt');
  assert.equal((await asset(`${q}&kind=final`, {}, 'GET', OTHER)).status, 404, 'another learner gets nothing');
  assert.equal((await asset(`${q}&kind=source`)).status, 404);
  assert.equal((await asset(`app=${BOARD.app}&artifact=wa_${'0'.repeat(32)}&kind=final`)).status, 404);
  // The sweep: a failed generation's checkpoints go after 24 h; a ready video's files stay.
  const f = stack(t, { fish: () => new Response(LONG) });
  const failed = (await f.generate()).done;
  const prefix = `learn-whiteboard/acme/canvas-a/main/${failed.artifactId}/`;
  assert.ok([...f.media.data.keys()].some(k => k.startsWith(prefix)));
  f.state.data.set(`job:${failed.id}`, { ...failed, endedAt: Date.now() - ORPHAN_MS - 1 });
  await f.actor.alarm();
  assert.deepEqual([[...f.media.data.keys()].filter(k => k.startsWith(prefix)).length, f.stored(failed.id).swept], [0, true]);
});
