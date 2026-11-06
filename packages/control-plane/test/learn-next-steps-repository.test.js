// repo-graph Release 1 (brief sections 10-12): Curious grounded in the canvas's repository, and the Chat's repository follow-ups.
// node:sqlite LEARN_DB (learn-grade-fixture.js); the planner is the keyless fixture or a scripted callModel; no network, no R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { DIGEST_LIMITS, curiousRepository, ownedCacheKey, repositoryDigest } from '../src/learn-next-steps-routes.js';
import { NEXT_STEPS_LIMITS, NEXT_STEPS_SYSTEM, withRepository } from '../src/agents/learn-next-steps.js';
import { ANSWER_META_REPOSITORY, ANSWER_META_SYSTEM, answerMetaSystem } from '../src/chat-answer-meta.js';

const BLANK = { mode: 'canvas', basis: 'nb_blank', goal: '', canvas: { blocks: [] }, scope: { concepts: {}, claims: {} }, recent: { intent: null, transitions: [], modalities: [], practice: [] }, previous: { hooks: [], goals: [] }, constraints: { learner: [] } };
const CARDS = { ...BLANK, basis: 'nb_cards', canvas: { blocks: [{ id: 'b1', kind: 'Explanation', title: 'Tides and the moon', concept_ids: [], claim_ids: [], practice: null }] } };
// A snapshot shaped as the indexer writes it: files, graph nodes and edges (get_repo_overview ranks symbols by degree).
const SNAPSHOT = {
  repo: 'someone/tidal', commit: 'c0ffee1', skipped: [],
  files: { 'README.md': `# Tidal\n${'Harmonic analysis of tide gauges. '.repeat(80)}`, 'pkg/README.md': 'inner readme', 'tidal/fit.py': 'def fit(): pass', 'tidal/constituents.py': 'M2 = 1' },
  graph: {
    nodes: [...Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: `symbol_${i}`, path: `tidal/mod_${i}.py` })), { id: 'fit', label: 'fit', path: 'tidal/fit.py' }],
    edges: Array.from({ length: 20 }, (_, i) => ({ source: 'fit', target: `n${i}`, relation: 'calls', confidence: 'EXTRACTED' })),
  },
};
const ROW = { id: 7, org: 'team', name: 'repo-0a1b2c3d-tidal', owner_email: 'maker@test', repo: 'someone/tidal', branch: 'main', commit_sha: 'c0ffee1', status: 'ready', kind: 'repository' };

