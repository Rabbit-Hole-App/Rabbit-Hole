// Owner review of 0ee34e70c (fix 1): Restart and reload restore the committed state with the input snapshot it was committed with.
// A change that never committed (its transition failed, or the page went away first) is not rebuilt or retried, and an intermediate
// state is never validated against later inputs. The hook runs over the one-component React stand-in (fake-react-hooks.mjs) with
// the real host on the packaged engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { FAKE_REACT } from '../fake-react-hooks.mjs';
import { sealProgram } from './contract.js';
import { LIMITS } from './limits.js';
import { STATEFUL_PROGRAM_STAMPS } from './stamps.js';
import { createProgramHost } from './host.js';
import { loadEngine, runProgram } from './runtime.js';

const dir = mkdtempSync(join(tmpdir(), 'program-state-')), outfile = join(dir, 'hook.cjs');
await esbuild.build({
  stdin: { contents: "export * from './use-program-state.js'; export { mount } from 'react';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'fake-react', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fake-react' }));
    build.onLoad({ filter: /.*/, namespace: 'fake-react' }, () => ({ contents: FAKE_REACT, loader: 'js' }));
  } }],
});
const H = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const engine = loadEngine();
const standIn = () => {
  const worker = {
    terminate() { worker.dead = true; },
    postMessage({ id, operation, source, request }) { engine.then(e => { const out = runProgram(e, { source, request, operation }, { ...LIMITS, interruptMs: 150 }); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); }); },
  };
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};

// A value over 18 is refused by the reducer, as a program may refuse a transition; its frame draws the inputs it is given.
const MANIFEST = {
  title: 'Two settings', summary: 'Two numbers.', assumptions: [], description: 'Two numbers.', readouts: [], capabilities: [],
  inputs: [{ type: 'number', id: 'a', label: 'A', default: 1, min: 0, max: 20 }, { type: 'number', id: 'b', label: 'B', default: 1, min: 0, max: 20 }],
  viewport: { width: 400, height: 300 }, actions: [{ id: 'add', label: 'Add' }], targets: [],
};
const SOURCE = `export function initialState() { return { n: 0 }; }
export function reduce({ state, event }) { if (event.type === 'input' && event.value > 18) throw new Error('over 18'); return { n: state.n + 1 }; }
export function evaluate({ state, inputs }) { return { frame: { width: 400, height: 300, objects: [sdk.text('t', 10, 20, state.n + ' ' + inputs.a + ' ' + inputs.b)] }, quantities: {} }; }`;

test('a saved state is restored with its committed inputs; changes that never committed are neither rebuilt nor retried', async () => {
  const artifact = (await sealProgram({ manifest: MANIFEST, source: SOURCE }, STATEFUL_PROGRAM_STAMPS)).value;
  const host = createProgramHost({ artifact, createWorker: standIn });
  const calls = [];
  const counted = { initialize: raw => (calls.push('initialize'), host.initialize(raw)), reduce: raw => (calls.push('reduce'), host.reduce(raw)), evaluate: (raw, options) => (calls.push('evaluate'), host.evaluate(raw, options)) };
  const committed = { bundleHash: artifact.bundleHash, state: { n: 3 }, revision: 3, seed: 0, inputs: { a: 2, b: 2 } };
  // The board as an earlier build left it: two input changes saved before their transitions, one of which the program refuses.
  const block = { id: 'card', type: 'animation', program: { bundleHash: artifact.bundleHash }, inputs: { a: 20, b: 5 }, programState: committed };
  const failures = [], saves = [];
  const card = H.mount(props => H.useProgramState(props), { host: counted, hostKey: 1, artifact, block, time: 0, persist: next => saves.push(next), fail: error => failures.push(error) });
  for (let i = 0; i < 20; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(failures, [], 'no failed transition is retried on Restart or reload');
  assert.deepEqual(calls.filter(call => call !== 'evaluate'), [], 'nothing is initialized or reduced: the committed state is restored as it is');
  assert.deepEqual([card.current.envelope.revision, card.current.envelope.state, card.current.envelope.inputs], [3, { n: 3 }, { a: 2, b: 2 }], 'the committed state with its own inputs');
  assert.deepEqual(saves, [], 'restoring saves nothing');
  card.unmount();
  host.dispose();
});
