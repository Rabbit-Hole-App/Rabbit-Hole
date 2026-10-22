// EXP-T00/T01 visualization-cases tool: intake, rollback, history, verdicts, isolation, comparison layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, examplePool, imageInfo, intake, recordRun, recordVerdict, rollback, sha256 } from './cases.mjs';
import { comparisonLayout } from './compose.mjs';

// Minimal valid PNG header bytes (IHDR only): enough for imageInfo and hashing.
function png(width, height, salt = 0) {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b[39] = salt;
  return b;
}

function sandbox(files) {
  const root = mkdtempSync(join(tmpdir(), 'vc-'));
  const corpus = join(root, 'corpus');
  const casesRoot = join(root, 'cases-root');
  mkdirSync(corpus, { recursive: true }); mkdirSync(casesRoot, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) { mkdirSync(join(corpus, name, '..'), { recursive: true }); writeFileSync(join(corpus, name), bytes); }
  return { corpus, casesRoot };
}
const manifestOf = casesRoot => JSON.parse(readFileSync(join(casesRoot, 'intake-manifest.json'), 'utf8'));

test('imageInfo reads PNG, JPEG and WebP headers', () => {
  assert.deepEqual(imageInfo(png(7, 9)), { format: 'png', width: 7, height: 9 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0, 0, 0, 0]);
  assert.deepEqual(imageInfo(jpeg), { format: 'jpeg', width: 600, height: 300 });
  const webp = Buffer.alloc(32); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8X', 12); webp.writeUIntLE(99, 24, 3); webp.writeUIntLE(49, 27, 3);
  assert.deepEqual(imageInfo(webp), { format: 'webp', width: 100, height: 50 });
  assert.equal(imageInfo(Buffer.from('not an image at all, just text')), null);
});

test('empty corpus is a blocked intake, not an empty success', () => {
  const { corpus, casesRoot } = sandbox({ 'notes.txt': 'hello' });
  const result = intake({ corpus, casesRoot, labels: {} });
  assert.equal(result.state, 'blocked');
  assert.equal(existsSync(join(casesRoot, 'intake-manifest.json')), false);
});

test('dry run writes nothing; real intake copies bytes and leaves the corpus intact', () => {
  const a = png(10, 20, 1);
  const { corpus, casesRoot } = sandbox({ 'a.png': a });
  const dry = intake({ corpus, casesRoot, labels: {}, dryRun: true });
  assert.equal(dry.state, 'dry-run');
  assert.equal(readdirSync(casesRoot).length, 0);
  const done = intake({ corpus, casesRoot, labels: { [sha256(a)]: { slug: 'tall-box', family: 'f', split: 'example' } }, runId: 'r1' });
  assert.equal(done.summary.imported, 1);
  const entry = manifestOf(casesRoot).entries[0];
  assert.equal(entry.caseId, `tall-box-${sha256(a).slice(0, 8)}`);
  assert.deepEqual(readFileSync(join(casesRoot, 'cases', entry.caseId, 'reference', 'tall-box.png')), a);
  assert.ok(existsSync(join(corpus, 'a.png')), 'original stays in the corpus');
  const record = JSON.parse(readFileSync(join(casesRoot, 'cases', entry.caseId, 'case.json'), 'utf8'));
  assert.equal(record.generationReady, true);
  assert.equal(record.reuseEligible, false);
  assert.equal(record.exposure, 'unseen');
  assert.equal(record.reference.width, 10);
});

test('repeat intake is idempotent and does not rewrite the manifest', () => {
  const { corpus, casesRoot } = sandbox({ 'a.png': png(1, 1, 1), 'b.png': png(2, 2, 2) });
  intake({ corpus, casesRoot, labels: {}, runId: 'r1' });
  const before = readFileSync(join(casesRoot, 'intake-manifest.json'), 'utf8');
  const again = intake({ corpus, casesRoot, labels: {}, runId: 'r2' });
  assert.equal(again.state, 'unchanged');
  assert.equal(readFileSync(join(casesRoot, 'intake-manifest.json'), 'utf8'), before);
});