function world(t, { repository = null, load = async () => SNAPSHOT } = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const store = new Map(), cache = { match: async key => store.get(key)?.clone(), put: async (key, response) => { store.set(key, response); } };
  const env = { LEARN_DB, SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures' };
  const who = { org: 'team', email: 'maker@test', user_id: 'u-maker-1' }, inputs = [], loads = [];
  // A scripted planner that records the input it was asked with and answers the keyless fixture's set.
  const callModel = async (_env, body) => {
    const input = JSON.parse(body.messages.at(-1).content.slice('input = '.length));
    inputs.push(input);
    const { fixtureFor } = await import('../src/learn-journey-fixtures.js');
    return Response.json({ model: 'fixture', content: [{ type: 'tool_use', name: 'suggest_next_steps', input: fixtureFor('suggest_next_steps', input) }] });
  };
  const post = (body, deps = {}) => tutorRoute('/api/learn/tutor/next-steps', new Request('https://dev.test/api/learn/tutor/next-steps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env,
    { authorize: async () => ({ ...who, app: body.app }), cache, callModel, repositoryOf: async () => repository, loadSnapshot: async (...args) => { loads.push(args[2]); return load(...args); }, ...deps });
  return { sqlite, env, store, post, inputs, loads };
}

test('the digest is bounded, reads the shallowest README and the most connected symbols, and is memoised per repository and commit', async () => {
  let reads = 0;
  const load = async () => { reads += 1; return SNAPSHOT; };
  const digest = await repositoryDigest({}, { ...ROW, id: 101 }, { load });
  assert.ok(digest.readme.startsWith('# Tidal'), 'the repository README, not a package one');
  assert.ok(digest.readme.length <= DIGEST_LIMITS.readme);
  assert.ok(digest.files.length <= DIGEST_LIMITS.files && digest.symbols.length <= DIGEST_LIMITS.symbols);
  assert.equal(digest.symbols[0], 'fit', 'the most connected symbol first');
  assert.deepEqual([digest.repo, digest.commit], ['someone/tidal', 'c0ffee1']);
  await repositoryDigest({}, { ...ROW, id: 101 }, { load });
  assert.equal(reads, 1, 'the same commit is read once per isolate');
  await repositoryDigest({}, { ...ROW, id: 101, commit_sha: 'beef002' }, { load });
  assert.equal(reads, 2, 'a new commit is read again');
});

test('withRepository keeps the input under input_chars, trimming only the repository, symbols first', () => {
  const digest = { repo: 'someone/tidal', commit: 'c0ffee1', readme: 'r'.repeat(1500), files: Array.from({ length: 8 }, (_, i) => `f${i}.py`), symbols: Array.from({ length: 12 }, (_, i) => `s${i}`) };
  const roomy = withRepository(BLANK, digest);
  assert.deepEqual(roomy.repository, digest, 'a small canvas keeps the whole digest');
  assert.equal(BLANK.repository, undefined, 'the browser input is never mutated');
  const big = { ...CARDS, canvas: { blocks: [{ ...CARDS.canvas.blocks[0], text: 'x'.repeat(NEXT_STEPS_LIMITS.input_chars - 1600 - JSON.stringify(CARDS).length) }] } };
  const tight = withRepository(big, digest);
  assert.ok(JSON.stringify(tight).length <= NEXT_STEPS_LIMITS.input_chars);
  assert.deepEqual(tight.canvas, big.canvas, 'the live canvas is never trimmed for the repository');
  assert.equal(tight.repository.symbols.length, 0, 'symbols leave first');
  const full = { ...CARDS, canvas: { blocks: [{ ...CARDS.canvas.blocks[0], text: 'x'.repeat(NEXT_STEPS_LIMITS.input_chars - JSON.stringify(CARDS).length - 20) }] } };
  assert.equal(withRepository(full, digest).repository, undefined, 'a canvas already at the cap plans without the repository');
});

test('the cache key changes with the repository commit and keeps earlier keys for a canvas with none', async () => {
  const access = { user_id: 'u1', email: 'e@x' }, body = { app: 'repo-0a1b2c3d-tidal', input: BLANK };
  const plain = await ownedCacheKey(access, body);
  assert.equal(await ownedCacheKey(access, body, undefined, null), plain);
  assert.notEqual(await ownedCacheKey(access, body, undefined, '7@c0ffee1'), plain);
  assert.notEqual(await ownedCacheKey(access, body, undefined, '7@c0ffee1'), await ownedCacheKey(access, body, undefined, '7@beef002'));
});

test('curiousRepository: a repository Main canvas is its own row; a project canvas reads only its owner\'s untrashed project', async t => {
  const { sqlite, LEARN_DB } = learnDb(t), env = { LEARN_DB };
  sqlite.prepare('INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(?,?,?,?,?,?,?,?)').run(7, 'team', 'repo-0a1b2c3d-tidal', 'maker@test', 'someone/tidal', 'main', 'c0ffee1', 'ready');
  assert.equal(await curiousRepository(env, ROW), ROW);
  assert.equal((await curiousRepository(env, { org: 'team', email: 'maker@test', project: 'repo-0a1b2c3d-tidal' })).repo, 'someone/tidal');
  assert.equal(await curiousRepository(env, { org: 'team', email: 'other@test', project: 'repo-0a1b2c3d-tidal' }), null, 'another person\'s project');
  assert.equal(await curiousRepository(env, { org: 'other', email: 'maker@test', project: 'repo-0a1b2c3d-tidal' }), null, 'another workspace');
  assert.equal(await curiousRepository(env, { org: 'team', email: 'maker@test', name: 'canvas-0a1b2c3d' }), null, 'a canvas with no project');
  sqlite.prepare('INSERT INTO library_trash(org,name,trashed_at) VALUES(?,?,?)').run('team', 'repo-0a1b2c3d-tidal', '2026-10-15');
  assert.equal(await curiousRepository(env, { org: 'team', email: 'maker@test', project: 'repo-0a1b2c3d-tidal' }), null, 'a project in Trash');
});

test('owned route: a repository canvas plans with its digest; a blank one still being read is refused with no model call', async t => {
  const w = world(t, { repository: ROW });
  const done = await w.post({ app: ROW.name, input: BLANK });
  assert.equal(done.status, 200, await done.clone().text());
  assert.equal(w.inputs.length, 1);
  assert.equal(w.inputs[0].repository.repo, 'someone/tidal');
  assert.ok(w.inputs[0].repository.readme && w.inputs[0].repository.symbols.includes('fit'), 'readme and symbols reach the planner');
  assert.ok((await done.json()).options.some(o => /symbol|fit/.test(o.hook)), 'the fixture grounds a blank canvas in the repository');
  const reading = world(t, { repository: { ...ROW, commit_sha: null, status: 'indexing' } });
  const refused = await reading.post({ app: ROW.name, input: BLANK });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).repository, 'unread');
  assert.equal(reading.inputs.length, 0, 'nothing invented, nothing paid');
  const withCards = await reading.post({ app: ROW.name, input: CARDS });
  assert.equal(withCards.status, 200, 'cards on the canvas still plan');
  assert.deepEqual(reading.inputs[0].repository, { repo: 'someone/tidal', status: 'unread' }, 'no repository content while it is unread');
});

test('owned route: a snapshot that will not load plans without it and is not cached under the commit', async t => {
  const w = world(t, { repository: { ...ROW, id: 909 }, load: async () => { throw new Error('Repository snapshot unavailable'); } });
  assert.equal((await w.post({ app: ROW.name, input: BLANK })).status, 409, 'a blank canvas has nothing else to plan from');
  assert.equal((await w.post({ app: ROW.name, input: CARDS })).status, 200);
  assert.equal(w.inputs[0].repository.status, 'unread');
  assert.equal(w.store.size, 0, 'the next ask reads the snapshot again');
});

test('the planner prompt asks for technical ideas behind the code, never code navigation, with the canvas leading', () => {
  assert.match(NEXT_STEPS_SYSTEM, /technical ideas behind what this code implements/);
  assert.match(NEXT_STEPS_SYSTEM, /Never a code-navigation question/);
  assert.match(NEXT_STEPS_SYSTEM, /never a topic restriction/);
  assert.match(NEXT_STEPS_SYSTEM, /repository\.status unread/);
});

test('answer_meta repository guidance rides only on repository chats', () => {
  assert.equal(answerMetaSystem(), ANSWER_META_SYSTEM);
  assert.equal(answerMetaSystem({ repository: false }), ANSWER_META_SYSTEM);
  assert.ok(answerMetaSystem({ repository: true }).startsWith(ANSWER_META_SYSTEM));
  assert.ok(answerMetaSystem({ repository: true }).endsWith(ANSWER_META_REPOSITORY));
  assert.match(ANSWER_META_REPOSITORY, /investigate its implementation/);
  assert.match(ANSWER_META_REPOSITORY, /never invent a file/);
});
