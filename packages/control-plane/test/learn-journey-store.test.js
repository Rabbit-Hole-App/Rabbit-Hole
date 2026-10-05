// packages/control-plane/test/learn-journey-store.test.js
// learning_journeys and learning_path_versions (learn-migrations/0006) on node:sqlite, built from
// repository-schema.sql like the dev LEARN_DB, behind the slice of the D1 API the store uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import {
  JourneyConflict, createJourney, loadJourney, loadJourneyById, saveJourney, archiveJourney,
  appendPathVersion, loadPath, appendJourneyEvidence, toClient,
} from '../src/learn-journey-store.js';

const SCOPE = { org: 'ana-ws', owner_email: 'ana@test', app: 'demo-app', board: 'board-1' };
const START = {
  request: { raw_user_message: 'I want to learn logistic regression', topic: 'logistic regression', intent: { kind: 'learn', topic: 'logistic regression' }, channel: 'text' },
  grounding: { kind: 'topic' },
  intake: { slots: { depth: 'guided' }, source: { depth: 'stated' } },
};
const CLAIM = { id: 'logistic-regression/sigmoid', concept: 'logistic-regression', statement: 'The sigmoid maps a score to a probability.', drawn: 'z = 2', ideas: ['squashes to (0, 1)'], misconceptions: [{ id: 'sigmoid-linear', check: 'treats it as linear' }] };
const REGISTRY = { concepts: { 'logistic-regression': { label: 'Logistic regression', names: ['logistic regression'], prerequisites: [] } }, claims: { [CLAIM.id]: CLAIM } };
const PROBE = { id: 'p1', kind: 'mcq', prompt: 'What does sigmoid(0) return?', options: [{ id: 'a', label: '0.5', correct: true }, { id: 'b', label: '0', correct: false, misconception_id: 'sigmoid-linear' }], claims: [CLAIM.id], purpose: 'diagnose', transfer: true };
const jev = (result = 'pass') => ({ status: 'settled', evaluator: 'jev', events: [{ concept: CLAIM.concept, claim: CLAIM.id, result, kind: result === 'pass' ? 'demonstrated_in_transfer' : null, idea: 0, settled: true, evaluator: 'jev', source: 'free_text' }] });
const path = (version, title = 'Sigmoid') => ({
  version, goal: 'intuition', target_topic: 'logistic regression', grounding: { kind: 'topic' },
  intake_ref: { journey_revision: 1 }, diagnostic_evidence_refs: [],
  sections: [{ id: 's1', title, purpose: 'See the squash.', kind: 'core', target_concepts: ['logistic-regression'], prerequisites: [], expected_evidence: [], depth: 'guided', status: 'upcoming', generation_state: 'not_generated' }],
  current_section_id: null,
  change: { source: version === 1 ? 'draft' : 'learner_edit', reason: version === 1 ? 'first draft' : 'shorter', evidence_refs: [], sections_changed: version === 1 ? [] : [{ id: 's1', op: 'retitled' }] },
});
const conflict = code => error => error instanceof JourneyConflict && error.code === code;

test('create -> load round-trips every field; only the owner loads it by id', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const created = await createJourney(env, SCOPE, START);
  assert.match(created.id, /^lj_[0-9a-f-]{36}$/);
  assert.deepEqual([created.state, created.pending, created.error, created.path_version, created.revision], ['intake', null, null, 0, 0]);
  assert.deepEqual(created.evidence, { seq: 0, events: [] });
  assert.deepEqual(created.request, START.request);
  assert.deepEqual(created.grounding, START.grounding);
  assert.deepEqual(created.intake, START.intake);
  assert.deepEqual(await loadJourney(env, SCOPE), created);

  const edited = { ...created, state: 'diagnostic', registry: REGISTRY, diagnostic: { probes: [PROBE], asked: [{ probe_id: 'p1', result: 'pass' }], skipped: false },
    constraints: ['no_quiz'], pending_edits: ['skip the math'], active_section_id: 's1', pending: 'path',
    section_plan: { section_id: 's1', checks: [PROBE] }, error: { op: 'path', message: 'The planner failed.', retryable: true }, paused_for: { child_app: 'kid', concept: 'logistic-regression' } };
  const saved = await saveJourney(env, edited, 0);
  assert.equal(saved.revision, 1);
  const loaded = await loadJourneyById(env, created.id, SCOPE);
  assert.deepEqual(loaded, saved);
  for (const key of ['request', 'grounding', 'intake', 'constraints', 'pending_edits', 'registry', 'diagnostic', 'evidence', 'section_plan', 'error', 'paused_for']) assert.deepEqual(loaded[key], edited[key], key);

  assert.equal(await loadJourneyById(env, created.id, { ...SCOPE, owner_email: 'ben@test' }), null);
  assert.equal(await loadJourneyById(env, created.id, { ...SCOPE, org: 'ben-ws' }), null);
  assert.equal(await loadJourney(env, { ...SCOPE, board: 'board-2' }), null);
});

test('one live journey per scope: a second create conflicts until the first is archived', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const first = await createJourney(env, SCOPE, START);
  await assert.rejects(createJourney(env, SCOPE, START), conflict('live_journey'));
  await createJourney(env, { ...SCOPE, board: 'board-2' }, START); // another board is another scope
  await archiveJourney(env, first);
  assert.equal(await loadJourney(env, SCOPE), null);
  assert.ok((await loadJourneyById(env, first.id, SCOPE)).archived_at);
  const second = await createJourney(env, SCOPE, START);
  assert.notEqual(second.id, first.id);
  assert.equal((await loadJourney(env, SCOPE)).id, second.id);
});

