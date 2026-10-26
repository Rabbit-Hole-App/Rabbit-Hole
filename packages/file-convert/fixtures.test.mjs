// One fixture per converter path through the real child (child.mjs), on any host. What this proves and what it does not:
//  - sniff and the whole child run for DOC, DOCX, PPT, PPTX, ODT, ODP, RTF, audio and STEP (AP214, and AP214 relabelled AP242);
//  - STEP runs the REAL OpenCascade when CONVERT_OCCT_DIR points at an occt-import-js `dist` (skipped otherwise: the package is
//    installed only in the image);
//  - every other path runs against STUB LibreOffice, poppler and FFmpeg programs on PATH (shell wrappers; on Windows an .exe launcher
//    named by CONVERT_TEST_SHIM_EXE, else skipped). That proves our wiring (command arguments, output names, error mapping, limitations),
//    not what the real programs produce: real-tool output is checked in the image by proof/run-proofs.mjs and the production acceptance.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthWav } from './proof/harness.mjs';
import { sniff } from './converters/sniff.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const fx = f => readFileSync(join(HERE, 'proof', 'fixtures', f));
const OCCT = process.env.CONVERT_OCCT_DIR;
const SHIMS = process.platform !== 'win32' || !!process.env.CONVERT_TEST_SHIM_EXE;

