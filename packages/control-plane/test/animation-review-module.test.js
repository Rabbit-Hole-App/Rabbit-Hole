// FX-AN-113 (C11, owner decision): the review prompt moved out of agents/animation-author.js into its own module, so agents/animation-author.js holds the author's text only and a change to the
// review's text is the REVIEW's identity (scripts/animation/author-sample.mjs REVIEW_IDENTITY_FILES), not Gate 1's. The move changes no byte. The hashes below were taken on C10 (f5c890763), BEFORE
// the move, from the same inputs: the review prompt, three review requests (an artifact with an arrow, one without, and the worst case the size check builds) and ARROW_NOTE. Offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ANIMATION_REVIEW_SYSTEM } from '../src/agents/animation-review.js';
import { ARROW_NOTE, buildReviewContent } from '../src/animation-review.js';
import { worstReviewContent } from '../src/animation-repair.js';
import { experimentFixture } from '../../web/src/animation3d/fixtures.js';

const sha = text => createHash('sha256').update(text).digest('hex');
const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const h = 'a'.repeat(64);
const captures = trace => ['default', 'side'].map((view, i) => ({ id: `v${i}-s0`, artifactHash: h, view, time: 0, inputs: {}, events: [], ticks: 0, data: i ? 'BBBB' : 'AAAA', mediaType: 'image/png', trace }));

test('the review prompt is the same text, byte for byte, as before the move', () => {
  assert.equal(Buffer.byteLength(ANIMATION_REVIEW_SYSTEM), 4838);
  assert.equal(sha(ANIMATION_REVIEW_SYSTEM), '5625b692cd25a9011537426d80554284f49a68b7cefa177fefd25621b0016814');
  assert.equal(sha(ARROW_NOTE), '7acc565e900ad4c5eef26acf13652f2a371426f023ea8983e519321647c09d63');
});

test('the review requests are the same, byte for byte, as before the move', () => {
  const trace = { arrows: [{ id: 'a', tail: [0, 1, 0], tip: [0, 2, 0], screenPx: 40 }], clamped: [{ node: 'ball', trueY: 5.6, y: 2 }] };
  const withArrow = buildReviewContent({ request: 'Show me SGD.', plan: golden.plan, artifact: golden.artifact, artifactHash: h, captures: captures(trace), evidence: [], coverage: { sampled: ['initial'], omitted: ['x'] } });
  assert.equal(sha(JSON.stringify(withArrow)), 'a12edd6aeb64bf25765a0568be614c8155974a54556e113130e649c1549f6d4d');
  const noArrow = buildReviewContent({ request: 'Show me a pendulum.', plan: experimentFixture.plan, artifact: experimentFixture.artifact, artifactHash: h, captures: captures({ readouts: { period: 2 } }), evidence: [], coverage: null });
  assert.equal(sha(JSON.stringify(noArrow)), '135d2195fea64ac5e24d996e98a7185d5c2f9db26ab9f7982b0feb79b8a4a4bb');
  const worst = worstReviewContent(golden.artifact, { prompt: 'Show me SGD.', plan: golden.plan, evidence: [] });
  assert.equal(sha(JSON.stringify(worst)), 'fc6caf0e2cdf51654b8c6a7e9350243eaad549dda02c9ed5f52c847b452ee808');
});

test('agents/animation-author.js holds no review text, the review module imports nothing of the author\'s, and the request builder takes the prompt from the review module', () => {
  const author = source('agents/animation-author.js'), review = source('agents/animation-review.js');
  assert.equal(author.includes('You independently review'), false);
  assert.equal(/ANIMATION_REVIEW_SYSTEM|report_review/.test(author), false, 'no review prompt, export or tool call in the author file');
  assert.ok(review.includes('You independently review a rendered interactive 3D animation'));
  assert.equal(/^import /m.test(review), false, 'nothing is imported: the review prompt depends on no author text');
  assert.match(source('animation-review.js'), /from '\.\/agents\/animation-review\.js'/);
  assert.match(source('animation-repair.js'), /from '\.\/agents\/animation-review\.js'/);
  assert.equal(/ANIMATION_REVIEW_SYSTEM/.test(source('animation-author.js')), false);
});
