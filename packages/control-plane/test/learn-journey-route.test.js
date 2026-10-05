// packages/control-plane/test/learn-journey-route.test.js
// /api/learn/journey (architecture §6, §7.1, §9, §10) as the dev worker mounts it: LEARN_DB as node:sqlite built from
// repository-schema.sql, the account from a scripted CONTROL_PLANE /api/me, a canvas owned by ana (ben shares her
// workspace but not the canvas), and the planners on the local fixtures behind a recording callModel. No real model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { journeyRoute } from '../src/learn-journey.js';
import { fixtureFor, fixtureModel } from '../src/learn-journey-fixtures.js';
import { JourneyConflict, appendJourneyEvidence, archiveJourney, loadJourney } from '../src/learn-journey-store.js';

// /api/me as the control plane answers it (§10.2): user_id is users.id, the journey key. anaAlt is another account behind
// ana's email principal; anaCli is ana with a null id (a CLI token), anaLegacy with none (the legacy small-cp fallback).
const PEOPLE = {
  ana: { email: 'ana@test', org: 'team-ws', user_id: 'u-ana-5d1e' }, ben: { email: 'ben@test', org: 'team-ws', user_id: 'u-ben-9a2b' },
  anaAlt: { email: 'ana@test', org: 'team-ws', user_id: 'u-ana-other' }, anaCli: { email: 'ana@test', org: 'team-ws', user_id: null }, anaLegacy: { email: 'ana@test', org: 'team-ws' },
};
const IDS = Object.values(PEOPLE).map(p => p.user_id).filter(Boolean);
const APP = 'canvas-0a1b2c3d', REPO = 'repo-0a1b2c3d-nanogpt', BOARD = 'main';
const SCOPE = { org: 'team-ws', owner_user_id: 'u-ana-5d1e', app: APP, board: BOARD };
const LEARN = 'I want to learn logistic regression';

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run('team-ws', APP, 'ana@test', 'Logistic regression');
  // A project of ana's beside the canvas: a repository app, where LP1 runs no journey.
  sqlite.prepare("INSERT INTO repository_apps(id, org, name, owner_email, repo, branch, commit_sha, status) VALUES (7, 'team-ws', ?, 'ana@test', 'karpathy/nanoGPT', 'master', 'abc', 'ready')").run(REPO);
  const env = { LEARN_DB, CONTROL_PLANE };
  // Every planner call by role, with its input; a role in `fail` answers HTTP 500, a role in `replies` answers
  // replies[role](input) as its tool input.
  const calls = [], fail = new Set(), replies = {};
  const callModel = async (e, body, model, org) => {
    const role = body.tools[0].name, text = body.messages[0].content;
    calls.push({ role, input: JSON.parse(text.slice(text.indexOf('input = ') + 8)) });
    if (fail.has(role)) return Response.json({ error: { message: 'overloaded' } }, { status: 500 });
    if (replies[role]) return Response.json({ content: [{ type: 'tool_use', name: role, input: replies[role](calls.at(-1).input) }] });
    return fixtureModel(e, body, model, org);
  };
  const call = async (method, { as = 'ana', body, query = `app=${APP}&board=${BOARD}`, now } = {}) => {
    const req = new Request(`https://app.test/api/learn/journey${method === 'GET' ? `?${query}` : ''}`, {
      method, headers: { 'Content-Type': 'application/json', cookie: `small_session=${as}` }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const response = await journeyRoute('/api/learn/journey', req, env, { callModel, ...(now ? { now } : {}) });
    const text = await response.text();
    // users.id never leaves the server (§10.2): no response in this file, journey, tray or error, carries one.
    for (const id of IDS) assert.equal(text.includes(id), false, `${method} answered with a user id`);
    return { status: response.status, body: JSON.parse(text), text };
  };
  const post = (action, extra = {}, as = 'ana', app = APP) => call('POST', { as, body: { app, board: BOARD, action, ...extra } });
  const roles = () => calls.map(c => c.role);
  const rows = () => sqlite.prepare('SELECT * FROM learning_journeys').all();
  // What the Tutor evaluate path (Task 7) stores for a probe answer: one deterministic claim-level event.
  // ref defaults to the probe's own tag; a typed answer's ref names no probe, and the walker then reads the probe's claims
  // after its ask point.
  const answer = async (probeId, { result = 'pass', transfer = true, settled = true, ref = { probe_id: probeId } } = {}) => {
    const j = await loadJourney(env, SCOPE), probe = j.diagnostic.probes.find(p => p.id === probeId);
    const event = { concept: probe.claims[0].split('/')[0], claim: probe.claims[0], result, kind: result === 'pass' ? (transfer ? 'demonstrated_in_transfer' : 'demonstrated_here') : null, settled, evaluator: 'deterministic', source: 'journey_probe' };
    await appendJourneyEvidence(env, j, { status: settled ? 'settled' : 'uncertain', evaluator: 'deterministic', events: [event] }, ref);
  };
  // Intake by clicking the first option of each question, then the walker on settled transfer answers until it stops.
  const throughIntake = async () => {
    let r;
    for (const [slot, option_id] of [['goal', 'intuition'], ['familiarity', 'seen'], ['depth', 'guided']]) r = await post('intake_answer', { slot, option_id });
    return r;
  };
  const throughDiagnostic = async r => {
    while (r.body.journey?.state === 'diagnostic' && r.status === 200) {
      await answer(r.body.tray.probe_id);
      r = await post('probe_advance', { probe_id: r.body.tray.probe_id });
    }
    return r;
  };
  return { sqlite, env, calls, fail, replies, call, post, roles, rows, answer, throughIntake, throughDiagnostic };
}

test('start -> intake -> diagnostic -> path -> accept -> one section plan', async t => {
  const { call, post, roles, calls, rows, throughIntake, throughDiagnostic } = setup(t);
  assert.deepEqual((await call('GET')).body, { journey: null, path: null, tray: null });

  let r = await post('start', { text: LEARN, channel: 'text' });
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.state, 'intake');
  assert.equal(r.body.journey.request.raw_user_message, LEARN);
  assert.equal('raw_request' in r.body.journey, false);
  assert.deepEqual([r.body.tray.mode, r.body.tray.slot], ['intent_intake', 'goal']);
  assert.equal(r.body.path, null);
  // A reload recomputes the same tray from the server state.
  assert.deepEqual((await call('GET')).body.tray, r.body.tray);

  r = await throughIntake();
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.state, 'diagnostic');
  assert.deepEqual(r.body.journey.intake.source, { goal: 'answered', familiarity: 'answered', depth: 'answered', minutes: 'default' });
  assert.equal(r.body.tray.mode, 'diagnostic_probe');
  assert.ok(r.body.tray.probe_id);
  for (const option of r.body.tray.options) assert.deepEqual(Object.keys(option).sort(), ['id', 'label']);
  // The answer key never leaves the server (§9.4).
  assert.equal(/"key"|"correct"|misconception_id/.test(r.text), false);
  assert.deepEqual(roles(), ['journey_diagnostic']);
  assert.deepEqual((await call('GET')).body.tray, r.body.tray);

  r = await throughDiagnostic(r);
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.state, 'path_review');
  assert.equal(r.body.tray.mode, 'path_preview');
  assert.deepEqual(r.body.journey.diagnostic.asked.map(a => a.result), ['settled_transfer', 'settled_transfer']);
  assert.equal(r.body.path.version, 1);
  assert.equal(r.body.path.change.source, 'draft');
  assert.deepEqual(r.body.path.diagnostic_evidence_refs, r.body.journey.evidence.events.map(e => e.seq));
  assert.equal(r.body.path.diagnostic_evidence_refs.length, 2);
  assert.deepEqual(r.body.path.grounding, { kind: 'topic' });
  assert.equal(typeof r.body.path.intake_ref.journey_revision, 'number');
  assert.equal(r.body.path.sections.length, 8);
  assert.ok(r.body.path.sections.every(s => s.generation_state === 'not_generated' && s.status === 'upcoming'));
  assert.deepEqual(roles(), ['journey_diagnostic', 'journey_path']);
  // Planner states: derived per claim with settled counts, never a score. Both probed claims were passed in transfer.
  const { states } = calls[1].input;
  assert.equal('max_sections' in calls[1].input, false);
  const probed = r.body.journey.diagnostic.asked.map(a => r.body.journey.diagnostic.probes.find(p => p.id === a.probe_id).claims[0]);
  for (const id of probed) assert.deepEqual(states[id], { state: 'understood', settled_passes: 1, settled_negatives: 0 });
  const unprobed = Object.keys(states).find(id => !probed.includes(id));
  assert.deepEqual(states[unprobed], { state: 'not_yet_observed', settled_passes: 0, settled_negatives: 0 });

  r = await post('accept', { revision: r.body.journey.revision });
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.state, 'active');
  assert.equal(r.body.journey.pending, null);
  assert.equal(r.body.journey.active_section_id, 's1');
  assert.equal(r.body.path.version, 2);
  assert.deepEqual([r.body.path.change.source, r.body.path.change.reason], ['learner_edit', 'accepted']);
  assert.equal(r.body.path.current_section_id, 's1');
  assert.equal(r.body.path.sections[0].status, 'current');
  assert.ok(r.body.path.sections.slice(1).every(s => s.status === 'upcoming' && s.generation_state === 'not_generated'));
  assert.equal(r.body.journey.section_plan.section_id, 's1');
  assert.equal(JSON.parse(rows()[0].section_plan_json).section_id, 's1');
  assert.deepEqual(roles(), ['journey_diagnostic', 'journey_path', 'journey_section']);
  assert.equal(r.body.tray, null);
});

