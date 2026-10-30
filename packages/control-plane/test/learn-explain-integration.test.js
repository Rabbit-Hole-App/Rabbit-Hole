// EB-09.1 (docs/superpowers/plans/2026-10-30-explain-back.md): the Explain-back text -> review -> revision loop and a
// voice-only answer, end to end through the real attemptRoute, attempt store, private asset store, claim/commit, spend
// admission and A's assessment module on node:sqlite (repository-schema.sql, learn 0034 included). The evaluator
// (deps.callModel) and the transcriber are stubs that record what they receive: this proves wiring, pinning and
// persistence, never assessment quality. No provider is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { attemptRoute } from '../src/learn-attempt-routes.js';
import { readAttemptAsset, readFrozenSnapshot, transcriptStore } from '../src/learn-attempt-assets.js';
import { canonical, readAttempt } from '../src/learn-attempt-store.js';
import { ANA, BEN, call, never, world } from './learn-attempt-fixture.js';
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

// --- EB-09.4 server matrix -----------------------------------------------------------------------------------------------
const OGG = tag => { const b = new Uint8Array(600); b.set([...'OggS'].map(c => c.charCodeAt(0))); b[4] = tag; for (let i = 5; i < b.length; i += 1) b[i] = (i * tag) % 251; return b; };
const PNG = (() => { const b = new Uint8Array(400); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < b.length; i += 1) b[i] = i % 199; return b; })();
const TIMELINE = { v: 1, kind: 'sketch-timeline', startedAt: '2026-10-30T00:00:00.000Z', durationMs: 20000, limitMs: 120000, narration: true, start: { strokes: [], shapes: [], items: [] },
  ops: [{ t: 1000, k: 'shapes', keep: 0, add: [{ kind: 'arrow', x1: 200, y1: 100, x2: 120, y2: 100, label: 'F outward' }] }, { t: 9000, k: 'shapes', keep: 0, add: [{ kind: 'arrow', x1: 200, y1: 100, x2: 120, y2: 100, label: 'F to the centre' }] }], pauses: [] };
const NOTE_SNAP = { id: 'note-1', type: 'note', text: 'Tension in the string pulls the ball toward the centre.' };
const NB_SNAP = { notebook: 'nb-1', path: null, cells: [{ id: 'c1', type: 'code', source: 'v = 2 * 3.14 * r / T', outputs: [{ output_type: 'stream', text: '6.28' }], executionCount: 1 }] };
const SAID = { 1: 'The velocity is tangent to the circle at every point.', 2: 'No wait, now the arrow points to the centre because the string pulls the ball in.' };

