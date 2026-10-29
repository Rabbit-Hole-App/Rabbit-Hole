// Task 8.3: stateful programs (schema 2) through the server pipeline: one switch (EXPLAIN_PROGRAM_STATEFUL) offers them to brief,
// author and repair and admits their drafts; off, everything reads exactly as before. The review samples bounded event sequences from
// the initial state, binds each capture to the sealed bundle, labels the events for the reviewer, and never treats buttons as reviewed
// when no transition was sampled. No model call: every role call is a stand-in that records its request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact, checkProgramDraft, programFacts, statefulEnabled } from '../src/explain-program.js';
import { authorStage, validateProgramStage } from '../src/explain-author.js';
import { prepareStage } from '../src/explain-brief.js';
import { programRepairStage } from '../src/explain-repair.js';
import { REVIEW_EVENTS, checkManifest, programCaptureManifest, renderStates, reserveRound, transitionSequences } from '../src/explain-render.js';
import { buildReviewContent, reviewSystem, REVIEW_STATEFUL_RULES } from '../src/explain-review.js';
import { renderStage } from '../src/explain-job.js';
import { sortFixture, springFixture, growthFixture } from '../../web/src/explain-program/fixtures.js';

const ON = { EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true' };
const OFF = { EXPLAIN_PROGRAM_ENABLED: 'true' };
const draft = fixture => ({ source: fixture.source, manifest: fixture.manifest });
const recorder = reply => { const calls = []; return { calls, call: async (role, request) => { calls.push({ role, ...request }); return { input: reply }; } }; };
const text = request => (typeof request.content === 'string' ? request.content : JSON.stringify(request.content));

test('one switch: stateful programs need the program route and EXPLAIN_PROGRAM_STATEFUL, which no configuration sets yet', () => {
  assert.equal(statefulEnabled(ON), true);
  assert.equal(statefulEnabled(OFF), false);
  assert.equal(statefulEnabled({ EXPLAIN_PROGRAM_STATEFUL: 'true' }), false, 'never without the program route');
});

test('off, a stateful draft is refused as before (unknown keys) and a schema 1 draft is unchanged; on, it is admitted and sealed as schema 2', async () => {
  const off = checkProgramDraft(draft(sortFixture));
  assert.ok(off.problems.some(problem => /viewport|actions|targets|Unrecognized/i.test(problem)), JSON.stringify(off.problems));
  const v1 = checkProgramDraft(draft(growthFixture));
  assert.equal(v1.schemaVersion, 1);
  assert.deepEqual(checkProgramDraft(draft(growthFixture), { stateful: true }).bundle, v1.bundle, 'a schema 1 draft reads the same with the switch on');
  const on = checkProgramDraft(draft(sortFixture), { stateful: true });
  assert.equal(on.schemaVersion, 2, JSON.stringify(on.problems));
  const artifact = await buildProgramArtifact(on.bundle);
  assert.equal(artifact.schemaVersion, 2);
  assert.equal((await buildProgramArtifact(v1.bundle)).schemaVersion, 1);
  // A stateful draft must export all three functions.
  const missing = checkProgramDraft({ ...draft(sortFixture), source: sortFixture.source.replace('export function reduce', 'function reduce') }, { stateful: true });
  assert.ok(missing.problems.some(problem => /must export reduce/.test(problem)));
  assert.ok(programFacts(on.bundle.manifest).includes('Compare next pair'), 'button labels are facts the reviewer checks');
});

test('validation uses the switch: a stateful draft passes the program stage only when it is on', async () => {
  const job = { program: draft(springFixture), prompt: 'a spring', evidence: [] };
  assert.ok((await validateProgramStage(job, { env: OFF })).problems?.length);
  const on = await validateProgramStage(job, { env: ON });
  assert.equal(on.artifact?.schemaVersion, 2, JSON.stringify(on.problems));
});

test('the author, the brief and repair are offered the stateful capability only when it is on', async () => {
  const job = { prompt: 'sort six numbers one comparison at a time', brief: null, context: null, evidence: [], examples: [] };
  for (const [env, offered] of [[OFF, false], [ON, true]]) {
    const author = recorder({ kind: 'capability_gap', gap: { needs: ['other'], reason: 'test' } });
    await authorStage(job, { env, call: author.call });
    const [request] = author.calls;
    const manifest = request.tool.input_schema.properties.program.properties.manifest.properties;
    assert.equal('actions' in manifest && 'targets' in manifest && 'viewport' in manifest, offered, 'tool fields');
    assert.equal(/Stateful programs\./.test(request.system), offered, 'author rules');
    assert.equal(/"stateful":/.test(text(request)), offered, 'program.stateful in the input');
    const brief = recorder({ gap: { needs: ['other'], reason: 'test' } });
    await prepareStage({ ...job, prompt: job.prompt }, { env, call: brief.call });
    assert.equal(/buttons/.test(brief.calls[0].system) && /"buttons":/.test(text(brief.calls[0])), offered, 'brief');
  }
  // Repair keeps a stateful program stateful: its tool and contract; a schema 1 program is repaired exactly as before.
  for (const [program, stateful] of [[draft(sortFixture), true], [draft(growthFixture), false]]) {
    const repair = recorder({ operation: 'none', reason: 'test' });
    await programRepairStage({ prompt: 'p', round: 0, program, findings: [{ problems: ['running the program failed (runtime_error; phase reduce): x'] }] }, { env: ON, call: repair.call });
    const manifest = repair.calls[0].tool.input_schema.properties.program.properties.manifest.properties;
    assert.equal('actions' in manifest, stateful);
    assert.equal('stateful' in JSON.parse(repair.calls[0].content[0].text).program, stateful);
  }
});

const sealed = async fixture => buildProgramArtifact(checkProgramDraft(draft(fixture), { stateful: true }).bundle);

test('the review samples bounded transitions from the initial state, within the six captures, and says what it left out', async () => {
  const artifact = await sealed(sortFixture);
  const reserved = reserveRound({ cap: 6 });
  const manifest = await programCaptureManifest(artifact, { reserved });
  assert.ok(manifest.entries.length <= 6);
  assert.deepEqual(manifest.entries.map(entry => entry.id), ['light', 'e0-light', 'e1-light', 'e2-light', 'e3-light', 'e4-light']);
  assert.deepEqual(manifest.entries[0].events, [], 'the initial state first');
  assert.deepEqual(manifest.entries[1].events, [{ type: 'action', action: 'step' }]);
  assert.ok(manifest.entries.every(entry => entry.seed === 0 && entry.events.length <= REVIEW_EVENTS && entry.width === 720 && entry.height === 360), 'declared viewport, bounded replay');
  const declared = transitionSequences(artifact.manifest);
  assert.equal(declared.length, 2 + 6 + 1);
  assert.deepEqual(manifest.coverage.transitions, { sampled: 5, declared: 9, events: 1 + 1 + 1 + 1 + 1, seed: 0 });
  assert.deepEqual(manifest.coverage.omitted, declared.slice(5).map(sequence => sequence.label), 'every transition not sampled is named');
  // Events are part of what a capture is: two sequences never collapse into one capture.
  const checked = await checkManifest(manifest, artifact);
  assert.equal(checked.entries.length, 6);
  await assert.rejects(checkManifest({ ...manifest, entries: [{ ...manifest.entries[1], events: Array(REVIEW_EVENTS + 1).fill({ type: 'action', action: 'step' }) }] }, artifact), { code: 'bad_entry' });
  // A schema 1 program's manifest is unchanged: no seed, no events.
  const v1 = await programCaptureManifest(await buildProgramArtifact(draft(growthFixture)), { reserved });
  assert.ok(v1.entries.every(entry => !('events' in entry) && !('seed' in entry)));
  assert.equal(v1.coverage.transitions, undefined);
});

function fakeBrowser(answer) {
  const asked = [];
  const page = {
    setRequestInterception: async () => {}, on: () => {}, emulateMediaFeatures: async () => {}, goto: async () => {}, waitForFunction: async () => {}, setViewport: async () => {},
    evaluate: async (fn, request) => { asked.push(request); return answer(request); }, $: async () => ({ screenshot: async () => new Uint8Array([1, 2, 3]) }), close: async () => {},
  };
  return { asked, browser: { newPage: async () => page, close: async () => {} } };
}
const ENV = { ASSETS: { fetch: async () => new Response('') } };

test('each stateful capture replays its seed and events in the review page and is bound to the sealed bundle', async () => {
  const artifact = await sealed(sortFixture);
  const manifest = await programCaptureManifest(artifact, { reserved: reserveRound({ cap: 6 }) });
  const honest = request => ({ ok: true, fonts: { missing: [] }, bundleHash: request.program.bundleHash, trace: { events: request.events, seed: request.seed, stateHash: 'h', quantities: {} } });
  const { asked, browser } = fakeBrowser(honest);
  const out = await renderStates(ENV, { program: artifact }, manifest, { browser, store: async () => {} });
  assert.deepEqual(asked.map(request => request.events.length), [0, 1, 1, 1, 1, 1]);
  for (const capture of out.captures) assert.deepEqual([capture.bundleHash, capture.seed, Array.isArray(capture.events)], [artifact.bundleHash, 0, true]);
  // Another bundle, or another sequence than the one asked for, is never reviewed.
  const other = fakeBrowser(request => ({ ...honest(request), bundleHash: 'f'.repeat(64) }));
  await assert.rejects(renderStates(ENV, { program: artifact }, manifest, { browser: other.browser, store: async () => {} }), { code: 'scene_invalid' });
  const skipped = fakeBrowser(request => ({ ...honest(request), trace: { ...honest(request).trace, events: [] } }));
  await assert.rejects(renderStates(ENV, { program: artifact }, manifest, { browser: skipped.browser, store: async () => {} }), { code: 'scene_invalid' });
});

test('the reviewer is told the events of every capture and the stateful rules; a schema 1 program reads as before', async () => {
  const artifact = await sealed(sortFixture);
  const captures = [{ id: 'light', events: [], data: 'AAAA' }, { id: 'e0-light', events: [{ type: 'action', action: 'step' }], data: 'AAAA' }];
  const { content } = buildReviewContent({ request: 'sort', captures, program: { source: artifact.source, manifest: artifact.manifest, traces: [] } });
  const labels = content.filter(block => block.type === 'text' && block.text.startsWith('Capture ')).map(block => block.text);
  assert.match(labels[0], /the initial state/);
  assert.match(labels[1], /after the events \[\{"type":"action","action":"step"\}\] in this order from the initial state/);
  assert.ok(reviewSystem(artifact).endsWith(REVIEW_STATEFUL_RULES));
  const v1 = await buildProgramArtifact(draft(growthFixture));
  assert.equal(reviewSystem(v1).includes(REVIEW_STATEFUL_RULES), false);
  const v1Labels = buildReviewContent({ request: 'r', captures: [{ id: 'light', data: 'AAAA' }], program: { source: v1.source, manifest: v1.manifest, traces: [] } }).content.filter(block => block.type === 'text' && block.text.startsWith('Capture '));
  assert.equal(v1Labels[0].text, 'Capture light (theme light, time ends):');
});

test('buttons are never treated as reviewed when no transition fitted: the render stage asks for a simpler presentation', async () => {
  const render = { reserveRound, programCaptureManifest: async () => ({ coverage: { transitions: { declared: 3, sampled: 0 } } }), renderStates: async () => { throw new Error('must not render'); } };
  const out = await renderStage({ render, browser: {} })({ id: 'j', artifact: await sealed(springFixture) }, { env: {} });
  assert.equal(out.repairable, true);
  assert.match(out.problems[0], /no room in one review to check the 3 buttons or selections/);
});