test('a quick overview asks one question, runs no diagnostic and drafts at most 3 sections', async t => {
  const { post, roles } = setup(t);
  let r = await post('start', { text: 'Give me a 10-minute visual overview of logistic regression' });
  assert.deepEqual([r.status, r.body.journey.state, r.body.tray.slot], [200, 'intake', 'goal']);
  r = await post('intake_answer', { slot: 'goal', option_id: 'intuition' });
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.state, 'path_review');
  assert.ok(r.body.path.sections.length <= 3);
  assert.deepEqual(roles(), ['journey_path']);
});

test('a quick overview caps the draft at 3 sections: a longer one is a retryable planner failure', async t => {
  const { post, replies, calls } = setup(t);
  await post('start', { text: 'Give me a 10-minute visual overview of logistic regression' });
  replies.journey_path = input => fixtureFor('journey_path', { ...input, intake: { slots: { depth: 'guided' } } }); // 8 sections
  const r = await post('intake_answer', { slot: 'goal', option_id: 'intuition' });
  assert.equal(calls.at(-1).input.max_sections, 3);
  assert.equal(r.status, 502);
  assert.match(r.body.error, /invalid plan.*at most 3 sections/);
  assert.deepEqual([r.body.journey.state, r.body.journey.path_version, r.body.journey.error.op, r.body.journey.error.retryable], ['path_review', 0, 'path', true]);
});