async function mixedWorld(t) {
  const w = setup(t);
  const bound = (await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card_circle', prompt: PROMPT, expects: IDEAS })).body;
  const up = async (bytes, kind, durationMs) => (await raw(w.env, 'PUT', '/api/learn/tutor/attempts/assets', { kind, sha256: sha(bytes), ...(durationMs ? { durationMs: String(durationMs) } : {}) }, { body: bytes, headers: { 'Content-Length': String(bytes.byteLength) } })).body.asset;
  const voiceA = await up(OGG(1), 'audio', 4000), narrA = await up(OGG(2), 'audio', 20000), png = await up(PNG, 'image');
  const timeline = await up(new TextEncoder().encode(JSON.stringify(TIMELINE)), 'timeline', 20000);
  await raw(w.env, 'PUT', `/api/learn/tutor/attempts/assets/${png.assetId}`, {}, { body: JSON.stringify({ app: ANA.app, board: ANA.board, marks: 2, text: 'F to the centre' }), headers: { 'Content-Type': 'application/json' } });
  const ref = (a, role, media, evidenceId, extra = {}) => ({ evidenceId, role, media, state: 'ready', assetId: a.assetId, revision: 1, hash: a.sha256, mime: a.mime, bytes: a.bytes, ...extra });
  const narration = ref(narrA, 'voice', 'audio', 'ev_narr', { durationMs: 20000 });
  const noteHash = sha(canonical(NOTE_SNAP)), nbHash = sha(canonical(NB_SNAP));
  const content = answer({
    text: A2,
    voice: [ref(voiceA, 'voice', 'audio', 'ev_voice', { durationMs: 4000 })],
    sketch: ref(png, 'sketch', 'image', 'ev_sketch'),
    recording: ref(timeline, 'recording', 'sketch_timeline', 'ev_rec', { durationMs: 20000, narration }),
    resources: [
      { evidenceId: 'ev_note', role: 'resource', media: 'card', state: 'ready', sourceKind: 'card', assetId: 'note-1', revision: noteHash, hash: noteHash, board: ANA.board, label: 'Tension note' },
      { evidenceId: 'ev_group', role: 'resource', media: 'group', state: 'ready', sourceKind: 'group', assetId: 'grp-1', revision: 1, board: ANA.board, label: 'Forces',
        members: [{ sourceKind: 'card', sourceId: 'note-1', revision: noteHash, hash: noteHash, board: ANA.board, media: 'card', state: 'ready' },
          { sourceKind: 'notebook', sourceId: 'nb-1', revision: nbHash, hash: nbHash, board: ANA.board, media: 'notebook', state: 'ready' }] },
    ],
  });
  const heard = [];
  const transcriber = { provider: 'openai', model: 'gpt-4o-transcribe', transcribe: async ({ bytes }) => { heard.push(bytes[4]); return { text: SAID[bytes[4]], segments: [{ start: 0, end: 4, text: SAID[bytes[4]] }] }; } };
  const deps = (callModel, extra = {}) => ({ ...never, callModel, transcriber, ...extra });
  const submit = (c, key, d, snapshots = [NOTE_SNAP, NB_SNAP]) => call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: 1, submissionKey: key, submittedContent: c, snapshots }, d);
  return { w, bound, content, heard, deps, submit, assets: { voiceA, narrA, png, timeline } };
}
const MIXED_REPLY = {
  criteria: [j(F, 'met', ['The net force points toward the centre: without it the ball would keep going straight']), j(V, 'met', ['The velocity is tangent to the circle'])],
  feedback: { strengths: { text: 'You explain both directions.', evidence: ['The velocity is tangent to the circle'] }, revisit: null, next: 'What if the speed doubles?' }, priorCorrections: [], notes: [],
};

test('mixed answer: every selected input reaches the request or explicit coverage; narration once; direct and Group links read once', async t => {
  const { w, content, heard, deps, submit } = await mixedWorld(t);
  const stub = replying(MIXED_REPLY);
  const r = await submit(content, 'eb-mixed-0001', deps(stub.callModel));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(stub.calls.length, 1, 'one coordinated assessment');
  assert.deepEqual(heard.sort(), [1, 2], 'the voice note and the narration, each transcribed once');
  const evidence = dataOf(stub.calls[0].body).current.evidence;
  const byId = Object.fromEntries(evidence.map(p => [p.id, p]));
  assert.equal(byId.text.text, A2);
  assert.deepEqual([byId.ev_voice.kind, byId.ev_voice.text], ['voice_transcript', SAID[1]]);
  assert.deepEqual([byId.ev_sketch.kind, byId.ev_sketch.labels], ['sketch', 'F to the centre']);
  assert.equal(byId.ev_rec.kind, 'sketch_recording');
  assert.equal(byId.ev_rec.narration.text, SAID[2], 'narration rides the recording');
  assert.ok(!evidence.some(p => p.id === 'ev_narr'), 'and is not sent again as a voice note');
  assert.ok(evidence.some(p => p.kind === 'resource' && JSON.stringify(p).includes(NOTE_SNAP.text)), 'the frozen note');
  assert.ok(evidence.some(p => p.kind === 'resource' && JSON.stringify(p).includes('2 * 3.14')), 'the frozen Notebook cell');
  assert.equal(evidence.filter(p => JSON.stringify(p).includes(NOTE_SNAP.text)).length, 1, 'the note linked directly and through the Group is read once');
  const content0 = stub.calls[0].body.messages[0].content;
  assert.ok(Array.isArray(content0) && content0.some(b => b.type === 'image' && b.source.media_type === 'image/png'), 'the Sketch image itself');
  const review = r.body.assessment.provenance.review;
  assert.equal(r.body.assessment.status, 'completed', JSON.stringify(r.body.assessment.reason));
  const coverage = Object.fromEntries(review.coverage.map(c => [c.memberId ? `${c.evidenceId}/${c.memberId}` : c.evidenceId, c]));
  for (const id of ['text', 'ev_voice', 'ev_sketch', 'ev_rec', 'ev_narr', 'ev_note', 'ev_group', 'ev_group/note-1', 'ev_group/nb-1']) assert.ok(coverage[id], `coverage for ${id}`);
  assert.match(coverage.ev_narr.note, /^same_as:ev_rec/);
  assert.match(coverage['ev_group/note-1'].note, /^same_as:ev_note/);
  assert.equal(coverage['ev_group/nb-1'].inspected.codeRun, false, 'code was read, never run');
  assert.equal(r.body.attempt.submittedContent.text, A2, 'no transcript in the typed answer');
});

