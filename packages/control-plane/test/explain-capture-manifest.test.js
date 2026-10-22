// EXP-T18 per-step / per-state review (r2-contract.md section 4): the bounded capture manifest and its reservation maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLAIN_LIMITS } from '../src/explain-policy.js';
import { RENDER_LIMITS, captureManifest, captureMoments, checkManifest, renderStates, reserveCaptures, reserveRound } from '../src/explain-render.js';
import { buildReviewContent } from '../src/explain-review.js';
import { compileVisual } from '../../web/src/visual-components/compile.js';
import { EXAMPLES } from '../../web/src/visual-components/examples/index.js';
import { LIMITS } from '../../web/src/visual-components/budget.js';

const ROUND = reserveRound({ cap: EXPLAIN_LIMITS.render.capturesPerRound });
const mod = (id, label, extra = {}) => ({ id, component: 'module', version: 1, params: { label }, ...extra });
const spec = (components, extra = {}) => ({ version: 1, id: 'm', title: 'M', components, presentation: { mode: 'static' }, ...extra });
const stepsSpec = count => spec([mod('a', 'Request'), ...Array.from({ length: count - 1 }, (_, i) => mod(`n${i}`, `Stage ${i + 1}`, { step: `s${i + 1}` }))],
  { presentation: { mode: 'steps', steps: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, title: `Step ${i}` })) } });

test('reservation maths: the product of the dimensions, capped by the round allowance and the renderer', () => {
  assert.deepEqual(reserveCaptures({ parts: 2, states: 3, checkpoints: 1, themes: 2, width: 400, height: 300, dpr: 1 }), { captures: 12, pixels: 12 * 400 * 300 });
  assert.equal(reserveCaptures({ parts: 2, states: 3, themes: 2, width: 400, height: 300, dpr: 1, cap: 6 }).captures, 6);
  assert.equal(reserveCaptures({ parts: 4, states: 64, checkpoints: 12, themes: 2, width: 10, height: 10, dpr: 1 }).captures, RENDER_LIMITS.maxCaptures);
  // Before authoring: the round's allowance at the largest card the scene limits admit, at the capture's dpr.
  assert.deepEqual(reserveRound({ cap: 6 }), { captures: 6, pixels: 6 * LIMITS.width * LIMITS.height });
  assert.deepEqual(reserveRound({ cap: 6, dpr: 2 }), { captures: 6, pixels: 6 * LIMITS.width * LIMITS.height * 4 });
  assert.equal(ROUND.captures, EXPLAIN_LIMITS.render.capturesPerRound);
});

test('a static card is its end frame in both themes, ids unchanged', async () => {
  const { scene } = compileVisual(EXAMPLES.pipeline);
  const manifest = await captureManifest(scene, { reserved: ROUND });
  assert.deepEqual(manifest.entries.map(entry => [entry.id, entry.time]), [['light', scene.duration], ['dark', scene.duration]]);
  assert.equal((await checkManifest(manifest, scene)).entries.length, 2);
});

test('a steps card is reviewed on every step, not only the final frame', async () => {
  const { scene } = compileVisual(stepsSpec(3));
  assert.deepEqual(captureMoments(scene), [{ time: 0, step: 'Step 0' }, { time: 1, step: 'Step 1' }, { time: 2, step: 'Step 2' }]);
  const manifest = await captureManifest(scene, { reserved: ROUND });
  assert.deepEqual(manifest.entries.map(entry => `${entry.id}:${entry.step}`), ['t0-light:Step 0', 't0-dark:Step 0', 't1-light:Step 1', 't1-dark:Step 1', 't2-light:Step 2', 't2-dark:Step 2']);
  assert.equal(new Set(manifest.entries.map(entry => entry.frameHash)).size, 3, 'each step draws a different frame');
  assert.equal((await checkManifest(manifest, scene)).entries.length, 6);
  // Four steps are 8 captures in two themes: over a 6-capture round, so light only, every step still captured.
  const four = await captureManifest(compileVisual(stepsSpec(4)).scene, { reserved: ROUND });
  assert.deepEqual([four.coverage.themes, four.entries.map(entry => entry.id)], [['light'], ['t0-light', 't1-light', 't2-light', 't3-light']]);
  // Seven steps cannot all be reviewed in one round: refused, never trimmed to the last frame.
  await assert.rejects(captureManifest(compileVisual(stepsSpec(7)).scene, { reserved: ROUND }), { code: 'over_budget', message: /7 distinct frames \(1 control states x 7 moments\) and a round reviews at most 6/ });
});

