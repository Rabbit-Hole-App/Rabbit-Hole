// codebase_index as a tool (codebase-index-spec.md section 3): the research loop and the chat's tool loop read the stored layer free, build it inside what the turn has left, and count the
// build against the turn's cap; search_code falls back to per-term matching when the whole phrase matches nothing. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { taskboard } from './learn-codebase-fixtures.js';
import { scripted, toolUse } from './learn-section-fixture.js';
import { SUBMIT_OVERVIEW_TOOL, codebaseIndexTool, indexGet } from '../src/learn-index.js';
import { CODEBASE_INDEX_TOOL, LAYERS } from '../src/learn-index-layers.js';
import { newTurn, researchTool, researchToolDefs, sectionTurn } from '../src/learn-section-research.js';
import { REPOSITORY_TOOLS, repositoryTool } from '../src/repository-context.js';
import { projectRepository } from '../src/canvases.js';
import { composeTutorPrompt } from '../src/tutor-prompt.js';

const OVERVIEW = {
  summary: 'A small task board that lists tasks and shows how many are finished.',
  options: [{ id: 'progress-number', label: 'Where the finished share comes from', what: 'How the share of finished tasks is worked out from the list.', anchors: ['src/progress.js'], kind: 'algorithm' }],
  cannot: [],
};
function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t), stored = new Map(), snapshot = taskboard('v1');
  const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', LEARN_DB, REPOSITORY_SNAPSHOTS: { get: async key => (stored.has(key) ? { json: async () => JSON.parse(stored.get(key)) } : null), put: async (key, value) => stored.set(key, value) } };
  return { env, sqlite, stored, snapshot, repo: { repo: snapshot.repo, commit: snapshot.commit } };
}

test('the tool is offered with exactly the layers that are built', () => {
  assert.deepEqual(LAYERS, ['overview']);
  assert.deepEqual(CODEBASE_INDEX_TOOL.input_schema.properties.layer.enum, LAYERS);
  assert.deepEqual(researchToolDefs(['read_source', 'codebase_index']).map(d => d.name), ['read_source', 'codebase_index']);
  assert.match(CODEBASE_INDEX_TOOL.description, /Stored; a repeat call costs nothing\./);
});

test('a stored layer is read free; a missing one is built once with the turn\'s model and counted in the turn; the next call is free', async t => {
  const f = setup(t), callModel = scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW)), turn = newTurn(), ctx = { env: f.env, snapshot: f.snapshot, turn, deps: { callModel } };
  const built = JSON.parse((await researchTool('codebase_index', { layer: 'overview' }, ctx)).content[0].text);
  assert.equal(built.summary, OVERVIEW.summary);
  assert.equal(callModel.calls.length, 1);
  assert.ok(turn.extraUsd > 0, 'the build is counted against the turn');
  const spent = turn.extraUsd, again = JSON.parse((await researchTool('codebase_index', { layer: 'overview' }, { ...ctx, deps: { callModel: scripted() } })).content[0].text);
  assert.deepEqual([again.summary, turn.extraUsd], [OVERVIEW.summary, spent], 'no model call, no cost');
  await assert.rejects(() => researchTool('codebase_index', { layer: 'topic' }, ctx), /layer must be one of overview/);
});

