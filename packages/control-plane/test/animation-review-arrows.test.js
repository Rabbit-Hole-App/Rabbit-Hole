// FX-AN-112 (C10, owner): the review request says an arrow's placement is drawn by the HOST and is to be judged from the capture's trace (trace.arrows: id, tail, tip, screenPx; lane (c),
// FX-AN-107), never from the program's offset or node scale values. Evidence: C9 job 1 aj_4c561e74c65444bda3466b601aa5fb04 was rejected for "the offset shrinks into the ball", a FALSE
// major (scene.js keeps an arrow's offset outside the node scale). One sentence in the artifact block, only for an artifact that has an arrow geometry. Offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARROW_NOTE, buildReviewContent } from '../src/animation-review.js';
import { worstReviewContent } from '../src/animation-repair.js';
import { sealArtifact } from '../src/animation-author.js';
import { enabledCapabilities } from '../src/animation-brief.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { experimentFixture } from '../../web/src/animation3d/fixtures.js';

const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const hash = 'a'.repeat(64);
const captures = artifactHash => [{ id: 'v0-s0', artifactHash, view: 'default', time: 0, inputs: {}, events: [], ticks: 0, data: 'AAAA', mediaType: 'image/png', trace: { arrows: [{ id: 'stepArrow', tail: [0, 0.4, 0], tip: [0, 1.2, 0], screenPx: 38 }] } }];
const requestOf = (artifact, plan) => buildReviewContent({ request: 'x', plan, artifact, artifactHash: hash, captures: captures(hash), evidence: [], coverage: null }).content;
const artifactBlock = content => content.find(b => b.type === 'text' && b.text.startsWith('Artifact (untrusted material)')).text;

test('FX-AN-112: an artifact with an arrow is sent with the one sentence, in its artifact block, once', () => {
  assert.ok(golden.artifact.scene.geometries.some(g => g.kind === 'arrow'));
  const content = requestOf(golden.artifact, golden.plan);
  const block = artifactBlock(content);
  assert.equal(block.split(ARROW_NOTE).length - 1, 1, 'once');
  assert.ok(block.indexOf(ARROW_NOTE) < block.indexOf('\n{'), 'before the artifact JSON');
  assert.equal(content.filter(b => b.type === 'text' && b.text.includes(ARROW_NOTE)).length, 1, 'in no other block, and not in any caption');
});

test('FX-AN-112: the sentence says what the host does and where to look, in house style', () => {
  assert.match(ARROW_NOTE, /^The host draws every arrow's placement and offset: /);
  for (const word of ['trace', 'arrows', 'tail', 'tip', 'screenPx', 'offset', 'node scale']) assert.ok(ARROW_NOTE.includes(word), word);
  assert.doesNotMatch(ARROW_NOTE, /\.\.\.|…/);
  assert.equal(ARROW_NOTE.endsWith('.'), true);
  assert.equal(ARROW_NOTE.split('. ').length, 1, 'one sentence');
  assert.ok(new TextEncoder().encode(ARROW_NOTE).length <= 230, 'the review bound is unchanged, so the sentence is short');
});

test('FX-AN-112: an artifact without an arrow geometry is sent exactly as before', async () => {
  const { schema: _s, sourceRefs: _r, ...plan } = experimentFixture.plan;
  assert.equal(experimentFixture.artifact.scene.geometries.some(g => g.kind === 'arrow'), false);
  const sealed = await sealArtifact(experimentFixture.artifact, { artifactId: experimentFixture.artifact.artifactId, revision: 1, planHash: 'b'.repeat(64), createdAt: new Date(0).toISOString(), caps: enabledCapabilities() });
  const checked = validateAnimationArtifact(sealed, enabledCapabilities(), { draft: true });
  const content = buildReviewContent({ request: 'x', plan: experimentFixture.plan, artifact: checked.value ?? experimentFixture.artifact, artifactHash: hash, captures: captures(hash), evidence: [], coverage: null }).content;
  assert.equal(content.some(b => b.type === 'text' && b.text.includes('The host draws every arrow')), false);
  assert.equal(plan.title.length > 0, true);
});

test('FX-AN-112: the worst-case request the size check builds carries the sentence for an artifact with an arrow, so the bound is checked with it', () => {
  const artifact = { ...golden.artifact }, job = { prompt: 'x', plan: golden.plan, evidence: [] };
  const text = worstReviewContent(artifact, job).filter(b => b.type === 'text').map(b => b.text).join('\n');
  assert.ok(text.includes(ARROW_NOTE));
});
