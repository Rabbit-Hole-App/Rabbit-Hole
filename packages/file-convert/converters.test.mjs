// The pure converter pieces on any host: format sniffing by bytes, the bounded ZIP reader (bomb
// and corrupt input), PPTX slide text and notes in slide order, STEP unit detection, the GLB writer
// (checked with the canvas viewer's own inspectGlb) and the dispatch validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { inspectGlb } from '../web/src/three-d-asset.js';
import { validateJob } from './contract.mjs';
import { occtToGlb } from './converters/glb.mjs';
import { pptxText } from './converters/pptx-text.mjs';
import { sniff } from './converters/sniff.mjs';
import { stepLengthUnit } from './converters/step.mjs';
import { textUnits } from './converters/text-units.mjs';
import { openZip } from './converters/zip.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'proof', 'fixtures');
const fx = f => readFileSync(join(FIX, f));

// A one-entry ZIP built by hand: name, deflated body, declared sizes.
function zip(name, body, { declared } = {}) {
  const data = deflateRawSync(body), n = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(declared ?? body.length, 22); local.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(declared ?? body.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = 30 + n.length + data.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(cdOff, 16);
  return Buffer.concat([local, n, data, cd, n, end]);
}

test('sniff decides by bytes, never by name', () => {
  assert.deepEqual(sniff(fx('sample.doc')), { kind: 'doc', ext: 'doc' });
  assert.deepEqual(sniff(fx('sample.docx')), { kind: 'docx', ext: 'docx' });
  assert.deepEqual(sniff(fx('sample.pptx')), { kind: 'pptx', ext: 'pptx' });
  assert.deepEqual(sniff(fx('cube-in.step')), { kind: 'step', ext: 'step' });
  assert.equal(sniff(Buffer.from('#!/bin/sh\nrm -rf /')), null);
  assert.equal(sniff(zip('evil.txt', Buffer.from('x'))), null, 'a ZIP that is not OOXML/ODF is not a document');
});

test('the ZIP reader refuses a decompression bomb and a lying size', () => {
  const bomb = zip('[Content_Types].xml', Buffer.alloc(40 * 1024 * 1024));
  assert.throws(() => openZip(bomb).read('[Content_Types].xml'), /larger than|inflated within/);
  const liar = zip('a.xml', Buffer.alloc(8 * 1024 * 1024), { declared: 100 });
  assert.throws(() => openZip(liar, { entries: 10, entry_bytes: 1024 * 1024, total_bytes: 2 * 1024 * 1024 }).read('a.xml'), /inflated within/);
  assert.throws(() => openZip(Buffer.from('PK\u0003\u0004 not really')), /end record|ZIP/);
});

test('PPTX text: slide order, notes labelled, hidden slides marked', () => {
  const r = pptxText(fx('sample.pptx'));
  assert.equal(r.slides, 3);
  assert.deepEqual(r.units.map(u => u.slide), [1, 2, 3]);
  assert.match(r.units[0].text, /Converter fixture deck/);
  assert.equal(r.units[1].notes, 'Speaker notes for slide two');
  assert.equal(r.units[2].hidden, true);
  assert.equal(r.units[0].notes, undefined);
  assert.equal(pptxText(fx('deck-40.pptx')).units.length, 40);
});

test('STEP length unit comes from the global unit context', () => {
  assert.equal(stepLengthUnit(fx('cube-in.step').toString('latin1')), 'inch');
  assert.equal(stepLengthUnit(fx('as1-oc-214.stp').toString('latin1')), 'millimetre');
  assert.equal(stepLengthUnit('ISO-10303-21;\nDATA;\nENDSEC;'), null);
});

test('GLB writer: valid for the canvas viewer, colours become materials, tree becomes nodes', () => {
  const tri = (name, color) => ({ name, color, attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, normal: { array: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] } }, index: { array: [0, 1, 2, 0, 2, 3] }, brep_faces: [{ first: 0, last: 0, color: [1, 0, 0] }, { first: 1, last: 1, color: null }] });
  const { glb, stats } = occtToGlb({ success: true, root: { name: 'asm', meshes: [], children: [{ name: 'p1', meshes: [0], children: [] }, { name: 'p2', meshes: [1], children: [] }] }, meshes: [tri('a', [0, 0, 1]), tri('b', null)] });
  const json = inspectGlb(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length));
  assert.equal(json.asset.version, '2.0');
  assert.deepEqual(json.nodes.map(n => n.name), ['asm', 'p1', 'p2', 'Z-up to Y-up']);
  assert.equal(stats.parts, 2);
  assert.equal(json.meshes[0].primitives.length, 2, 'two face colours -> two primitives');
  assert.equal(json.materials.length, 3);
  assert.deepEqual(json.accessors[0].min, [0, 0, 0]);
  assert.throws(() => occtToGlb({ success: true, root: { meshes: [0] }, meshes: [tri('a')] }, { maxElements: 5 }), /accessor elements/);
  assert.throws(() => occtToGlb({ success: false }), /could not read/);
});