test('duplicate bytes are one case with an alias; same name with different bytes is a second case with a recorded collision', () => {
  const a = png(3, 3, 3);
  const { corpus, casesRoot } = sandbox({ 'a.png': a, 'copy-of-a.png': a, 'x/fig.png': png(4, 4, 4), 'y/fig.png': png(5, 5, 5) });
  const result = intake({ corpus, casesRoot, labels: {}, runId: 'r1' });
  assert.equal(result.summary.imported, 3);
  assert.equal(result.summary.aliased, 1);
  const m = manifestOf(casesRoot);
  assert.equal(m.entries.length, 3);
  const dup = m.entries.find(e => e.sha256 === sha256(a));
  assert.deepEqual([dup.source, ...dup.aliases].sort(), ['a.png', 'copy-of-a.png']);
  const figs = m.entries.filter(e => e.originalName === 'fig.png');
  assert.equal(figs.length, 2);
  assert.notEqual(figs[0].caseId, figs[1].caseId);
  assert.deepEqual(figs[1].collisions, [figs[0].caseId]);
  // Every corpus file is accounted for exactly once through source or alias.
  const accounted = m.entries.flatMap(e => [e.source, ...e.aliases]).sort();
  assert.deepEqual(accounted, ['a.png', 'copy-of-a.png', 'x/fig.png', 'y/fig.png']);
});

test('an interrupted intake resumes on rerun, and rollback removes only that run', () => {
  const { corpus, casesRoot } = sandbox({ 'a.png': png(1, 2, 1), 'b.png': png(3, 4, 2) });
  let copies = 0;
  const failing = (from, to) => { if (++copies === 2) throw new Error('disk unplugged'); copyFileSync(from, to); };
  assert.throws(() => intake({ corpus, casesRoot, labels: {}, runId: 'r1', copy: failing }), /disk unplugged/);
  const mid = manifestOf(casesRoot);
  assert.deepEqual(mid.entries.map(e => e.state).sort(), ['imported', 'planned']);
  assert.equal(mid.runs[0].state, 'running');
  const resumed = intake({ corpus, casesRoot, labels: {}, runId: 'r2' });
  assert.equal(resumed.summary.resumed, 1);
  assert.ok(manifestOf(casesRoot).entries.every(e => e.state === 'imported' && e.runId === 'r1'));
  const { removed } = rollback('r1', { casesRoot });
  assert.equal(removed.length, 2);
  assert.equal(manifestOf(casesRoot).entries.length, 0);
  assert.equal(readdirSync(join(casesRoot, 'cases')).length, 0);
  assert.ok(existsSync(join(corpus, 'a.png')) && existsSync(join(corpus, 'b.png')), 'rollback never touches the corpus');
});

