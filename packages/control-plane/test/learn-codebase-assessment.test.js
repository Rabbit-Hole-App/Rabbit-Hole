// packages/control-plane/test/learn-codebase-assessment.test.js
// Owner finding 5B (2026-10-21): codebase answers are assessed against the goal's agreed criteria and the exact repository
// revision the activity cites, read through the existing authorization (repositories.js readableVersion). Real codebase
// route, attempt route and store, rubric route, Progress read model, on node:sqlite with the TaskBoard fixture and a stub
// snapshot store. The Opus 5.5 rubric role is a stub (deps.callModel): it proves wiring, never judgement quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { COMMITS, SECRET_VALUE, taskboard } from './learn-codebase-fixtures.js';
import { SIGMOID, WRITING, WRITING_CASES, WRITING_PROMPT, dataOf, replying } from './learn-rich-fixtures.js';
import { act, never } from './learn-attempt-fixture.js';
import { codebaseRoute } from '../src/learn-codebase-source-map.js';
import { attemptRoute } from '../src/learn-attempt-routes.js';
import { readProgress, sourceReader } from '../src/learn-progress.js';
import { readCoachingState } from '../src/learn-coaching-store.js';
import { canvasApp } from '../src/canvases.js';
import { sha256Hex } from '../src/learn-grade-jev.js';
import { CODEBASE_GOALS, goalOf } from '../../web/src/learn-codebase-goals.js';

const CANVAS = 'canvas-0000aaaa';
const ACTOR = { org: 'ws', userId: 'u-ana', app: CANVAS, board: 'main' };
// The production switch (owner GO 2026-10-21): codebase assessment alone; the general rubric and visual switches stay off.
const ON = { TUTOR_CODEBASE_ASSESSMENT_ENABLED: 'true' };
const FOCUS = { understand_feature: 'the completion indicator', debug_behavior: 'Why does progress show 0% after completing one task?', make_change: 'round the percentage to one decimal', prepare_contribute: '', learn_concept: 'derived state in the completion percentage' };
// A learner's answer per goal, and the words of it that meet each criterion (what a stubbed evaluator quotes back).
const ANSWERS = {
  understand_feature: { text: 'The checkbox calls toggleTask, which calls updateTask and then setTasks with the returned tasks. The header then calls completionPercent(tasks): for one of three done it gives 0, because Math.round(1/3) is 0 before the multiply by 100.',
    quotes: { trace_path: 'toggleTask, which calls updateTask and then setTasks', explain_current: 'Math.round(1/3) is 0 before the multiply by 100' } },
  debug_behavior: { text: 'Actual: one of three done shows 0%. Expected: 33%. The cause is in progress.js: it rounds completed / tasks.length before multiplying by 100. A test with one of three done expecting 33 tells the rounding order apart from a wrong count.',
    quotes: { supported_hypothesis: 'it rounds completed / tasks.length before multiplying by 100', verify_cause: 'A test with one of three done expecting 33' } },
  make_change: { text: 'Wanted: 1 of 3 gives 33.3 and 2 of 3 gives 66.7. Edit only completionPercent in src/progress.js. Add cases for 1 of 3 and 2 of 3 to test/progress.test.js and keep the 0% and 100% cases.',
    quotes: { focused_change: 'Edit only completionPercent in src/progress.js', verify_change: 'Add cases for 1 of 3 and 2 of 3 to test/progress.test.js' } },
  prepare_contribute: { text: 'A new test belongs in test/, because CONTRIBUTING.md asks for a test in test/ for every change. npm test runs node --test test/ from package.json, and it covers only the cases in those tests.',
    quotes: { navigate_conventions: 'CONTRIBUTING.md asks for a test in test/ for every change', verification_path: 'npm test runs node --test test/ from package.json' } },
  learn_concept: { text: 'completionPercent derives the percentage from the tasks on every render instead of storing it, so the number cannot go stale when a task changes.',
    quotes: { explain_here: 'derives the percentage from the tasks on every render instead of storing it' } },
};
const FLAWED_LINE = 'return Math.round(completed / tasks.length) * 100;';
const FIXED_LINE = 'return Math.round((completed / tasks.length) * 100);';