test('a fast start needs a topic; with one it drafts, accepts and plans section 1', async t => {
  const { post, roles, rows } = setup(t);
  let r = await post('start', { text: 'Skip setup and start' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'topic_required');
  assert.deepEqual([r.body.tray.mode, r.body.tray.prompt], ['clarification', 'What do you want to learn?']);
  assert.equal(rows().length, 0);

  r = await post('start', { text: 'Teach me logistic regression, skip setup and just start' });
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.state, 'active');
  assert.equal(r.body.journey.active_section_id, r.body.path.sections[0].id);
  assert.equal(r.body.path.sections[0].status, 'current');
  assert.equal(r.body.journey.section_plan.section_id, r.body.path.sections[0].id);
  assert.deepEqual(roles(), ['journey_path', 'journey_section']);
});

test('a factual question is not a journey, and one board holds one live journey', async t => {
  const { post, rows } = setup(t);
  let r = await post('start', { text: 'What is logistic regression?' });
  assert.deepEqual([r.status, r.body.error], [400, 'not_a_learning_journey']);
  assert.equal(rows().length, 0);

  const first = await post('start', { text: LEARN });
  r = await post('start', { text: 'Teach me linear algebra' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'live_journey');
  assert.equal(r.body.journey.id, first.body.journey.id);
  assert.equal(rows().length, 1);
});

test('a path planner failure keeps the answers, sets a retryable error and never plans a section', async t => {
  const { post, fail, roles, sqlite, throughIntake, throughDiagnostic } = setup(t);
  await post('start', { text: LEARN });
  fail.add('journey_path');
  let r = await throughDiagnostic(await throughIntake());
  assert.equal(r.status, 502);
  assert.match(r.body.error, /HTTP 500/);
  const j = r.body.journey;
  assert.deepEqual([j.state, j.pending, j.path_version, j.section_plan], ['path_review', null, 0, null]);
  assert.deepEqual([j.error.op, j.error.retryable], ['path', true]);
  assert.deepEqual(j.intake.source, { goal: 'answered', familiarity: 'answered', depth: 'answered', minutes: 'default' });
  assert.equal(j.diagnostic.asked.length, 2);
  assert.equal(r.body.path, null);
  assert.equal(r.body.tray.options[0].id, 'retry');
  assert.equal(/"cards"|"blocks"/.test(JSON.stringify(r.body)), false);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM learning_path_versions').get().n, 0);
  assert.equal(roles().includes('journey_section'), false);
  // Only retry is legal now.
  assert.equal((await post('accept')).status, 409);

  fail.clear();
  r = await post('retry');
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.journey.state, r.body.journey.error, r.body.path.version], ['path_review', null, 1]);
});