test('an experiment card is reviewed in every admitted state', async () => {
  const compiled = compileVisual(EXAMPLES['pendulum-experiment']);
  const manifest = await captureManifest(compiled.scene, { reserved: ROUND });
  assert.deepEqual(manifest.entries.map(entry => entry.inputs), compiled.coverage.stateInputs, 'the compiler\'s state list, default first');
  assert.deepEqual(manifest.coverage, { states: 6, moments: 1, frames: 6, themes: ['light'] });
  assert.deepEqual((await checkManifest(manifest, compiled.scene)).entries.map(entry => entry.id), ['s0-light', 's1-light', 's2-light', 's3-light', 's4-light', 's5-light']);
  // With room for both themes (a larger allowance), each state is captured in light and dark.
  const both = await captureManifest(compiled.scene, { reserved: reserveRound({ cap: 12 }) });
  assert.equal(both.entries.length, 12);
  // Nine states (three masses) do not fit a 6-capture round: refused.
  const nine = { ...EXAMPLES['pendulum-experiment'], presentation: { ...EXAMPLES['pendulum-experiment'].presentation, experiments: EXAMPLES['pendulum-experiment'].presentation.experiments.map(e => (e.id === 'mass' ? { ...e, domain: { values: [0.5, 1, 2] } } : e)) } };
  await assert.rejects(captureManifest(compileVisual(nine).scene, { reserved: ROUND }), { code: 'over_budget', message: /9 distinct frames/ });
});

test('identical frames are captured once: duplicates become aliases by frame hash', async () => {
  // A steps scene whose last two steps draw the same (the scene gate would refuse it; the manifest must still not pay twice).
  const { scene } = compileVisual(stepsSpec(3));
  const same = { ...scene, duration: 3, presentation: { ...scene.presentation, steps: [...scene.presentation.steps, { id: 's3', title: 'Step 3', at: 3 }] } };
  const manifest = await captureManifest(same, { reserved: ROUND });
  assert.equal(manifest.coverage.frames, 3);
  const checked = await checkManifest(manifest, same);
  assert.equal(checked.entries.length, 6);
  assert.deepEqual(checked.entries.find(entry => entry.id === 't2-light').aliases, ['t3-light']);
});

test('each capture reaches the reviewer as its own image, labelled with its step and state', async () => {
  const { scene } = compileVisual(stepsSpec(3));
  const manifest = await captureManifest(scene, { reserved: ROUND });
  const page = {
    setRequestInterception: async () => {}, on: () => {}, emulateMediaFeatures: async () => {}, setViewport: async () => {}, goto: async () => {}, waitForFunction: async () => {},
    evaluate: async () => ({ ok: true, fonts: { missing: [] } }), $: async () => ({ screenshot: async () => new Uint8Array([137, 80, 78, 71]) }), close: async () => {},
  };
  const out = await renderStates({ ASSETS: { fetch: async () => new Response('') } }, { scene }, manifest, { browser: { newPage: async () => page } });
  assert.deepEqual(out.captures.map(capture => [capture.id, capture.step]), manifest.entries.map(entry => [entry.id, entry.step]));
  const { content, imageBlocks } = buildReviewContent({ request: 'Explain it.', compiledHash: out.compiledHash, captures: out.captures.map(capture => ({ ...capture, compiledHash: out.compiledHash })) });
  assert.equal(imageBlocks, 6);
  assert.ok(content.some(block => block.type === 'text' && block.text === 'Capture t1-dark (theme dark, step "Step 1", time 1s):'));
});

test('the job render stage captures every step, and refuses a card one review cannot cover', async () => {
  const { renderStage } = await import('../src/explain-job.js');
  const page = {
    setRequestInterception: async () => {}, on: () => {}, emulateMediaFeatures: async () => {}, setViewport: async () => {}, goto: async () => {}, waitForFunction: async () => {},
    evaluate: async () => ({ ok: true, fonts: { missing: [] } }), $: async () => ({ screenshot: async () => new Uint8Array([1]) }), close: async () => {},
  };
  const stage = renderStage({ browser: { newPage: async () => page }, store: async () => {} });
  const env = { ASSETS: { fetch: async () => new Response('') } };
  const out = await stage({ id: 'job1', compiled: compileVisual(stepsSpec(3)) }, { env });
  assert.deepEqual(out.captures.map(capture => capture.id), ['t0-light', 't0-dark', 't1-light', 't1-dark', 't2-light', 't2-dark']);
  await assert.rejects(stage({ id: 'job2', compiled: compileVisual(stepsSpec(7)) }, { env }), { code: 'over_budget', category: 'budget', stopReason: 'unsupported_repair', message: 'This explanation has more steps or settings than one check can cover. Edit the request to use fewer.' });
});
