// packages/control-plane/test/learn-visual-assessment.test.js
// Tutor Task 14 (C:/s/spec/tutor-workflow/draft.md; owner decision 7a): visual assessment of submitted drawings, through the
// real attempt route, store, capability gate and image authorization (learn-image-context.js) on node:sqlite with an
// in-memory R2. The Opus 5.5 visual role is a stub behind the real spend admission; no provider is reached. Stubs prove
// wiring, never visual understanding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCriterionSummary } from '../../web/src/learn-coaching-contract.js';
import { acceptAttempt, readAttempt } from '../src/learn-attempt-store.js';
import { assessAttempt } from '../src/learn-assessment.js';
import { drawingImage } from '../src/learn-visual-assessment.js';
import { putUploadedMedia } from '../src/learn-media.js';
import { paperIdentity } from '../src/learn-paper.js';
import { ANA, BEN, never, submit, world } from './learn-attempt-fixture.js';
import { ANA_EMAIL, SIGMOID, VISUAL_CASES, WATER, boardWith, coachingActivity, dataOf, replying } from './learn-rich-fixtures.js';

const ON = { TUTOR_VISUAL_ASSESSMENT_ENABLED: 'true' };
// A 1x1 PNG, and an edited version of it (still sniffed as PNG, different bytes and hash).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const EDITED = Buffer.concat([PNG, Buffer.from('edited after submission')]);
const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const ACCESS = { kind: 'canvas', org: ANA.org, user_id: ANA.userId, email: ANA_EMAIL };
const imageCardOf = (id, sourceId, rev) => ({ id, type: 'file', kind: 'image', dx: 0, dy: 0, label: 'drawing.png', fileRef: { source: { id: sourceId, rev } } });
const sentImages = body => body.messages[0].content.filter(block => block.type === 'image');
const statusOf = (body, criteria) => Object.fromEntries(criteria.map(c => [c.criterionId, deriveCriterionSummary({ criterion: { ...c, version: 1 }, observations: body.assessments.flatMap(a => a.observations) })]));

// An R2 bucket in memory that records every read.
function bucket() {
  const store = new Map(), reads = [];
  return {
    store, reads,
    put: async (key, value, options = {}) => { store.set(key, { bytes: new Uint8Array(value), ...options }); },
    get: async key => {
      reads.push(key);
      const hit = store.get(key);
      if (!hit) return null;
      const copy = hit.bytes.slice();
      return { key, size: copy.length, arrayBuffer: async () => copy.buffer, httpMetadata: hit.httpMetadata, customMetadata: hit.customMetadata };
    },
    delete: async key => { store.delete(key); },
  };
}

// ANA's canvas with an image card whose stored source the board references (learn 0023), the bytes in R2.
async function visualWorld(t, { env = {}, criteria = SIGMOID, prompt = VISUAL_CASES.labelledSigmoid.prompt } = {}) {
  const w = world(t, { ...ON, ...env });
  const media = bucket();
  w.env.LEARN_MEDIA = media;
  const store = async (sourceId, bytes) => {
    const sha = await hex(bytes);
    w.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'image', 'drawing.png', 'image/png', ?, ?, ?, 'stored', 1, 1)")
      .run(sourceId, ANA.org, ANA_EMAIL, ANA.app, 'board-ana-main', bytes.length, sha, `r2-${sourceId}`);
    w.sqlite.prepare('INSERT INTO file_source_refs (source_id, board_id) VALUES (?, ?)').run(sourceId, 'board-ana-main');
    await media.put(`r2-${sourceId}`, bytes, { httpMetadata: { contentType: 'image/png' } });
    return sha;
  };
  const rev = await store('fs1', PNG);
  boardWith(w.sqlite, [imageCardOf('img1', 'fs1', rev)]);
  const { activity, goalId } = await coachingActivity(w.env, { label: 'Sketch', criteria, prompt, responseKind: 'drawing' });
  const capture = async (bytes, who = ANA) => (await putUploadedMedia(w.env, paperIdentity({ org: who.org, name: who.app, email: `${who.userId}@test` }), new File([bytes], 'capture.png', { type: 'image/png' }))).id;
  return { ...w, media, store, rev, activity, goalId, capture };
}
const drawing = (w, content, deps, key) => submit(w.env, ANA, w.activity, { submissionKey: key ?? `sub-${Math.random().toString(36).slice(2, 12)}`, submittedContent: content }, deps);
const card = rev => ({ image: { block_id: 'img1', source: { id: 'fs1', rev } } });

