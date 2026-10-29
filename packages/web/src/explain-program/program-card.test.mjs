import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_MESSAGES, parseManifest, sealProgram } from './contract.js';
import {
  clampTime, describeProgram, evaluateRequestFor, fixturesAdmitted, isProgramBlock, programChanged, programErrorMessage, programInputs, programTime,
  keptProgram, resetProgram, resolveProgram, setProgramInput, shownProgram,
} from './program-card.js';
import { growthFixture, searchFixture } from './fixtures.js';
import { BOARDS, BOARD_SEED_VERSIONS, PROGRAM_FIXTURE_BOARD } from '../demo-scenes.js';
import { applyExplainEdit, explainEditProblem, explainProposedBlock, explainResultBlock, sharedProgramClient } from '../explain-client.js';

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

// An accepted program: resolved only through its saved result (the owner's result route answers { artifact, identity, execution }),
// bound to this card's identity and the saved bundle hash. The job record is never read: it is pruned while the result is kept.
async function accepted(overrides = {}) {
  const sealed = (await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, stamps)).value;
  const identity = { jobId: 'job1', resultId: 'er_1', revision: 'xr_1', cardId: 'card1', canvas: { boardId: 'board1' } };
  const block = { id: 'card1', type: 'animation', title: 'Balance', explain: identity, program: { bundleHash: sealed.bundleHash } };
  const calls = [];
  const client = {
    get: async id => { calls.push(['job', id]); throw Object.assign(new Error('pruned'), { status: 404 }); }, // the job record is gone
    result: async (resultId, cardId) => { calls.push(['result', resultId, cardId]); return { artifact: sealed, identity: { ...identity, ...overrides.result }, execution: { allowed: true }, ...overrides.answer }; },
  };
  return { client, block: { ...block, ...overrides.block }, sealed, calls };
}

test('an accepted program resolves through its saved result, never the job record and never from the block', async () => {
  const { client, block, sealed, calls } = await accepted();
  const out = await resolveProgram(block, { client });
  assert.equal(out.ok, true);
  assert.equal(out.artifact.bundleHash, sealed.bundleHash);
  assert.deepEqual(calls, [['result', 'er_1', 'card1']], 'opens with its job record pruned');
  // A share link's answer names no canvas (the server bound it to the link's board) and no job: it still resolves and verifies.
  const link = { result: async () => ({ artifact: sealed, identity: { resultId: 'er_1', cardId: 'card1', revision: 'xr_1', kind: 'program', bundleHash: sealed.bundleHash }, execution: { allowed: true } }) };
  assert.equal((await resolveProgram(block, { client: link })).ok, true);
  // A card with no saved result yet (still pending) is not resolved here: ExplainPending polls its job.
  const pending = { ...block, explain: undefined };
  calls.length = 0;
  assert.equal((await resolveProgram(pending, { client })).error.code, 'version_unavailable');
  assert.deepEqual(calls, [], 'no result read without a saved result id');
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
    'no identity': { answer: { identity: null } },
    'server says no': { answer: { execution: { allowed: false } } },
    'no execution policy': { answer: { execution: undefined } },
    'a client approval flag is not a policy': { answer: { execution: { allowed: 'true' } } },
    'saved hash differs': { block: { program: { bundleHash: 'f'.repeat(64) } } },
  };
  for (const [name, overrides] of Object.entries(cases)) {
    const { client, block } = await accepted(overrides);
    const out = await resolveProgram(block, { client });
    assert.equal(out.ok, false, name);
    assert.ok(['version_unavailable', 'unsupported_capability'].includes(out.error.code), name);
  }
  const tampered = await accepted();
  const bad = { result: async (...args) => { const answer = await tampered.client.result(...args); return { ...answer, artifact: { ...answer.artifact, source: `${answer.artifact.source} ` } }; } };
  assert.equal((await resolveProgram(tampered.block, { client: bad })).ok, false, 'source changed after hashing');
  const down = await resolveProgram(tampered.block, { client: { result: async () => { throw Object.assign(new Error('x'), { status: 500 }); } } });
  assert.equal(down.error.code, 'version_unavailable');
  const refused = await resolveProgram(tampered.block, { client: { result: async () => { throw Object.assign(new Error('Not available'), { status: 404 }); } } });
  assert.equal(refused.error.code, 'version_unavailable', 'a revoked link or a refused read');
});

