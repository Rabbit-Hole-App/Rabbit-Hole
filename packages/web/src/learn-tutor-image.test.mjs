import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTutorImage, submittedDrawing } from './learn-tutor-image.js';

test('a selected image waits for its remote save before yielding a block reference', async () => {
  let finish, resolved = false;
  const saving = new Promise(resolve => { finish = resolve; });
  const canvas = { block: id => ({ id, type: 'file', kind: 'image', mediaId: 'media:old' }), persist: () => saving };
  const ready = prepareTutorImage({ canvas, targetId: 'new-drop' }).then(value => { resolved = true; return value; });
  await Promise.resolve();
  assert.equal(resolved, false);
  finish({ ok: true, remote: 'ok' });
  assert.deepEqual(await ready, { image: { block_id: 'new-drop' } });
});

test('an attached card also flushes; failed, skipped or thrown saves yield a useful notice and no reference', async () => {
  for (const result of [{ ok: false, remote: 'failed' }, { ok: true, remote: 'skipped' }, null, new Error('offline')]) {
    const out = await prepareTutorImage({ image: { block_id: 'attached' }, canvas: { persist: async () => { if (result instanceof Error) throw result; return result; } } });
    assert.equal(out.image, null);
    assert.match(out.notice, /image.*could not be saved/i);
  }
  assert.deepEqual(await prepareTutorImage({ image: { block_id: 'attached' }, canvas: { persist: async () => ({ ok: true, remote: 'ok' }) } }), { image: { block_id: 'attached' } });
});

test('captures and detached context never flush or infer an image from an old selection', async () => {
  const canvas = { block: () => { throw Error('no selected card'); }, persist: () => { throw Error('no flush needed'); } };
  assert.deepEqual(await prepareTutorImage({ canvas, image: { id: 'media:0123456789ab' } }), { image: { id: 'media:0123456789ab' } });
  assert.deepEqual(await prepareTutorImage({ canvas }), { image: null });
});

// Tutor Task 14 (autosave_strokes_never_assess, browser half): a drawing becomes a submission only as a saved, stored image.
test('a submitted drawing freezes the stored revision after the save; strokes, an unsaved card or a legacy image submit nothing', async () => {
  const rev = 'a'.repeat(64);
  let saved = false;
  const canvas = { block: id => ({ id, type: 'file', kind: 'image', ...(saved ? { fileRef: { source: { id: 'fs-9', rev } } } : {}) }), persist: async () => { saved = true; return { ok: true, remote: 'ok' }; } };
  assert.deepEqual(await submittedDrawing({ canvas, targetId: 'img-1' }), { image: { block_id: 'img-1', source: { id: 'fs-9', rev } } }, 'the revision read after the save');
  for (const persist of [async () => ({ ok: false, remote: 'failed' }), async () => { throw new Error('offline'); }]) {
    const out = await submittedDrawing({ canvas: { block: canvas.block, persist }, targetId: 'img-1' });
    assert.equal(out.image, null);
    assert.match(out.notice, /not submitted/);
  }
  const legacy = { block: id => ({ id, type: 'file', kind: 'image', mediaId: 'media:old' }), persist: async () => ({ ok: true, remote: 'ok' }) };
  assert.equal((await submittedDrawing({ canvas: legacy, targetId: 'img-2' })).image, null, 'no stored revision, nothing to freeze');
  const strokes = { block: () => null, persist: () => { throw Error('no flush for strokes'); } };
  assert.deepEqual(await submittedDrawing({ canvas: strokes, targetId: 'stroke-1' }), { image: null });
  assert.deepEqual(await submittedDrawing({ canvas: strokes, image: { id: 'media:0123456789ab' } }), { image: { id: 'media:0123456789ab' } }, 'a capture is already immutable');
});
