// The reviewer calibration set (scripts/animation/calibration): the manifest, its fixtures and the golden are what lane (e)'s tool sends through the review. Offline, no model.
// Run: node --test scripts/animation-calibration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateStage } from '../packages/control-plane/src/animation-author.js';
import { draftOf } from '../packages/control-plane/src/animation-repair.js';
import { ANIMATION_CLIENT_FEATURES } from '../packages/web/src/animation3d/capabilities.js';
import { canonicalJson, sha256Hex } from '../packages/web/src/explain-program/contract.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = path => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const manifest = read('scripts/animation/calibration/manifest.json');
const jobOf = (plan, draft, request) => ({ prompt: request, plan, planHash: 'a'.repeat(64), resultId: `ar_${'a'.repeat(32)}`, approval: { at: 0 }, draft, evidence: [], features: [...ANIMATION_CLIENT_FEATURES], calls: [{ role: 'author', status: 'settled', served: 'claude-opus-5-5' }] });

test('the golden is the file the manifest pins (a retuned golden regenerates the manifest on purpose) and it validates', async () => {
  const text = readFileSync(join(ROOT, manifest.golden.path), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(text).digest('hex'), manifest.golden.sha256);
  assert.equal(manifest.golden.mustPass, true);
  const golden = JSON.parse(text), out = await validateStage(jobOf(golden.plan, draftOf(golden.artifact), 'calibration'), { env: {} });
  assert.deepEqual(out.problems ?? [], []);
});

test('three cases that must fail, each a different kind, each with its evidence and a usable match rule', () => {
  assert.equal(manifest.mustFail.length, 3);
  assert.equal(new Set(manifest.mustFail.map(c => c.kind)).size, 3);
  assert.deepEqual(manifest.mustFail.map(c => c.id).sort(), ['height-mismatch', 'mixed-arrow-scales', 'twin-balls-and-edge-claim']);
  for (const c of manifest.mustFail) {
    assert.ok(existsSync(join(ROOT, c.artifact)), c.artifact);
    assert.ok(c.job.startsWith('aj_') && c.candidate && c.reviewArtifactHash.length === 64 && c.request.length > 10);
    assert.ok(c.knownFindings.length >= 5 && c.knownFindings.every(f => ['major', 'blocker'].includes(f.severity) && f.message && f.c9Renderer));
    assert.ok(c.mustMention.length > 0);
    for (const pattern of c.mustMention) assert.doesNotThrow(() => new RegExp(pattern, 'i'), pattern);
    // the rule is satisfiable by the evidence itself: some known finding matches one of the patterns
    assert.ok(c.knownFindings.some(f => c.mustMention.some(p => new RegExp(p, 'i').test(f.message))), `${c.id}: no known finding matches mustMention`);
  }
});

test('each fixture is the draft its review judged: the recorded hash, a plan, a request, and the product validator accepts it', async () => {
  for (const c of manifest.mustFail) {
    const fixture = read(c.artifact);
    assert.equal(fixture.id, c.id);
    assert.equal((await sha256Hex(canonicalJson(fixture.draft))).slice(0, 12), fixture.review.draftHash12);
    assert.equal(fixture.review.artifactHashOfReview, c.reviewArtifactHash);
    assert.deepEqual(fixture.knownFindings.map(f => f.message.slice(0, 240)), c.knownFindings.map(f => f.message), 'the manifest summarises the fixture');
    assert.ok(fixture.request && fixture.plan?.schema === 'animation-plan/1' && fixture.draft?.scene && fixture.whyItMustFail);
    const out = await validateStage(jobOf(fixture.plan, fixture.draft, fixture.request), { env: {} });
    assert.deepEqual(out.problems ?? [], [], c.id);
  }
});

test('no machine-local path or secret in the set', () => {
  for (const c of manifest.mustFail) {
    const text = readFileSync(join(ROOT, c.artifact), 'utf8');
    assert.doesNotMatch(text, /C:[\\/](?:Users|s)[\\/]/i);
    assert.doesNotMatch(text, /sk-[A-Za-z0-9]{10}|session|cookie/i);
  }
});

test('a known false positive: a draft the review may reject for real reasons but must not reject for the offset it misread (C9 job 1, FX-AN-112)', async () => {
  assert.equal(manifest.falsePositives.length, 1);
  for (const c of manifest.falsePositives) {
    assert.ok(existsSync(join(ROOT, c.artifact)), c.artifact);
    assert.ok(c.job.startsWith('aj_') && c.candidate && c.reviewArtifactHash.length === 64 && c.request.length > 10 && c.note.length > 40);
    const patterns = c.mustNotMention.map(p => new RegExp(p, 'i'));
    assert.ok(patterns.length >= 2);
    // the evidence satisfies the rule: the review's false finding matches, so a repeat of it is caught
    assert.ok(c.knownFalseFindings.length >= 1 && c.knownFalseFindings.every(f => ['major', 'blocker'].includes(f.severity) && patterns.some(r => r.test(f.message))));
    const fixture = read(c.artifact);
    assert.equal(fixture.id, c.id);
    assert.equal((await sha256Hex(canonicalJson(fixture.draft))).slice(0, 12), fixture.review.draftHash12);
    assert.equal(fixture.review.artifactHashOfReview, c.reviewArtifactHash);
    // the rule is not over-broad: the REAL findings of the same review (the camera) match none of the patterns
    const real = fixture.majorFindings.filter(f => !f.falsePositive);
    assert.ok(real.length >= 1 && real.every(f => !patterns.some(r => r.test(f.message))), 'a real camera finding must stay allowed');
    assert.deepEqual(fixture.majorFindings.filter(f => f.falsePositive).map(f => f.message.slice(0, 260)), c.knownFalseFindings.map(f => f.message));
    const out = await validateStage(jobOf(fixture.plan, fixture.draft, fixture.request), { env: {} });
    assert.deepEqual(out.problems ?? [], []);
    assert.doesNotMatch(readFileSync(join(ROOT, c.artifact), 'utf8'), /C:[\/](?:Users|s)[\/]/i);
  }
  // no mustFail case is also a false positive: the sections are different promises
  assert.equal(manifest.mustFail.some(c => manifest.falsePositives.some(f => f.job === c.job)), false);
  assert.match(manifest.falsePositiveMatching, /OTHER reasons/);
});