test('path edits, cancel as skip, and the materialized heading', async t => {
  const { post, call, sqlite, roles, calls, answer } = setup(t);
  await post('start', { text: LEARN });
  // Before a path exists an edit waits in pending_edits and reaches the draft.
  let r = await post('path_edit', { text: 'Do Python first' });
  assert.deepEqual([r.status, r.body.journey.pending_edits], [200, ['Do Python first']]);
  // cancel on the intake tray is the intake skip: every open slot takes its default.
  r = await post('cancel');
  assert.equal(r.body.journey.state, 'diagnostic');
  assert.deepEqual(r.body.journey.intake.source, { goal: 'default', familiarity: 'default', depth: 'default', minutes: 'default' });
  // An untagged unsettled answer on the probe's claims reads as uncertain; no new evidence on the next probe as an
  // evaluator error (the earlier answer is before its ask point and on other claims).
  const first = r.body.tray.probe_id;
  await answer(first, { settled: false, ref: { turn: 1 } });
  r = await post('probe_advance', { probe_id: first });
  const second = r.body.tray.probe_id;
  assert.notEqual(second, first);
  assert.equal((await post('probe_advance', { probe_id: first })).status, 409);
  r = await post('probe_advance', { probe_id: second });
  assert.deepEqual(r.body.journey.diagnostic.asked.map(a => [a.result, a.seq]), [['uncertain', 1], ['error', 1]]);
  assert.equal(r.body.journey.state, 'diagnostic');
  r = await post('cancel');
  assert.equal(r.body.journey.state, 'path_review');
  assert.equal(r.body.journey.diagnostic.skipped, true);
  assert.deepEqual(r.body.journey.pending_edits, []);

  r = await post('path_edit', { text: 'Make it shorter' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.journey.state, r.body.path.version, r.body.path.change.source], ['path_review', 2, 'learner_edit']);
  assert.deepEqual(roles(), ['journey_diagnostic', 'journey_path', 'journey_adapt']);
  assert.deepEqual(calls.find(c => c.role === 'journey_path').input.pending_edits, ['Do Python first']);

  r = await post('accept');
  // LP1 Task 15 (regression 5): from accept until section_materialized the current section reads planning; the rest of
  // the path, and the stored version, keep their own state.
  const gen = body => body.path.sections.map(s => s.generation_state);
  assert.deepEqual(gen(r.body).slice(0, 2), ['planning', 'not_generated']);
  assert.equal(r.body.journey.section_plan.generation_state, undefined);
  assert.deepEqual(gen((await call('GET')).body).slice(0, 2), ['planning', 'not_generated'], 'a reload reads the same');
  r = await post('section_materialized', { section_id: 's1', heading_block_id: 'h-s1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.section_plan.heading_block_id, 'h-s1');
  assert.equal(r.body.path.version, 3);
  assert.equal(r.body.path.sections[0].heading_block_id, 'h-s1');
  assert.equal(r.body.journey.section_plan.generation_state, 'generated');
  assert.deepEqual(gen(r.body).slice(0, 2), ['generated', 'not_generated']);
  const stored = JSON.parse(sqlite.prepare('SELECT path_json FROM learning_path_versions WHERE version = 3').get().path_json);
  assert.deepEqual([stored.sections[0].generation_state, stored.sections[0].heading_block_id], ['not_generated', undefined], 'path versions stay immutable history');
  assert.equal((await post('section_materialized', { section_id: 's2', heading_block_id: 'h-s2' })).status, 409);
});

test('a settled misconception answer reads as fail and steps down the ladder', async t => {
  const { post, answer } = setup(t);
  await post('start', { text: LEARN });
  let r = await post('intake_skip');
  const first = r.body.tray.probe_id, ladder = r.body.journey.diagnostic.probes.map(p => p.id);
  await answer(first, { result: 'misconception' });
  r = await post('probe_advance', { probe_id: first });
  assert.deepEqual(r.body.journey.diagnostic.asked.map(a => a.result), ['fail']);
  assert.equal(r.body.tray.probe_id, ladder[ladder.indexOf(first) - 1]);
});

test('evidence tagged to another probe never counts for the open probe', async t => {
  const { post, answer } = setup(t);
  await post('start', { text: LEARN });
  const r = await post('intake_skip'), first = r.body.tray.probe_id;
  await answer(first, { ref: { probe_id: 'p-other' } }); // on the open probe's claims, but another probe's answer
  const after = await post('probe_advance', { probe_id: first });
  assert.deepEqual(after.body.journey.diagnostic.asked.map(a => a.result), ['error']);
});

test('a section planner failure after accept keeps section 1 current, path v2, and plans nothing else', async t => {
  const { post, fail, calls, throughIntake, throughDiagnostic } = setup(t);
  await post('start', { text: LEARN });
  await throughDiagnostic(await throughIntake());
  fail.add('journey_section');
  let r = await post('accept');
  assert.equal(r.status, 502);
  const j = r.body.journey;
  assert.deepEqual([j.state, j.pending, j.active_section_id, j.section_plan, j.error.op, j.error.retryable], ['active', null, 's1', null, 'section', true]);
  assert.equal(r.body.path.version, 2);
  assert.equal(r.body.path.sections[0].status, 'current');
  assert.ok(r.body.path.sections.slice(1).every(s => s.status === 'upcoming' && s.generation_state === 'not_generated'));
  assert.deepEqual(calls.filter(c => c.role === 'journey_section').map(c => c.input.section.id), ['s1']);
  fail.clear();
  r = await post('retry');
  assert.deepEqual([r.status, r.body.journey.section_plan.section_id, r.body.path.version], [200, 's1', 2]);
});

test('an internal planner error is never shown: a generic message, and a log line with ids only', async t => {
  const { post, replies } = setup(t);
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));
  replies.journey_diagnostic = () => { throw new TypeError(`Cannot read properties of undefined: ${LEARN}`); };
  await post('start', { text: LEARN });
  const r = await post('intake_skip');
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'The planner failed. Try again.');
  assert.equal(r.body.journey.error.message, 'The planner failed. Try again.');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].includes('logistic'), false);
  assert.deepEqual(JSON.parse(logged[0]), { event: 'learn_journey_planner_error', journey_id: r.body.journey.id, op: 'diagnostic', error: 'TypeError' });
});

