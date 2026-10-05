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
// §9.4: the answer key is probe-level and server-only.
const PROBE = { id: 'p1', kind: 'mcq', prompt: 'What does sigmoid(0) return?', options: [{ id: 'a', label: '0.5' }, { id: 'b', label: '0' }], claims: [CLAIM.id], purpose: 'diagnose', transfer: true, key: { correct: 'a', misconceptions: { b: 'sigmoid-linear' } } };
const jev = (result = 'pass') => ({ status: 'settled', evaluator: 'jev', events: [{ concept: CLAIM.concept, claim: CLAIM.id, result, kind: result === 'pass' ? 'demonstrated_in_transfer' : null, idea: 0, settled: true, evaluator: 'jev', source: 'free_text' }] });
const path = (version, title = 'Sigmoid') => ({
  version, goal: 'intuition', target_topic: 'logistic regression', grounding: { kind: 'topic' },
  intake_ref: { journey_revision: 1 }, diagnostic_evidence_refs: [],
  sections: [{ id: 's1', title, purpose: 'See the squash.', kind: 'core', target_concepts: ['logistic-regression'], prerequisites: [], expected_evidence: [], depth: 'guided', status: 'upcoming', generation_state: 'not_generated' }],
  current_section_id: null,
  change: { source: version === 1 ? 'draft' : 'learner_edit', reason: version === 1 ? 'first draft' : 'shorter', evidence_refs: [], sections_changed: version === 1 ? [] : [{ id: 's1', op: 'retitled' }] },
});
const conflict = code => error => error instanceof JourneyConflict && error.code === code;
const rawRow = (sqlite, id) => sqlite.prepare('SELECT * FROM learning_journeys WHERE id = ?').get(id);
const pathRows = (sqlite, id) => sqlite.prepare('SELECT version FROM learning_path_versions WHERE journey_id = ? ORDER BY version').all(id).map(r => r.version);

test('create -> load round-trips every field; only the owner loads it by id', async t => {
  const { LEARN_DB, sqlite } = learnDb(t);
  const env = { LEARN_DB };
  const created = await createJourney(env, SCOPE, START);
  assert.match(created.id, /^lj_[0-9a-f-]{36}$/);
  assert.deepEqual([created.state, created.pending, created.error, created.path_version, created.revision], ['intake', null, null, 0, 0]);
  assert.deepEqual(created.evidence, { seq: 0, events: [] });
  assert.deepEqual(created.request, START.request);
  assert.deepEqual(created.grounding, START.grounding);
  assert.deepEqual(created.intake, START.intake);
  assert.deepEqual(await loadJourney(env, SCOPE), created);

  // Each part in its own column; the learner's exact words only in raw_request.
  const row = rawRow(sqlite, created.id);
  assert.deepEqual(JSON.parse(row.intake_json), START.intake);
  assert.deepEqual(JSON.parse(row.request_json), { intent: START.request.intent, channel: 'text' });
  assert.deepEqual(JSON.parse(row.grounding_json), { kind: 'topic' });
  assert.equal(row.raw_request, START.request.raw_user_message);
  assert.equal(row.request_json.includes('I want to learn'), false);

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

test('a request without its exact words or topic, or a path without a change, is refused with a clear error', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  await assert.rejects(createJourney(env, SCOPE, { ...START, request: { ...START.request, topic: undefined } }), /request\.raw_user_message and request\.topic/);
  await assert.rejects(createJourney(env, SCOPE, { ...START, request: { topic: 'x' } }), /request\.raw_user_message and request\.topic/);
  const journey = await createJourney(env, SCOPE, START);
  await assert.rejects(appendPathVersion(env, journey, { ...path(1), change: undefined }, 0), /path\.change with a source/);
});

test('one live journey per scope: a second create conflicts until the first is archived', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const first = await createJourney(env, SCOPE, START);
  await assert.rejects(createJourney(env, SCOPE, START), conflict('live_journey'));
  await createJourney(env, { ...SCOPE, board: 'board-2' }, START); // another board is another scope
  await archiveJourney(env, first);
  assert.equal(await loadJourney(env, SCOPE), null);
  assert.equal(await loadJourneyById(env, first.id, SCOPE), null);
  const second = await createJourney(env, SCOPE, START);
  assert.notEqual(second.id, first.id);
  assert.equal((await loadJourney(env, SCOPE)).id, second.id);
});

test('an archived journey is never written again, even through a stale object', async t => {
  const { LEARN_DB, sqlite } = learnDb(t);
  const env = { LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  await archiveJourney(env, journey);
  const archived = rawRow(sqlite, journey.id);
  assert.equal(archived.revision, 1);
  await assert.rejects(appendJourneyEvidence(env, journey, jev('pass'), { turn_id: 't1' }), conflict('archived'));
  await assert.rejects(saveJourney(env, { ...journey, state: 'diagnostic' }, 1), conflict('archived'));
  await assert.rejects(appendPathVersion(env, journey, path(1), 1), conflict('archived'));
  assert.deepEqual(rawRow(sqlite, journey.id), archived);
  assert.deepEqual(pathRows(sqlite, journey.id), []);
});

test('a save with a stale revision conflicts and changes nothing', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  const tab1 = await saveJourney(env, { ...journey, pending_edits: ['tab 1'] }, 0);
  await assert.rejects(saveJourney(env, { ...journey, pending_edits: ['tab 2'] }, 0), conflict('revision'));
  assert.deepEqual(await loadJourney(env, SCOPE), tab1);
});