test('visual_bytes_reach_correct_route: the authorized image bytes, not an id or a summary, go to the Opus 5.5 visual role; JEV is never asked', async t => {
  const w = await visualWorld(t);
  const stub = replying(VISUAL_CASES.labelledSigmoid.reply);
  const r = await drawing(w, card(w.rev), { ...never, callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = r.body.assessment;
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].model, 'claude-opus-5-5');
  const images = sentImages(stub.calls[0].body);
  assert.equal(images.length, 1, 'one image block');
  assert.ok(Buffer.from(images[0].source.data, 'base64').equals(PNG), 'the exact stored bytes');
  assert.deepEqual([a.status, a.route, a.provenance.route, a.provenance.calls[0].role], ['completed', 'larger', 'visual', 'tutor_visual']);
  assert.deepEqual(a.provenance.image, { kind: 'card', blockId: 'img1', sourceId: 'fs1', rev: w.rev, mediaType: 'image/png', bytes: PNG.length, sha256: w.rev });
  assert.deepEqual(dataOf(stub.calls[0].body).rubric.map(c => c.criterionId), ['sigmoid']);
  assert.deepEqual(a.observations.map(o => [o.criterionId, o.fit, o.reason]), [['sigmoid', 'met', 'rubric_met']]);
  assert.equal(statusOf(r.body, SIGMOID).sigmoid.status, 'demonstrated_independently');
  // A capture is read under the learner's own identity, by its immutable id.
  const id = await w.capture(EDITED);
  const media = replying(VISUAL_CASES.labelledSigmoid.reply);
  const m = await drawing(w, { image: { id }, explanation: 'The dashed line marks 0.5.' }, { ...never, callModel: media.callModel });
  assert.ok(Buffer.from(sentImages(media.calls[0].body)[0].source.data, 'base64').equals(EDITED));
  assert.deepEqual([m.body.assessment.provenance.image.kind, m.body.assessment.provenance.image.mediaId], ['media', id]);
  assert.equal(dataOf(media.calls[0].body).explanation, 'The dashed line marks 0.5.', 'the learner\'s own words travel with the image');
});

test('unreadable_axes_are_not_misconception: unreadable or ambiguous parts are unclear with a clarification question, never not met', async t => {
  const w = await visualWorld(t);
  const r = await drawing(w, card(w.rev), { ...never, callModel: replying(VISUAL_CASES.ambiguousAxes.reply).callModel });
  const a = r.body.assessment;
  assert.deepEqual(a.observations.map(o => [o.fit, o.reasoning, o.conflict, o.reason]), [['unclear', 'unclear', false, 'perception_unreadable']]);
  assert.ok(!JSON.stringify(a.observations).includes('misconception'), 'the model\'s misconception reading is not stored');
  assert.deepEqual(a.provenance.clarifications, [{ criterionId: 'sigmoid', version: 1, question: 'What did you label the vertical axis?' }]);
  assert.deepEqual((({ status, reason }) => [status, reason])(statusOf(r.body, SIGMOID).sigmoid), ['not_checked', 'not_interpretable'], 'no negative evidence');
  // The whole drawing unreadable: every criterion is unclear, with one question.
  const water = await visualWorld(t, { criteria: WATER, prompt: VISUAL_CASES.unreadableHandwriting.prompt });
  const u = await drawing(water, card(water.rev), { ...never, callModel: replying(VISUAL_CASES.unreadableHandwriting.reply).callModel });
  assert.deepEqual(u.body.assessment.observations.map(o => [o.criterionId, o.fit, o.reason]), [['evaporation', 'unclear', 'perception_unreadable'], ['routes', 'unclear', 'perception_unreadable']]);
  assert.deepEqual(u.body.assessment.provenance.clarifications.map(c => c.question), ['Could you type the labels on your arrows?']);
});

