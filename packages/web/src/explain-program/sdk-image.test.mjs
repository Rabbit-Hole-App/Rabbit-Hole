import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBundle, STATEFUL_SCHEMA_VERSION } from './contract.js';
import { IMAGE_FIXTURE_IDS, IMAGE_FIXTURE_PATHS, IMAGE_SOURCE } from './sdk-image.js';
import { SDK_SOURCE } from './sdk.js';
import { imageViewsFixture } from './testdata/image-views.mjs';

const asset = 'vlm-patch-source';
const sdk = new Function(SDK_SOURCE + IMAGE_SOURCE + '\nreturn sdk;')();
const panel = { x: 10, y: 20, w: 280, h: 200 };
const wide = { id: 'wide', x: 0.125, y: 0.25, w: 0.5, h: 0.25 };
const tall = { id: 'tall', x: 0.625, y: 0.125, w: 0.25, h: 0.5 };
const inner = { id: 'inner', x: 0.25, y: 0.25, w: 0.125, h: 0.125 };
const rect = ({ x, y, w, h }) => ({ x, y, w, h });
const byId = (objects, id) => objects.find(object => object.id === id);

test('an image frame fits the entire square or exact normalized crop, with an asset ID only', () => {
  assert.deepEqual(IMAGE_FIXTURE_IDS, [asset]);
  assert.equal(IMAGE_FIXTURE_PATHS[asset], '/lesson-assets/vlm-patch-source.jpg');
  const full = sdk.imageFrame('source', { ...panel, asset, src: 'https://example.invalid/a.png' });
  assert.equal(full.kind, 'image');
  assert.equal(full.asset, asset);
  assert.deepEqual(rect(full), { x: 50, y: 20, w: 200, h: 200 });
  assert.equal(full.src, undefined);
  assert.equal(full.crop, undefined);

  const detail = sdk.imageFrame('detail', { x: 30, y: 40, w: 120, h: 100, asset, crop: wide });
  assert.deepEqual(rect(detail), { x: 30, y: 60, w: 120, h: 60 });
  assert.deepEqual(detail.crop, { x: 0.125, y: 0.25, w: 0.5, h: 0.25 });
});

test('regions use the fitted picture coordinates and put the smaller target above its parent', () => {
  const options = { ...panel, asset, regions: [inner, wide] };
  const first = sdk.imageRegions('overview', options);
  const selected = sdk.imageRegions('overview', { ...options, selected: 'inner' });
  assert.deepEqual(first.map(object => object.id), ['overview', 'overview.wide', 'overview.inner']);
  assert.deepEqual(selected.map(object => object.id), first.map(object => object.id));
  assert.deepEqual(rect(byId(first, 'overview.wide')), { x: 75, y: 70, w: 100, h: 50 });
  assert.deepEqual(rect(byId(first, 'overview.inner')), { x: 100, y: 70, w: 25, h: 25 });
  assert.equal(byId(first, 'overview.inner').role, 'neutral');
  const active = byId(selected, 'overview.inner');
  assert.equal(active.role, 'learner');
  assert.ok(active.opacity > byId(selected, 'overview.wide').opacity && active.opacity < 1);
});