test('a save with a stale revision conflicts and changes nothing', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  const tab1 = await saveJourney(env, { ...journey, pending_edits: ['tab 1'] }, 0);
  await assert.rejects(saveJourney(env, { ...journey, pending_edits: ['tab 2'] }, 0), conflict('revision'));
  assert.deepEqual(await loadJourney(env, SCOPE), tab1);
});

test('path versions are immutable rows; loadPath reads the latest or a named version', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  const v1 = await appendPathVersion(env, journey, path(1));
  assert.equal(journey.path_version, 1);
  const v2 = await appendPathVersion(env, journey, path(2, 'The squash'));
  assert.equal(journey.path_version, 2);
  assert.deepEqual([v1.version, v2.version, v1.journey_id], [1, 2, journey.id]);
  assert.deepEqual(await loadPath(env, journey.id), v2);
  assert.deepEqual(await loadPath(env, journey.id, 1), v1);
  assert.equal((await loadPath(env, journey.id, 1)).sections[0].title, 'Sigmoid');
  assert.equal(await loadPath(env, journey.id, 3), null);
  assert.equal(await loadPath(env, 'lj_none'), null);
  await assert.rejects(appendPathVersion(env, journey, path(2))); // a version is written once
});

test('appendJourneyEvidence persists reconciled events with increasing seq and saves with the revision', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  const ref = { turn_id: 't1', canvas: { app: 'demo-app', board: 'board-1' } };
  const first = await appendJourneyEvidence(env, journey, jev('pass'), ref);
  assert.equal(first.seq, 1);
  assert.deepEqual(first.events.map(e => [e.seq, e.claim, e.result, e.settled, e.ref]), [[1, CLAIM.id, 'pass', true, ref]]);
  assert.equal(first.journey.revision, 1);
  const second = await appendJourneyEvidence(env, first.journey, jev('fail'), { turn_id: 't2' });
  assert.deepEqual([second.seq, second.events.map(e => e.seq), second.events[1].result], [2, [1, 2], 'fail']);
  const stored = await loadJourney(env, SCOPE);
  assert.deepEqual(stored.evidence, { seq: 2, events: second.events });
  assert.equal(stored.revision, 2);
  // Built from the stale journey (revision 0): two tabs, one write wins.
  await assert.rejects(appendJourneyEvidence(env, journey, jev('pass'), ref), conflict('revision'));
});

test('an evaluator error adds nothing and saves nothing', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  const out = await appendJourneyEvidence(env, journey, { status: 'error', evaluator: 'jev', events: jev().events, error: 'timeout' }, { turn_id: 't1' });
  assert.deepEqual([out.seq, out.events, out.journey.revision], [0, [], 0]);
  assert.deepEqual(await loadJourney(env, SCOPE), journey);
});

test('evidence is capped at 500 events, oldest unsettled first', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const created = await createJourney(env, SCOPE, START);
  const events = Array.from({ length: 500 }, (_, i) => ({ ...jev().events[0], seq: i + 1, settled: i !== 3 && i !== 7 }));
  const journey = await saveJourney(env, { ...created, evidence: { seq: 500, events } }, 0);
  const out = await appendJourneyEvidence(env, journey, { status: 'settled', events: [jev().events[0], jev().events[0], jev().events[0]] }, {});
  assert.equal(out.events.length, 500);
  assert.equal(out.seq, 503);
  // The two unsettled ones (seq 4 and 8) go, then the oldest settled one (seq 1).
  assert.deepEqual(out.events.slice(0, 7).map(e => e.seq), [2, 3, 5, 6, 7, 9, 10]);
  assert.deepEqual(out.events.slice(-3).map(e => e.seq), [501, 502, 503]);
});

test('toClient strips the answer key from every probe option and the raw_request duplicate', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const created = await createJourney(env, SCOPE, START);
  const journey = await saveJourney(env, { ...created, diagnostic: { probes: [PROBE], asked: [], skipped: false }, section_plan: { section_id: 's1', checks: [{ ...PROBE, id: 'c1' }] } }, 0);
  const client = toClient({ ...journey, raw_request: journey.request.raw_user_message });
  for (const probe of [...client.diagnostic.probes, ...client.section_plan.checks]) {
    assert.deepEqual(probe.options, [{ id: 'a', label: '0.5' }, { id: 'b', label: '0' }]);
    assert.equal(probe.prompt, PROBE.prompt);
  }
  assert.equal('raw_request' in client, false);
  assert.equal(client.request.raw_user_message, START.request.raw_user_message);
  assert.equal(journey.diagnostic.probes[0].options[0].correct, true, 'the server copy keeps its key');
  assert.equal(toClient(created).section_plan, null);
});

test('migration 0006 is re-runnable and mirrored in repository-schema.sql', () => {
  const migration = readFileSync(new URL('../learn-migrations/0006-learning-journeys.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  sqlite.exec(migration);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'learning_%' ORDER BY name").all().map(r => r.name), ['learning_journeys', 'learning_journeys_live', 'learning_path_versions']);
  sqlite.close();
  const statements = sql => sql.replace(/\r/g, '').replace(/--.*$/gm, '').split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const schema = statements(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  for (const statement of statements(migration)) assert.ok(schema.includes(statement), statement.slice(0, 60));
});