test('valid_alternative_is_not_forced_wrong: a valid alternative route meets the criterion; a reply calling it not met is a conflict, never a fail', async t => {
  const w = await visualWorld(t, { criteria: WATER, prompt: VISUAL_CASES.waterAlternative.prompt });
  const stub = replying(VISUAL_CASES.waterAlternative.reply);
  const r = await drawing(w, card(w.rev), { ...never, callModel: stub.callModel });
  assert.deepEqual(r.body.assessment.observations.map(o => [o.criterionId, o.fit, o.reason]), [['evaporation', 'met', 'rubric_met'], ['routes', 'met', 'valid_alternative']]);
  assert.equal(dataOf(stub.calls[0].body).task, VISUAL_CASES.waterAlternative.prompt);
  assert.match(stub.calls[0].body.system, /Several valid answers can exist/);
  const forced = structuredClone(VISUAL_CASES.waterAlternative.reply);
  Object.assign(forced.criteria[1], { fit: 'not_met', evidence: [] });
  const f = await drawing(w, card(w.rev), { ...never, callModel: replying(forced).callModel });
  const routes = f.body.assessment.observations.find(o => o.criterionId === 'routes');
  assert.deepEqual([routes.fit, routes.conflict, routes.reason], ['unclear', true, 'alternative_conflict']);
  assert.equal(statusOf(f.body, WATER).routes.status, 'needs_review');
});

test('new_drawing_not_graded_by_old_result: a card edited after submission is never read for the old attempt; the new drawing gets its own result', async t => {
  const w = await visualWorld(t);
  const old = await acceptAttempt(w.env, ANA, { activityId: w.activity.activityId, activityRevision: 1, submissionKey: 'sub-old-drawing', submittedContent: card(w.rev), sourceRefs: [], assistanceRefs: [] });
  // The learner keeps drawing: the card now shows a new stored revision.
  const rev2 = await w.store('fs2', EDITED);
  boardWith(w.sqlite, [{ ...imageCardOf('img1', 'fs2', rev2) }]);
  const stub = replying(VISUAL_CASES.labelledSigmoid.reply);
  const late = await assessAttempt(w.env, ANA, old.attemptId, { ...never, callModel: stub.callModel, access: ACCESS });
  assert.deepEqual([late.status, late.reason, late.observations, stub.calls.length], ['unavailable', 'image_changed', [], 0]);
  assert.ok(!w.media.reads.includes('r2-fs2'), 'the newer drawing was never read for the old attempt');
  // The newer drawing is its own submission, with its own result.
  const fresh = await drawing(w, { image: { block_id: 'img1', source: { id: 'fs2', rev: rev2 } } }, { ...never, callModel: stub.callModel });
  assert.deepEqual([fresh.body.assessment.status, fresh.body.assessment.provenance.image.sha256], ['completed', rev2]);
  assert.ok(fresh.body.assessment.observations.every(o => o.attemptId === fresh.body.attempt.attemptId));
  assert.deepEqual((await readAttempt(w.env, ANA, old.attemptId)).assessments.map(a => [a.status, a.observations.length]), [['unavailable', 0]]);
  // A capture is the submitted version itself: edits to the canvas afterwards never change what is assessed.
  const id = await w.capture(PNG);
  const captured = await acceptAttempt(w.env, ANA, { activityId: w.activity.activityId, activityRevision: 1, submissionKey: 'sub-capture-01', submittedContent: { image: { id } }, sourceRefs: [], assistanceRefs: [] });
  boardWith(w.sqlite, [imageCardOf('img1', 'fs2', rev2), { id: 'stroke-note', type: 'text', text: 'new arrows' }]);
  const later = replying(VISUAL_CASES.labelledSigmoid.reply);
  const done = await assessAttempt(w.env, ANA, captured.attemptId, { ...never, callModel: later.callModel, access: ACCESS });
  assert.equal(done.status, 'completed');
  assert.ok(Buffer.from(sentImages(later.calls[0].body)[0].source.data, 'base64').equals(PNG));
});