test('one selected region drives all detail crops and the overview highlight', () => {
  const options = {
    asset, regions: [wide, tall], views: [
      { id: 'overview', mode: 'overview', x: 20, y: 40, w: 280, h: 200 },
      { id: 'large', mode: 'detail', x: 320, y: 40, w: 180, h: 260 },
      { id: 'small', mode: 'detail', x: 530, y: 40, w: 260, h: 100 },
    ],
  };
  const before = sdk.imageViews('study', options);
  assert.equal(byId(before, 'study.large').crop, undefined);

  const first = sdk.imageViews('study', { ...options, selected: 'wide' });
  const second = sdk.imageViews('study', { ...options, selected: 'tall' });
  assert.deepEqual(second.map(object => object.id), before.map(object => object.id));
  assert.equal(byId(first, 'study.overview.wide').role, 'learner');
  assert.equal(byId(second, 'study.overview.wide').role, 'neutral');
  assert.equal(byId(second, 'study.overview.tall').role, 'learner');
  assert.deepEqual(rect(byId(first, 'study.large')), { x: 320, y: 125, w: 180, h: 90 });
  assert.deepEqual(rect(byId(first, 'study.small')), { x: 560, y: 40, w: 200, h: 100 });
  assert.deepEqual(rect(byId(second, 'study.large')), { x: 345, y: 40, w: 130, h: 260 });
  assert.deepEqual(rect(byId(second, 'study.small')), { x: 635, y: 40, w: 50, h: 100 });
  for (const [objects, crop] of [[first, { x: 0.125, y: 0.25, w: 0.5, h: 0.25 }], [second, { x: 0.625, y: 0.125, w: 0.25, h: 0.5 }]]) {
    assert.deepEqual(byId(objects, 'study.large').crop, crop);
    assert.deepEqual(byId(objects, 'study.small').crop, crop);
    assert.equal(byId(objects, 'study.overview').crop, undefined);
  }
});

test('image helpers refuse paths, malformed geometry and unbounded or ambiguous region lists', () => {
  for (const unsafe of ['https://example.invalid/a.png', '//example.invalid/a.png', 'data:image/png;base64,a', '/lesson-assets/vlm-patch-source.jpg', '../x.png', '__proto__', 'constructor']) {
    assert.throws(() => sdk.imageFrame('source', { ...panel, asset: unsafe }), /asset/);
  }
  for (const crop of [{ ...wide, x: -0.1 }, { ...wide, w: 0 }, { ...wide, x: 0.75 }, { ...wide, y: Infinity }]) {
    assert.throws(() => sdk.imageFrame('source', { ...panel, asset, crop }), /region/);
  }
  assert.throws(() => sdk.imageFrame('source', { ...panel, asset, w: Infinity }), /layout/);
  const options = { ...panel, asset, regions: [wide] };
  assert.throws(() => sdk.imageRegions('source', { ...options, regions: [wide, wide] }), /unique/);
  assert.throws(() => sdk.imageRegions('source', { ...options, regions: Array(9).fill(wide) }), /at most 8/);
  assert.throws(() => sdk.imageRegions('source', { ...options, regions: Array(1) }), /region/);
  assert.throws(() => sdk.imageRegions('source', { ...options, selected: 'absent' }), /selected/);
  const view = { ...panel, id: 'source', mode: 'overview' };
  assert.throws(() => sdk.imageViews('views', { asset, views: [view, view], regions: [wide] }), /unique/);
  assert.throws(() => sdk.imageViews('views', { asset, views: [{ ...view, mode: 'cover' }], regions: [wide] }), /mode/);
  assert.throws(() => sdk.imageViews('views', { asset, views: Array(1), regions: [wide] }), /view/);
});

test('the example keeps its declared selection targets and resets both views through one action', () => {
  const parsed = parseBundle(imageViewsFixture, STATEFUL_SCHEMA_VERSION);
  assert.equal(parsed.ok, true, parsed.issue);
  const { manifest, source } = imageViewsFixture;
  const { initialState, reduce, evaluate } = new Function(SDK_SOURCE + IMAGE_SOURCE + source.replaceAll('export function', 'function')
    + '\nreturn { initialState, reduce, evaluate };')();
  let state = initialState();
  for (const target of manifest.targets) {
    state = reduce({ state, event: { type: 'select', target: target.id } });
    const { frame } = evaluate({ state });
    assert.ok(manifest.targets.every(item => byId(frame.objects, item.id)));
    assert.equal(byId(frame.objects, target.id).role, 'learner');
    const crop = byId(frame.objects, 'study.large').crop;
    assert.ok(crop);
    assert.deepEqual(byId(frame.objects, 'study.small').crop, crop);
  }
  state = reduce({ state, event: { type: 'action', action: 'clear' } });
  const { frame } = evaluate({ state });
  assert.equal(byId(frame.objects, 'study.large').crop, undefined);
  assert.equal(byId(frame.objects, 'study.small').crop, undefined);
  assert.ok(manifest.targets.every(target => byId(frame.objects, target.id).role === 'neutral'));
});
