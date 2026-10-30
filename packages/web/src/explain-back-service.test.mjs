// useExplainBackService (EB-04.3): the card's durable attempt store. Bundled with esbuild over the one-component React
// stand-in (fake-react-hooks.mjs) and a fake attempts route; no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { FAKE_REACT } from './fake-react-hooks.mjs';

const tick = () => new Promise(done => setImmediate(done));
const settle = async () => { for (let i = 0; i < 30; i++) await tick(); };

const dir = mkdtempSync(join(tmpdir(), 'eb-service-')), outfile = join(dir, 'service.cjs');
await esbuild.build({
  stdin: { contents: "export * from './explain-back-service.js'; export { mount } from 'react';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'fake-react', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fake-react' }));
    build.onLoad({ filter: /.*/, namespace: 'fake-react' }, () => ({ contents: FAKE_REACT, loader: 'js' }));
  } }],
});
const S = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// The attempts route as the service sees it. lose: submission keys whose first save lands but whose answer is lost.
// review: the stored review every assessment carries (absent: none, as the older tests had).
function server({ lose = [], review = null } = {}) {
  const attempts = [], calls = [], byKey = new Map();
  globalThis.fetch = async (path, options = {}) => {
    const url = new URL(path, 'http://local'), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, path: url.pathname, body });
    const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url.pathname.endsWith('/bind')) return reply({ activityId: 'act', activityRevision: 1, goalId: 'g' });
    if (method === 'GET' && url.searchParams.has('cardId')) return reply({ attempts: attempts.slice().reverse().map(a => ({ attemptId: a.attemptId })) });
    if (method === 'GET') { const a = attempts.find(x => url.pathname.endsWith(x.attemptId)); return reply({ attempt: { submittedContent: a.content }, assessment: a.assessment }); }
    const held = byKey.get(body.submissionKey);
    if (held && JSON.stringify(held.content) !== JSON.stringify(body.submittedContent)) return reply({ error: 'submission_key_conflict' }, 409);
    if (!held) { const a = { attemptId: `a${attempts.length + 1}`, content: body.submittedContent, assessment: { assessmentId: `s${attempts.length + 1}`, status: 'completed', ...(review ? { provenance: { review } } : {}) } }; attempts.push(a); byKey.set(body.submissionKey, a); }
    if (lose.includes(calls.filter(c => c.method === 'POST' && !c.path.endsWith('/bind')).length)) return reply({ error: 'attempts_unavailable' }, 503);
    return reply({ attempt: { attemptId: byKey.get(body.submissionKey).attemptId } });
  };
  return { attempts, calls };
}

const block = { id: 'card-1', prompt: 'Why does the pendulum slow?', expects: ['friction'] };

test('a lost response replays the same key (one attempt); a revision pins the parent and its completed review', async () => {
  const { attempts, calls } = server({ lose: [1] });
  const hook = S.mount(props => S.useExplainBackService(props), { app: 'demo', board: 'main', enabled: true });
  assert.equal(hook.current.card(block.id), null, 'loading first');
  await settle();
  assert.deepEqual(hook.current.card(block.id).attempts, []);
  await assert.rejects(hook.current.submit({ block, text: 'air drag' }), /saving is unavailable/);
  await hook.current.submit({ block, text: 'air drag' });
  assert.equal(attempts.length, 1, 'the replay found the saved attempt instead of saving twice');
  await settle();
  await hook.current.submit({ block, text: 'air drag and pivot friction', parentAttemptId: 'a1' });
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1].content.baseline, { parentAttemptId: 'a1', parentAssessmentId: 's1' });
  assert.equal(calls.filter(c => c.path.endsWith('/bind')).length, 1, 'the card is bound once');
  await settle();
  assert.deepEqual(hook.current.card(block.id).attempts.map(a => a.attemptId), ['a1', 'a2'], 'oldest first');
});

test('an edited answer after a lost response gets a fresh key; a sketch without the asset store is refused, not sent as text', async () => {
  const { attempts } = server({ lose: [1] });
  const hook = S.mount(props => S.useExplainBackService(props), { app: 'demo', board: 'main', enabled: true });
  await settle();
  await assert.rejects(hook.current.submit({ block, text: 'first' }));
  await hook.current.submit({ block, text: 'first, edited' });
  assert.deepEqual(attempts.map(a => a.content.text), ['first', 'first, edited']);
  await assert.rejects(hook.current.submit({ block, text: 'x', sketch: { image: 'data:image/png;base64,AA' } }), /Sketch answers are not available/);
  assert.equal(attempts.length, 2);
});

test('off unless enabled and a board is known', () => {
  const hook = S.mount(props => S.useExplainBackService(props), { app: 'demo', board: 'main', enabled: false });
  assert.equal(hook.current, null);
});

test('teaching aids (FX-EB-05): the canvas\'s existing teaching cards go with the submission; Open on canvas only reveals them', async () => {
  const review = { teachingAids: [{ cardId: 'exp-1', title: 'Centripetal force', kind: 'explanation', reason: 'It shows why the force points inward.' }] };
  const { calls } = server({ review });
  const blocks = [
    { id: 'exp-1', type: 'explanation', title: 'Centripetal force' },
    { id: 'quiz-1', type: 'quiz', title: 'Not teaching material' },
    { id: 'pending', type: 'animation', title: 'Still generating', scene: null },
    { id: 'nb-1', type: 'notebook', active_path: 'orbit.ipynb' },
    { id: block.id, type: 'challenge', title: 'The Explain-back card itself' },
  ];
  const focused = [];
  const canvasApi = { current: { blocks: () => blocks, block: id => blocks.find(b => b.id === id) || null, focusBlock: id => focused.push(id) } };
  const hook = S.mount(props => S.useExplainBackService(props), { app: 'demo', board: 'main', enabled: true, canvasApi });
  await settle();
  await hook.current.submit({ block, text: 'the force points outward' });
  const sent = calls.find(c => c.method === 'POST' && !c.path.endsWith('/bind')).body;
  assert.deepEqual(sent.teachingCards, [{ id: 'nb-1', title: 'orbit.ipynb', kind: 'notebook' }, { id: 'exp-1', title: 'Centripetal force', kind: 'explanation' }], 'newest first; teaching kinds only; never the card itself or a card still being made');
  assert.equal(sent.submittedContent.teachingCards, undefined, 'not part of the saved answer');
  await settle();
  const [aid] = hook.current.teachingAids('a1');
  assert.deepEqual(aid, { id: 'exp-1', cardId: 'exp-1', title: 'Centripetal force', kind: 'explanation', reason: 'It shows why the force points inward.', available: true });
  const before = calls.length;
  assert.equal(hook.current.openTeachingAid(aid), true);
  assert.equal(hook.current.openTeachingAid(aid), true);
  assert.deepEqual(focused, ['exp-1', 'exp-1'], 'the same existing card each time');
  assert.equal(calls.length, before, 'opening makes no request: no model call, no new card');
  blocks.splice(0, 1);
  assert.equal(hook.current.teachingAids('a1')[0].available, false, 'a removed card shows unavailable');
  assert.equal(hook.current.openTeachingAid(aid), false);
  assert.deepEqual(hook.current.teachingAids('unknown'), []);
});
