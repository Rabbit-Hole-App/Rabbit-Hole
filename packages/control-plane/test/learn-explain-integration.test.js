// EB-09.1 (docs/superpowers/plans/2026-10-30-explain-back.md): the Explain-back text -> review -> revision loop and a
// voice-only answer, end to end through the real attemptRoute, attempt store, private asset store, claim/commit, spend
// admission and A's assessment module on node:sqlite (repository-schema.sql, learn 0034 included). The evaluator
// (deps.callModel) and the transcriber are stubs that record what they receive: this proves wiring, pinning and
// persistence, never assessment quality. No provider is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { attemptRoute } from '../src/learn-attempt-routes.js';
import { readAttemptAsset, transcriptStore } from '../src/learn-attempt-assets.js';
import { ANA, call, never, world } from './learn-attempt-fixture.js';
import { dataOf, replying } from './learn-rich-fixtures.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const IDEAS = ['Explains that the net force points toward the centre and why it is needed to change the direction of motion.', 'States that the velocity is tangent to the circle at each point.'];
const [F, V] = IDEAS.map(idea => `k_${sha(idea).slice(0, 16)}`);
const PROMPT = 'A ball on a string moves in a horizontal circle at constant speed. Explain which way the net force and the velocity point, and why.';
const A1 = 'The velocity is tangent to the circle. The force pushes the ball outward, which is why the string is tight.';
const A2 = 'The velocity is tangent to the circle. The net force points toward the centre: without it the ball would keep going straight.';
// Every key-idea criterion requires reasoning (P ruling, 2026-10-30), so a met judgement carries supported reasoning.
const j = (criterionId, fit, evidence = [], extra = {}) => ({ criterionId, version: 1, fit, reasoning: fit === 'met' ? 'supported' : 'missing', evidence, contradicted: false, alternative: false, uncertain: false, question: null, explanation: `${criterionId} ${fit}`, ...extra });
const REPLY1 = {
  criteria: [j(F, 'not_met', ['The force pushes the ball outward'], { contradicted: true }), j(V, 'met', ['The velocity is tangent to the circle'])],
  feedback: { strengths: { text: 'You say the velocity is tangent.', evidence: ['The velocity is tangent to the circle'] }, revisit: { criterionId: F, version: 1, text: 'Which way must the force point?', evidence: [] }, next: 'What if the string breaks?' },
  priorCorrections: [], notes: [],
};
const REPLY2 = {
  criteria: [j(F, 'met', ['The net force points toward the centre: without it the ball would keep going straight']), j(V, 'met', ['The velocity is tangent to the circle'])],
  feedback: { strengths: { text: 'You now explain the inward force.', evidence: ['without it the ball would keep going straight'] }, revisit: null, next: 'What if the speed doubles?' },
  priorCorrections: [], notes: [],
};
const answer = over => ({ v: 1, kind: 'explain_back', text: '', voice: [], resources: [], assistance: [], ...over });

function media() {
  const objects = new Map();
  return {
    put: async (key, body, { sha256 } = {}) => { const bytes = new Uint8Array(body instanceof ReadableStream || typeof body === 'string' ? await new Response(body).arrayBuffer() : body); if (sha256 && sha(bytes) !== sha256) throw new Error('put: The SHA-256 checksum you specified did not match what we received.'); objects.set(key, bytes); },
    get: async (key, options) => { const b = objects.get(key); if (!b) return null; const { offset = 0, length = b.byteLength - offset } = options?.range || {}; return { body: b.slice(offset, offset + length), size: b.byteLength }; },
  };
}
const setup = t => world(t, { TUTOR_EXPLAIN_BACK_ENABLED: 'true', LEARN_MEDIA: media() });
const authorize = async () => ({ kind: 'canvas', org: ANA.org, user_id: ANA.userId });
async function raw(env, method, path, query, init = {}) {
  const res = await attemptRoute(path, new Request(`https://app.test${path}?${new URLSearchParams({ app: ANA.app, board: ANA.board, ...query })}`, { method, ...init }), env, { authorize });
  return { status: res.status, body: await res.json() };
}
const rowOf = (sqlite, table, id) => JSON.stringify(sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));