test('a share link reads a program card by the link and the card id, and the visitor\'s changes stay in memory, never saved', async () => {
  const { block, sealed } = await accepted();
  const requested = [];
  const answer = { artifact: sealed, identity: { resultId: 'er_1', cardId: 'card1', revision: 'xr_1', kind: 'program', bundleHash: sealed.bundleHash }, execution: { allowed: true } };
  const link = sharedProgramClient('tok/en', async (url, init) => { requested.push([url, init]); return Response.json(answer); });
  const out = await resolveProgram(block, { client: link });
  assert.equal(out.ok, true);
  assert.deepEqual(requested, [['/api/learn/boards/shared/tok%2Fen/cards/card1/program', undefined]], 'one GET by the link, no job route, no POST');
  const gone = sharedProgramClient('tok', async () => Response.json({ error: 'Not available' }, { status: 404 }));
  assert.equal((await resolveProgram(block, { client: gone })).error.code, 'version_unavailable', 'a revoked link refuses the program too');
  // Inputs, time and Reset change only the in-memory card; a reload (nothing kept) shows the saved card; a different saved card drops it.
  const changed = { ...setProgramInput(block, manifest, 'rate', 9), time: 3 };
  const kept = keptProgram(block, changed);
  assert.equal(shownProgram(block, kept), changed);
  assert.equal(programInputs(manifest, shownProgram(block, kept)).rate, 9);
  assert.equal(block.inputs, undefined, 'the saved card is untouched');
  assert.equal(shownProgram(block, null), block, 'a reload starts from the saved defaults');
  assert.equal(shownProgram({ ...block, explain: { ...block.explain, resultId: 'er_2' } }, kept).explain.resultId, 'er_2', 'a newer saved card is shown as saved');
  assert.equal(shownProgram(block, keptProgram(block, resetProgram(changed))).time, 0);
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

// ---- Task 9.1: the Proposed preview of a program Edit -----------------------------------------------------------------------

test('Proposed resolves the program candidate\'s own artifact through the owner\'s result route; another card\'s candidate is refused', async () => {
  const accepted = (await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, stamps)).value;
  const proposedArtifact = (await sealProgram({ manifest: searchFixture.manifest, source: searchFixture.source }, stamps)).value;
  const base = { jobId: 'job1', resultId: 'er_1', revision: 'xr_1', cardId: 'card1', canvas: { boardId: 'board1' } };
  // What the owner's result route holds on this canvas: the accepted result, this card's edit candidate, and another card's candidate.
  const results = {
    er_1: { artifact: accepted, identity: base },
    er_2: { artifact: proposedArtifact, identity: { ...base, jobId: 'job2', resultId: 'er_2', revision: 'xr_2', baseRevision: 'xr_1' } },
    er_9: { artifact: proposedArtifact, identity: { ...base, jobId: 'job9', resultId: 'er_9', revision: 'xr_9', cardId: 'card2' } },
  };
  const calls = [];
  const client = { result: async (resultId, cardId) => { calls.push([resultId, cardId]); return { ...results[resultId], execution: { allowed: true } }; } };
  const card = { id: 'card1', type: 'animation', title: 'Balance', program: { bundleHash: accepted.bundleHash }, explain: base, inputs: { rate: 7 }, time: 2,
    explainEdit: { id: 'job2', boardId: 'board1', stage: 'ready', instruction: 'Show a sorted row instead' } };
  // The ready edit answer (explain-job.js block): program, no scene.
  const candidate = { type: 'animation', id: 'card1', title: searchFixture.manifest.title, program: { kind: 'explain_program', resultId: 'er_2', bundleHash: proposedArtifact.bundleHash }, explain: results.er_2.identity };
  const proposed = explainProposedBlock(card, candidate);
  const shown = await resolveProgram(proposed, { client });
  assert.equal(shown.ok, true);
  assert.equal(shown.artifact.bundleHash, proposedArtifact.bundleHash, 'the candidate, not the accepted program');
  assert.notEqual(shown.artifact.bundleHash, accepted.bundleHash);
  assert.deepEqual(calls, [['er_2', 'card1']], 'read by its own result id, under this card');
  assert.equal((await resolveProgram(card, { client })).artifact.bundleHash, accepted.bundleHash, 'Current still resolves the accepted program');
  // Changing the result id to another card's candidate (or to a result whose bundle is not the reference) is refused.
  const forged = { ...proposed, explain: { ...proposed.explain, resultId: 'er_9', revision: 'xr_9' } };
  assert.equal((await resolveProgram(forged, { client })).error.code, 'version_unavailable', 'another card\'s candidate');
  const swapped = { ...proposed, explain: { ...proposed.explain, resultId: 'er_1', revision: 'xr_1' } };
  assert.equal((await resolveProgram(swapped, { client })).error.code, 'version_unavailable', 'the accepted result under the candidate\'s bundle');
  // A share link reads only the card's saved result: the candidate's identity does not match it, so the link never shows a candidate.
  const link = { result: async () => ({ artifact: accepted, identity: { resultId: 'er_1', cardId: 'card1', revision: 'xr_1', kind: 'program', bundleHash: accepted.bundleHash }, execution: { allowed: true } }) };
  assert.equal((await resolveProgram(proposed, { client: link })).ok, false);
  // The preview's own changes stay in its memory (ProgramScene preview): the accepted card's inputs and time are untouched.
  const played = keptProgram(proposed, { ...setProgramInput(proposed, parseManifest(searchFixture.manifest).value, 'target', 9), time: 3 });
  assert.equal(shownProgram(proposed, played).time, 3);
  assert.deepEqual([card.inputs, card.time], [{ rate: 7 }, 2]);
  assert.equal(shownProgram(card, played), card, 'kept preview state never shows on the accepted card');
});

// Task 9.3: the Tutor's and composer's context for a program card comes from what this page already loaded for that exact card:
// no fetch, no source, readouts only from a frame drawn at the card's current settings, and an honest partial description otherwise.
test('describeProgram uses the loaded manifest and drawn readouts of this exact card, and says what it does not know', async () => {
  const { rememberProgram, loadedProgram, PROGRAM_DESCRIPTION } = await import('./program-card.js');
  const saved = card({ id: 'card-93', program: { bundleHash: 'bh1' }, explain: { resultId: 'er1', revision: 'xr1' }, inputs: { rate: 8, mode: 'simple' }, time: 2 });
  const before = describeProgram(saved).text;
  assert.match(before, /not loaded on this page yet; do not state their values/);
  assert.doesNotMatch(before, /Yearly rate/);
  rememberProgram(saved, manifest);
  const loadedText = describeProgram(saved).text;
  assert.match(loadedText, /Yearly rate: 8 %/);
  assert.match(loadedText, /Interest: Simple/, 'a select reads as the option label the learner sees');
  assert.match(loadedText, /Paused at 2.0s of 4s/);
  assert.match(loadedText, /Its readouts \(Balance\) are not drawn for these settings yet; do not state their values/);
  rememberProgram(saved, manifest, { inputs: programInputs(manifest, saved), time: 2, readouts: [{ id: 'balance', label: 'Balance', text: '1469' }] });
  assert.match(describeProgram(saved).text, /Shown now: Balance 1469/);
  assert.doesNotMatch(describeProgram({ ...saved, inputs: { rate: 9, mode: 'simple' } }).text, /Shown now/, 'a frame drawn at other settings is never reported');
  assert.match(describeProgram({ ...saved, time: 3 }).text, /Paused at 2.0s of 4s[^]*Shown now: Balance 1469/, 'the drawn moment, not a saved time it was not drawn at');
  // Another revision of the card (an applied Edit: new result and bundle) is a different identity: nothing carried over.
  assert.equal(loadedProgram({ ...saved, program: { bundleHash: 'bh2' }, explain: { resultId: 'er2', revision: 'xr2' } }), null);
  assert.match(describeProgram({ ...saved, program: { bundleHash: 'bh2' }, explain: { resultId: 'er2', revision: 'xr2' } }).text, /not loaded on this page yet/);
  assert.equal(describeProgram(saved).text.includes(growthFixture.source.slice(0, 40)), false, 'never source');
  assert.ok(describeProgram(saved).text.length <= PROGRAM_DESCRIPTION);
});

// REGRESSION (review of e8f1bd0b): during Play the card advances its own clock without saving block.time, so the description said
// "Paused at 0.0s" and dropped the readouts drawn at 5 s. It now reports the drawn frame's moment and whether it is playing; a
// frame drawn at other settings is still never reported.
test('describeProgram reports the displayed moment and playback, not the saved time, keeping stale-input protection', async () => {
  const { programPlayback, rememberProgram } = await import('./program-card.js');
  const saved = card({ id: 'card-play', program: { bundleHash: 'bh-play' }, explain: { resultId: 'er-play', revision: 'xr-play' }, inputs: { rate: 8 }, time: 0 });
  rememberProgram(saved, manifest, { inputs: programInputs(manifest, saved), time: 3.5, readouts: [{ id: 'balance', label: 'Balance', text: '1310' }] });
  programPlayback?.(saved, true);
  const playing = describeProgram(saved).text;
  assert.match(playing, /Playing, now at 3.5s of 4s/);
  assert.match(playing, /Shown now: Balance 1310/);
  assert.doesNotMatch(playing, /Paused at 0.0s/);
  programPlayback?.(saved, false);
  assert.match(describeProgram(saved).text, /Paused at 3.5s of 4s/);
  assert.doesNotMatch(describeProgram({ ...saved, inputs: { rate: 2 } }).text, /Shown now/);
});

// Task 9.4: the owner's result answer names the sources the card was made from; the card shows them only as given (a share link's
// answer has none), and only well-formed ones (card-sources.js).
test('a resolved program carries the sources its result answer names, and none when the answer names none', async () => {
  const sources = [{ kind: 'file', title: 'Lab notes.pdf', page: 2, note: 'Read for this explanation.' }];
  const owner = await accepted({ answer: { sources } });
  assert.deepEqual((await resolveProgram(owner.block, { client: owner.client })).sources, sources);
  const link = await accepted();
  assert.equal('sources' in (await resolveProgram(link.block, { client: link.client })), false);
});