test('an intake answer must name an option of the open question, or be goal text', async t => {
  const { post, rows } = setup(t);
  await post('start', { text: LEARN });
  const before = rows()[0];
  for (const body of [
    { slot: 'goal', option_id: 'bogus' },           // not an option
    { slot: 'goal' },                               // no answer
    { slot: 'goal', option_id: 7 },                 // not a string
    { slot: 'familiarity', option_id: 'seen' },     // not the open question
    { slot: 'goal', text: {} },                     // text must be a string
    { slot: 'goal', text: '   ' },                  // blank
    { slot: 'goal', text: 'x'.repeat(301) },        // too long
    { slot: 'goal', option_id: 'build', text: {} }, // a malformed text is refused even beside an option
  ]) {
    const r = await post('intake_answer', body);
    assert.deepEqual([r.status, r.body.error], [400, 'invalid_answer'], JSON.stringify(body));
  }
  assert.deepEqual(rows()[0], before);
  // Text on a non-goal slot is refused too.
  let r = await post('intake_answer', { slot: 'goal', option_id: 'build' });
  assert.equal(r.status, 200);
  const mid = rows()[0];
  r = await post('intake_answer', { slot: 'familiarity', text: 'pretty new' });
  assert.deepEqual([r.status, r.body.error], [400, 'invalid_answer']);
  assert.deepEqual(rows()[0], mid);
});

test('an intake answer without a slot answers the open question; goal text is goal other', async t => {
  const { post } = setup(t);
  await post('start', { text: LEARN });
  const r = await post('intake_answer', { text: 'Pass my stats exam' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.journey.intake.slots.goal, r.body.journey.intake.goal_text, r.body.tray.slot], ['other', 'Pass my stats exam', 'familiarity']);
});