test('text loop: attempt 2 is assessed with attempt 1\'s exact answer and pinned review; attempt 1 never changes; replay and stale baselines call nothing', async t => {
  const w = setup(t);
  const bound = (await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card_circle', prompt: PROMPT, expects: IDEAS })).body;
  assert.deepEqual(bound.criterionRefs, [{ criterionId: F, version: 1 }, { criterionId: V, version: 1 }]);
  const submit = (content, key, stub) => call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: bound.activityRevision, submissionKey: key, submittedContent: content }, { ...never, callModel: stub.callModel });

  const s1 = replying(REPLY1);
  const first = await submit(answer({ text: A1 }), 'eb-int-0001', s1);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const a1 = first.body.attempt.attemptId, r1 = first.body.assessment;
  assert.deepEqual([s1.calls.length, r1.status, r1.provenance.review.rating.status, r1.provenance.review.rating.score], [1, 'completed', 'rated', 5]);
  const attempt1Row = rowOf(w.sqlite, 'learn_attempts', a1), review1Row = rowOf(w.sqlite, 'learn_assessments', r1.assessmentId);
  // reading it back calls nothing and returns the stored review
  const read1 = await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${a1}`);
  assert.deepEqual(read1.body.assessment.provenance.review, r1.provenance.review);

  const s2 = replying(REPLY2);
  const baseline = { parentAttemptId: a1, parentAssessmentId: r1.assessmentId };
  const second = await submit(answer({ text: A2, baseline }), 'eb-int-0002', s2);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(s2.calls.length, 1);
  const sent = dataOf(s2.calls[0].body);
  assert.equal(sent.current.evidence[0].text, A2);
  assert.equal(sent.previousAttempt.answer.text, A1, 'the exact first answer');
  const stored1 = r1.provenance.review;
  assert.deepEqual(sent.previousAttempt.review.criteria.map(c => [c.criterionId, c.judgment, c.fit, c.reasoning]), stored1.judgments.map(x => [x.criterionId, x.judgment, x.fit, x.reasoning]), 'the exact pinned review');
  assert.deepEqual(sent.previousAttempt.review.feedback, { strengths: stored1.feedback.strengths.text, revisit: stored1.feedback.revisit.text, next: stored1.feedback.next.text });
  const r2 = second.body.assessment, review2 = r2.provenance.review;
  assert.deepEqual([review2.rating.status, review2.rating.score], ['rated', 10]);
  assert.deepEqual([review2.comparison.parentAttemptId, review2.comparison.parentAssessmentId], [a1, r1.assessmentId]);
  assert.deepEqual(second.body.attempt.assistanceRefs, [`saw_prior_feedback:${r1.assessmentId}`]);
  assert.ok(r2.observations.every(o => o.assistance === 'assisted'), 'improvement after feedback is not unaided');

  // attempt 1 and its review are byte for byte what they were
  assert.equal(rowOf(w.sqlite, 'learn_attempts', a1), attempt1Row);
  assert.equal(rowOf(w.sqlite, 'learn_assessments', r1.assessmentId), review1Row);

  // history: newest first, each with its own stored rating and parent link
  const list = await raw(w.env, 'GET', '/api/learn/tutor/attempts', { cardId: 'card_circle' });
  assert.deepEqual(list.body.attempts.map(a => [a.attemptId, a.parentAttemptId, a.assessment.rating.score]), [[second.body.attempt.attemptId, a1, 10], [a1, null, 5]]);

  // a replay of attempt 2's key returns it and calls nothing
  const again = await submit(answer({ text: A2, baseline }), 'eb-int-0002', s2);
  assert.deepEqual([again.body.replayed, again.body.attempt.attemptId, s2.calls.length], [true, second.body.attempt.attemptId, 1]);

  // a newer review of attempt 1: a revision still naming the old one is refused before anything is called
  const s3 = replying(REPLY1);
  const re = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${a1}/reassess`, { requestKey: 'eb-int-reassess-1' }, { ...never, callModel: s3.callModel });
  assert.equal(re.status, 200, JSON.stringify(re.body));
  const s4 = replying(REPLY2);
  const stale = await submit(answer({ text: `${A2} Again.`, baseline }), 'eb-int-0003', s4);
  assert.deepEqual([stale.status, stale.body.error, stale.body.detail.parentAssessmentId, s4.calls.length], [409, 'stale_baseline', re.body.assessment.assessmentId, 0]);
  assert.equal(rowOf(w.sqlite, 'learn_attempts', a1), attempt1Row, 'a reassessment adds an operation; the attempt is untouched');
});