test('a path version is written atomically with the journey row; loadPath reads the named or the journey\'s version', async t => {
  const { LEARN_DB, sqlite } = learnDb(t);
  const env = { LEARN_DB };
  const journey = await createJourney(env, SCOPE, START);
  // (a) A journey already stepped by journeyStep(path_drafted), whose path_version is the new version. The caller's
  // other changes (state, pending) land in the same write.
  const one = await appendPathVersion(env, { ...journey, state: 'path_review', pending: null, path_version: 1 }, path(1), 0);
  assert.deepEqual([one.path.version, one.path.journey_id, one.journey.path_version, one.journey.revision, one.journey.state], [1, journey.id, 1, 1, 'path_review']);
  assert.deepEqual(await loadJourney(env, SCOPE), one.journey);
  // (b) Or one not stepped yet, still at the previous path_version.
  const other = await createJourney(env, { ...SCOPE, board: 'board-2' }, START);
  assert.equal((await appendPathVersion(env, other, path(1), 0)).journey.path_version, 1);
  // (c) A v3 against the stored v1 writes nothing, whichever of its two legal path_versions the passed journey has.
  await assert.rejects(appendPathVersion(env, { ...one.journey, path_version: 3 }, path(3), 1), conflict('path_version'));
  await assert.rejects(appendPathVersion(env, { ...one.journey, path_version: 2 }, path(3), 1), conflict('path_version'));
  // Any other passed path_version is a caller bug, refused before the batch even when the stored row would allow it.
  await assert.rejects(appendPathVersion(env, { ...one.journey, path_version: 7 }, path(2), 1), conflict('path_version'));
  assert.deepEqual(pathRows(sqlite, journey.id), [1]);
  assert.deepEqual([rawRow(sqlite, journey.id).path_version, rawRow(sqlite, journey.id).revision], [1, 1]);
  const two = await appendPathVersion(env, one.journey, path(2, 'The squash'), 1);
  assert.deepEqual([two.journey.path_version, two.journey.revision], [2, 2]);
  assert.deepEqual(await loadPath(env, journey.id), two.path);
  assert.deepEqual(await loadPath(env, journey.id, 1), one.path);
  assert.equal(await loadPath(env, journey.id, 3), null);
  assert.equal(await loadPath(env, 'lj_none'), null);

  // (d) A stale revision writes neither row: no orphan version, path_version unchanged.
  await assert.rejects(appendPathVersion(env, two.journey, path(3), 1), conflict('revision'));
  assert.deepEqual(pathRows(sqlite, journey.id), [1, 2]);
  assert.deepEqual([rawRow(sqlite, journey.id).path_version, rawRow(sqlite, journey.id).revision], [2, 2]);
  // The retry with the fresh revision inserts cleanly.
  const three = await appendPathVersion(env, two.journey, path(3), 2);
  assert.deepEqual([three.journey.path_version, three.journey.revision], [3, 3]);
  assert.deepEqual(pathRows(sqlite, journey.id), [1, 2, 3]);

  // Latest is the journey's path_version, not the highest row.
  sqlite.prepare("INSERT INTO learning_path_versions VALUES (?, 9, '{\"version\":9}', 'draft', '', '[]', '[]', 'now')").run(journey.id);
  assert.equal((await loadPath(env, journey.id)).version, 3);
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

test('toClient strips the probe answer key everywhere and the raw_request duplicate', async t => {
  const env = { LEARN_DB: learnDb(t).LEARN_DB };
  const created = await createJourney(env, SCOPE, START);
  const legacy = { ...PROBE, id: 'c2', options: [{ id: 'a', label: '0.5', correct: true }, { id: 'b', label: '0', misconception_id: 'sigmoid-linear' }] };
  const journey = await saveJourney(env, { ...created, diagnostic: { probes: [PROBE], asked: [], skipped: false }, section_plan: { section_id: 's1', checks: [{ ...PROBE, id: 'c1' }, legacy] } }, 0);
  const client = toClient({ ...journey, raw_request: journey.request.raw_user_message });
  const probes = [...client.diagnostic.probes, ...client.section_plan.checks];
  assert.equal(probes.length, 3);
  for (const probe of probes) {
    assert.equal('key' in probe, false);
    assert.deepEqual(probe.options, [{ id: 'a', label: '0.5' }, { id: 'b', label: '0' }]);
    assert.equal(probe.prompt, PROBE.prompt);
  }
  assert.equal('raw_request' in client, false);
  assert.equal(client.request.raw_user_message, START.request.raw_user_message);
  assert.deepEqual(journey.diagnostic.probes[0].key, PROBE.key, 'the server copy keeps its key');
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
