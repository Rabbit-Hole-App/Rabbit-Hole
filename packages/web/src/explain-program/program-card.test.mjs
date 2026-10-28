import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_MESSAGES, parseManifest, sealProgram } from './contract.js';
import {
  clampTime, describeProgram, evaluateRequestFor, fixturesAdmitted, isProgramBlock, programChanged, programErrorMessage, programInputs, programTime,
  resetProgram, resolveProgram, setProgramInput,
} from './program-card.js';
import { growthFixture } from './fixtures.js';
import { BOARDS, BOARD_SEED_VERSIONS, PROGRAM_FIXTURE_BOARD } from '../demo-scenes.js';
import { applyExplainEdit, explainEditProblem, explainResultBlock } from '../explain-client.js';

// Fixtures are hand-authored test data, not generation evidence.
const stamps = { runtimeVersion: 'engine-1', fingerprints: { engine: 'e1', sdk: 's1', renderer: 'r1' } };
const manifest = parseManifest(growthFixture.manifest).value;
const card = (extra = {}) => ({ id: 'card1', type: 'animation', title: 'Balance', program: { fixtureId: 'fixture-growth' }, ...extra });

test('only an animation block with a program reference is a program card; scene cards are not', () => {
  assert.equal(isProgramBlock(card()), true);
  assert.equal(isProgramBlock({ id: 'a', type: 'animation', scene: { id: 's' } }), false);
  assert.equal(isProgramBlock({ id: 'a', type: 'animation', explainJob: { id: 'j' }, scene: null }), false, 'a pending card');
  assert.equal(isProgramBlock({ id: 'a', type: 'note', program: {} }), false);
});

test('a fixture card is admitted only where the build flag is set, and never runs unsealed', async () => {
  assert.equal(fixturesAdmitted({ VITE_EXPLAIN_PROGRAM_FIXTURES: 'true' }), true);
  assert.equal(fixturesAdmitted({ VITE_COACHING_DEV: 'true' }), true, 'the dev and review build');
  assert.equal(fixturesAdmitted({ VITE_RABBIT_HOLE: 'true' }), false, 'the production build flag admits nothing');
  assert.equal(fixturesAdmitted({ VITE_EXPLAIN_PROGRAM_FIXTURES: 'false', VITE_COACHING_DEV: 'false', MODE: 'production' }), false);
  assert.equal(fixturesAdmitted({}), false);
  assert.equal(fixturesAdmitted(undefined), false);
  const refused = await resolveProgram(card(), { fixtures: false, stamps });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.message, ERROR_MESSAGES.invalid_program);
  const admitted = await resolveProgram(card(), { fixtures: true, stamps });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.artifact.manifest.title, 'Balance over time');
  assert.equal((await resolveProgram(card({ program: { fixtureId: 'nope' } }), { fixtures: true, stamps })).ok, false);
});

// An accepted program: resolved only through the job route, bound to this card's identity and the saved bundle hash.
async function accepted(overrides = {}) {
  const sealed = (await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, stamps)).value;
  const identity = { jobId: 'job1', resultId: 'er_1', revision: 'xr_1', cardId: 'card1', canvas: { boardId: 'board1' } };
  const job = { id: 'job1', stage: 'ready', cardId: 'card1', boardId: 'board1', result: { ...identity, program: sealed, execution: { allowed: true } } };
  const block = { id: 'card1', type: 'animation', title: 'Balance', explain: identity, program: { bundleHash: sealed.bundleHash } };
  const calls = [];
  const client = { get: async id => { calls.push(id); return { job: { ...job, ...overrides.job, result: { ...job.result, ...overrides.result } } }; } };
  return { client, block: { ...block, ...overrides.block }, sealed, calls };
}

test('an accepted program resolves through the authorized job route, never from the block', async () => {
  const { client, block, sealed, calls } = await accepted();
  const out = await resolveProgram(block, { client });
  assert.equal(out.ok, true);
  assert.equal(out.artifact.bundleHash, sealed.bundleHash);
  assert.deepEqual(calls, ['job1']);
  // Source pasted into canvas JSON is not read: with no route, nothing runs.
  const pasted = await resolveProgram({ ...block, program: { bundleHash: sealed.bundleHash, source: 'export function evaluate(){return {}}', manifest: {} } }, { client: null });
  assert.equal(pasted.ok, false);
  assert.equal(pasted.error.code, 'version_unavailable');
});

