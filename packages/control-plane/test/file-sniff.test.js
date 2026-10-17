// file-sniff.js: each extension's structure check on small in-test samples (always run), and on Lane 5's real fixtures when
// they are on this machine (C:/s/fi-fixtures/manifest.json, or FI_FIXTURES=<manifest>): every real file matches its name,
// every mislabelled one is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, openSync, readSync, closeSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { FORMATS, HEAD_BYTES, sniffUpload } from '../src/file-sniff.js';
import { family as familyById } from '../../web/src/file-capabilities.js';

const b = (...parts) => new Uint8Array(Buffer.concat(parts.map(p => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))));
const pad = (bytes, n) => b(bytes, new Uint8Array(Math.max(0, n - bytes.length)));
const SAMPLES = {
  png: b([0x89], 'PNG\r\n\x1a\n', [0, 0, 0, 13]), jpg: b([0xff, 0xd8, 0xff, 0xe0]), webp: b('RIFF', [1, 2, 3, 4], 'WEBPVP8 '), gif: b('GIF89a', [1, 0]),
  svg: b('\xef\xbb\xbf<?xml version="1.0"?>\n<!-- a comment -->\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"/>'),
  mp4: b([0, 0, 0, 24], 'ftypisom'), m4a: b([0, 0, 0, 24], 'ftypM4A '), webm: b([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86]),
  mp3: b('ID3', [4, 0, 0]), wav: b('RIFF', [1, 2, 3, 4], 'WAVEfmt '), ogg: b('OggS', [0, 2]), flac: b('fLaC', [0, 0, 0, 34]),
  pdf: b('%PDF-1.7\n'), docx: b('PK\x03\x04', new Uint8Array(26), '[Content_Types].xml'), doc: b([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  ipynb: b('{\n "cells": []\n}'), glb: b('glTF', [2, 0, 0, 0, 0, 0, 0, 0]), gltf: b('{"asset":{"version":"2.0"}}'), obj: b('v 0 0 0\n'),
  stl: b('solid cube\n'), '3mf': b('PK\x03\x04', new Uint8Array(26), '[Content_Types].xml'), fbx: b('Kaydara FBX Binary  \x00\x1a\x00'),
  step: b('ISO-10303-21;\nHEADER;'), ply: b('ply\nformat binary_little_endian 1.0\n'), spz: b([0x1f, 0x8b, 0x08, 0]),
  sog: b('PK\x03\x04', new Uint8Array(26), 'meta.json'), zip: b('PK\x05\x06', new Uint8Array(18)),
  ksplat: (() => { const h = new Uint8Array(4096); h[1] = 1; h[4] = 1; h[8] = 1; return h; })(),
};

test('every structure check accepts its own sample and refuses plain text', () => {
  for (const [ext, sample] of Object.entries(SAMPLES)) {
    assert.equal(FORMATS[ext](sample, ext === 'ksplat' ? 4096 : sample.length), true, `${ext} sample`);
    if (!['obj', 'stl', 'splat'].includes(ext)) assert.equal(FORMATS[ext](b('just some text, not a file format\n'), 34), false, `${ext} refuses text`);
  }
});

test('formats that share a container are told apart where the bytes allow it', () => {
  assert.equal(FORMATS.webp(SAMPLES.wav), false); assert.equal(FORMATS.wav(SAMPLES.webp), false);
  assert.equal(FORMATS.docx(SAMPLES.sog), false, 'a zip without [Content_Types].xml is not Office');
  assert.equal(FORMATS.sog(SAMPLES.docx), false, 'a zip without meta.json is not SOG');
  assert.equal(FORMATS.glb(b('glTF', [1, 0, 0, 0])), false, 'glTF 1.0 binary is not GLB 2');
  // AAC ADTS shares the sync bits with MPEG audio; its layer bits are 00.
  assert.equal(FORMATS.mp3(b([0xff, 0xf1, 0x50, 0x80])), false); assert.equal(FORMATS.mp3(b([0xff, 0xfb, 0x90, 0x64])), true);
  assert.equal(FORMATS.pdf(b(new Uint8Array(500).fill(32), '%PDF-1.4')), true, 'a PDF header within the first 1024 bytes');
  assert.equal(FORMATS.svg(b('<html><svg/></html>')), false, 'an HTML page is not an SVG');
});

test('binary STL and .splat have no magic: their size must fit the layout', () => {
  const stl = pad(new Uint8Array(84), 84); new DataView(stl.buffer).setUint32(80, 2, true);
  assert.equal(FORMATS.stl(stl, 84 + 100), true); assert.equal(FORMATS.stl(stl, 84 + 99), false);
  assert.equal(FORMATS.splat(new Uint8Array(64), 64000), true); assert.equal(FORMATS.splat(new Uint8Array(64), 64001), false);
});

test('sniffUpload: the name must be one the family takes, the bytes that format; text families must be text', () => {
  assert.deepEqual(sniffUpload({ family: 'video', name: 'clip.MP4', head: SAMPLES.mp4 }), { ok: true, format: 'mp4', checked: true });
  assert.equal(sniffUpload({ family: 'video', name: 'clip.mp4', head: b('plain text named mp4') }).ok, false);
  assert.match(sniffUpload({ family: 'video', name: 'clip.mov', head: SAMPLES.mp4 }).reason, /does not take \.mov/);
  assert.equal(sniffUpload({ family: 'image', name: 'a.png', head: SAMPLES.gif }).ok, false, 'a GIF named .png');
  assert.equal(sniffUpload({ family: 'code', name: 'a.js', head: b('export default 1;\n') }).ok, true);
  assert.equal(sniffUpload({ family: 'code', name: 'a.js', head: SAMPLES.png }).ok, false, 'binary under a code name');
  assert.equal(sniffUpload({ family: 'text', name: 'utf16.txt', head: b([0xff, 0xfe], 'h\0i\0') }).ok, true, 'UTF-16 with a BOM is text');
  assert.equal(sniffUpload({ family: 'nope', name: 'a.png', head: SAMPLES.png }).ok, false);
  const splatPly = b('ply\nformat binary_little_endian 1.0\nelement vertex 1\n', ...['x', 'f_dc_0', 'opacity', 'scale_0', 'rot_0'].map(p => `property float ${p}\n`), 'end_header\n');
  assert.equal(sniffUpload({ family: 'splat', name: 't.ply', head: splatPly }).ok, true);
  assert.equal(sniffUpload({ family: 'splat', name: 'mesh.ply', head: SAMPLES.ply }).ok, false, 'a mesh PLY is not a splat');
  assert.equal(sniffUpload({ family: 'ply', name: 't.ply', head: splatPly }).ok, true, 'it is still a PLY');
});

// Lane 5's fixtures, when present on this machine.
const MANIFEST = process.env.FI_FIXTURES || 'C:/s/fi-fixtures/manifest.json';
test('Lane 5 fixtures: every real file matches its name and family; every mislabelled one is refused', { skip: !existsSync(MANIFEST) && `no fixture list at ${MANIFEST}` }, () => {
  const { fixtures } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const head = file => { const fd = openSync(file, 'r'); const out = Buffer.alloc(HEAD_BYTES); const n = readSync(fd, out, 0, HEAD_BYTES, 0); closeSync(fd); return new Uint8Array(out.subarray(0, n)); };
  const wrong = [];
  let checked = 0;
  const REFUSED = new Set(['mislabelled', 'zip-traversal', 'zip-symlink', 'zip-bomb', 'macro']);
  for (const f of fixtures) {
    if (f.attack && !REFUSED.has(f.attack)) continue;                  // the other attacks are about content the sniff does not judge
    if (f.family !== null && !familyById(f.family)) continue;           // a family this branch's registry does not have yet
    const file = join(dirname(MANIFEST), f.path);
    const body = f.family === 'model-package' ? new Uint8Array(readFileSync(file)) : null;
    const verdict = sniffUpload({ family: f.family, name: f.path, head: head(file), size: statSync(file).size, body });
    const want = !REFUSED.has(f.attack);
    checked++;
    if (verdict.ok !== want) wrong.push(`${f.path}: ${JSON.stringify(verdict)}`);
  }
  // This branch's registry does not list .markdown, .ini, .jsonl or .kts yet (Lane 2 adds them): those refusals are the
  // registry's, not this module's.
  const registryGaps = wrong.filter(w => /does not take \.(markdown|ini|jsonl|kts)"/.test(w));
  assert.deepEqual(wrong.filter(w => !registryGaps.includes(w)), [], `of ${checked}`);
  assert.ok(checked >= 95, `${checked} fixtures checked`);
});

// Model packages and parts (Lane 4: model-formats.js modelPackageCheck runs on the whole archive).
const FIX = dirname(MANIFEST);
const whole = rel => new Uint8Array(readFileSync(join(FIX, rel)));
const pkg = rel => sniffUpload({ family: 'model-package', name: rel, head: whole(rel).subarray(0, HEAD_BYTES), size: whole(rel).length, body: whole(rel) });
test('model packages: a model bundle is accepted; traversal, symlink and bomb archives are refused (the route answers 415)', { skip: !existsSync(MANIFEST) && `no fixtures at ${FIX}` }, () => {
  for (const rel of ['bundle/gltf-bundle.zip', 'bundle/obj-bundle.zip', 'bundle/two-models.zip']) assert.equal(pkg(rel).ok, true, rel);
  assert.deepEqual(pkg('bundle/two-models.zip').entries.sort(), ['box/cube.obj', 'cube/cube.gltf']);
  assert.match(pkg('negative/zip-traversal.zip').reason, /outside the package/);
  assert.match(pkg('negative/zip-symlink.zip').reason, /symbolic link/);
  assert.match(pkg('negative/zip-bomb-1gib.zip').reason, /expands past|decompression bomb/);
  assert.match(sniffUpload({ family: 'model-package', name: 'cube.zip', head: whole('bundle/gltf-bundle.zip').subarray(0, HEAD_BYTES) }).reason, /whole archive/, 'no body, no verdict');
  assert.equal(sniffUpload({ family: 'model-package', name: 'x.zip', head: b('not a zip') }).ok, false);
  assert.equal(sniffUpload({ family: 'splat', name: 'torus.sog', head: whole('splat/torus.sog').subarray(0, HEAD_BYTES) }).ok, true, 'a .sog keeps its own check under splat');
});
test('model parts: .bin is any non-empty bytes, .mtl is text, a .mtl with NUL bytes is refused', () => {
  assert.equal(sniffUpload({ family: 'model-part', name: 'cube.bin', head: b([0, 1, 2]), size: 3 }).ok, true);
  assert.equal(sniffUpload({ family: 'model-part', name: 'cube.bin', head: b(), size: 0 }).ok, false);
  assert.equal(sniffUpload({ family: 'model-part', name: 'cube.mtl', head: b('newmtl a\nKd 1 1 1\n') }).ok, true);
  assert.equal(sniffUpload({ family: 'model-part', name: 'cube.mtl', head: b('newmtl a', [0, 0, 1]) }).ok, false);
  if (existsSync(MANIFEST)) assert.equal(sniffUpload({ family: 'model-part', name: 'binary.mtl', head: whole('negative/binary.mtl') }).ok, false, 'the NUL fixture');
});