// The rubric reply a stubbed evaluator gives: each criterion of the activity met (or the given fit), quoting the answer.
const reply = (activity, quotes, fit = {}) => ({
  criteria: activity.criterionRefs.map(({ criterionId, version }) => ({ criterionId, version, fit: fit[criterionId] ?? 'met', reasoning: fit[criterionId] === 'not_met' ? 'missing' : 'supported',
    evidence: fit[criterionId] === 'not_met' ? [] : [quotes[criterionId]], alternative: false, uncertain: false, explanation: 'Stub judgement.' })),
  factualClaims: [], notes: [],
});

// A learner's project canvas on a TaskBoard import, the snapshots in a stub store, and the codebase and attempt routes as the
// learner calls them (authorize stands in for authorizedBoardApp: this account's own canvas).
function setup(t, extra = {}) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const stored = new Map();
  const env = { SMALL_ENV: 'test', LEARN_DB, ...extra, REPOSITORY_SNAPSHOTS: { get: async key => (stored.has(key) ? { json: async () => structuredClone(stored.get(key)) } : null) } };
  const first = taskboard('v1');
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ws','repo-0a1b2c3d-proj','ana@test','${first.repo}','main','${first.commit}','ready');
    INSERT INTO canvases(org,name,owner_email,title,project) VALUES('ws','${CANVAS}','ana@test','Logistic Regression','repo-0a1b2c3d-proj');`);
  const publish = snapshot => {
    stored.set(`snap-${snapshot.commit}`, snapshot);
    sqlite.prepare('INSERT OR IGNORE INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,?,?)').run(snapshot.commit, `snap-${snapshot.commit}`);
    sqlite.prepare('UPDATE repository_apps SET commit_sha = ? WHERE id = 7').run(snapshot.commit);
  };
  publish(first);
  const access = { ...canvasApp(sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(CANVAS), { email: 'ana@test', org: 'ws', orgName: null }), user_id: 'u-ana' };
  const authorize = async () => access;
  const json = async response => ({ status: response.status, body: await response.json() });
  let seq = 0;
  const start = async goal => {
    const { revision } = await readCoachingState(env, ACTOR);
    const out = await json(await codebaseRoute('/api/learn/codebase', new Request('https://dev.test/api/learn/codebase', { method: 'POST', body: JSON.stringify({ app: CANVAS, board: 'main', action: 'start', goal, question: FOCUS[goal], actionId: `start-${++seq}-${goal}`, expectedRevision: revision }) }), env, { authorize }));
    assert.equal(out.body.route, 'started', `${goal}: ${JSON.stringify(out.body).slice(0, 200)}`);
    return out.body.state.activities.find(a => a.activityId === out.body.state.activeActivityId);
  };
  const refresh = async activityId => {
    const { revision } = await readCoachingState(env, ACTOR);
    const out = await json(await codebaseRoute('/api/learn/codebase', new Request('https://dev.test/api/learn/codebase', { method: 'POST', body: JSON.stringify({ app: CANVAS, board: 'main', action: 'refresh', activityId, actionId: `refresh-${++seq}`, expectedRevision: revision }) }), env, { authorize }));
    return out.body.state.activities.find(a => a.activityId === out.body.state.activeActivityId);
  };
  const attempts = (path, body, deps) => attemptRoute(path, new Request(`https://dev.test${path}`, { method: 'POST', body: JSON.stringify({ app: CANVAS, board: 'main', ...body }) }), env, { authorize, ...deps }).then(json);
  // What the browser sends (TutorActivity.jsx): the answer and no source refs.
  const submit = (activity, text, deps) => attempts('/api/learn/tutor/attempts', { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: `sub-${++seq}-codebase`, submittedContent: { text }, sourceRefs: [], assistanceRefs: [] }, deps);
  const reassess = (attemptId, deps) => attempts(`/api/learn/tutor/attempts/${attemptId}/reassess`, { requestKey: `review-${++seq}-codebase` }, deps);
  const progress = goalId => readProgress(env, ACTOR, { goalId }, { canReadSource: sourceReader(new Request('https://dev.test/api/learn/progress'), env, access, ACTOR) });
  return { env, sqlite, publish, start, refresh, submit, reassess, progress };
}
const statusOf = view => Object.fromEntries(view.criteria.map(c => [c.criterionId, c.status]));