test('privacy: another learner, board or fork reads no attempt, history, asset, draft or frozen snapshot', async t => {
  const { w, content, deps, submit, assets } = await mixedWorld(t);
  const r = await submit(content, 'eb-mixed-0002', deps(replying(MIXED_REPLY).callModel));
  const attemptId = r.body.attempt.attemptId;
  await raw(w.env, 'PUT', '/api/learn/tutor/attempts/drafts', {}, { body: JSON.stringify({ app: ANA.app, board: ANA.board, cardId: 'card_circle', expectedRevision: 0, answer: answer({ text: 'draft' }) }), headers: { 'Content-Type': 'application/json' } });
  const { attempt } = await readAttempt(w.env, ANA, attemptId);
  for (const other of [BEN, { ...ANA, board: 'side' }, { ...ANA, app: 'canvas-fork-0001' }]) {
    const as = async (method, path, query = {}) => {
      const res = await attemptRoute(path, new Request(`https://app.test${path}?${new URLSearchParams({ app: other.app, board: other.board, ...query })}`, { method }), w.env, { authorize: async () => ({ kind: 'canvas', org: other.org, user_id: other.userId }) });
      return { status: res.status, body: await res.json() };
    };
    const tag = JSON.stringify(other);
    assert.equal((await as('GET', `/api/learn/tutor/attempts/${attemptId}`)).status, 404, tag);
    assert.deepEqual((await as('GET', '/api/learn/tutor/attempts', { cardId: 'card_circle' })).body, { attempts: [] }, tag);
    for (const a of Object.values(assets)) assert.equal((await as('GET', `/api/learn/tutor/attempts/assets/${a.assetId}`)).status, 404, tag);
    assert.deepEqual((await as('GET', '/api/learn/tutor/attempts/drafts', { cardId: 'card_circle' })).body, { draft: null }, tag);
    assert.equal(await readFrozenSnapshot(w.env, other, attempt, content.resources[0]), null, tag);
    assert.equal(await readAttemptAsset(w.env, other, attempt, content.sketch), null, tag);
  }
  // the owner still reads all of it
  assert.deepEqual(await readFrozenSnapshot(w.env, ANA, attempt, content.resources[0]), { snapshot: NOTE_SNAP });
});