test('an accepted program is refused when anything about its identity, hash or server policy is off', async () => {
  const cases = {
    'another card': { result: { cardId: 'card2' } },
    'another board': { result: { canvas: { boardId: 'board2' } } },
    'another result': { result: { resultId: 'er_2' } },
    'another revision': { result: { revision: 'xr_2' } },
    'not ready': { job: { stage: 'rendering' } },
    'server says no': { result: { execution: { allowed: false } } },
    'no execution policy': { result: { execution: undefined } },
    'a client approval flag is not a policy': { result: { execution: { allowed: 'true' } } },
    'saved hash differs': { block: { program: { bundleHash: 'f'.repeat(64) } } },
  };
  for (const [name, overrides] of Object.entries(cases)) {
    const { client, block } = await accepted(overrides);
    const out = await resolveProgram(block, { client });
    assert.equal(out.ok, false, name);
    assert.ok(['version_unavailable', 'unsupported_capability'].includes(out.error.code), name);
  }
  const tampered = await accepted();
  const bad = { ...tampered.client, get: async () => { const { job } = await tampered.client.get(); return { job: { ...job, result: { ...job.result, program: { ...job.result.program, source: `${job.result.program.source} ` } } } }; } };
  assert.equal((await resolveProgram(tampered.block, { client: bad })).ok, false, 'source changed after hashing');
  const down = await resolveProgram(tampered.block, { client: { get: async () => { throw Object.assign(new Error('x'), { status: 500 }); } } });
  assert.equal(down.error.code, 'version_unavailable');
});

test('inputs: saved values apply, a change bumps the revision once, an unchanged value writes nothing, reset restores defaults and time zero', () => {
  const block = card();
  assert.deepEqual(programInputs(manifest, block), { rate: 5, years: 10, mode: 'compound' });
  const next = setProgramInput(block, manifest, 'rate', 12);
  assert.equal(next.inputs.rate, 12);
  assert.equal(next.inputRevision, 1);
  assert.equal(setProgramInput(next, manifest, 'rate', 12), next, 'same value: same block');
  assert.equal(setProgramInput(block, manifest, 'nope', 1), block, 'an undeclared input is ignored');
  assert.equal(setProgramInput(block, manifest, 'rate', 999).inputs.rate, 20, 'clamped into its domain');
  assert.equal(setProgramInput(block, manifest, 'mode', 'barter'), block, 'a value that is not an option changes nothing');
  assert.equal(programChanged(manifest, block), false);
  assert.equal(programChanged(manifest, next), true);
  const reset = resetProgram({ ...next, time: 3 });
  assert.deepEqual([reset.inputs, reset.time, reset.inputRevision], [{}, 0, 2]);
  assert.equal(reset.program, next.program, 'reset keeps the accepted program');
});

test('time starts at zero, is clamped to the duration, and a request carries only declared inputs and a fixed seed', () => {
  assert.equal(programTime(manifest, card()), 0);
  assert.equal(programTime(manifest, card({ time: 99 })), 4);
  assert.equal(clampTime(manifest, Number.NaN), 0);
  assert.equal(clampTime({ ...manifest, duration: undefined }, 5), 0, 'a static program has no time');
  const request = evaluateRequestFor(manifest, card({ inputs: { rate: 7, stray: 1 } }), 2.5, 9);
  assert.deepEqual(request, { requestId: '9', inputs: { rate: 7, years: 10, mode: 'compound' }, time: 2.5, seed: 0, state: null });
});

test('a failure shows only the fixed message of the normalised code', () => {
  assert.equal(programErrorMessage({ code: 'runtime_limit' }), 'This explanation stopped because it exceeded its runtime limit.');
  assert.equal(programErrorMessage({ code: 'unsupported_capability' }), 'This explanation needs a capability that is not available yet.');
  assert.equal(programErrorMessage(new Error('secret source line 3')), 'This explanation could not run. Your saved version is kept.');
  assert.equal(programErrorMessage(undefined), ERROR_MESSAGES.runtime_error);
});

test('the composer context names what the learner sees and sets, never source', () => {
  const out = describeProgram(card({ inputs: { rate: 8 }, time: 2 }), manifest);
  assert.match(out.text, /Yearly rate: 8 %/);
  assert.match(out.text, /Paused at 2.0s of 4s/);
  assert.equal(out.text.includes('evaluate'), false);
  assert.equal(describeProgram(card()).text.includes('Balance'), true, 'before the artifact resolves, the title alone');
});

