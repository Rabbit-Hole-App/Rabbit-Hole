import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTutorImage } from './learn-tutor-image.js';

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
