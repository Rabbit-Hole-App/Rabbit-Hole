// packages/control-plane/test/learn-codebase-source-map.test.js
// Tutor Task 12 (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase"): the five codebase goals, the bounded learning
// source map over the existing repository tools, the relevance gate, and source drift. Two invented repositories
// (learn-codebase-fixtures.js): TaskBoard (JavaScript, src/server/test) and Ledger (a Python package with tests/ and docs/).
// node:sqlite LEARN_DB with the whole learn schema (0025 coaching, 0026 attempts); the snapshot store is a stub; the
// repository tools are the real ones; no model is reachable and nothing is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { COMMITS, INJECTED, SECRET_VALUE, ledger, taskboard } from './learn-codebase-fixtures.js';
import { buildLearningSourceMap, codebaseActivity, codebaseRoute, learningSourceMap, sourceDrift, symbolEnd } from '../src/learn-codebase-source-map.js';
import { CODEBASE_GOALS, EVIDENCE_LABEL, NOT_RUN_NOTE, QUESTION_LABEL, citationRef, goalOf, repositoryRelevance, showCodebaseMenu, snapshotIndex } from '../../web/src/learn-codebase-goals.js';
import { HANDOFF_CAPABILITIES } from '../src/learn-tutor-handoff.js';
import { repositoryTool } from '../src/repository-context.js';
import { acceptAttempt } from '../src/learn-attempt-store.js';
import { readCoachingState } from '../src/learn-coaching-store.js';
import { canvasApp } from '../src/canvases.js';
import { sha256Hex } from '../src/learn-grade-jev.js';

const CANVAS = 'canvas-0000aaaa', PLAIN = 'canvas-0000bbbb';
const ACTOR = { org: 'ws', userId: 'u-ana', app: CANVAS, board: 'main' };
const ISSUE = 'Why does progress show 0% after completing one task?';
// What a learner might answer to each goal's clarifying question, per repository. Prepare to contribute asks nothing.
const FOCUS = {
  'example/taskboard': { understand_feature: 'the completion indicator', debug_behavior: ISSUE, make_change: 'round the percentage to one decimal', prepare_contribute: '', learn_concept: 'derived state in the completion percentage' },
  'example/ledger': { understand_feature: 'the monthly total', debug_behavior: 'monthly_total drops the cents', make_change: 'add a yearly total report', prepare_contribute: '', learn_concept: 'dataclasses for parsed entries' },
};

// A learner's project canvas on a repository import, its snapshots in the store, and the route with an injected authorize.
function setup(t, first = taskboard('v1')) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const stored = new Map(), batches = [], fetches = [];
  const env = {
    SMALL_ENV: 'test',
    LEARN_DB: { prepare: sql => LEARN_DB.prepare(sql), batch: async list => { batches.push(list.length); return LEARN_DB.batch(list); } },
    REPOSITORY_SNAPSHOTS: { get: async key => (stored.has(key) ? { json: async () => structuredClone(stored.get(key)) } : null) },
  };
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ws','repo-0a1b2c3d-proj','ana@test','${first.repo}','main','${first.commit}','ready');
    INSERT INTO canvases(org,name,owner_email,title,project) VALUES('ws','${CANVAS}','ana@test','Logistic Regression','repo-0a1b2c3d-proj'),('ws','${PLAIN}','ana@test','Notes',NULL);`);
  // A refresh of the import: the new commit's snapshot is stored and the project points at it.
  const publish = snapshot => {
    const key = `snap-${snapshot.commit}`;
    stored.set(key, snapshot);
    sqlite.prepare('INSERT OR IGNORE INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,?,?)').run(snapshot.commit, key);
    sqlite.prepare('UPDATE repository_apps SET commit_sha = ?, repo = ? WHERE id = 7').run(snapshot.commit, snapshot.repo);
  };
  publish(first);
  const user = { email: 'ana@test', org: 'ws', orgName: null };
  const access = name => ({ ...canvasApp(sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(name), user), user_id: 'u-ana' });
  const route = (method, body) => codebaseRoute('/api/learn/codebase', method === 'GET'
    ? new Request(`https://dev.test/api/learn/codebase?app=${body.app}&board=${body.board || 'main'}`)
    : new Request('https://dev.test/api/learn/codebase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: 'main', ...body }) }), env, { authorize: async () => access(body.app) });
  let seq = 0;
  const start = async (goal, question, extra = {}) => {
    const { revision } = await readCoachingState(env, ACTOR);
    const response = await route('POST', { app: CANVAS, action: 'start', goal, question, actionId: `start-${++seq}-${goal}`.slice(0, 120), expectedRevision: revision, ...extra });
    return { status: response.status, body: await response.json() };
  };
  const drift = async () => (await (await route('GET', { app: CANVAS })).json());
  const rows = () => Object.fromEntries(['learn_goals', 'learn_activities', 'learn_attempts', 'learn_assessments', 'learn_observations', 'learn_coaching_state']
    .map(table => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map(row => ({ ...row }))]));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { fetches.push(String(args[0])); throw new Error('no network in this test'); };
  t.after(() => { globalThis.fetch = realFetch; });
  return { env, sqlite, route, start, drift, publish, rows, batches, fetches };
}
const activityOf = (state, id = state.activeActivityId) => state.activities.find(a => a.activityId === id);
const roles = activity => activity.sourceRefs.map(ref => ref.locator.role);
const paths = activity => activity.sourceRefs.map(ref => ref.locator.path);

