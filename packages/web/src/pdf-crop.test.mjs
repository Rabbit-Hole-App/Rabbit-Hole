import test from 'node:test';
import assert from 'node:assert/strict';
import { CROP, cropScale, smallerScale } from './pdf-crop.js';
import { excerptDraft, get, getCrop, put } from './pdf-excerpt-drafts.js';
import { newId } from './pdf-highlights.js';

test('a small region renders with its long side at 2000 px; a large one never below 72 dpi, never over 4096 px', () => {
  assert.equal(cropScale(100, 50) * 100, 2000);
  assert.equal(cropScale(50, 400) * 400, 2000);
  assert.equal(cropScale(3000, 1000), 1, 'never below scale 1');
  assert.ok(cropScale(6000, 100) * 6000 <= CROP.maxSide, 'the side limit wins over scale 1');
  assert.ok(cropScale(1, 1) * 1 <= CROP.maxSide);
});

test('a too-large PNG steps the scale down to the readable floor, then stops', () => {
  const steps = [];
  for (let scale = cropScale(200, 100); scale; scale = smallerScale(scale, 200, 100)) steps.push(scale);
  assert.equal(steps[0], 10);
  assert.equal(steps.at(-1), 1, 'the last try is the 72-dpi size');
  assert.ok(steps.every((s, i) => i === 0 || s < steps[i - 1]));
  assert.equal(smallerScale(1, 200, 100), null);
  const big = cropScale(8192, 100);
  assert.equal(smallerScale(big, 8192, 100), null, 'at the side-limit floor there is no smaller readable scale');
});

test('drafts keep the contract shape and the crop beside it, by id', async () => {
  const id = newId('pdfx');
  assert.match(id, /^pdfx_[0-9a-f]{24}$/);
  assert.match(newId('pdfh'), /^pdfh_[0-9a-f]{24}$/);
  const draft = excerptDraft({ id, kind: 'region', source: { key: 'doc:ctx:0123456789ab', sha256: 'a'.repeat(64), name: 'Doc' }, page: { index: 3 }, rotate: 0, view: [0, 0, 612, 792], rects: [[1, 2, 3, 4]], quote: { exact: 'x' } });
  assert.deepEqual(Object.keys(draft), ['v', 'id', 'kind', 'source', 'page', 'rotate', 'view', 'rects', 'quote', 'highlightId', 'crop', 'part']);
  assert.equal(draft.quote, null, 'a region has no quote');
  assert.deepEqual(draft.page, { index: 3, label: null });
  assert.equal(draft.source.home, null);
  put(draft, Promise.resolve({ blob: 'png', width: 2, height: 1 }));
  assert.equal(get(id), draft);
  assert.deepEqual(await getCrop(id), { blob: 'png', width: 2, height: 1 });
  assert.equal(get('pdfx_missing'), null);
  assert.equal(getCrop('pdfx_missing'), null);
});