test('voice only: uploaded through the asset route, transcribed once per audio hash, typed text stays empty', async t => {
  const w = setup(t);
  const bound = (await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card_circle', prompt: PROMPT, expects: IDEAS })).body;
  const audio = new Uint8Array(900); audio.set([...'OggS'].map(c => c.charCodeAt(0))); for (let i = 4; i < audio.length; i += 1) audio[i] = i % 241;
  const up = await raw(w.env, 'PUT', '/api/learn/tutor/attempts/assets', { kind: 'audio', sha256: sha(audio), durationMs: '6000' }, { body: audio, headers: { 'Content-Length': String(audio.byteLength) } });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const said = 'The velocity is tangent to the circle. The net force points toward the centre because without it the ball would keep going straight.';
  const heard = [];
  const transcriber = { provider: 'openai', model: 'gpt-4o-transcribe', transcribe: async ({ bytes, mime }) => { heard.push({ bytes: bytes.length, mime }); return { text: said, segments: [{ start: 0, end: 6, text: said }] }; } };
  const deps = stub => ({ ...never, callModel: stub.callModel, readAttemptAsset, transcriptStore: transcriptStore(w.env, ANA), transcriber });
  const voice = { evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: up.body.asset.assetId, revision: 1, hash: up.body.asset.sha256, mime: up.body.asset.mime, bytes: up.body.asset.bytes, durationMs: 6000 };
  const reply = { criteria: [j(F, 'met', ['The net force points toward the centre because without it the ball would keep going straight']), j(V, 'met', ['The velocity is tangent to the circle'])], feedback: { strengths: { text: 'Clear.', evidence: ['The velocity is tangent to the circle'] }, revisit: null, next: 'What if the speed doubles?' }, priorCorrections: [], notes: [] };
  const s1 = replying(reply);
  const first = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: 1, submissionKey: 'eb-voice-0001', submittedContent: answer({ voice: [voice] }) }, deps(s1));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.attempt.submittedContent.text, '', 'the transcript never enters the typed answer');
  assert.deepEqual(heard, [{ bytes: audio.byteLength, mime: 'audio/ogg' }]);
  const part = dataOf(s1.calls[0].body).current.evidence;
  assert.deepEqual(part.map(p => [p.kind, p.text]), [['voice_transcript', said]]);
  const review = first.body.assessment.provenance.review;
  assert.deepEqual([review.coverage[0].evidenceId, review.coverage[0].inspected.transcriptOnly], ['ev_voice_1', true]);
  assert.equal(review.rating.score, 10);
  const stored = await transcriptStore(w.env, ANA).get(review.coverage[0].derivative.derivativeId);
  assert.deepEqual([stored.status, stored.text, stored.hash], ['ready', said, sha(audio)]);

  // a revision re-submitting the same clip reuses its transcript: no second transcription
  const s2 = replying(reply);
  const second = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: 1, submissionKey: 'eb-voice-0002',
    submittedContent: answer({ voice: [voice], baseline: { parentAttemptId: first.body.attempt.attemptId, parentAssessmentId: first.body.assessment.assessmentId } }) }, deps(s2));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual([heard.length, s2.calls.length], [1, 1]);
});