test('five_goals_choose_distinct_actions: each goal has its own first activity, sources and completion criterion, on two differently built repositories; a specific request skips the menu; changing goals keeps earlier work', async t => {
  // The definitions: five goals, five first activities, five completion criteria, no shared criterion.
  assert.equal(new Set(CODEBASE_GOALS.map(g => g.id)).size, 5);
  assert.equal(new Set(CODEBASE_GOALS.map(g => g.first)).size, 5);
  assert.equal(new Set(CODEBASE_GOALS.map(g => g.completion)).size, 5);
  const criteria = CODEBASE_GOALS.flatMap(g => g.criteria.map(c => c.criterionId));
  assert.equal(new Set(criteria).size, criteria.length);

  for (const snapshot of [taskboard('v1'), ledger()]) {
    const f = setup(t, snapshot), made = {};
    for (const goal of CODEBASE_GOALS) {
      const out = await f.start(goal.id, FOCUS[snapshot.repo][goal.id]);
      assert.equal(out.status, 200, `${snapshot.repo} ${goal.id}: ${JSON.stringify(out.body).slice(0, 200)}`);
      assert.equal(out.body.route, 'started', `${snapshot.repo} ${goal.id}`);
      const activity = activityOf(out.body.state);
      assert.equal(activity.checkpoint.codebase.goal, goal.id);
      assert.deepEqual(activity.criterionRefs.map(r => r.criterionId), goal.criteria.filter(c => !c.requiresTransfer).map(c => c.criterionId), 'the goal\'s own completion criteria');
      made[goal.id] = activity;
    }
    const all = Object.values(made);
    assert.equal(new Set(all.map(a => a.prompt)).size, 5, 'five different first activities');
    assert.equal(new Set(all.map(a => a.objective)).size, 5);
    // Sources follow the goal's roles, found by convention in either layout - never by a fixture's file names.
    assert.ok(roles(made.understand_feature).includes('source'));
    assert.ok(roles(made.debug_behavior).includes('source') && roles(made.debug_behavior).includes('test'), `${snapshot.repo} debug cites code and its test`);
    assert.ok(roles(made.make_change).includes('config') && roles(made.make_change).includes('source'));
    assert.deepEqual([...new Set(roles(made.prepare_contribute))].sort(), ['config', 'docs', 'test'], `${snapshot.repo} contribute starts from docs, manifest and tests`);
    assert.ok(roles(made.learn_concept).every(role => role === 'source'));
    // Changing goals pauses the earlier one; nothing is archived and each keeps its own activity.
    const state = await readCoachingState(f.env, ACTOR);
    assert.equal(state.goals.length, 5);
    assert.deepEqual(state.goals.map(g => g.status).sort(), ['active', 'paused', 'paused', 'paused', 'paused']);
    for (const goal of state.goals) assert.ok(state.activities.some(a => a.goalId === goal.goalId), 'each goal keeps its activity');
  }
  // The layouts differ, so the same goal reads different files.
  const tb = await learningSourceMap(taskboard('v1'), { goal: 'prepare_contribute' }), lg = await learningSourceMap(ledger(), { goal: 'prepare_contribute' });
  assert.deepEqual(tb.nodes.map(n => n.path).sort(), ['CONTRIBUTING.md', 'README.md', 'package.json', 'test/progress.test.js']);
  assert.deepEqual(lg.nodes.map(n => n.path).sort(), ['README.rst', 'docs/CONTRIBUTING.md', 'pyproject.toml', 'tests/test_report.py']);

  // A specific request skips the generic menu: the learner typing, or a goal already set, shows no menu.
  const entry = { kind: 'welcome' }, repository = { commit: COMMITS.v1 };
  assert.equal(showCodebaseMenu({ entry, repository }), true);
  assert.equal(showCodebaseMenu({ entry, repository, typing: true }), false, 'an explicit request skips the menu');
  assert.equal(showCodebaseMenu({ entry, repository, dismissed: true }), false, 'Learn something else');
  assert.equal(showCodebaseMenu({ entry: { kind: 'resume' }, repository }), false, 'a saved goal shows its return choices');
  assert.equal(showCodebaseMenu({ entry: { kind: 'quiet' }, repository }), false, 'Tutor Off, paused or not selected: no offer');
  assert.equal(showCodebaseMenu({ entry, repository: null }), false, 'no repository: the general welcome');
  // The draft's explicit issue begins from that issue's source.
  const f = setup(t);
  const issue = await f.start('debug_behavior', ISSUE);
  assert.ok(paths(activityOf(issue.body.state)).includes('src/progress.js'));
});