test('dispatch validation pins origins and options', () => {
  const origin = 'https://cp.example';
  const ok = { schema: 'file-convert/1', job_id: 'fj_1', attempt: 1, converter: 'step-glb', options: { quality: 'draft' },
    source: { url: `${origin}/s`, bytes: 1, sha256: 'a'.repeat(64) }, callback: { url: `${origin}/c`, token: 't'.repeat(32) } };
  assert.deepEqual(validateJob(ok, { allowedOrigins: [origin] }), []);
  assert.match(validateJob(ok, { allowedOrigins: [] }).join(), /not on an allowed origin/);
  assert.match(validateJob({ ...ok, source: { ...ok.source, url: 'https://user:pw@cp.example/s' } }, { allowedOrigins: [origin] }).join(), /http\(s\) URL/);
  assert.match(validateJob({ ...ok, options: { quality: 'ultra' } }, { allowedOrigins: [origin] }).join(), /out of range/);
  assert.match(validateJob({ ...ok, extra: 1 }, { allowedOrigins: [origin] }).join(), /unknown field/);
});

test('text.json uses the shared units shape: page/slide units, notes as their own unit, hidden marked', () => {
  const slides = textUnits(pptxText(fx('sample.pptx')), 'slide', 3);
  assert.deepEqual(slides.units.map(u => u.loc), [{ slide: 1 }, { slide: 2 }, { slide: 2, notes: true }, { slide: 3 }]);
  assert.equal(slides.units[2].text, 'Speaker notes for slide two');
  assert.match(slides.units[3].text, /^\[Hidden slide\]\nHidden third slide/);
  assert.deepEqual([slides.v, slides.complete, slides.limited], [1, true, undefined]);
  const pages = textUnits({ units: [{ page: 1, text: 'a' }], truncated: true }, 'page', 4);
  assert.deepEqual(pages, { v: 1, units: [{ loc: { page: 1 }, text: 'a' }], complete: false, limited: 'pages 1-1 of 4' });
  assert.match(textUnits({ units: [{ page: 1, text: '' }], truncated: false }, 'page', 1).limited, /no text layer/);
});

test('Symbol/Wingdings private-use bullets read as "•" in text.json', () => {
  const r = textUnits({ units: [{ slide: 1, text: '\uF0B7 one\n\uF0A7 two\n\uF076 three', notes: '\uF0D8 note' }], truncated: false }, 'slide', 1);
  assert.deepEqual(r.units.map(u => u.text), ['\u2022 one\n\u2022 two\n\u2022 three', '\u2022 note']);
  assert.equal(textUnits({ units: [{ page: 1, text: 'plain \u2022 kept, \uE000 other private use kept' }] }, 'page', 1).units[0].text, 'plain \u2022 kept, \uE000 other private use kept');
});