test('recovery: a lost response replays; a timeout or slow preparation calls nothing more; reassessment and revision are distinct', async t => {
  const { w, content, heard, deps, submit } = await mixedWorld(t);
  const text = answer({ text: A2 });
  // the evaluator never answers: the operation ends unknown, and nothing calls it again on its own
  let hung = 0;
  const hang = async () => { hung += 1; return new Promise(() => {}); };
  const timedOut = await submit(text, 'eb-rec-0001', deps(hang, { timeoutMs: 20 }), undefined);
  assert.deepEqual([timedOut.status, timedOut.body.assessment.status, timedOut.body.assessment.reason, hung], [200, 'unknown', 'completion_unknown', 1]);
  // the response was lost: the same key returns the same attempt and operation, and calls nothing
  const replay = await submit(text, 'eb-rec-0001', deps(hang, { timeoutMs: 20 }), undefined);
  assert.deepEqual([replay.body.replayed, replay.body.attempt.attemptId, replay.body.assessment.assessmentId, hung], [true, timedOut.body.attempt.attemptId, timedOut.body.assessment.assessmentId, 1]);
  assert.equal((await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${timedOut.body.attempt.attemptId}`)).body.assessment.status, 'unknown', 'reading calls nothing');
  assert.equal(hung, 1);

  // slow preparation: under 15 s of the claim left after reading the evidence, no evaluator call
  let ticks = 0, slowCalls = 0;
  const now = () => (ticks++ === 0 ? 1_000_000 : 1_046_000);
  const slow = await submit(content, 'eb-rec-0002', deps(async (...a) => { slowCalls += 1; return replying(MIXED_REPLY).callModel(...a); }, { now }));
  assert.deepEqual([slow.body.assessment.status, slow.body.assessment.reason, slowCalls], ['failed', 'preparation_slow', 0]);
  const transcribed = heard.length;

  // an explicit reassessment: a new operation on the same attempt (the stored transcripts are reused)
  const s = replying(MIXED_REPLY);
  const re = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${slow.body.attempt.attemptId}/reassess`, { requestKey: 'eb-rec-reassess-1' }, deps(s.callModel));
  assert.equal(re.status, 200, JSON.stringify(re.body));
  assert.deepEqual([re.body.attempt.attemptId, re.body.assessments.length, re.body.assessment.status, s.calls.length, heard.length], [slow.body.attempt.attemptId, 2, 'completed', 1, transcribed]);
  // a new revision: a new attempt with its own key and a baseline, the reassessed attempt untouched
  const rev = await submit(answer({ text: `${A2} Revised.`, baseline: { parentAttemptId: slow.body.attempt.attemptId, parentAssessmentId: re.body.assessment.assessmentId } }), 'eb-rec-0003', deps(replying(MIXED_REPLY).callModel), undefined);
  assert.equal(rev.status, 200, JSON.stringify(rev.body));
  assert.notEqual(rev.body.attempt.attemptId, slow.body.attempt.attemptId);
  const list = await raw(w.env, 'GET', '/api/learn/tutor/attempts', { cardId: 'card_circle' });
  assert.deepEqual(list.body.attempts.map(a => a.attemptId), [rev.body.attempt.attemptId, slow.body.attempt.attemptId, timedOut.body.attempt.attemptId]);
});

test('learners see no dollar amounts or diagnostics: no response from the attempt routes has a cost, usd, micros, model, usage or latency key; the store keeps them', async t => {
  const { w, content, deps, submit } = await mixedWorld(t);
  const keys = (value, out = []) => { if (Array.isArray(value)) value.forEach(v => keys(v, out)); else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); keys(v, out); } return out; };
  const priced = body => keys(body).filter(k => /cost|usd|micros|price|margin/i.test(k));
  const r = await submit(content, 'eb-cost-0001', deps(replying(MIXED_REPLY).callModel));
  const id = r.body.attempt.attemptId;
  const legacy = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: (await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card_text', prompt: PROMPT, expects: IDEAS })).body.activityId, activityRevision: 1, submissionKey: 'eb-cost-0002', submittedContent: answer({ text: A1 }) }, deps(replying(REPLY1).callModel));
  const responses = {
    submit: r.body, legacySubmit: legacy.body,
    read: (await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${id}`)).body,
    list: (await raw(w.env, 'GET', '/api/learn/tutor/attempts', { cardId: 'card_circle' })).body,
    reassess: (await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${id}/reassess`, { requestKey: 'eb-cost-reassess' }, deps(replying(MIXED_REPLY).callModel))).body,
  };
  for (const [name, body] of Object.entries(responses)) {
    assert.deepEqual(priced(body), [], name);
    // and no internal diagnostics: provider calls, model names, token usage or latency (P ruling, 2026-10-30)
    assert.deepEqual(keys(body).filter(k => k === 'calls' || /model|tokens|usage|latency/i.test(k)), [], name);
  }
  assert.ok(responses.read.assessment.provenance.review, 'what the card reads stays');
  const stored = (await readAttempt(w.env, ANA, id)).assessments;
  assert.ok(stored.some(a => a.provenance.calls?.some(c => typeof c.costUsd === 'number')), 'the stored provenance keeps the cost for the ledger');
});
