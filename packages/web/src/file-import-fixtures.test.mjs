// The parameterized import check's decisions (e2e/file-import-fixtures.mjs), on the real registry and small synthetic boards:
// what a fixture should become, when board JSON stops being compact, and which stored originals a card points at.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as registry from './file-capabilities.js';
import { addedBlocks, cardOf, compactness, expectation, loadFixtures, originalsOf, sniffs } from '../e2e/file-import-fixtures.mjs';

const fixture = (path, family, extra = {}) => ({ path, family, ext: path.split('.').pop(), role: 'import', bytes: 10, attack: null, deps: [], ...extra });

test('a registry card is type[:kind] on the block it makes', () => {
  assert.deepEqual(cardOf('file:clip'), { type: 'file', kind: 'clip' });
  assert.deepEqual(cardOf('repo-code'), { type: 'repo-code', kind: null });
  assert.equal(cardOf(null), null);
});

test('a shipped family is offered with its card and chooser; a planned one is refused; a wrong family is a misdetection', () => {
  const clip = expectation(fixture('video/clip.mp4', 'video'), registry);
  assert.deepEqual([clip.offered, clip.detected, clip.card, clip.cap], [true, 'video', { type: 'file', kind: 'clip' }, 50 * registry.MiB]);
  const pdf = expectation(fixture('pdf/report.pdf', 'pdf'), registry);
  assert.equal(pdf.chooser, 'pdf');
  // A planned family (a synthetic one, so this holds whichever lane ships what): neither drop nor the picker takes it.
  const planned = { ...registry, family: id => (id === 'svg' ? { ...registry.family('svg'), status: 'planned' } : registry.family(id)), familyOf: () => null };
  const svg = expectation(fixture('svg/vector.svg', 'svg'), planned);
  assert.deepEqual([svg.offered, svg.detected, svg.card, svg.misdetected], [false, null, null, false]);
  // A notebook's JSON under a .json name is a code file: claiming it as a notebook would be a misdetection.
  assert.equal(expectation(fixture('code/notebook-shaped.json', 'notebook'), registry).misdetected, true);
  assert.equal(expectation(fixture('code/notebook-shaped.json', 'code'), registry).misdetected, false);
  // A .ply is decided by its header, not its name.
  assert.equal(expectation(fixture('splat/torus-3dgs.ply', 'splat'), registry).byStructure, true);
});

test('an over-the-cap boundary file and a mislabelled file of an offered family must be refused', () => {
  const MiB = registry.MiB;
  assert.equal(expectation(fixture('video/exact.mp4', 'video', { role: 'boundary', bytes: 50 * MiB }), registry).mustRefuse, false);
  assert.equal(expectation(fixture('video/over.mp4', 'video', { role: 'boundary', bytes: 50 * MiB + 1 }), registry).mustRefuse, true);
  assert.equal(expectation(fixture('negative/not-a-video.mp4', 'video', { role: 'negative', attack: 'mislabelled' }), registry).mustRefuse, true);
});

test('sniff: the family\'s structure check on the first bytes, or null when it has none', () => {
  const ftyp = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypisom')]);
  assert.equal(sniffs(registry, fixture('a.mp4', 'video'), ftyp), true);
  assert.equal(sniffs(registry, fixture('a.mp4', 'video'), Buffer.from('plain text named mp4')), false);
  assert.equal(sniffs(registry, fixture('a.py', 'python'), Buffer.from('print(1)')), null);
});

test('compactness: references pass; growth over the limit, base64, data: and blob: URLs, or a large fileRef fail', () => {
  const board = blocks => JSON.stringify({ blocks });
  const before = board([{ id: 'a', type: 'text' }]);
  const ref = { v: 1, source: { id: 'fs_' + 'a'.repeat(24), rev: 'b'.repeat(64) }, family: 'workbook', meta: { name: 'sales.xlsx', size: 48213 } };
  assert.equal(compactness(before, board([{ id: 'a', type: 'text' }, { id: 'b', type: 'file', fileRef: ref }]), { sourceBytes: 48213 }).ok, true);
  assert.equal(compactness(before, board([{ id: 'b', text: 'x'.repeat(20000) }])).ok, false, 'growth over 16 KiB');
  const base64 = Buffer.alloc(3000, 7).toString('base64');
  assert.ok(compactness(before, board([{ id: 'b', body: base64 }]), { limit: 1e9 }).base64Run >= 1024);
  assert.equal(compactness(before, board([{ id: 'b', src: 'data:image/png;base64,AAAA' }])).dataUri, true);
  assert.equal(compactness(before, board([{ id: 'b', src: 'blob:http://x/1' }])).blobUrl, true);
  assert.equal(compactness(before, board([{ id: 'b', fileRef: { ...ref, meta: { name: 'n'.repeat(3000) } } }]), { limit: 1e9 }).ok, false, 'a fileRef stays under 2 KB');
});

test('originals: a fileRef source first, then each board-file key once; added blocks are the new ids', () => {
  assert.deepEqual(originalsOf({ fileRef: { source: { id: 'fs_1', rev: 'r' } }, assetKey: 'drop:1' }), [{ via: 'file', id: 'fs_1', rev: 'r' }, { via: 'asset', id: 'drop:1' }]);
  assert.deepEqual(originalsOf({ source_asset: 'import:1', source: { assetKey: 'import:1' } }), [{ via: 'asset', id: 'import:1' }]);
  assert.deepEqual(addedBlocks({ blocks: [{ id: 'a' }] }, { blocks: [{ id: 'a' }, { id: 'b' }] }).map(b => b.id), ['b']);
});

test('the fixture list resolves paths beside the manifest and filters by path, family or role', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fi-manifest-'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ fixtures: [fixture('video/a.mp4', 'video'), fixture('negative/b.svg', 'svg', { role: 'negative' })] }));
  const all = loadFixtures(join(dir, 'manifest.json'));
  assert.equal(all[0].file, join(dir, 'video/a.mp4'));
  assert.deepEqual(loadFixtures(join(dir, 'manifest.json'), 'negative').map(f => f.path), ['negative/b.svg']);
  assert.deepEqual(loadFixtures(join(dir, 'manifest.json'), 'video').map(f => f.path), ['video/a.mp4']);
});
