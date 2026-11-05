// Test helpers only (gate, composition and route tests): whiteboard-render/1 requests built from a manifest, and wb-server's fixtures
// (packages/control-plane/test/fixtures/whiteboard, branch feat/w1-server) read from the repo when they are there.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, RENDER_SCHEMA } from './contracts.mjs';

export const SERVER_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'control-plane', 'test', 'fixtures', 'whiteboard');
export const SERVER_POLICY = join(SERVER_FIXTURES, '..', '..', '..', 'src', 'whiteboard-policy.js');
export const serverFixturesMissing = !existsSync(join(SERVER_FIXTURES, 'plan-10.json')) && 'wb-server\'s fixtures are not on this branch (feat/w1-server)';
export const serverFixture = name => JSON.parse(readFileSync(join(SERVER_FIXTURES, name), 'utf8'));

// Timing for a plan + scenes: each scene's beats evenly across its window, a narrated beat speaking for `audio(sceneId, beat)` frames.
export function timingFor(plan, scenes, audio = () => 45) {
  const beats = [];
  scenes.forEach((scene, si) => {
    const w = plan.scenes[si], len = w.endFrame - w.startFrame, n = scene.beats.length;
    scene.beats.forEach((b, k) => beats.push({
      id: b.id, sceneId: scene.sceneId, startFrame: w.startFrame + Math.floor((k * len) / n), audioKey: `whiteboard/test/audio/${scene.sceneId}-${b.id}.mp3`,
      audioFrames: b.narration.trim() ? Math.min(Math.floor(len / n) - 1, audio(scene.sceneId, b)) : 0,
    }));
  });
  return { schema: 'whiteboard-timing/1', fps: FPS, totalFrames: plan.durationSeconds * FPS, beats };
}

// A request for a manifest; every narrated beat gets `mp3(key)` (base64), a few placeholder bytes unless given.
export function requestFor(manifest, mp3 = () => Buffer.from('ID3 placeholder').toString('base64')) {
  const total = manifest.timing.totalFrames;
  return {
    schema: RENDER_SCHEMA, job_id: 'wj_test', segment: { index: 0, of: 1, startFrame: 0, endFrame: total }, manifest,
    audio: manifest.timing.beats.filter(t => t.audioFrames > 0).map(t => ({ beat: t.audioKey, b64: mp3(t.audioKey) })), illustrations: [],
  };
}

// A 10 s, one-scene manifest drawing every W1 primitive kind.
export function sampleManifest() {
  const plan = {
    schema: 'whiteboard-plan/1', planId: 'wp_sample', revision: 1, goal: 'Draw every primitive once.', audience: 'a test', durationSeconds: 10,
    language: 'en', voice: 'whiteboard-default-v1', quality: 'whiteboard-1080p-v1', sourceRefs: [],
    scenes: [{ id: 's1', startFrame: 0, endFrame: 300, learningPoint: 'Every kind.', visualIntent: 'All nine kinds.', narrationSummary: 'Each kind.', facts: [], illustration: false }],
    substitutions: [], limitations: [],
  };
  const c = { color: '#37352f', width: 3 };
  const scene = {
    schema: 'whiteboard-scene/1', sceneId: 's1',
    primitives: [
      { id: 'r', kind: 'rect', ...c, x: 100, y: 100, w: 300, h: 200 },
      { id: 'e', kind: 'ellipse', ...c, cx: 700, cy: 200, rx: 120, ry: 80 },
      { id: 'l', kind: 'line', ...c, x1: 100, y1: 400, x2: 500, y2: 450 },
      { id: 'x', kind: 'cross', ...c, x: 600, y: 380, w: 60, h: 60 },
      { id: 'a', kind: 'arrow', ...c, x1: 800, y1: 400, x2: 1100, y2: 420 },
      { id: 'p', kind: 'path', ...c, points: [[100, 600], [300, 700], [500, 600], [700, 700]] },
      { id: 't', kind: 'text', ...c, x: 1200, y: 100, size: 56, text: 'slope = 2x' },
      { id: 'q', kind: 'equation', ...c, x: 1200, y: 250, size: 56, text: 'x - 0.2 * 6 = 1.8' },
      { id: 'g', kind: 'graph', color: '#2383e2', width: 3, x: 1200, y: 450, w: 600, h: 400, domain: [-4, 4], range: [0, 16], points: [[-4, 16], [-2, 4], [0, 0], [2, 4], [4, 16]] },
    ],
    beats: [
      { id: 'b1', narration: 'A box, an ellipse, a line, a cross and an arrow.', reveals: ['r', 'e', 'l', 'x', 'a'], pauseFrames: 0 },
      { id: 'b2', narration: 'A curve, a label, an equation and a graph.', reveals: ['p', 't', 'q', 'g'], pauseFrames: 15 },
    ],
  };
  return { plan, scenes: [scene], timing: timingFor(plan, [scene]) };
}

// wb-server's fixtures as render manifests: plan-10 with scene-1; plan-60 with scene-1, scene-2 and those two again as s3 and s4.
export function serverManifests() {
  const [s1, s2] = ['scene-1.json', 'scene-2.json'].map(serverFixture);
  const plan10 = serverFixture('plan-10.json'), plan60 = serverFixture('plan-60.json');
  const scenes60 = [s1, s2, { ...s1, sceneId: 's3' }, { ...s2, sceneId: 's4' }];
  return [
    { plan: plan10, scenes: [s1], timing: timingFor(plan10, [s1]) },
    { plan: plan60, scenes: scenes60, timing: timingFor(plan60, scenes60) },
  ];
}