test('unrelated_topic_skips_repository: the water cycle is not about either repository; nothing is mapped, saved or read for it, and the Tutor handoff reads no source', async t => {
  for (const snapshot of [taskboard('v1'), ledger()]) {
    assert.equal(repositoryRelevance(snapshotIndex(snapshot), 'Explain the water cycle').relevant, false, snapshot.repo);
    assert.equal(repositoryRelevance(snapshotIndex(snapshot), 'How does evaporation become rain?').relevant, false, snapshot.repo);
  }
  assert.equal(repositoryRelevance(snapshotIndex(taskboard('v1')), ISSUE).relevant, true);
  assert.equal(repositoryRelevance(snapshotIndex(ledger()), 'what does monthly_total return').relevant, true);
  assert.equal(repositoryRelevance(snapshotIndex(ledger()), 'walk me through this codebase').relevant, true, 'a request about the code itself');

  // Chosen as a concept to learn through the code, an unrelated topic finds nothing: no goal, no activity, no write.
  const f = setup(t);
  await readCoachingState(f.env, ACTOR); // the learner's coaching row exists before (ensureState), as on any Tutor canvas
  const before = f.rows(), writes = f.batches.length;
  const out = await f.start('learn_concept', 'the water cycle');
  assert.equal(out.status, 200);
  assert.equal(out.body.route, 'not_found');
  assert.deepEqual(out.body.map.nodes, []);
  assert.deepEqual(f.rows(), before, 'nothing saved');
  assert.equal(f.batches.length, writes);

  // The Tutor's repository handoff (the Tutor source adapter): an unrelated request stops before any model call.
  const calls = [];
  const callModel = async (env, body) => { calls.push(body); return Response.json({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'From the code: completionPercent rounds first.' }] }); };
  const run = HANDOFF_CAPABILITIES.repository_context.run;
  const access = { org: 'ws', owner_email: 'ana@test', email: 'ana@test' };
  await assert.rejects(run(f.env, access, { app: CANVAS, request: 'Explain the water cycle', selection: null, card: null }, callModel), error => error.category === 'not_about_repository');
  assert.equal(calls.length, 0, 'no model call, so no repository material in any prompt');
  assert.equal(await run(f.env, access, { app: CANVAS, request: 'How does completionPercent compute the percentage?', selection: null, card: null }, callModel), 'From the code: completionPercent rounds first.');
  assert.equal(calls.length, 1, 'a request about the code still reaches the reader');
  assert.deepEqual(f.fetches, []);
});