// ---- fixtures built here (nothing downloaded): ODF containers, RTF, OLE directories, audio magic
function zipStored(entries) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, body] of Object.entries(entries)) {
    const n = Buffer.from(name), d = Buffer.from(body);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(d.length, 18); local.writeUInt32LE(d.length, 22); local.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(d.length, 20); cd.writeUInt32LE(d.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    parts.push(local, n, d); central.push(cd, n); off += 30 + n.length + d.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}
const odf = (type, body) => zipStored({ mimetype: `application/vnd.oasis.opendocument.${type}`, 'content.xml': body });
// An OLE2 file whose directory holds one stream entry at `at` (bytes): enough for sniff, not for LibreOffice.
function ole(stream, at = 4096) {
  const b = Buffer.alloc(at + 128);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(b);
  b.write(stream, at, 'utf16le'); b.writeUInt16LE((stream.length + 1) * 2, at + 64); b[at + 66] = 2;
  return b;
}
const magic = (head, size = 4096) => Buffer.concat([Buffer.from(head, 'latin1'), Buffer.alloc(size)]);

// ---- stub programs: the poppler/LibreOffice/FFmpeg command lines child.mjs issues, answered from the arguments alone
const SHIM_JS = `
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const [name, ...a] = process.argv.slice(2), env = process.env, pages = Number(env.SHIM_PAGES || 2);
const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1280, 16); png.writeUInt32BE(720, 20);
const AUDIO = { RIFF: ['pcm_s16le', 'wav'], FORM: ['pcm_s16be', 'aiff'], ID3: ['mp3', 'mp3'], OggS: ['vorbis', 'ogg'], fLaC: ['flac', 'flac'], '\\x1aE\\xdf\\xa3': ['opus', 'matroska,webm'], '\\x00\\x00\\x00\\x20': ['alac', 'mov,mp4,m4a'] };
if (name === 'soffice') {
  if (env.SHIM_SOFFICE === 'none') process.exit(81);
  const out = a[a.indexOf('--outdir') + 1], filter = a[a.indexOf('--convert-to') + 1].split(':').slice(0, 2).join(':');
  writeFileSync(join(out, basename(a.at(-1)).replace(/\\.[^.]+$/, '') + '.pdf'), '%PDF-1.4 shim ' + filter + ' ' + basename(a.at(-1)));
} else if (name === 'pdfinfo') process.stdout.write('Pages:          ' + pages + '\\nPage size:      612 x 792 pts (letter)\\n');
else if (name === 'pdftotext') process.stdout.write(Array.from({ length: pages }, (_, i) => 'text of ' + (i + 1)).join('\\f') + '\\f');
else if (name === 'pdftoppm') {
  const from = Number(a[a.indexOf('-f') + 1]), to = Number(a[a.indexOf('-l') + 1]), prefix = a.at(-1);
  for (let n = from; n <= to; n++) writeFileSync(prefix + '-' + String(n).padStart(String(pages).length, '0') + '.png', png);
} else if (name === 'ffprobe') {
  const file = a.at(-1);
  if (file.endsWith('.m4a')) process.stdout.write(JSON.stringify({ streams: [{ codec_type: 'audio', codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '5.0' }], format: { format_name: 'mov,mp4,m4a' } }));
  else {
    const head = readFileSync(file).subarray(0, 4).toString('latin1'), hit = Object.entries(AUDIO).find(([k]) => head.startsWith(k));
    if (!hit) { process.stderr.write('Invalid data found when processing input'); process.exit(1); }
    process.stdout.write(JSON.stringify({ streams: [{ codec_type: 'audio', codec_name: hit[1][0], sample_rate: '44100', channels: Number(env.SHIM_CHANNELS || 2), duration: env.SHIM_SECONDS || '5.0' }], format: { format_name: hit[1][1] } }));
  }
} else if (name === 'ffmpeg') writeFileSync(a.at(-1), 'ftypM4A shim');
else process.exit(82);
`;
function shimDir() {
  const dir = mkdtempSync(join(tmpdir(), 'convert-shims-'));
  writeFileSync(join(dir, 'shim.mjs'), SHIM_JS);
  for (const name of ['soffice', 'pdfinfo', 'pdftotext', 'pdftoppm', 'ffprobe', 'ffmpeg']) {
    if (process.platform === 'win32') copyFileSync(process.env.CONVERT_TEST_SHIM_EXE, join(dir, `${name}.exe`));
    else { writeFileSync(join(dir, name), `#!/bin/sh\nexec "${process.execPath}" "${join(dir, 'shim.mjs')}" ${name} "$@"\n`); chmodSync(join(dir, name), 0o755); }
  }
  return dir;
}

// ---- one attempt through the real child, the way the service runs it (sandbox none: the Linux sandbox exists only in the image)
async function convert(converter, bytes, { options = {}, env = {}, shims } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'convert-fx-')), tmp = join(dir, 'tmp');
  mkdirSync(join(dir, 'in'), { recursive: true }); mkdirSync(join(dir, 'out')); mkdirSync(tmp);
  writeFileSync(join(dir, 'job.json'), JSON.stringify({ converter, options }));
  writeFileSync(join(dir, 'in', 'source'), bytes);
  const childEnv = { PATH: [shims, process.env.PATH].filter(Boolean).join(delimiter), HOME: tmp, TMPDIR: tmp, TEMP: tmp, TMP: tmp, CONVERT_SANDBOX: 'none', ...(OCCT ? { CONVERT_OCCT_DIR: OCCT } : {}), ...env };
  if (process.platform === 'win32') Object.assign(childEnv, { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR, USERPROFILE: tmp });
  const child = spawn(process.execPath, [join(HERE, 'child.mjs'), dir], { env: childEnv, stdio: 'ignore' });
  const code = await new Promise(r => child.on('exit', r));
  assert.equal(code, 0, 'the child itself must not crash');
  const result = JSON.parse(readFileSync(join(dir, 'out', 'result.json'), 'utf8'));
  return { result, files: readdirSync(join(dir, 'out')).sort(), read: f => readFileSync(join(dir, 'out', f)) };
}
const names = r => r.result.outputs?.map(o => o.name);