test('a path edit is 1-300 characters of text', async t => {
  const { post, rows } = setup(t);
  await post('start', { text: LEARN });
  const before = rows()[0];
  for (const text of [{}, '', '  ', 'x'.repeat(301), undefined]) assert.equal((await post('path_edit', { text })).status, 400, JSON.stringify(text));
  assert.deepEqual(rows()[0], before);
});

test('archive retires the live journey, and a new one starts on the same board', async t => {
  const { call, post, rows } = setup(t);
  const first = await post('start', { text: LEARN });
  let r = await post('archive', { revision: first.body.journey.revision });
  assert.deepEqual([r.status, r.body], [200, { journey: null, path: null, tray: null }]);
  assert.deepEqual((await call('GET')).body, { journey: null, path: null, tray: null });
  r = await post('start', { text: 'Teach me linear algebra' });
  assert.equal(r.status, 200);
  assert.equal(r.body.journey.request.topic, 'linear algebra');
  assert.deepEqual(rows().map(row => [row.id === first.body.journey.id, row.archived_at != null]), [[true, true], [false, false]]);
});

test('archive is revision-safe: a stale revision gets 409 and the journey stays live', async t => {
  const { env, post, rows } = setup(t);
  const first = await post('start', { text: LEARN }), revision = first.body.journey.revision;
  const r = await post('archive', { revision: revision - 1 });
  assert.deepEqual([r.status, r.body.error, r.body.journey.id], [409, 'revision', first.body.journey.id]);
  // The store write itself is conditional, so a write landing between the route's read and the archive cannot be lost.
  // It takes the server copy: the browser copy has no owner_user_id, so it could never be written (not_owner).
  const stored = await loadJourney(env, SCOPE);
  await assert.rejects(archiveJourney(env, first.body.journey, revision), e => e instanceof JourneyConflict && e.code === 'not_owner');
  await assert.rejects(archiveJourney(env, stored, revision - 1), e => e instanceof JourneyConflict && e.code === 'revision');
  assert.equal(rows()[0].archived_at, null);
  await archiveJourney(env, stored, revision);
  assert.notEqual(rows()[0].archived_at, null);
});

test('LP1 journeys run on canvases only', async t => {
  const { call, post, rows } = setup(t);
  assert.deepEqual((await call('GET', { query: `app=${REPO}&board=${BOARD}` })).body, { journey: null, path: null, tray: null });
  const r = await post('start', { text: LEARN }, 'ana', REPO);
  assert.deepEqual([r.status, r.body.error], [400, 'journeys_on_canvases_only']);
  assert.equal(rows().length, 0);
});

test('only the owner reads or writes; a stale revision is a conflict', async t => {
  const { call, post, rows } = setup(t);
  assert.equal((await call('GET', { as: 'ben' })).status, 403);
  assert.equal((await post('start', { text: LEARN }, 'ben')).status, 403);
  assert.equal(rows().length, 0);

  const started = await post('start', { text: LEARN });
  assert.equal((await call('GET', { as: 'ben' })).status, 403);
  assert.equal((await post('intake_skip', {}, 'ben')).status, 403);

  const r = await post('intake_answer', { slot: 'goal', option_id: 'build', revision: started.body.journey.revision + 1 });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'revision');
  assert.equal(r.body.journey.revision, started.body.journey.revision);
  assert.equal(r.body.journey.intake.slots.goal, undefined);
});

test('journeys key on the user id: two accounts behind one email never see each other\'s journeys', async t => {
  const { call, post, rows } = setup(t);
  const mine = await post('start', { text: LEARN });
  assert.equal(mine.status, 200);
  assert.deepEqual((await call('GET', { as: 'anaAlt' })).body, { journey: null, path: null, tray: null });
  const r = await post('intake_skip', {}, 'anaAlt');
  assert.deepEqual([r.status, r.body.error, r.body.journey], [409, 'no_journey', null]);
  const theirs = await post('start', { text: 'I want to learn linear algebra' }, 'anaAlt');
  assert.equal(theirs.status, 200);
  assert.notEqual(theirs.body.journey.id, mine.body.journey.id);
  assert.deepEqual(rows().map(row => row.owner_user_id).sort(), ['u-ana-5d1e', 'u-ana-other']);
  assert.equal((await call('GET')).body.journey.request.topic, 'logistic regression');
  assert.equal((await call('GET', { as: 'anaAlt' })).body.journey.request.topic, 'linear algebra');
});