function readyCorpus() {
  const imgs = { 'ex1.png': png(10, 10, 1), 'ex2.png': png(10, 10, 2), 'held.png': png(10, 10, 3), 'other.png': png(10, 10, 4), 'new.png': png(10, 10, 5) };
  const { corpus, casesRoot } = sandbox(imgs);
  const labels = {
    [sha256(imgs['ex1.png'])]: { slug: 'ex1', family: 'arch', lineage: 'l1', split: 'example' },
    [sha256(imgs['ex2.png'])]: { slug: 'ex2', family: 'arch', lineage: 'l1', split: 'example' },
    [sha256(imgs['held.png'])]: { slug: 'held', family: 'arch', lineage: 'l2', split: 'heldout' },
    [sha256(imgs['other.png'])]: { slug: 'other', family: 'math', lineage: 'l3', split: 'example' },
  };
  intake({ corpus, casesRoot, labels, runId: 'r1' });
  const ids = Object.fromEntries(manifestOf(casesRoot).entries.map(e => [e.referenceName.replace('.png', ''), e.caseId]));
  // Make the example cases reuse-eligible, as an approved accepted spec would.
  for (const id of [ids.ex1, ids.ex2, ids.other]) {
    const path = join(casesRoot, 'cases', id, 'case.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reuseEligible: true }));
  }
  return { casesRoot, ids, generated: join(corpus, 'ex1.png') };
}

test('split and family isolation: held-out cases never feed examples, and a run that leaks them is refused', () => {
  const { casesRoot, ids } = readyCorpus();
  const cases = readdirSync(join(casesRoot, 'cases')).map(id => JSON.parse(readFileSync(join(casesRoot, 'cases', id, 'case.json'), 'utf8')));
  const byId = Object.fromEntries(cases.map(c => [c.id, c]));
  assert.deepEqual(examplePool(cases, byId[ids.held]).map(c => c.id), [ids.other], 'held-out target: no same-family examples');
  assert.deepEqual(examplePool(cases, byId[ids.ex1]).map(c => c.id), [ids.other], 'same lineage excluded');
  const base = { casesRoot, mode: 'generate', inputMode: 'prompt-only', prompt: { learnerPrompt: 'x' }, outcome: 'failed', error: 'stub' };
  assert.throws(() => recordRun(ids.held, { ...base, runId: 'v1', examples: [ids.ex1] }), /not allowed/);
  assert.throws(() => recordRun(ids.ex1, { ...base, runId: 'v1', examples: [ids.held] }), /not allowed/);
  assert.throws(() => recordRun(ids.new, { ...base, runId: 'v1' }), /family\/split not assigned/);
  assert.equal(recordRun(ids.held, { ...base, runId: 'v1', examples: [ids.other] }).receipt.outcome, 'failed');
});

test('history is immutable, failures stay missing-result, verdicts bind to run and output hash', () => {
  const { casesRoot, ids, generated } = readyCorpus();
  const base = { casesRoot, mode: 'render-existing', inputMode: 'prompt-only', prompt: { exact: 'prompt as sent' } };
  const failed = recordRun(ids.ex1, { ...base, runId: 'v001', outcome: 'failed', error: 'compile refused' });
  assert.equal(failed.receipt.result, 'missing-result');
  assert.equal(existsSync(join(failed.runDir, 'generated.png')), false);
  assert.throws(() => recordRun(ids.ex1, { ...base, runId: 'v001', outcome: 'failed' }), /immutable/);
  assert.throws(() => recordVerdict(ids.ex1, { casesRoot, runId: 'v001', verdict: 'approved', reviewer: 'owner' }), /no result/);
  assert.throws(() => recordRun(ids.ex1, { ...base, runId: 'v002', outcome: 'ok' }), /generated.png/);
  const ok = recordRun(ids.ex1, { ...base, runId: 'v002', outcome: 'ok', generatedPng: generated });
  assert.equal(ok.receipt.outputSha256, sha256(readFileSync(generated)));
  assert.deepEqual(JSON.parse(readFileSync(join(ok.runDir, 'prompt.json'), 'utf8')), { exact: 'prompt as sent' });
  const review = recordVerdict(ids.ex1, { casesRoot, runId: 'v002', verdict: 'approved', reviewer: 'owner' });
  assert.equal(review.verdicts[0].outputSha256, ok.receipt.outputSha256);
  const latest = JSON.parse(readFileSync(join(casesRoot, 'cases', ids.ex1, 'generated', 'latest', 'run.json'), 'utf8'));
  assert.deepEqual(latest, { runId: 'v002', outcome: 'ok' }, 'latest is a pointer, approval lives in review.json');
  const html = readFileSync(buildIndex(casesRoot), 'utf8');
  assert.match(html, /missing result: compile refused/);
  assert.match(html, /approved by owner/);
  assert.doesNotMatch(html, /<script/);
});

test('comparison layout keeps full images and aspect ratios with neutral padding', () => {
  const tall = comparisonLayout({ width: 300, height: 900 }, { width: 1600, height: 400 });
  const [left, right] = tall.panels;
  assert.ok(Math.abs(left.w / left.h - 300 / 900) < 0.01);
  assert.ok(Math.abs(right.w / right.h - 1600 / 400) < 0.01);
  assert.ok(left.x + left.w <= right.x, 'original left of result, no overlap');
  assert.ok(right.x + right.w <= tall.width && Math.max(left.y + left.h, right.y + right.h) <= tall.height);
  assert.ok(left.w <= 300 && right.w <= 1600, 'never upscaled past natural size');
  const missing = comparisonLayout({ width: 300, height: 200 }, null);
  assert.equal(missing.panels.length, 1, 'no result means no fabricated right panel');
});
