// C9 (owner; C7 job 3, aj_2f17bed198df4482b5e2e7e170dcdd31: a surface drawn at twice the height the program uses, balls and trails buried): a capture whose trace names a marker
// or path drawn below the surface it sits on is a repairable spec problem found by the render stage, before any review is paid; a trace that names none renders as it always did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_CAPTURE, renderStage } from '../src/animation-render.js';
import { artifactHashOf } from '../src/animation-author.js';
import { primitivesFixture } from '../../web/src/animation3d/fixtures.js';

const artifact = primitivesFixture.artifact;
function fakeBrowser(extra) {
  const evaluated = [];
  const page = { setRequestInterception: async () => {}, on: () => {}, emulateMediaFeatures: async () => {}, goto: async () => {}, waitForFunction: async () => {}, setViewport: async () => {},
    evaluate: async (_fn, request) => { evaluated.push(request); return { ok: true, artifactHash: request.artifactHash, trace: { inputs: request.inputs, time: request.time, events: request.events, readouts: {}, ...extra(request, evaluated.length) } }; },
    $: async () => ({ screenshot: async () => new Uint8Array([137, 80, 78, 71, evaluated.length]) }), close: async () => {} };
  return { newPage: async () => page, close: async () => {} };
}
const media = () => { const objects = new Map(); return { put: async (key, value) => { objects.set(key, new Uint8Array(value)); }, get: async key => (objects.has(key) ? { arrayBuffer: async () => objects.get(key).buffer } : null) }; };
const env = { ASSETS: { fetch: async () => new Response('ok') }, BROWSER: {}, LEARN_MEDIA: media() };
const run = async extra => renderStage({ browser: fakeBrowser(extra) })({ id: 'aj_1', artifact, artifactHash: await artifactHashOf(artifact) }, { env });

test('the trace may carry buried (the capture keys allow it)', () => {
  assert.ok(ANIMATION_CAPTURE.traceKeys.includes('buried') && ANIMATION_CAPTURE.traceKeys.includes('clamped'));
});

test('a buried marker or path is a repairable spec problem naming the node, the captures and how far under, not a render failure', async () => {
  const out = await run((_request, n) => (n <= 2 ? { buried: [{ node: 'ball', y: 0.6625, surfaceY: 1.125 }, { node: 'trail', y: 0.5825, surfaceY: 1.125 }] } : {}));
  assert.deepEqual([out.category, out.repairable, out.captures], ['spec', true, undefined]);
  assert.equal(out.problems.length, 2);
  assert.match(out.problems[0], /^ball is drawn below the surface it sits on in capture(s)? v0-s0(, v0-s1)? \(0\.46 under it: its y is 0\.6625 where the surface is 1\.125\)/);
  assert.match(out.problems[1], /^trail is drawn below the surface it sits on/);
  assert.ok(out.problems.every(p => /follow the same heights/.test(p)), 'each line says what to change');
});

test('a trace that names nothing buried renders as before: the captures come back', async () => {
  const out = await run(() => ({}));
  assert.equal(out.problems, undefined);
  assert.ok(out.captures.length > 0);
});