test('source_map_excludes_unavailable_files: secrets, generated, vendored, minified and lock files stay out and are listed; each node carries its exact source', async t => {
  for (const snapshot of [taskboard('v1'), ledger()]) {
    for (const goal of CODEBASE_GOALS) {
      const map = await learningSourceMap(snapshot, { goal, question: FOCUS[snapshot.repo][goal.id] });
      const shown = map.nodes.map(n => n.path);
      for (const path of shown) assert.doesNotMatch(path, /node_modules\/|^dist\/|^build\/|^vendor\/|secrets|keys\.pem|package-lock/, `${snapshot.repo} ${goal.id} shows ${path}`);
      const text = JSON.stringify([map, codebaseActivity(goal, map, { focus: FOCUS[snapshot.repo][goal.id] })]);
      assert.equal(text.includes(SECRET_VALUE), false, 'a secret value never appears');
      assert.equal(text.includes('PRIVATE KEY'), false, 'a key file is never read into the map');
      for (const node of map.nodes) {
        const { sourceRef } = node, citation = map.citations.find(c => c.path === node.path);
        assert.equal(sourceRef.version, snapshot.commit, 'the exact commit');
        assert.equal(sourceRef.hash, await sha256Hex(snapshot.files[node.path]), 'the hash of the whole file at that commit');
        assert.equal(sourceRef.id, `${snapshot.repo}:${node.path}`);
        assert.deepEqual([sourceRef.locator.start, sourceRef.locator.end], [citation.start, citation.end]);
        assert.equal(citation.text, snapshot.files[node.path].split('\n').slice(citation.start - 1, citation.end).join('\n'), 'the cited lines as they are');
        assert.ok(citation.end - citation.start < 120, 'bounded by read_source');
      }
    }
  }
  const map = await learningSourceMap(taskboard('v1'), { goal: 'debug_behavior', question: ISSUE });
  const reasons = Object.fromEntries(map.omissions.map(o => [o.path, o.reason]));
  assert.deepEqual([reasons['config/secrets.json'], reasons['node_modules/left-pad/index.js'], reasons['dist/bundle.min.js'], reasons['package-lock.json'], reasons['.env'], reasons['public/logo.png'], reasons.react],
    ['secret', 'vendored', 'generated', 'lockfile', 'not_indexed', 'not_indexed', 'outside_snapshot']);
  const py = Object.fromEntries((await learningSourceMap(ledger(), { goal: 'make_change', question: 'add a yearly total report' })).omissions.map(o => [o.path, o.reason]));
  assert.deepEqual([py['ledger/keys.pem'], py['vendor/six.py'], py['build/ledger_pb2.py']], ['secret', 'vendored', 'generated']);
  // Edges the indexer read from the code are supported; the dynamic HTTP call is only inferred, so tentative.
  const edge = (from, to) => map.edges.find(e => e.from === from && e.to === to)?.status;
  assert.equal(edge('src/TaskList.jsx', 'src/progress.js'), 'supported');
  assert.equal(edge('src/api.js', 'server/tasks.js'), 'tentative');

  // The learner's selection: a generated file they chose is shown; a secret never; other commits and repositories are named.
  const ref = (commit, path, repo = 'example/taskboard') => ({ kind: 'code', sourceId: `code:${repo}@${commit}:${path}`, name: path });
  const picked = await learningSourceMap(taskboard('v1'), { goal: 'understand_feature', question: '', selectedRefs: [ref(COMMITS.v1, 'dist/bundle.min.js'), ref(COMMITS.v1, 'config/secrets.json'), ref(COMMITS.v2, 'src/progress.js'), ref(COMMITS.v1, 'a.py', 'other/repo')] });
  assert.deepEqual(picked.nodes.map(n => n.path), ['dist/bundle.min.js']);
  assert.deepEqual(picked.omissions.filter(o => ['other_commit', 'other_repository'].includes(o.reason)).map(o => o.reason), ['other_commit', 'other_repository']);

  // buildLearningSourceMap reads only a version the actor may read (repositories.js readableVersion).
  const f = setup(t);
  assert.ok(await buildLearningSourceMap(f.env, { org: 'ws', email: 'ana@test' }, { repositoryRef: 'example/taskboard', revision: COMMITS.v1, goal: 'debug_behavior', question: ISSUE }));
  assert.equal(await buildLearningSourceMap(f.env, { org: 'other', email: 'bob@test' }, { repositoryRef: 'example/taskboard', revision: COMMITS.v1, goal: 'debug_behavior', question: ISSUE }), null, 'another workspace, not confirmed public');
  f.sqlite.exec("INSERT INTO repository_visibility(app_id, visibility) VALUES (7, 'public')");
  assert.ok(await buildLearningSourceMap(f.env, { org: 'other', email: 'bob@test' }, { repositoryRef: 'example/taskboard', revision: COMMITS.v1, goal: 'debug_behavior', question: ISSUE }), 'confirmed public');
});