test('no user id: GET answers nulls, POST 401 identity_unavailable, and no row is written', async t => {
  const { call, post, rows } = setup(t);
  for (const as of ['anaCli', 'anaLegacy']) {
    assert.deepEqual((await call('GET', { as })).body, { journey: null, path: null, tray: null }, as);
    const r = await post('start', { text: LEARN }, as);
    assert.deepEqual([r.status, r.body], [401, { error: 'identity_unavailable' }], as);
  }
  assert.equal(rows().length, 0);
  // Beside the email principal's own live journey, no id is still never a match.
  await post('start', { text: LEARN });
  assert.deepEqual((await call('GET', { as: 'anaCli' })).body, { journey: null, path: null, tray: null });
  assert.deepEqual([(await post('intake_skip', {}, 'anaCli')).status, (await post('archive', {}, 'anaLegacy')).status], [401, 401]);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].archived_at, null);
});

test('a planner call that never reported back turns into a retryable error', async t => {
  const { call, post, sqlite } = setup(t);
  await post('start', { text: LEARN });
  sqlite.prepare("UPDATE learning_journeys SET state = 'diagnostic', pending = 'diagnostic'").run();
  assert.ok((await call('GET')).body.tray.busy);
  const r = await call('GET', { now: () => Date.now() + 10 * 60 * 1000 });
  assert.deepEqual([r.body.journey.pending, r.body.journey.error.op, r.body.tray.options[0].id], [null, 'diagnostic', 'retry']);
});

test('resolve classifies through the resolver model (rule 5)', async t => {
  const { post, roles } = setup(t);
  const tray = { mode: 'path_preview', prompt: 'Here is your path.', options: [{ id: 'start', label: 'Start' }], free_text: false };
  const r = await post('resolve', { text: 'Why is this section here?', tray });
  assert.deepEqual([r.status, r.body], [200, { kind: 'unrelated_question' }]);
  assert.deepEqual(roles(), ['journey_resolver']);
  const bad = [
    { text: 'Why?', tray: { ...tray, options: 'start' } },
    { text: 'Why?', tray: { ...tray, options: [null] } },
    { text: 'Why?', tray: { ...tray, options: Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` })) } },
    { text: 'Why?', tray: { ...tray, options: [{ id: 'x'.repeat(41), label: 'Start' }] } },
    { text: 'Why?', tray: { ...tray, options: [{ id: 'start', label: 'x'.repeat(121) }] } },
    { text: 'Why?', tray: { ...tray, options: [{ id: 'start' }] } },
    { text: 'Why?', tray: { ...tray, prompt: 'x'.repeat(301) } },
    { text: 'Why?', tray: { ...tray, prompt: 7 } },
    { text: 'Why?', tray: { ...tray, mode: 'bogus' } },
    { text: 'Why?', tray: null },
    { text: 'x'.repeat(1001), tray },
    { text: '', tray },
    { text: {}, tray },
  ];
  for (const body of bad) assert.equal((await post('resolve', body)).status, 400, JSON.stringify(body).slice(0, 120));
  assert.deepEqual(roles(), ['journey_resolver']);
  assert.equal((await post('resolve', { text: 'Why?', tray: { ...tray, mode: null } })).status, 200);
});

// LP1 Task 7 review round 1 (I-3): planner states come from the shared locked derivation over the journey registry, so a
// claim with two settled events naming the same misconception reaches the path planner as misconception, not uncertain.
test('planner states: two settled named misconceptions reach the path planner as misconception, with settled counts', async t => {
  const { env, post, calls } = setup(t);
  await post('start', { text: LEARN });
  const r = await post('intake_skip');
  const j = await loadJourney(env, SCOPE), probeId = r.body.tray.probe_id;
  const claim = j.diagnostic.probes.find(p => p.id === probeId).claims[0], entry = j.registry.claims[claim];
  const event = { concept: entry.concept, claim, result: 'misconception', misconception_id: entry.misconceptions[0].id, kind: null, settled: true, evaluator: 'deterministic', source: 'journey_probe' };
  await appendJourneyEvidence(env, j, { status: 'settled', evaluator: 'deterministic', events: [event, event] }, { probe_id: probeId });
  assert.equal((await post('cancel')).status, 200); // the diagnostic skip drafts the path
  const { states } = calls.find(c => c.role === 'journey_path').input;
  assert.deepEqual(states[claim], { state: 'misconception', settled_passes: 0, settled_negatives: 2 });
});