test('with too little of the turn left it does not build; a layer being built answers building', async t => {
  const f = setup(t), callModel = scripted();
  await assert.rejects(() => codebaseIndexTool(f.env, f.snapshot, { layer: 'overview' }, { remainingUsd: 0.02, deps: { callModel } }), /Not enough of this turn's budget is left/);
  assert.equal(callModel.calls.length, 0);
  assert.deepEqual(f.sqlite.prepare('SELECT count(*) n FROM repository_index').get().n, 0, 'nothing was claimed');
  f.sqlite.prepare("INSERT INTO repository_index(repo,commit_sha,layer,scope,storage_key,status) VALUES(?,?,'overview','','k','building')").run(f.repo.repo, f.repo.commit);
  const out = await codebaseIndexTool(f.env, f.snapshot, { layer: 'overview' }, { remainingUsd: 0.5, deps: { callModel } });
  assert.equal(out.value.status, 'building');
  assert.equal(callModel.calls.length, 0);
});

test('the turn that asked counts the build: a research turn that calls codebase_index then submits is over its cap when the build and its own calls pass it', async t => {
  const f = setup(t), SUBMIT = { name: 'submit_x', description: 'x', input_schema: { type: 'object', properties: {} } };
  const outer = scripted(toolUse('codebase_index', { layer: 'overview' }, 'c1'), toolUse('submit_x', {}, 's1'));
  const inner = scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW));
  const ctx = { env: f.env, snapshot: f.snapshot, turn: newTurn(), deps: { callModel: inner } };
  const out = await sectionTurn(f.env, { composed: composeTutorPrompt({ task: 'learn-index', use: 'learn_concept' }), user: 'x', submit: SUBMIT, research: ['codebase_index'], ctx, validate: () => ({ value: 1 }), capUsd: 0.15, callModel: outer, maxResearchSteps: 2 });
  assert.equal(out.ok, 1);
  assert.ok(ctx.turn.extraUsd > 0 && ctx.remainingUsd > 0 && ctx.remainingUsd < 0.15, 'the loop tells the tool what is left');
  assert.equal(outer.calls[1].body.messages[2].content[0].tool_use_id, 'c1', 'the model read the index and went on');
  const tight = setup(t), starved = await sectionTurn(tight.env, { composed: composeTutorPrompt({ task: 'learn-index', use: 'learn_concept' }), user: 'x', submit: SUBMIT, research: ['codebase_index'],
    ctx: { env: tight.env, snapshot: tight.snapshot, turn: { ...newTurn(), extraUsd: 0.5 }, deps: { callModel: scripted() } }, validate: () => ({ value: 1 }), capUsd: 0.15, callModel: scripted(), maxResearchSteps: 2 });
  assert.equal(starved.failed, 'over_cap', 'what an earlier build cost is part of the turn');
});

test('the chat on a repository canvas has the tool: the stored overview comes back, built on first use', async t => {
  const f = setup(t), first = f.snapshot;
  f.sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ws','repo-x','ana@test','${first.repo}','main','${first.commit}','ready');`);
  f.stored.set('snap', JSON.stringify(first));
  f.sqlite.prepare('INSERT OR IGNORE INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,?,?)').run(first.commit, 'snap');
  const repository = await projectRepository(f.env, { project: 'repo-x', org: 'ws', email: 'ana@test', title: 'T' });
  assert.deepEqual(repository.tools.map(tool => tool.name), [...REPOSITORY_TOOLS.map(tool => tool.name), 'codebase_index']);
  await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: first, deps: { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW)) } });
  assert.equal((await repository.runTool('codebase_index', { layer: 'overview' })).summary, OVERVIEW.summary);
  assert.equal((await repository.runTool('get_repo_overview', {})).repo, first.repo, 'the repository tools are unchanged');
});

test('search_code: the whole phrase first as before; when nothing holds it, the lines holding the most of its words come first', () => {
  const snapshot = taskboard('v1'), search = query => repositoryTool(snapshot, 'search_code', { query });
  const phrase = search('progress');
  assert.ok(phrase.matches.length > 0 && !('method' in phrase), 'a hit on the phrase is unchanged');
  const none = search('zzqqxx qqzzyy');
  assert.deepEqual(none.matches, [], 'words that are nowhere still find nothing');
  const word = Object.values(snapshot.files).join('\n').match(/[A-Za-z]{5,}/)[0].toLowerCase(), terms = `${word} zzqqxx`;
  const fallback = search(terms);
  assert.ok(fallback.matches.length > 0 && /No line held the whole phrase/.test(fallback.method), 'one of the words is enough to find lines');
  const two = ['filter', 'tasks'], any = search(`${two[0]} ${two[1]} notthere`);
  if (any.matches.length > 1) {
    const score = m => two.filter(w => m.text.toLowerCase().includes(w)).length;
    assert.ok(any.matches.every((m, i, all) => i === 0 || score(all[i - 1]) >= score(m)), 'most words first');
  }
  assert.deepEqual(search('zzqqxx'), { nodes: [], matches: [] }, 'a one-word query with no hit keeps its own answer, with no method note');
});
