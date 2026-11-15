import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Frame } from '../../web/src/explain-program/contract.js';

const derived = await import('../../../scripts/interact/stepper-reference-frames.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return null;
});

test('Brief merge sort has an independently HTML-derived, legal four-frame reference', () => {
  assert.equal(typeof derived?.deriveBriefMergeFrames, 'function');
  const frames = derived.deriveBriefMergeFrames();
  assert.deepEqual(frames.map(frame => frame.objects.length), [59, 58, 59, 58]);
  for (const frame of frames) {
    const parsed = Frame.safeParse(frame);
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    assert.equal(frame.width, 640);
    assert.equal(frame.height, 338);
    assert.equal(frame.readouts.length, 0);
    assert.equal(new Set(frame.objects.map(object => object.id)).size, frame.objects.length);
  }
});

test('reference lowering retains every HTML word and number, including every callout line', () => {
  assert.equal(typeof derived?.deriveBriefMergeCases, 'function');
  for (const { svg, frame } of derived.deriveBriefMergeCases()) {
    const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
      .map(match => ({ id: /\bid="([^"]+)"/.exec(match[1])[1], text: match[2] }));
    assert.deepEqual(frame.objects.filter(object => object.kind === 'text').map(({ id, text }) => ({ id, text })), texts);
    assert.ok(frame.objects.filter(object => object.id.startsWith('callout.active.') && object.kind === 'text').length > 4);
  }
});

test('link packing preserves reference shaft geometry independently for each emphasis', () => {
  assert.equal(typeof derived?.compareLinkGeometry, 'function');
  for (const { svg, frame, active } of derived.deriveBriefMergeCases()) {
    assert.deepEqual(derived.compareLinkGeometry(svg, frame, active), []);
    const wrong = structuredClone(frame);
    wrong.objects.find(object => object.kind === 'polyline' && object.id.startsWith('link.')).points.forEach(point => { point[0] += 3; });
    assert.ok(derived.compareLinkGeometry(svg, wrong, active).length > 0);
  }
});
