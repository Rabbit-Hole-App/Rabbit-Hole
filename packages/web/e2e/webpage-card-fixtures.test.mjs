// The webpage card fixtures keep the capture server's shapes (webcard-interface.md v2, control-plane/src/webpage-capture.js), so a check failure means the card, not the fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCapture, readyResult, heldResult, webpageBlock, sha256, TILE_H } from './webpage-card-fixtures.mjs';

const jpegs = { red: Buffer.from('r'), green: Buffer.from('g') };
const cap = makeCapture({ jpegs, tiles: ['red', 'green'], runs: [{ text: 'a', x: 1, y: 10, w: 5, h: 5 }, { text: 'b', x: 1, y: TILE_H + 10, w: 5, h: 5 }] });

test('the manifest, fileRef and files agree on ids, revisions and tile places', () => {
  const manifestFile = cap.files.find(f => f.role === 'manifest');
  assert.equal(cap.manifestId, manifestFile.id); assert.equal(cap.sha256, sha256(manifestFile.bytes));
  assert.deepEqual(JSON.parse(manifestFile.bytes), cap.manifest);
  assert.deepEqual(cap.manifest.tiles.map(t => [t.key, t.y, t.h]), cap.tileIds.map((id, i) => [id, i * TILE_H, TILE_H]));
  for (const t of cap.manifest.tiles) assert.equal(t.sha256, sha256(cap.files.find(f => f.id === t.key).bytes));
  assert.equal(cap.manifest.text.sha256, sha256(cap.files.find(f => f.id === cap.textId).bytes));
  assert.deepEqual(cap.files.map(f => f.declared), ['webpage-tile', 'webpage-tile', 'webpage-text', 'webpage-manifest']);
  assert.equal(cap.fileRef.v, 1); assert.equal(cap.fileRef.family, 'webpage'); assert.equal(cap.fileRef.meta.title, cap.title);
  assert.equal(cap.fileRef.meta.size, manifestFile.bytes.length); assert.deepEqual(Object.keys(cap.fileRef.source), ['id', 'rev']);
  assert.equal(cap.fileRef.source.id, cap.manifestId); assert.equal(cap.fileRef.source.rev, cap.sha256);
  for (const part of cap.fileRef.bundle) assert.equal(part.source.rev, sha256(cap.files.find(f => f.id === part.source.id).bytes));
  assert.deepEqual(cap.fileRef.bundle.map(p => p.role), ['tile', 'tile', 'text']);
  assert.deepEqual(cap.colors, ['red', 'green']);
  assert.ok(cap.files.every(f => /^fs_[0-9a-f]{24}$/.test(f.id))); assert.match(cap.lineage, /^wc_[0-9a-f]{24}$/);
});

test('text runs name the tile that holds their top', () => {
  const text = JSON.parse(cap.files.find(f => f.role === 'text').bytes);
  assert.deepEqual(text.runs.map(r => r.tile), [0, 1]);
});

test('Results and blocks', () => {
  assert.equal(readyResult(cap).capture.manifestId, cap.manifestId);
  assert.equal(heldResult('blocked').screening.status, 'failed');
  assert.equal(heldResult('login_required').screening, null);
  const block = webpageBlock('w', cap, { x: 5 });
  assert.equal(block.type, 'webpage'); assert.equal(block.x, 5); assert.equal(block.fileRef, cap.fileRef);
});