test('sniff: every accepted container is recognised by its bytes, and an OLE directory placed past 4 MiB still is', () => {
  const kinds = {
    doc: fx('sample.doc'), docx: fx('sample.docx'), pptx: fx('sample.pptx'), step: fx('cube-ap242.step'),
    odt: odf('text', '<office:document-content/>'), odp: odf('presentation', '<office:document-content/>'),
    rtf: Buffer.from('{\\rtf1\\ansi Hello}'), ppt: ole('PowerPoint Document'),
  };
  for (const [kind, bytes] of Object.entries(kinds)) assert.deepEqual(sniff(bytes), { kind, ext: kind }, kind);
  // Large Word and PowerPoint files keep the OLE directory after their content: a prefix scan called them "not a recognised format".
  assert.deepEqual(sniff(ole('WordDocument', 5 * 1024 * 1024)), { kind: 'doc', ext: 'doc' });
  assert.deepEqual(sniff(ole('PowerPoint Document', 40 * 1024 * 1024)), { kind: 'ppt', ext: 'ppt' });
  assert.equal(sniff(ole('Workbook')), null, 'an OLE file that is neither is refused');
  assert.equal(sniff(Buffer.concat([ole('Book'), Buffer.from('WordDocument', 'utf16le')])), null, 'the name alone, outside a directory entry, is not enough');
  for (const head of ['RIFF', 'ID3', 'OggS', 'fLaC']) assert.equal(sniff(magic(head)), null, `${head}: audio is decided by ffprobe, not sniffed`);
});

const REAL_STEP = OCCT ? test : test.skip;
for (const [file, unit, parts] of [['cube-in.step', 'inch', 1], ['as1-oc-214.stp', 'millimetre', 18], ['cube-ap242.step', 'inch', 1]]) {
  REAL_STEP(`STEP -> GLB with the real OpenCascade: ${file}`, async () => {
    const r = await convert('step-glb', fx(file));
    assert.equal(r.result.status, 'ready', JSON.stringify(r.result));
    assert.deepEqual(names(r), ['model.glb', 'structure.json']);
    assert.equal(r.read('model.glb').subarray(0, 4).toString(), 'glTF');
    const meta = r.result.outputs[0].meta;
    assert.deepEqual([meta.source_unit, meta.parts], [unit, parts]);
  });
}

test('STEP: a file that is not STEP fails as unsupported_format before OpenCascade loads', async () => {
  const r = await convert('step-glb', Buffer.from('not a step file'));
  assert.deepEqual([r.result.status, r.result.error], ['failed', 'unsupported_format']);
});

