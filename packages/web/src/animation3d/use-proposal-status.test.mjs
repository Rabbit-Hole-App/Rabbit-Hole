// The Chat status line's polling, mounted in linkedom through the real hook: recovery from a temporary read failure to ready and to
// failed, a final refusal, and the old polling ending on unmount and on another job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
document.oninput = null;
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })), close() {} }; port1.close = () => {}; } };

const dir = mkdtempSync(join(tmpdir(), 'animation-proposal-')), outfile = join(dir, 'hook.cjs');
await esbuild.build({
  stdin: { contents: "export { useAnimationProposal } from './use-proposal-status.js'; export { createElement } from 'react'; export { createRoot } from 'react-dom/client'; export { act } from 'react';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const wait = ms => B.act(() => new Promise(resolve => setTimeout(resolve, ms)));
const transient = () => Object.assign(new Error('Could not reach the server.'), { status: 503 });
const refused = () => Object.assign(new Error('Not available'), { status: 404 });
const proposal = job => ({ command: 'animation', input: { job } });

// reads: each read's answer in order (an Error is thrown); the last repeats.
function mount(reads, job = 'j1') {
  const seen = { status: null, calls: [] };
  const ops = { hasCard: () => true, readAnimationJob: async p => { seen.calls.push(p.input.job); const next = reads[Math.min(seen.calls.length - 1, reads.length - 1)]; if (next instanceof Error) throw next; return next; } };
  const Probe = ({ p }) => { seen.status = B.useAnimationProposal(p, true, ops); return null; };
  const host = document.createElement('div');
  const root = B.createRoot(host);
  const draw = id => B.act(async () => { root.render(B.createElement(Probe, { p: proposal(id) })); });
  return { seen, draw, start: () => draw(job), unmount: () => B.act(async () => { root.unmount(); }) };
}

test('a temporary read failure recovers to ready: unknown while it fails, then the job status', async () => {
  const m = mount([transient(), { stage: 'ready', cardId: 'c1' }]);
  await m.start();
  assert.equal(m.seen.status.phase, 'unknown');
  await wait(2200);
  assert.deepEqual([m.seen.status.phase, m.seen.status.label, m.seen.status.cardId, m.seen.calls.length], ['done', 'Added to the canvas', 'c1', 2]);
  await m.unmount();
});

test('a temporary read failure recovers to failed, and a finished job is read no more', async () => {
  const m = mount([transient(), { stage: 'failed', cardId: 'c1', failure: { message: 'The scene could not be checked.' } }]);
  await m.start();
  await wait(2200);
  assert.deepEqual([m.seen.status.phase, m.seen.status.detail], ['failed', 'The scene could not be checked.']);
  const calls = m.seen.calls.length;
  await wait(2200);
  assert.equal(m.seen.calls.length, calls);
  await m.unmount();
});

test('a read failure after a known status keeps that status while it retries', async () => {
  const m = mount([{ stage: 'reviewing', cardId: 'c1' }, transient(), { stage: 'ready', cardId: 'c1' }]);
  await m.start();
  assert.equal(m.seen.status.phase, 'running');
  await wait(4300);
  assert.equal(m.seen.status.phase, 'running', 'still the last status known');
  await wait(2200);
  assert.equal(m.seen.status.phase, 'done');
  await m.unmount();
});

test('a final refusal stops the polling', async () => {
  const m = mount([refused()]);
  await m.start();
  await wait(2300);
  assert.deepEqual([m.seen.status.phase, m.seen.calls.length], ['unknown', 1]);
  await m.unmount();
});

test('unmounting cancels the pending retry', async () => {
  const m = mount([transient()]);
  await m.start();
  await m.unmount();
  await wait(2300);
  assert.equal(m.seen.calls.length, 1);
});

test('another job cancels the old polling and shows nothing of the old job', async () => {
  const reads = [transient(), { stage: 'authoring', cardId: 'other' }];
  const m = mount(reads, 'j1');
  await m.start();
  await m.draw('j2');
  assert.deepEqual(m.seen.calls, ['j1', 'j2']);
  assert.equal(m.seen.status.cardId, 'other');
  await wait(2300);
  assert.equal(m.seen.calls.filter(id => id === 'j1').length, 1, 'the old job\'s retry was cancelled');
  await m.unmount();
});