test('5B: each of the five codebase goals is assessed against its own agreed criteria and the cited source at the exact revision; Progress updates', async t => {
  const f = setup(t, ON);
  for (const goal of CODEBASE_GOALS) {
    const activity = await f.start(goal.id);
    const answer = ANSWERS[goal.id];
    const stub = replying(reply(activity, answer.quotes));
    const r = await f.submit(activity, answer.text, { ...never, callModel: stub.callModel });
    assert.equal(r.status, 200, `${goal.id}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const a = r.body.assessment;
    assert.deepEqual([a.status, a.route, a.provenance.route, a.rubricVersion], ['completed', 'larger', 'rubric', 'rubric-codebase-1'], `${goal.id}: ${a.reason}`);
    assert.equal(stub.calls.length, 1, `${goal.id}: one rubric call`);
    // The attempt is bound to the activity's cited sources at their commit, although the browser named none.
    assert.deepEqual(r.body.attempt.sourceRefs, activity.sourceRefs, `${goal.id}: sourceRefs recorded on the attempt`);
    assert.ok(r.body.attempt.sourceRefs.length > 0 && r.body.attempt.sourceRefs.every(ref => ref.version === COMMITS.v1));
    // The evaluator gets the goal's agreed criteria and the cited lines read at that commit, never another version.
    const data = dataOf(stub.calls[0].body);
    const agreed = goal.criteria.filter(c => !c.requiresTransfer);
    assert.deepEqual(data.rubric.map(c => [c.criterionId, c.requirement]), agreed.map(c => [c.criterionId, c.requirement]), `${goal.id}: the agreed criteria`);
    assert.equal(data.task, activity.prompt);
    const snapshot = taskboard('v1');
    for (const [i, ref] of activity.sourceRefs.slice(0, 5).entries()) {
      const { path, start, end } = ref.locator;
      assert.equal(data.sources[i].text, snapshot.files[path].split('\n').slice(start - 1, end).join('\n').slice(0, 3000), `${goal.id}: ${path} as cited at ${COMMITS.v1}`);
      assert.match(data.sources[i].label, new RegExp(`^${path.replace(/\./g, '\\.')}:${start}-${end} at ${COMMITS.v1.slice(0, 7)}$`));
      assert.deepEqual(a.provenance.sources[i].ref, { kind: 'repository_file', id: ref.id, version: COMMITS.v1 });
    }
    assert.equal(JSON.stringify(stub.calls[0].body).includes(SECRET_VALUE), false, 'no secret reaches the prompt');
    // Progress: each assessed criterion is demonstrated, from this attempt.
    const view = await f.progress(activity.goalId);
    assert.deepEqual(statusOf(view), Object.fromEntries(goal.criteria.map(c => [c.criterionId, c.requiresTransfer ? 'not_checked' : 'demonstrated_independently'])), goal.id);
    assert.ok(view.criteria.flatMap(c => c.evidence).every(e => e.sources.every(s => s.version === COMMITS.v1)), `${goal.id}: evidence names its revision`);
  }
  // The debugging activity reads the flawed line itself.
  const debug = (await readCoachingState(f.env, ACTOR)).activities.find(a => a.checkpoint?.codebase?.goal === 'debug_behavior');
  assert.ok(debug.sourceRefs.some(ref => ref.locator.path === 'src/progress.js'));
});

test('5B: an incorrect answer is not met and stays practising; with the rubric flag off nothing is called and the answer stays unassessed', async t => {
  const f = setup(t, ON);
  const activity = await f.start('understand_feature');
  const wrong = 'The checkbox calls toggleTask, which calls updateTask and then setTasks. For one of three tasks done the current code returns 33%.';
  const stub = replying(reply(activity, { trace_path: 'toggleTask, which calls updateTask and then setTasks' }, { explain_current: 'not_met' }));
  const r = await f.submit(activity, wrong, { ...never, callModel: stub.callModel });
  const fit = Object.fromEntries(r.body.assessment.observations.map(o => [o.criterionId, o.fit]));
  assert.deepEqual(fit, { trace_path: 'met', explain_current: 'not_met' });
  assert.deepEqual(statusOf(await f.progress(activity.goalId)), { trace_path: 'demonstrated_independently', explain_current: 'practising' });
  // A "met" with no quote from the answer is rejected: an evaluator cannot pass an answer that does not say it.
  const unsupported = replying({ criteria: [{ criterionId: 'explain_current', version: 1, fit: 'met', reasoning: 'supported', evidence: ['It rounds before multiplying.'], explanation: 'x' }] });
  const second = await f.submit(activity, wrong, { ...never, callModel: unsupported.callModel });
  assert.deepEqual([second.body.assessment.status, second.body.assessment.reason], ['failed', 'no_supported_observations']);
  assert.equal(statusOf(await f.progress(activity.goalId)).explain_current, 'practising');

  // Production keeps the rubric route off (owner item 4): no provider call, the answer saved and unassessed, its refs kept.
  const off = setup(t);
  const offActivity = await off.start('understand_feature');
  const saved = await off.submit(offActivity, ANSWERS.understand_feature.text, never);
  assert.deepEqual([saved.body.assessment.status, saved.body.assessment.reason], ['unavailable', 'no_registered_claims']);
  assert.deepEqual(saved.body.attempt.sourceRefs, offActivity.sourceRefs);
});

test('5B: revision preservation: a later repository revision never rewrites an earlier assessment; a review reads the submitted revision; Update assesses the new one', async t => {
  const f = setup(t, ON);
  const first = await f.start('debug_behavior');
  const answer = ANSWERS.debug_behavior;
  const one = replying(reply(first, answer.quotes));
  const v1 = await f.submit(first, answer.text, { ...never, callModel: one.callModel });
  assert.ok(dataOf(one.calls[0].body).sources.some(s => s.text.includes(FLAWED_LINE)));
  const before = f.sqlite.prepare('SELECT * FROM learn_assessments ORDER BY rowid').all().map(row => ({ ...row }));
  const observations = f.sqlite.prepare('SELECT * FROM learn_observations ORDER BY rowid').all().map(row => ({ ...row }));

  f.publish(taskboard('v2')); // the import moves on: progress.js is fixed
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM learn_assessments ORDER BY rowid').all().map(row => ({ ...row })), before, 'nothing rewrites the earlier assessment');
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM learn_observations ORDER BY rowid').all().map(row => ({ ...row })), observations);
  const view = await f.progress(first.goalId);
  assert.deepEqual(statusOf(view), { supported_hypothesis: 'demonstrated_independently', verify_cause: 'demonstrated_independently' });
  assert.ok(view.criteria[0].evidence[0].excerpt, 'the v1 evidence still reads: v1 stays readable');

  // A deliberate review of the v1 answer judges it against v1, not the current code.
  const again = replying(reply(first, answer.quotes));
  const review = await f.reassess(v1.body.attempt.attemptId, { ...never, callModel: again.callModel });
  assert.equal(review.body.assessment.status, 'completed');
  const reviewed = dataOf(again.calls[0].body).sources;
  assert.ok(reviewed.some(s => s.text.includes(FLAWED_LINE)) && !reviewed.some(s => s.text.includes(FIXED_LINE)), 'the submitted revision, not v2');
  assert.equal(review.body.assessments.length, 2, 'the original assessment is kept beside the review');

  // Update the activity: the new answer is assessed against v2; the v1 attempt keeps its refs.
  const next = await f.refresh(first.activityId);
  const two = replying(reply(next, answer.quotes));
  const v2 = await f.submit(next, answer.text, { ...never, callModel: two.callModel });
  assert.ok(v2.body.attempt.sourceRefs.every(ref => ref.version === COMMITS.v2));
  assert.ok(dataOf(two.calls[0].body).sources.some(s => s.text.includes(FIXED_LINE)));
  const kept = JSON.parse(f.sqlite.prepare('SELECT source_refs_json FROM learn_attempts WHERE id = ?').get(v1.body.attempt.attemptId).source_refs_json);
  assert.ok(kept.every(ref => ref.version === COMMITS.v1));
});

test('5B: revoked access stops the resolver: no source is read, no evaluator call is made, and Progress withholds the content', async t => {
  const f = setup(t, ON);
  const activity = await f.start('understand_feature');
  const answer = ANSWERS.understand_feature;
  const first = await f.submit(activity, answer.text, { ...never, callModel: replying(reply(activity, answer.quotes)).callModel });
  assert.equal(first.body.assessment.status, 'completed');

  // The learner's own import goes to Trash, and the repository is not confirmed public: readableVersion refuses the commit.
  f.sqlite.exec("INSERT INTO library_trash(org, name, trashed_at) VALUES ('ws', 'repo-0a1b2c3d-proj', '2026-10-21T00:00:00Z')");
  const blocked = replying(reply(activity, answer.quotes));
  const review = await f.reassess(first.body.attempt.attemptId, { ...never, callModel: blocked.callModel });
  assert.deepEqual([review.body.assessment.status, review.body.assessment.reason, blocked.calls.length], ['unavailable', 'source_unavailable', 0]);
  assert.ok(review.body.assessment.provenance.sourcesUnavailable.every(s => s.kind === 'repository_file' && s.reason === 'source_unavailable'));
  const view = await f.progress(activity.goalId);
  const evidence = view.criteria[0].evidence[0];
  assert.deepEqual([evidence.withheld, evidence.excerpt, evidence.sources.every(s => s.available === false)], ['source_unavailable', null, true]);
  assert.equal(statusOf(view).trace_path, 'demonstrated_independently', 'the confirmed observation stays; only its content is withheld');

  // A new answer after revocation: saved, never assessed.
  const later = await f.submit(activity, `${answer.text} Again.`, { ...never, callModel: blocked.callModel });
  assert.deepEqual([later.status, later.body.assessment.status, later.body.assessment.reason, blocked.calls.length], [200, 'unavailable', 'source_unavailable', 0]);

  // Restored from Trash: readable again.
  f.sqlite.exec("DELETE FROM library_trash WHERE name = 'repo-0a1b2c3d-proj'");
  const back = await f.reassess(first.body.attempt.attemptId, { ...never, callModel: blocked.callModel });
  assert.deepEqual([back.body.assessment.status, blocked.calls.length], ['completed', 1]);
});

test('5B: a crafted repository source is still read only under authorization: a secret file, a wrong hash or another repository is never sent', async t => {
  const f = setup(t, ON);
  const snapshot = taskboard('v1');
  const goal = goalOf('understand_feature');
  await act(f.env, ACTOR, 'create_goal', { label: 'Crafted', criteria: goal.criteria });
  const goalId = (await readCoachingState(f.env, ACTOR)).activeGoalId;
  const ref = (path, extra = {}) => ({ kind: 'repository_file', id: `${snapshot.repo}:${path}`, version: COMMITS.v1, hash: 'a'.repeat(64), locator: { path, start: 1, end: 5, role: 'source' }, ...extra });
  const hashOf = async path => sha256Hex(snapshot.files[path]);
  // The secret file with its true hash; the right file with a wrong hash; the right file and hash claimed for another repository
  // or under another file's id.
  for (const crafted of [ref('config/secrets.json', { hash: await hashOf('config/secrets.json') }), ref('src/progress.js'), ref('src/progress.js', { id: 'other/repo:src/progress.js', hash: await hashOf('src/progress.js') }),
    ref('src/progress.js', { id: `${snapshot.repo}:src/api.js`, hash: await hashOf('src/progress.js') })]) {
    const state = (await act(f.env, ACTOR, 'activate_activity', { activity: { goalId, objective: 'Crafted', prompt: 'Explain.', responseKind: 'text', criterionRefs: [{ criterionId: 'trace_path', version: 1 }], sourceRefs: [crafted] } })).state;
    const activity = state.activities.find(a => a.activityId === state.activeActivityId);
    const stub = replying(reply(activity, { trace_path: 'toggleTask' }));
    const r = await f.submit(activity, 'toggleTask calls updateTask.', { ...never, callModel: stub.callModel });
    assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, stub.calls.length], ['unavailable', 'source_unavailable', 0], crafted.id);
    assert.equal(JSON.stringify(r.body).includes(SECRET_VALUE), false);
  }
});

test('flag split: TUTOR_CODEBASE_ASSESSMENT_ENABLED assesses codebase answers only; other rubric goals, drawings and codebase-labelled goals without cited code stay unassessed with no call', async t => {
  const f = setup(t, ON);
  const activity = await f.start('understand_feature');
  const answer = ANSWERS.understand_feature;
  const code = replying(reply(activity, answer.quotes));
  const r = await f.submit(activity, answer.text, { ...never, callModel: code.callModel });
  assert.deepEqual([r.body.assessment.status, r.body.assessment.provenance.route, code.calls.length], ['completed', 'rubric', 1], 'codebase on');

  // Every other answer must make no call: a stub that throws proves it.
  const make = async (label, criteria, responseKind, sourceRefs = []) => {
    await act(f.env, ACTOR, 'create_goal', { label, criteria });
    const goalId = (await readCoachingState(f.env, ACTOR)).activeGoalId;
    const state = (await act(f.env, ACTOR, 'activate_activity', { activity: { goalId, objective: label, prompt: WRITING_PROMPT, responseKind, criterionRefs: criteria.map(c => ({ criterionId: c.criterionId, version: 1 })), sourceRefs } })).state;
    return state.activities.find(a => a.activityId === state.activeActivityId);
  };
  const writing = await make('Library hours paragraph', WRITING, 'text');
  const w = await f.submit(writing, WRITING_CASES.proposalA.text, never);
  assert.deepEqual([w.body.assessment.status, w.body.assessment.reason], ['unavailable', 'no_registered_claims'], 'another rubric goal: off');
  const drawing = await make('Sketch', SIGMOID, 'drawing');
  const d = await attemptRoute('/api/learn/tutor/attempts', new Request('https://dev.test/api/learn/tutor/attempts', { method: 'POST', body: JSON.stringify({ app: CANVAS, board: 'main', activityId: drawing.activityId, activityRevision: drawing.revision, submissionKey: 'sub-split-drawing', submittedContent: { image: { id: 'm-1' } }, sourceRefs: [], assistanceRefs: [] }) }), f.env, { authorize: async () => ({ ...canvasApp(f.sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(CANVAS), { email: 'ana@test', org: 'ws' }), user_id: 'u-ana' }), ...never });
  const dv = await d.json();
  assert.deepEqual([dv.assessment.status, dv.assessment.reason], ['unavailable', 'visual_not_supported'], 'visual: off');
  // A goal that claims the codebase rubric but cites no repository file is not a codebase answer.
  const labelled = await make('Claims the codebase rubric', goalOf('understand_feature').criteria.slice(0, 1), 'text');
  const l = await f.submit(labelled, answer.text, never);
  assert.deepEqual([l.body.assessment.status, l.body.assessment.reason], ['unavailable', 'no_registered_claims']);
  assert.equal(code.calls.length, 1, 'no further call');
});