const SHIM = SHIMS ? test : test.skip;
describe('every path against stub tools', { concurrency: 4 }, () => {
  const documents = [['doc', fx('sample.doc'), /Legacy \.doc/], ['docx', fx('sample.docx')], ['odt', odf('text', '<x/>')], ['rtf', Buffer.from('{\\rtf1\\ansi Hello}')]];
  for (const [kind, bytes, limit] of documents) {
    SHIM(`office-pdf (stub tools): ${kind} -> preview.pdf, text.json, poster.png`, async () => {
      const r = await convert('office-pdf', bytes, { shims: shimDir() });
      assert.equal(r.result.status, 'ready', JSON.stringify(r.result));
      assert.equal(r.result.source_kind, kind);
      assert.deepEqual(names(r), ['preview.pdf', 'text.json', 'poster.png']);
      assert.match(r.read('preview.pdf').toString(), /writer_pdf_Export/, 'Writer filter for documents');
      const text = JSON.parse(r.read('text.json'));
      assert.deepEqual(text.units.map(u => u.loc), [{ page: 1 }, { page: 2 }]);
      assert.equal(text.complete, true);
      assert.deepEqual(r.result.coverage, { text: 'extracted', units: 'pages', count: 2 });
      if (limit) assert.match(r.result.limitations.join(' '), limit);
    });
  }

  for (const [kind, bytes, notes] of [['pptx', fx('sample.pptx'), true], ['ppt', ole('PowerPoint Document'), false], ['odp', odf('presentation', '<x/>'), false]]) {
    SHIM(`slides (stub tools): ${kind} -> preview.pdf, one slide image per page, text.json`, async () => {
      const r = await convert('slides', bytes, { shims: shimDir(), env: { SHIM_PAGES: '3' } });
      assert.equal(r.result.status, 'ready', JSON.stringify(r.result));
      assert.equal(r.result.source_kind, kind);
      assert.deepEqual(names(r), ['preview.pdf', 'slide-001.png', 'slide-002.png', 'slide-003.png', 'text.json']);
      assert.match(r.read('preview.pdf').toString(), /impress_pdf_Export/, 'Impress filter, hidden slides included');
      const text = JSON.parse(r.read('text.json'));
      // PPTX reads its own XML (notes, hidden flag); PPT and ODP fall back to the PDF text layer, one unit per slide.
      assert.equal(text.units.some(u => u.loc.notes), notes);
      if (!notes) { assert.deepEqual(text.units.map(u => u.loc), [{ slide: 1 }, { slide: 2 }, { slide: 3 }]); assert.match(r.result.limitations.join(' '), /Speaker notes are not extracted/); }
    });
  }

  SHIM('slides (stub tools): the slide range option limits the images, never the PDF', async () => {
    const r = await convert('slides', fx('sample.pptx'), { shims: shimDir(), env: { SHIM_PAGES: '3' }, options: { from: 2, to: 2 } });
    assert.deepEqual(names(r), ['preview.pdf', 'slide-002.png', 'text.json']);
    assert.match(r.result.limitations.join(' '), /Slide images 2-2 of 3/);
  });

  for (const [format, head] of [['WAV', 'RIFF'], ['AIFF', 'FORM'], ['MP3', 'ID3'], ['Ogg Vorbis', 'OggS'], ['FLAC', 'fLaC'], ['WebM Opus', '\x1aE\xdf\xa3'], ['M4A ALAC', '\x00\x00\x00\x20']]) {
    SHIM(`audio-playback (stub tools): ${format} -> playback.m4a and probe.json`, async () => {
      const r = await convert('audio-playback', head === 'RIFF' ? synthWav(1) : magic(head), { shims: shimDir() });
      assert.equal(r.result.status, 'ready', JSON.stringify(r.result));
      assert.deepEqual(names(r), ['playback.m4a', 'probe.json']);
      assert.equal(r.result.outputs[0].meta.codec, 'aac');
      assert.equal(JSON.parse(r.read('probe.json')).source.container, { RIFF: 'wav', FORM: 'aiff', ID3: 'mp3', OggS: 'ogg', fLaC: 'flac', '\x1aE\xdf\xa3': 'matroska,webm', '\x00\x00\x00\x20': 'mov,mp4,m4a' }[head]);
    });
  }

  SHIM('error mapping: what each tool failure becomes, and that every one is a clean failed result, never a crash', async () => {
    const shims = shimDir();
    const run = (converter, bytes, env) => convert(converter, bytes, { shims, env }).then(r => r.result);
    const [noAudio, tooLong, surround, noPdf, pptxAsDoc, docAsSlides, junk] = await Promise.all([
      run('audio-playback', magic('NOPE')), run('audio-playback', magic('ID3'), { SHIM_SECONDS: String(5 * 3600) }), run('audio-playback', magic('ID3'), { SHIM_CHANNELS: '6' }),
      run('office-pdf', fx('sample.docx'), { SHIM_SOFFICE: 'none' }), run('office-pdf', fx('sample.pptx')), run('slides', fx('sample.docx')), run('office-pdf', Buffer.from('#!/bin/sh')),
    ]);
    assert.equal(noAudio.error, 'unsupported_format', 'ffprobe cannot read it');
    assert.equal(tooLong.error, 'too_complex', 'over the 4 h audio limit');
    assert.match(surround.limitations.join(), /Downmixed from 6 channels/);
    assert.equal(noPdf.error, 'invalid_source', 'LibreOffice produced no PDF');
    assert.equal(pptxAsDoc.error, 'unsupported_format', 'a presentation is not a document');
    assert.equal(docAsSlides.error, 'unsupported_format', 'a document is not a presentation');
    assert.equal(junk.error, 'unsupported_format');
  });
});