test('source_instruction_cannot_execute_tool: instructions planted in source are text; the map uses only the read tools, and the route saves exactly the goal and its activity', async t => {
  const used = [], spy = (snapshot, name, input) => { used.push(name); return repositoryTool(snapshot, name, input); };
  const clean = await learningSourceMap(taskboard('v1'), { goal: 'understand_feature', question: 'the completion indicator' });
  const hostile = await learningSourceMap(taskboard('v1', { inject: true }), { goal: 'understand_feature', question: 'the completion indicator' }, { tool: spy });
  assert.ok(used.includes('read_source') && used.includes('query_graph'));
  assert.ok(used.every(name => ['query_graph', 'search_code', 'read_source'].includes(name)), `only read tools: ${used}`);
  const shape = map => ({ nodes: map.nodes.map(n => [n.path, n.role]), edges: map.edges, omissions: map.omissions.map(o => [o.path, o.reason]) });
  assert.deepEqual(shape(hostile), shape(clean), 'the planted text changes nothing the map does');
  assert.ok(hostile.citations.some(c => c.text.includes(INJECTED)), 'shown as source text, nothing more');
  const activity = codebaseActivity('understand_feature', hostile, { focus: 'the completion indicator' });
  assert.equal(JSON.stringify([activity.objective, activity.prompt, activity.checkpoint]).includes('create_material'), false);

  const f = setup(t, taskboard('v1', { inject: true }));
  const before = await readCoachingState(f.env, ACTOR), writes = f.batches.length;
  const out = await f.start('understand_feature', 'the completion indicator');
  assert.equal(out.body.route, 'started');
  assert.deepEqual(Object.keys(out.body).sort(), ['activityId', 'map', 'route', 'state']);
  assert.equal(f.batches.length - writes, 2, 'two writes: the goal, then its activity');
  assert.deepEqual(out.body.state.controls, { ...before.controls, revision: out.body.state.controls.revision }, 'controls unchanged');
  assert.equal(out.body.state.goals.length, 1);
  assert.deepEqual(out.body.state.goals[0].criteria.map(c => c.criterionId), goalOf('understand_feature').criteria.map(c => c.criterionId), 'only the goal\'s own criteria');
  assert.equal(JSON.stringify(activityOf(out.body.state)).includes(INJECTED), false);
  assert.deepEqual(f.fetches, [], 'no network, no model');
});

test('relevant_drift_marks_stale_only: a changed or deleted cited file is stale, others stay current; Update makes a new activity and keeps the submitted one', async t => {
  const f = setup(t);
  const out = await f.start('understand_feature', 'the completion indicator');
  const first = activityOf(out.body.state);
  assert.deepEqual(paths(first).sort(), ['src/TaskList.jsx', 'src/progress.js', 'test/progress.test.js']);
  const attempt = await acceptAttempt(f.env, ACTOR, { activityId: first.activityId, activityRevision: first.revision, submissionKey: 'sub-progress-1', submittedContent: { text: 'It rounds 1/3 to 0, then multiplies by 100.' }, sourceRefs: [], assistanceRefs: [] });
  assert.equal((await f.drift()).activity.stale.length, 0, 'same commit: nothing stale');

  f.publish(taskboard('v2')); // progress.js fixed; nothing else changed
  const drift = (await f.drift()).activity;
  assert.equal(drift.commit, COMMITS.v2);
  assert.deepEqual(drift.stale, ['src/progress.js']);
  assert.deepEqual(Object.fromEntries(drift.items.map(i => [i.path, i.status])), { 'src/progress.js': 'changed', 'src/TaskList.jsx': 'current', 'test/progress.test.js': 'current' });

  // A deleted file the activity cites is stale as deleted; the activity, its attempts and feedback are untouched.
  const debugMap = await learningSourceMap(taskboard('v1'), { goal: 'debug_behavior', question: ISSUE });
  const gone = await sourceDrift(debugMap.nodes.map(n => n.sourceRef), taskboard('deleted'));
  assert.deepEqual(gone.stale, ['server/store.js']);
  assert.ok(gone.items.filter(i => i.path !== 'server/store.js').every(i => i.status === 'current'));
  assert.ok((await sourceDrift(debugMap.nodes.map(n => n.sourceRef), null)).items.every(i => i.status === 'unavailable'), 'unreadable now: unavailable, never stale');

  // Update the activity: a new one at the current commit; the submitted one keeps its commit, its revision and its attempt.
  const state = await readCoachingState(f.env, ACTOR);
  const refreshed = await (await f.route('POST', { app: CANVAS, action: 'refresh', activityId: first.activityId, actionId: 'refresh-0001', expectedRevision: state.revision })).json();
  const next = activityOf(refreshed.state);
  assert.notEqual(next.activityId, first.activityId);
  assert.ok(next.sourceRefs.every(ref => ref.version === COMMITS.v2));
  assert.deepEqual(paths(next).sort(), paths(first).sort(), 'the same files, re-read at the current commit');
  assert.deepEqual([next.checkpoint.codebase.refreshedFrom, next.checkpoint.codebase.previousCommit], [first.activityId, COMMITS.v1]);
  const old = f.sqlite.prepare('SELECT status, revision, source_refs_json FROM learn_activities WHERE id = ?').get(first.activityId);
  assert.equal(old.status, 'paused', 'kept, waiting for an explicit return');
  assert.ok(JSON.parse(old.source_refs_json).every(ref => ref.version === COMMITS.v1), 'the submitted revision stays as submitted');
  const kept = f.sqlite.prepare('SELECT activity_id, activity_revision FROM learn_attempts WHERE id = ?').get(attempt.attemptId);
  assert.deepEqual({ ...kept }, { activity_id: first.activityId, activity_revision: first.revision });
  assert.deepEqual((await f.drift()).activity.stale, [], 'the new activity is current');
});

