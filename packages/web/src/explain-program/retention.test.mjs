// Task 10.3: version retention and the unavailable states, through the same two steps a card takes (ProgramScene.jsx): resolve
// the saved reference (program-card.js resolveProgram), then run it in a host (host.js). The saved artifact is the genuine
// sandbox-ex1-b cooling result (testdata), never rewritten. The guest runs in the real packaged QuickJS engine behind a
// Worker-shaped stand-in; the stand-in's failure replies are the ones worker.js sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProgram, evaluateRequestFor, programErrorMessage } from './program-card.js';
import { createProgramHost, programStamps } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { LIMITS } from './limits.js';
import { ERROR_MESSAGES, sealProgram } from './contract.js';

const RECORDED = JSON.parse(readFileSync(new URL('./testdata/sandbox-ex1-b-job.json', import.meta.url), 'utf8'));
const { program: SAVED, ...IDENTITY } = RECORDED.job.result;
const SAVED_TEXT = JSON.stringify(SAVED);
const engine = loadEngine();
const GUEST_LIMITS = { ...LIMITS, interruptMs: 150 }; // test-only, as host.test.mjs: a loaded machine must not turn a valid run into an overrun

let started = 0;
// mode: 'real' runs the program; 'no-wasm' answers { ready: false } as worker.js does when loadEngine rejects (the WASM did not
// load); 'no-script' fails to start, as a Worker whose script is missing does.
class StandIn {
  constructor(mode) {
    Object.assign(this, { mode, terminated: false, onmessage: null, onerror: null });
    started++;
    if (mode === 'no-script') setTimeout(() => this.onerror?.(new Event('error')), 0);
    else engine.then(() => this.emit({ ready: mode === 'real', bootMs: 1 }));
  }
  emit(data) { setTimeout(() => !this.terminated && this.onmessage?.({ data }), 0); }
  postMessage({ id, source, request }) { engine.then(e => this.emit({ id, ...runProgram(e, { source, request }, GUEST_LIMITS) })); }
  terminate() { this.terminated = true; }
}

// The saved card and the result route's answer for it; overrides replace parts of the answer.
const card = (artifact = SAVED) => ({ id: IDENTITY.cardId, type: 'animation', program: { bundleHash: artifact.bundleHash }, explain: { resultId: IDENTITY.resultId, revision: IDENTITY.revision, canvas: IDENTITY.canvas } });
const client = ({ artifact = SAVED, execution = { allowed: true } } = {}) => ({ result: async () => structuredClone({ artifact, identity: IDENTITY, execution }) });

// What the learner gets when the card opens: the first frame, or the stage that refused it, its code and its fixed message.
async function openCard({ block = card(), answer = client(), worker = 'real' } = {}) {
  const resolved = await resolveProgram(block, { client: answer });
  if (!resolved.ok) return { stage: 'resolve', code: resolved.error.code, message: programErrorMessage(resolved.error) };
  const host = createProgramHost({ artifact: resolved.artifact, createWorker: () => new StandIn(worker) });
  try {
    const reply = await host.evaluate(evaluateRequestFor(resolved.artifact.manifest, block, 5, 1));
    return { stage: 'drawn', reply, host };
  } catch (error) {
    host.dispose();
    return { stage: 'host', code: error.code, message: programErrorMessage(error) };
  }
}

test('the saved v1 cooling artifact resolves and runs unchanged under the build\'s supported versions', async () => {
  assert.equal(SAVED.schemaVersion, 1);
  const out = await openCard();
  assert.equal(out.stage, 'drawn', out.message);
  assert.ok(out.reply.frame.objects.length > 0, 'a frame with objects');
  assert.equal(JSON.stringify(SAVED), SAVED_TEXT, 'the saved artifact is never rewritten to fit');
  out.host.dispose();
});

test('an artifact sealed for an engine, SDK or renderer this build does not carry is version_unavailable, and no Worker starts', async () => {
  const stamps = await programStamps();
  for (const other of [{ ...stamps, runtimeVersion: 'quickjs-release-sync@0.33.0' }, { ...stamps, fingerprints: { ...stamps.fingerprints, sdk: 'e'.repeat(64) } }, { ...stamps, rendererVersion: 'renderer-9' }]) {
    const sealed = await sealProgram({ manifest: SAVED.manifest, source: SAVED.source }, other);
    assert.equal(sealed.ok, true, sealed.issue);
    const before = started;
    const out = await openCard({ block: card(sealed.value), answer: client({ artifact: sealed.value }) });
    assert.deepEqual([out.stage, out.code, out.message], ['host', 'version_unavailable', ERROR_MESSAGES.version_unavailable], JSON.stringify(other));
    assert.equal(started, before, 'refused before any Worker starts');
  }
});

test('an artifact of a schema this build does not know is refused at load, never run under the schema it does know', async () => {
  // What a rollback build sees for an artifact created by a newer one: the strict artifact schema refuses the unknown version.
  const before = started;
  const out = await openCard({ answer: client({ artifact: { ...SAVED, schemaVersion: 99 } }) });
  assert.deepEqual([out.stage, out.code, out.message], ['resolve', 'invalid_program', ERROR_MESSAGES.invalid_program]);
  assert.equal(started, before);
});

test('corrupted source, a corrupted stored hash, or a card naming another bundle is refused at load with the fixed unavailable message', async () => {
  const cases = {
    source: { ...SAVED, source: SAVED.source.replace('90', '95') },
    storedHash: { ...SAVED, sourceHash: '0'.repeat(64) },
  };
  for (const [name, artifact] of Object.entries(cases)) {
    const out = await openCard({ answer: client({ artifact }) });
    assert.deepEqual([out.stage, out.code, out.message], ['resolve', 'version_unavailable', ERROR_MESSAGES.version_unavailable], name);
  }
  const other = await openCard({ block: { ...card(), program: { bundleHash: 'f'.repeat(64) } } });
  assert.deepEqual([other.stage, other.code], ['resolve', 'version_unavailable']);
});

test('a missing WASM or Worker script is version_unavailable with the fixed message, not a crash or an endless wait', async () => {
  for (const worker of ['no-wasm', 'no-script']) {
    const out = await openCard({ worker });
    assert.deepEqual([out.stage, out.code, out.message], ['host', 'version_unavailable', ERROR_MESSAGES.version_unavailable], worker);
  }
});

test('execution kill is read when the result loads: a card opened afterwards refuses to run; a card already open keeps running', async () => {
  const open = await openCard(); // opened while execution is allowed
  assert.equal(open.stage, 'drawn');
  // The kill switch flips: the result route now answers execution { allowed: false } (EXPLAIN_PROGRAM_EXECUTION_KILL=true).
  const killed = await openCard({ answer: client({ execution: { allowed: false } }) });
  assert.deepEqual([killed.stage, killed.code, killed.message], ['resolve', 'unsupported_capability', ERROR_MESSAGES.unsupported_capability]);
  // Current behavior, documented in docs/features/explain-program-support.md: the host never re-reads the policy, so the card
  // that was already open keeps evaluating until it is closed or reloaded.
  const again = await open.host.evaluate(evaluateRequestFor(SAVED.manifest, card(), 10, 2));
  assert.ok(again.frame.objects.length > 0);
  open.host.dispose();
});
