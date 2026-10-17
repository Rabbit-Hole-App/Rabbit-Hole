import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_FILE_LIMIT, FAMILIES, MiB, boardFileLimit, familyOf, family, formatBytes } from './file-capabilities.js';
import { classifyDrop } from './learn-drop.js';

test('the board file cap: 50 MiB for a video type, 25 MiB for everything else', () => {
  assert.equal(boardFileLimit('video/mp4').bytes, 50 * MiB);
  assert.equal(boardFileLimit('video/webm; codecs=vp9').bytes, 50 * MiB);
  assert.equal(boardFileLimit('VIDEO/MP4').bytes, 50 * MiB);
  for (const type of ['video/quicktime', 'application/pdf', 'image/png', 'text/x-cached-string', '', undefined]) assert.equal(boardFileLimit(type).bytes, BOARD_FILE_LIMIT, String(type));
  assert.equal(BOARD_FILE_LIMIT, 25 * MiB);
});

test('the client and the server agree at the 50 MiB boundary: exactly 50 MiB is a video, one byte more is not', () => {
  const video = size => ({ type: 'video/mp4', size, name: 'clip.mp4' });
  assert.equal(classifyDrop(video(50 * MiB)).kind, 'clip');
  assert.ok(classifyDrop(video(50 * MiB + 1)).error);
  assert.equal(boardFileLimit('video/mp4').bytes, 50 * MiB);
});

test('a family over the general cap must sniff its bytes', () => {
  const { sniff } = boardFileLimit('video/mp4');
  assert.ok(sniff(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])), 'MP4 ftyp');
  assert.ok(sniff(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), 'WebM EBML');
  assert.ok(!sniff(new Uint8Array(16)), 'zeros');
  assert.ok(!sniff(new TextEncoder().encode('<html><script>')), 'a page');
  for (const f of FAMILIES) if ((f.limits.bytes || 0) > BOARD_FILE_LIMIT) assert.equal(typeof f.sniff, 'function', f.id);
});

test('sizes read in MiB', () => {
  assert.equal(formatBytes(50 * MiB), '50 MiB');
  assert.equal(formatBytes(25 * MiB), '25 MiB');
  assert.equal(formatBytes(1.5 * MiB), '1.5 MiB');
});

test('families: only shipped ones are offered, and a planned one claims nothing', () => {
  assert.equal(familyOf({ name: 'clip.MP4' }).id, 'video');
  assert.equal(familyOf({ name: '', type: 'video/webm' }).id, 'video');
  assert.equal(familyOf({ name: 'scene.glb' }), null, 'planned');
  assert.equal(familyOf({ name: 'part.step' }), null, 'planned');
  assert.equal(familyOf({ name: 'old.doc' }), null, 'planned until its converter (lane 2)');
  assert.equal(familyOf({ name: 'data.csv' }).id, 'delimited', 'shipped by lane 2');
  for (const f of FAMILIES.filter(f => f.status === 'planned')) assert.deepEqual(Object.values(f.can), [false, false, false, false, false], f.id);
  assert.equal(family('video').limits.bytes, 50 * MiB);
  const extensions = FAMILIES.flatMap(f => f.extensions);
  assert.equal(new Set(extensions).size, extensions.length, 'each extension belongs to one family');
  assert.ok(!extensions.includes('kspalt') && extensions.includes('ksplat'));
});

test('every shipped extension reaches a card today, and the picker offers exactly those', async () => {
  const { importKind } = await import('./learn-file-import.js');
  const { acceptList } = await import('./file-capabilities.js');
  const { mediaFamilyOf } = await import('./media-family.js');
  const { docKind } = await import('./file-doc-import.js');
  for (const f of FAMILIES.filter(f => f.status === 'shipped')) {
    for (const ext of f.extensions) {
      if (f.route === 'import') assert.ok(importKind(`file.${ext.toUpperCase()}`), `.${ext} opens the import dialog`);
      else if (f.route === 'media') assert.equal(mediaFamilyOf(`file.${ext.toUpperCase()}`), f.id, `.${ext} is read by media-import.js`);
      else if (f.route === 'doc') assert.ok(docKind(`file.${ext.toUpperCase()}`), `.${ext} goes to the lane 2 importer (DocImport.jsx)`);
      else assert.ok(classifyDrop({ type: f.mime[0], size: 1, name: `file.${ext}` }).kind, `.${ext} is a ${f.id} drop`);
    }
  }
  const offered = acceptList().split(',');
  assert.ok(['.mp4', '.webm', '.pdf', '.ipynb', '.py', '.ts', '.png', '.svg', '.flac'].every(ext => offered.includes(ext)), 'Lane 3 shipped svg and audio');
  assert.ok(!offered.some(ext => ['.glb', '.doc', '.step'].includes(ext)), 'planned formats are not offered');
  assert.ok(['.txt', '.md', '.markdown', '.csv', '.tsv', '.xlsx', '.xls', '.docx', '.pptx', '.jsonl', '.ini', '.kts'].every(ext => offered.includes(ext)), 'lane 2 formats are offered');
});