// ---- explain-client: the result attaches by reference, source stays out of the saved block ---------------------------------

test('a program result attaches to its pending card by reference: no artifact or source in the saved block', async () => {
  const { block, sealed } = await accepted();
  const pending = { id: 'card1', type: 'animation', title: 'T', scene: null, explainJob: { id: 'job1', boardId: 'board1', stage: 'queued' } };
  const job = { id: 'job1', stage: 'ready', cardId: 'card1', boardId: 'board1', result: { ...block.explain, program: sealed, execution: { allowed: true } } };
  const attached = explainResultBlock(pending, job, { id: 'card1', type: 'animation', title: 'Balance', program: sealed });
  assert.deepEqual(attached.program, { bundleHash: sealed.bundleHash });
  assert.equal(attached.explainJob, undefined);
  assert.equal(attached.time, 0, 'a time card starts at zero');
  assert.equal(JSON.stringify(attached).includes('evaluate'), false, 'no source anywhere in the saved card');
  assert.equal('program' in attached.explain, false);
  assert.equal(attached.explain.resultId, 'er_1');
  assert.equal(explainEditProblem(attached), null, 'a program card can be edited');
  assert.equal(explainResultBlock(pending, { ...job, cardId: 'other' }, { id: 'card1', program: sealed }), null, 'another card');
  assert.equal(explainResultBlock(pending, job, { id: 'card1', type: 'animation' }), null, 'neither a scene nor a program');
});

test('legacy results are unchanged by the program path', () => {
  const pending = { id: 'c', type: 'animation', title: 'T', scene: null, explainJob: { id: 'j', boardId: 'b', stage: 'queued' } };
  const result = { jobId: 'j', resultId: 'er_9', revision: 'xr_9', cardId: 'c', canvas: { boardId: 'b' } };
  const scene = { id: 's', duration: 7, objects: [], timeline: [] };
  const out = explainResultBlock(pending, { id: 'j', stage: 'ready', cardId: 'c', boardId: 'b', result }, { id: 'c', type: 'animation', title: 'T', scene });
  assert.equal(out.explain, result, 'the identical result object, as before');
  assert.equal(out.time, 7);
  assert.equal('program' in out, false);
  const editing = { ...out, explainEdit: { id: 'e', boardId: 'b', stage: 'ready' } };
  const applied = applyExplainEdit(editing, { id: 'e', stage: 'ready', cardId: 'c', boardId: 'b', result: { ...result, baseRevision: 'xr_9' } }, { id: 'c', scene: { ...scene, duration: 3 } });
  assert.equal(applied.ok, true);
  assert.equal(applied.block.time, 3);
});

test('the preview board holds only fixture references, and a build without the flag runs none of them', async () => {
  assert.equal(BOARD_SEED_VERSIONS[PROGRAM_FIXTURE_BOARD], 1);
  const blocks = BOARDS[PROGRAM_FIXTURE_BOARD]();
  assert.deepEqual(blocks.map(item => item.program.fixtureId), ['fixture-growth', 'fixture-search', 'fixture-loop', 'fixture-capability']);
  for (const item of blocks) {
    assert.deepEqual(Object.keys(item.program), ['fixtureId'], 'a reference only: no source on the board');
    assert.equal(isProgramBlock(item), true);
    const refused = await resolveProgram(item, { fixtures: false, stamps });
    assert.equal(refused.ok, false, `${item.program.fixtureId} must not run without the build flag`);
    assert.equal(refused.error.message, ERROR_MESSAGES.invalid_program);
  }
});

test('the error fixtures end in the fixed messages: the loop is sealed and then stopped by the host, the capability one is refused before it runs', async () => {
  const [, , loop, capability] = BOARDS[PROGRAM_FIXTURE_BOARD]();
  const sealed = await resolveProgram(loop, { fixtures: true, stamps });
  assert.equal(sealed.ok, true, 'the loop is a valid artifact; the interpreter stops it at run time');
  const blocked = await resolveProgram(capability, { fixtures: true, stamps });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'unsupported_capability');
  assert.equal(blocked.error.message, 'This explanation needs a capability that is not available yet.');
});