test('readme_only_change_preserves_evidence: a README edit marks nothing an understanding activity cites; drift writes nothing and evidence stays', async t => {
  const f = setup(t);
  const out = await f.start('understand_feature', 'the completion indicator');
  const activity = activityOf(out.body.state);
  await acceptAttempt(f.env, ACTOR, { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'sub-readme-01', submittedContent: { text: 'The checkbox updates the task, then the header recomputes.' }, sourceRefs: [], assistanceRefs: [] });
  const before = f.rows();
  f.publish(taskboard('readme'));
  const drift = (await f.drift()).activity;
  assert.equal(drift.commit, COMMITS.readme);
  assert.deepEqual(drift.stale, []);
  assert.ok(drift.items.every(i => i.status === 'current'));
  assert.deepEqual(f.rows(), before, 'reading drift wrote nothing: goals, activities, attempts, assessments and observations as they were');
  // A contribution activity cites the README: only that item is stale, and still nothing else changes.
  const contribute = await learningSourceMap(taskboard('v1'), { goal: 'prepare_contribute' });
  const only = await sourceDrift(contribute.nodes.map(n => n.sourceRef), taskboard('readme'));
  assert.deepEqual(only.stale, ['README.md']);
});

test('current_vs_expected_output_is_explicit: every first activity names whether it asks about the current code, the intended behaviour or a proposed change, and claims no output', async t => {
  const f = setup(t);
  for (const goal of CODEBASE_GOALS) {
    const out = await f.start(goal.id, FOCUS['example/taskboard'][goal.id]);
    const { prompt, checkpoint } = activityOf(out.body.state);
    assert.equal(checkpoint.codebase.question, goal.question);
    assert.ok(QUESTION_LABEL[goal.question], `${goal.question} has a label`);
    assert.equal(checkpoint.codebase.execution, 'not_run_here');
    assert.doesNotMatch(prompt, /\d+\s*%/, `${goal.id}: no output value is claimed; nothing was run`);
    if (goal.id === 'understand_feature') { assert.match(prompt, /through the current code/); assert.match(prompt, /separately as the intended behaviour/); }
    if (goal.id === 'debug_behavior') { assert.match(prompt, /Current code: /); assert.match(prompt, /Intended behaviour:/); assert.match(prompt, /tentative/); }
    if (goal.id === 'make_change') assert.match(prompt, /A proposed change, not the current behaviour/);
    if (goal.id === 'prepare_contribute') assert.match(prompt, /not proof that it runs here/);
    if (goal.id === 'learn_concept') assert.match(prompt, /the current code/);
    // Owner brief 2026-10-21 "Question presentation": no commit hash, raw path or line range and no execution note in the
    // question; the commit, hashes and execution status stay saved on the activity for Source details.
    for (const text of [prompt, activityOf(out.body.state).objective]) {
      assert.doesNotMatch(text, /\b[0-9a-f]{7,40}\b/, `${goal.id}: no commit hash`);
      assert.doesNotMatch(text, /[\w-]+\/[\w./-]+|\w\.(js|jsx|py|md|toml|json)\b|:\d+-\d+/, `${goal.id}: no raw path or line range`);
      assert.equal(text.includes(NOT_RUN_NOTE), false, `${goal.id}: execution status is in Source details`);
    }
    assert.equal(checkpoint.codebase.commit, COMMITS.v1, 'the exact revision stays saved');
  }
  // Inspection, learner-supplied output and execution are three labels, never one.
  assert.equal(new Set(Object.values(EVIDENCE_LABEL)).size, 3);
  assert.deepEqual(Object.keys(EVIDENCE_LABEL), ['inspection', 'learner_output', 'execution']);
});