test('revoked_image_never_reaches_provider: an unreferenced, deleted or foreign image is unavailable before any call', async t => {
  const w = await visualWorld(t);
  w.sqlite.prepare('DELETE FROM file_source_refs WHERE source_id = ?').run('fs1');
  const stub = replying(VISUAL_CASES.labelledSigmoid.reply);
  const r = await drawing(w, card(w.rev), { ...never, callModel: stub.callModel });
  assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, stub.calls.length], ['unavailable', 'image_unavailable', 0]);
  assert.ok(!w.media.reads.includes('r2-fs1'), 'the bytes were not even read');
  // A deleted source, and an image card no longer on the board.
  w.sqlite.prepare('INSERT INTO file_source_refs (source_id, board_id) VALUES (?, ?)').run('fs1', 'board-ana-main');
  w.sqlite.prepare("UPDATE file_sources SET status = 'deleted' WHERE id = 'fs1'").run();
  assert.equal((await drawing(w, card(w.rev), { ...never, callModel: stub.callModel })).body.assessment.reason, 'image_unavailable');
  boardWith(w.sqlite, []);
  assert.equal((await drawing(w, card(w.rev), { ...never, callModel: stub.callModel })).body.assessment.reason, 'image_unavailable');
  // A capture another learner made is not readable under this learner's identity; a removed capture is gone.
  const theirs = await w.capture(PNG, BEN);
  assert.equal((await drawing(w, { image: { id: theirs } }, { ...never, callModel: stub.callModel })).body.assessment.reason, 'image_unavailable');
  const mine = await w.capture(PNG);
  for (const key of [...w.media.store.keys()].filter(k => k.endsWith(mine))) await w.media.delete(key);
  assert.equal((await drawing(w, { image: { id: mine } }, { ...never, callModel: stub.callModel })).body.assessment.reason, 'image_unavailable');
  assert.equal(stub.calls.length, 0);
});

test('autosave_strokes_never_assess: strokes are not a submission; only an explicit image reference is assessed, once per submission', async t => {
  const w = await visualWorld(t);
  const stub = replying(VISUAL_CASES.labelledSigmoid.reply);
  const before = w.media.reads.length;
  const strokes = await drawing(w, { strokes: [{ points: [[0, 0], [10, 10]] }] }, { ...never, callModel: stub.callModel });
  assert.deepEqual([strokes.body.assessment.status, strokes.body.assessment.reason, stub.calls.length, w.media.reads.length], ['unavailable', 'no_image', 0, before]);
  // Autosaving the board writes no attempt and no assessment.
  const count = () => w.sqlite.prepare('SELECT (SELECT COUNT(*) FROM learn_attempts) AS attempts, (SELECT COUNT(*) FROM learn_assessments) AS ops').get();
  const was = count();
  boardWith(w.sqlite, [imageCardOf('img1', 'fs1', w.rev), { id: 's1', type: 'text', text: 'more strokes' }]);
  assert.deepEqual(count(), was);
  // A malformed reference is no image either.
  for (const content of [{ image: { block_id: 'img1' } }, { image: { block_id: 'img1', source: { id: 'fs1', rev: 'not-a-hash' } } }, { image: { id: 'media:short' } }]) assert.equal(drawingImage(content), null);
  // The explicit submission is assessed once; a retry replays it.
  const key = 'sub-explicit-01';
  await drawing(w, card(w.rev), { ...never, callModel: stub.callModel }, key);
  await drawing(w, card(w.rev), { ...never, callModel: stub.callModel }, key);
  assert.equal(stub.calls.length, 1);
});

test('the visual gate and spend: off by default; a refused allowance makes no call and observes nothing', async t => {
  const off = await visualWorld(t, { env: { TUTOR_VISUAL_ASSESSMENT_ENABLED: undefined } });
  const r = await drawing(off, card(off.rev), never);
  assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, r.body.assessment.provenance.gate], ['unavailable', 'visual_not_supported', 'disabled']);
  const capped = await visualWorld(t, { env: { SMALL_ENV: 'dev' } });
  const stub = replying(VISUAL_CASES.labelledSigmoid.reply);
  const refused = await drawing(capped, card(capped.rev), { ...never, callModel: stub.callModel });
  assert.deepEqual([refused.body.assessment.status, refused.body.assessment.reason, refused.body.assessment.observations, stub.calls.length], ['unavailable', 'allowance_refused', [], 0]);
});
