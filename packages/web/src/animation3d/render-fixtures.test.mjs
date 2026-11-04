// The pure half of e2e/animation-render-check.mjs (which draws these four artifacts through render/animation3d-render.js in CI's browser): everything the page does that needs no
// pixels, run here in verify with the real engine. The four fixtures seal and validate; the review samples 6 captures of each; each capture's trace and readout strip are what the
// hand-written strips say, text readouts included, with nothing buried; and the review page's source takes its strip from the card's own lines (the page itself cannot run
// here: a strip that drops a text readout, FX-AN-098, is also caught by that source guard).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureManifest } from '../../../control-plane/src/animation-render.js';
import { validateAnimationArtifact } from './contract.js';
import { readoutLines } from './card.js';
import { runReviewProgram } from './review.js';
import { canonicalJson, sha256Hex } from '../explain-program/contract.js';
import { renderFixtures } from './testdata/render-fixtures.mjs';

let engineModule = null;
try { engineModule = await import('../explain-program/runtime.js'); } catch { engineModule = null; }
const run = engineModule ? test : test.skip;
let engine;
before(async () => { if (engineModule) engine = await engineModule.loadEngine(); });
after(() => engine?.dispose?.());
const workerFactory = () => {
  const worker = { terminated: false, terminate() { worker.terminated = true; }, postMessage: message => queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...engineModule.runProgram(engine, message) } }); }) };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
// The strip the review page draws for a frame: the card's readout lines, then a game's goal (render/animation3d-render.js showOverlay).
const stripOf = (artifact, frame) => [...readoutLines(artifact, frame), ...(frame.goal ? [`${frame.goal.status === 'won' ? 'Won' : frame.goal.status === 'lost' ? 'Lost' : 'Playing'}${frame.goal.message ? `: ${frame.goal.message}` : ''}`] : [])].join('  ·  ');

run('each fixture seals, validates and is sampled as 6 captures; every trace and strip is the hand-written one, text readouts shown, nothing buried or clamped', async () => {
  const fixtures = await renderFixtures();
  assert.deepEqual(fixtures.map(f => f.name), ['golden', 'grid-game', 'pendulum', 'projectile']);
  for (const { name, artifact, strips } of fixtures) {
    const checked = validateAnimationArtifact(artifact);
    assert.equal(checked.ok, true, `${name}: ${JSON.stringify(checked.issues?.slice(0, 3))}`);
    const { entries } = captureManifest(artifact), hash = await sha256Hex(canonicalJson(artifact));
    assert.equal(entries.length, 6, `${name}: two views of three states`);
    assert.deepEqual([...new Set(entries.map(e => e.view.name))], ['default', 'side']);
    for (const entry of entries) {
      const request = { artifact, artifactHash: hash, view: entry.view, inputs: entry.inputs, time: entry.time, events: entry.events, leadTicks: entry.leadTicks ?? 0, ticks: entry.ticks, seed: entry.seed, theme: entry.theme, width: entry.width, height: entry.height };
      const done = await runReviewProgram(request, { workerFactory });
      assert.equal(done.ok, true, `${name} ${entry.id}: ${JSON.stringify(done)}`);
      assert.equal(done.artifactHash, hash);
      assert.equal(stripOf(artifact, done.frame), strips[Number(entry.id.slice(-1))], `${name} ${entry.id}: the readout strip`);
      assert.deepEqual(['buried' in done.trace, 'clamped' in done.trace], [false, false], `${name} ${entry.id}: nothing buried or clamped`);
      assert.deepEqual(Object.keys(done.trace.readouts).sort(), artifact.readouts.map(r => r.id).filter(id => id in done.trace.readouts).sort());
    }
  }
  const golden = fixtures[0], status = golden.artifact.readouts.find(r => r.id === 'status');
  assert.equal(status.kind, 'text');
  assert.ok(golden.strips.every(strip => /^Status: (paused|running|converged|diverged)  ·  /.test(strip)), 'the golden\'s strip leads with its Status word');
  assert.ok(fixtures[3].artifact.readouts.some(r => r.kind === 'text') && /Result: short/.test(fixtures[3].strips[2]), 'a regression fixture has a text readout and its word is in the strip');
});

test('the review page draws its strip from the card\'s own lines and exposes it for the CI check', () => {
  const page = readFileSync(new URL('../../render/animation3d-render.js', import.meta.url), 'utf8');
  assert.match(page, /readoutLines\(artifact, frame\)/, 'a strip with its own number-only formatter dropped every text readout (FX-AN-098)');
  assert.doesNotMatch(page, /Number\.isFinite\(frame\.readouts/);
  assert.match(page, /data-animation-strip/, 'the hook e2e/animation-render-check.mjs reads');
});