test('route: only the learner\'s own project canvas; a goal that needs a focus asks for it; a stale revision changes nothing', async t => {
  const f = setup(t);
  assert.deepEqual(await (await f.route('GET', { app: PLAIN })).json(), { repository: null, activity: null }, 'no project: no menu, no drift');
  assert.deepEqual((await (await f.route('GET', { app: CANVAS })).json()).repository, { app: 'repo-0a1b2c3d-proj', repo: 'example/taskboard', commit: COMMITS.v1 });
  const plain = await f.route('POST', { app: PLAIN, action: 'start', goal: 'prepare_contribute', actionId: 'plain-start-1', expectedRevision: 0 });
  assert.deepEqual([plain.status, (await plain.json()).error], [409, 'no_repository']);
  const vague = await f.start('debug_behavior', '');
  assert.deepEqual([vague.status, vague.body.error, vague.body.clarify], [400, 'question_required', goalOf('debug_behavior').clarify]);
  assert.equal((await f.start('not_a_goal', 'x')).status, 400);
  const stale = await f.start('prepare_contribute', '', { expectedRevision: 99 });
  assert.deepEqual([stale.status, stale.body.error], [409, 'revision']);
  assert.equal(stale.body.state.goals.length, 0);
  // Trash: a project in Trash is not read.
  f.sqlite.exec("INSERT INTO library_trash(org, name, trashed_at) VALUES ('ws', 'repo-0a1b2c3d-proj', '2026-10-21T00:00:00Z')");
  assert.equal((await (await f.route('GET', { app: CANVAS })).json()).repository, null);
});

// Integrator ruling 2026-10-21 (production check, defect 1): minGPT's CausalSelfAttention was cited as lines 27-56, a fixed 30
// lines from the class start, which left out forward's masked_fill / softmax / att @ v, so a correct cited answer could not be
// confirmed. A symbol is now cited whole (capped at the 120-line read), and a citation is still refused beyond it.
const MINGPT_MODEL = [
  '"""', 'Full definition of a GPT Language Model, all of it in this single file.', '"""', '', 'import math', '', 'import torch',
  'import torch.nn as nn', 'from torch.nn import functional as F', '', 'from mingpt.utils import CfgNode as CN', '',
  '# -----------------------------------------------------------------------------', '', 'class NewGELU(nn.Module):', '    """',
  '    Implementation of the GELU activation function currently in Google BERT repo (identical to OpenAI GPT).', '    """',
  '    def forward(self, x):', '        return 0.5 * x * (1.0 + torch.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * torch.pow(x, 3.0))))', '',
  'class CausalSelfAttention(nn.Module):', '    """', '    A vanilla multi-head masked self-attention layer with a projection at the end.', '    """', '',
  '    def __init__(self, config):', '        super().__init__()', '        assert config.n_embd % config.n_head == 0',
  '        # key, query, value projections for all heads, but in a batch', '        self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd)',
  '        # output projection', '        self.c_proj = nn.Linear(config.n_embd, config.n_embd)', '        # regularization',
  '        self.attn_dropout = nn.Dropout(config.attn_pdrop)', '        self.resid_dropout = nn.Dropout(config.resid_pdrop)',
  '        # causal mask to ensure that attention is only applied to the left in the input sequence',
  '        self.register_buffer("bias", torch.tril(torch.ones(config.block_size, config.block_size))',
  '                                     .view(1, 1, config.block_size, config.block_size))',
  '        self.n_head = config.n_head', '        self.n_embd = config.n_embd', '', '    def forward(self, x):',
  '        B, T, C = x.size() # batch size, sequence length, embedding dimensionality (n_embd)', '',
  '        # calculate query, key, values for all heads in batch and move head forward to be the batch dim',
  '        q, k ,v  = self.c_attn(x).split(self.n_embd, dim=2)',
  '        k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)',
  '        q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)',
  '        v = v.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)', '',
  '        # causal self-attention; Self-attend: (B, nh, T, hs) x (B, nh, hs, T) -> (B, nh, T, T)',
  '        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))',
  "        att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))", '        att = F.softmax(att, dim=-1)',
  '        att = self.attn_dropout(att)', '        y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)',
  '        y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side', '',
  '        # output projection', '        y = self.resid_dropout(self.c_proj(y))', '        return y', '',
  'class Block(nn.Module):', '    """ an unassuming Transformer block """', '', '    def __init__(self, config):', '        super().__init__()', '',
].join('\n');
const lineOf = text => MINGPT_MODEL.split('\n').findIndex(line => line.includes(text)) + 1;
const mingpt = () => ({
  repo: 'karpathy/minGPT', commit: '37baab71b9abea1b76ab957409a1cc2fbfba8a26', files: { 'mingpt/model.py': MINGPT_MODEL },
  graph: { nodes: [{ id: 'mingpt_model_py', label: 'model.py', path: 'mingpt/model.py', line: 1, kind: 'code' },
    { id: 'mingpt_model_causalselfattention', label: 'CausalSelfAttention', path: 'mingpt/model.py', line: lineOf('class CausalSelfAttention'), kind: 'code' }], edges: [] },
});

