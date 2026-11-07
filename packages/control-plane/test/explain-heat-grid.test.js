import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authorStage, validateProgramStage } from '../src/explain-author.js';
import { programCaptureManifest } from '../src/explain-render.js';
import { parseGuestResult, sealProgram } from '../../web/src/explain-program/contract.js';
import { normalizeFrame } from '../../web/src/explain-program/frame.js';
import { createProgramHost } from '../../web/src/explain-program/host.js';
import { LIMITS } from '../../web/src/explain-program/limits.js';
import { evaluateRequestFor, resolveProgram, setProgramInput } from '../../web/src/explain-program/program-card.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { programSdkSource } from '../../web/src/explain-program/sdk.js';
import { VISUAL_PROGRAM_STAMPS } from '../../web/src/explain-program/stamps.js';
import { spectrogramFixture } from '../../web/src/explain-program/testdata/spectrogram-fixture.mjs';

const engine = loadEngine();
const createWorker = () => {
  const worker = {
    terminate() {},
    postMessage({ id, source, request, operation, sdkVersion }) {
      engine.then(loaded => worker.onmessage?.({
        data: { id, operation, ...runProgram(loaded, { source, request, operation, sdkVersion }, { ...LIMITS, interruptMs: 1000 }) },
      }));
    },
  };
  engine.then(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};

const author = async bundle => {
  const job = { prompt: bundle.manifest.summary };
  const ctx = {
    env: { EXPLAIN_PROGRAM_ENABLED: 'true' },
    call: async (_role, { content }) => {
      const { program } = JSON.parse(content);
      assert.ok(program.capabilities.includes('heat_grid'));
      assert.equal(program.limits.heatCells, 256);
      return { input: { kind: 'program', program: bundle } };
    },
  };
  const authored = await authorStage(job, ctx);
  const checked = await validateProgramStage({ ...job, ...authored }, ctx);
  assert.ok(checked.artifact, JSON.stringify(checked.gap || checked.problems));
  return checked.artifact;
};

const draw = async (artifact, block = {}) => {
  const host = createProgramHost({ artifact, createWorker });
  try {
    const reply = await host.evaluate(evaluateRequestFor(artifact.manifest, block, 0, 'draw'));
    const view = normalizeFrame(reply.frame, artifact.manifest);
    assert.equal(view.ok, true, view.issue);
    return view.state.objects;
  } finally {
    host.dispose();
  }
};

test('a saved spectrogram can switch windows and reload with the same dB scale and axes', async () => {
  const artifact = await author(spectrogramFixture);
  assert.equal(artifact.sdkVersion, 'sdk-3');
  assert.equal(createHash('sha256').update(programSdkSource(artifact.sdkVersion)).digest('hex'), artifact.fingerprints.sdk);
  const identity = { resultId: 'spectrogram-result', revision: 'r1', cardId: 'spectrogram-card', canvas: { boardId: 'board' } };
  const saved = { id: identity.cardId, type: 'animation', program: { bundleHash: artifact.bundleHash }, explain: identity };
  const client = { result: async () => ({ identity, artifact, execution: { allowed: true } }) };
  const load = async block => {
    const resolved = await resolveProgram(block, { client });
    assert.equal(resolved.ok, true, resolved.error?.message);
    return draw(resolved.artifact, block);
  };

  const short = await load(saved);
  const reopened = JSON.parse(JSON.stringify(setProgramInput(saved, artifact.manifest, 'window', 'long')));
  const long = await load(reopened);
  const grid = objects => objects.find(object => object.id === 'spectrogram');
  const probes = object => [8, 6, 4].map(row => object.values[row * 19 + 18]);
  assert.deepEqual(probes(grid(short)), [-1.7, -0.9, -1.7]);
  assert.deepEqual(probes(grid(long)), [-6, -31.5, -6]);
  for (const objects of [short, long]) {
    assert.equal(grid(objects).type, 'grid');
    assert.equal(grid(objects).values.length, 247);
    assert.equal(grid(objects).heat.mode, 'sequential');
    assert.deepEqual(grid(objects).valueDomain, { min: -60, max: 0 });
    assert.deepEqual(objects.find(object => object.id === 'scale').valueDomain, { min: -60, max: 0 });
  }
  const fixedLabels = objects => objects.filter(object => object.type === 'text').map(({ id, x, y, label }) => ({ id, x, y, label }));
  assert.deepEqual(fixedLabels(short), fixedLabels(long));
  const reserved = { captures: 4, pixels: 1120 * 860 * 4 };
  const manifest = await programCaptureManifest(artifact, { reserved, themes: ['light', 'dark'], width: 430, height: 338 });
  assert.deepEqual(new Set(manifest.entries.map(entry => entry.inputs.window)), new Set(['short', 'long']));
});

const smallGrid = { kind: 'heat_grid', id: 'scores', x: 20, y: 20, cell: 36, rows: 2, cols: 2, values: [0.75, 0.25, 0.5, 0.5], domain: [0, 1] };
const bundleWith = (source, capabilities = ['heat_grid']) => ({
  source,
  manifest: { title: 'Attention weights', summary: 'Rows show the distribution across two keys.', description: 'Two rows of attention weights.', assumptions: [], inputs: [], readouts: [], capabilities },
});
const frameWith = objects => ({ frame: { width: 180, height: 140, objects }, quantities: {} });

test('a separate authored attention matrix keeps its original numeric values', async () => {
  const { kind, id, ...options } = smallGrid;
  const artifact = await author(bundleWith(`export function evaluate() {
    return { frame: { width: 180, height: 140, objects: [sdk.heatGrid('scores', ${JSON.stringify(options)})] }, quantities: {} };
  }`));
  const [scores] = await draw(artifact);
  assert.equal(scores.type, 'grid');
  assert.deepEqual(scores.values, [0.75, 0.25, 0.5, 0.5]);
  assert.deepEqual(scores.valueDomain, { min: 0, max: 1 });
});

test('heat grids require the capability and fit the aggregate cell budget', () => {
  const manifest = bundleWith('').manifest;
  const parse = objects => parseGuestResult(frameWith(objects), manifest, 'sdk-3');
  assert.equal(parse([smallGrid]).ok, true);
  assert.equal(parseGuestResult(frameWith([smallGrid]), manifest, 'sdk-2').error.code, 'invalid_output');
  assert.equal(parseGuestResult(frameWith([smallGrid]), bundleWith('', []).manifest, 'sdk-3').error.code, 'invalid_output');
  for (const invalid of [
    { ...smallGrid, cols: 3 }, { ...smallGrid, values: [1, 2, NaN, 4] },
    { ...smallGrid, domain: [1, 1] }, { ...smallGrid, domain: [2, 1] },
    { ...smallGrid, src: '/other.svg' }, { ...smallGrid, x: 170 },
  ]) assert.equal(parse([invalid]).error.code, 'invalid_output');

  const fullGrid = { ...smallGrid, cell: 5, rows: 16, cols: 16, values: Array(256).fill(0) };
  assert.equal(parse([fullGrid]).ok, true);
  assert.equal(parse([fullGrid, { ...smallGrid, id: 'overflow' }]).error.code, 'invalid_output');
});

test('an older saved artifact still draws under SDK v2 and cannot declare the heat-grid capability', async () => {
  const source = 'export function evaluate() { return { frame: { objects: [sdk.box("b", 20, 20, 40, 40)] }, quantities: {} }; }';
  const legacy = await sealProgram(bundleWith(source, []), VISUAL_PROGRAM_STAMPS);
  assert.equal(legacy.ok, true, legacy.issue);
  assert.equal((await draw(legacy.value))[0].type, 'box');
  const mismatch = await sealProgram(bundleWith(source), VISUAL_PROGRAM_STAMPS);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'unsupported_capability');
});