test('a symbol is cited whole: minGPT CausalSelfAttention covers the masked_fill and softmax lines of forward; a range beyond the symbol is refused', async () => {
  const map = await learningSourceMap(mingpt(), { goal: 'understand_feature', question: 'how CausalSelfAttention applies the causal mask' });
  const ref = map.nodes.find(n => n.path === 'mingpt/model.py').sourceRef;
  const [cls, mask, softmax, ret, block] = ['class CausalSelfAttention', 'att.masked_fill', 'F.softmax(att', '        return y', 'class Block'].map(lineOf);
  assert.equal(ref.locator.symbol, 'CausalSelfAttention');
  assert.deepEqual([ref.locator.start, ref.locator.end], [cls - 2, ret], 'from just above the class to its last line, not a fixed 30 lines');
  assert.ok(ref.locator.end - ref.locator.start + 1 > 30, 'wider than the old window');
  assert.ok(ref.locator.end < block, 'the next class is not cited');
  assert.ok(map.citations.find(c => c.path === 'mingpt/model.py').text.includes('att.masked_fill'), 'the placed code card holds the mask lines, so they can be selected there');
  // The learner may now cite the lines that apply the mask; the stored ref is still built from the activity's own ref.
  const claim = (start, end, extra = {}) => ({ kind: ref.kind, id: ref.id, version: ref.version, hash: ref.hash, locator: { path: ref.locator.path, start, end }, ...extra });
  assert.deepEqual(citationRef([ref], claim(mask, softmax)).locator, { path: 'mingpt/model.py', start: mask, end: softmax, role: 'source', citation: true });
  // Beyond the symbol (into class Block), before it, or with another hash: still refused.
  assert.equal(citationRef([ref], claim(ret, block)), null);
  assert.equal(citationRef([ref], claim(ref.locator.start - 1, mask)), null);
  assert.equal(citationRef([ref], claim(mask, softmax, { hash: '0'.repeat(64) })), null);
  // The cap: a symbol longer than the 120-line read is cut at 120 lines.
  const long = ['def long():', ...Array.from({ length: 200 }, (_, i) => `    x${i} = ${i}`), ''].join('\n');
  assert.equal(symbolEnd(long.split('\n'), 1), 201);
  const capped = await learningSourceMap({ repo: 'a/b', commit: 'c'.repeat(40), files: { 'long.py': long }, graph: { nodes: [{ id: 'long', label: 'long', path: 'long.py', line: 1, kind: 'code' }], edges: [] } }, { goal: 'understand_feature', question: 'long' });
  assert.deepEqual([capped.nodes[0].sourceRef.locator.start, capped.nodes[0].sourceRef.locator.end], [1, 120]);
  // Brace languages: the closing brace at the symbol's indent is part of it; a one-line symbol keeps the old window.
  assert.equal(symbolEnd(['export function f(a) {', '  return a;', '}', 'const g = 1;'], 1), 3);
  assert.equal(symbolEnd(['const g = 1;', 'const h = 2;'], 1), 1);
});
