// EXP-T02/T22 corpus runner with fakes: no model call, no browser.
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { intake, loadCases } from './cases.mjs';
import { runCorpus } from './corpus-run.mjs';
import * as explainRender from '../../packages/control-plane/src/explain-render.js';
import { compileVisual } from '../../packages/web/src/visual-components/compile.js';
import { EXAMPLES } from '../../packages/web/src/visual-components/examples/index.js';

function png(w, h, salt) { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[39] = salt; return b; }
function corpus() {
  const root = mkdtempSync(join(tmpdir(), 'vc-corpus-'));
  const dir = join(root, 'in'); mkdirSync(dir);
  writeFileSync(join(dir, 'a.png'), png(10, 10, 1)); writeFileSync(join(dir, 'b.png'), png(10, 10, 2));
  const casesRoot = join(root, 'cases'); mkdirSync(casesRoot);
  const h = b => createHash('sha256').update(b).digest('hex');
  intake({ corpus: dir, casesRoot, runId: 'r1', labels: {
    [h(png(10, 10, 1))]: { slug: 'a', family: 'f', split: 'example', prompt: 'Explain A.' },
    [h(png(10, 10, 2))]: { slug: 'b', family: 'g', split: 'heldout', prompt: 'Explain B.' } } });
  return { casesRoot, cases: loadCases(casesRoot) };
}

const scene = { id: 's', width: 100, height: 50, duration: 1, objects: [], timeline: [] };
const fakeFlow = (byPrompt) => async (prompt, { ctx, ledger, save }) => {
  await ctx.call('author', { system: 's', tool: { name: 'author_tool', input_schema: {} }, content: [{ type: 'text', text: prompt }] });
  save('spec-r0.json', { v: 1, prompt });
  return byPrompt[prompt];
};
const transport = async (body, model) => Response.json({ model, usage: { input_tokens: 100, output_tokens: 10 }, content: [] });
const callExplainRole = async (env, role, request, { callModel }) => { await callModel(env, { max_tokens: 10, ...request, tools: [request.tool], messages: [] }, 'claude-opus-5-5'); return { input: {} }; };

test('v2 runs record history, a comparison for rendered results, a missing-result state otherwise, and no human verdict', async () => {
  const { casesRoot, cases } = corpus();
  const composed = [];
  const out = await runCorpus({ runId: 'v2-pilot', system: 'v2', cases, transport, capUsd: 1, prices: { 'claude-opus-5-5': [4, 20, 0.2] },
    runFlow: fakeFlow({ 'Explain A.': { result: 'accepted', accepted: true, spec: { v: 1 }, compiled: { scene }, review: { accepted: true }, stages: [], rounds: 0, captures: [{ id: 'p1-light-r0', png: png(5, 5, 3) }] },
      'Explain B.': { result: 'repair_stopped', accepted: false, spec: { v: 1 }, compiled: null, stop: { reason: 'needs a pager' }, stages: [], rounds: 3 } }),
    callExplainRole, render: async () => png(20, 20, 9), compose: async (ref, gen, outPath) => { composed.push(outPath); writeFileSync(outPath, 'x'); }, casesRoot });
  const [a, b] = out.rows;
  assert.equal(a.outcome, 'ok'); assert.equal(a.accepted, true);
  assert.equal(b.outcome, 'failed'); assert.match(b.error, /repair_stopped: needs a pager/);
  assert.equal(composed.length, 1);
  const runA = join(casesRoot, 'cases', cases[0].id, 'generated', 'history', 'v2-pilot');
  const receipt = JSON.parse(readFileSync(join(runA, 'receipt.json'), 'utf8'));
  assert.equal(receipt.humanVerdict, 'pending owner');
  assert.equal(receipt.calls, 1);
  assert.ok(receipt.costUsd > 0);
  assert.equal(JSON.parse(readFileSync(join(runA, 'prompt.json'), 'utf8')).stageCalls.length, 1);
  assert.equal(existsSync(join(casesRoot, 'cases', cases[0].id, 'review.json')), false, 'no verdict is invented');
  assert.deepEqual(JSON.parse(readFileSync(join(runA, 'rounds', 'spec-r0.json'), 'utf8')), { v: 1, prompt: 'Explain A.' }, 'every round is kept with the run');
  assert.equal(existsSync(join(casesRoot, 'cases', cases[1].id, 'generated', 'history', 'v2-pilot', 'generated.png')), false);
  assert.equal(receipt.flowResult, 'accepted');
  assert.deepEqual(readFileSync(join(runA, 'rounds', 'capture-p1-light-r0.png')), png(5, 5, 3), 'every reviewed capture is kept with the run');
  const html = readFileSync(join(casesRoot, 'index.html'), 'utf8');
  assert.match(html, /verdict pending owner/);
  assert.match(html, /flow accepted · model review accepted · 1 calls/);
  assert.match(html, /flow repair_stopped/);
  assert.match(html, /<img src="cases\/[^"]+\/v2-pilot\/comparison.png"/);
});

test('v2 reference-guided is recorded as transport_unavailable, with no call made', async () => {
  const { casesRoot, cases } = corpus();
  let calls = 0;
  const out = await runCorpus({ runId: 'v2-ref', system: 'v2', inputMode: 'reference-guided', cases: cases.slice(0, 1), transport: async (...a) => { calls++; return transport(...a); }, capUsd: 1, prices: {},
    runFlow: async () => { throw new Error('must not run'); }, callExplainRole, render: async () => png(1, 1, 1), compose: async () => {}, casesRoot });
  assert.equal(calls, 0);
  assert.match(out.rows[0].error, /transport_unavailable/);
});

test('bank review (EXP-T11) reviews only records that lack nothing but the semantic check, every pager part in both themes', async () => {
  const { reviewBank, reviewStates } = await import('./bank-review.mjs');
  assert.deepEqual((await reviewStates(compileVisual(EXAMPLES['request-path-parts']).scene)).map(s => [s.id, s.inputs]), [['s0-light', { part: 0 }], ['s0-dark', { part: 0 }], ['s1-light', { part: 1 }], ['s1-dark', { part: 1 }], ['s2-light', { part: 2 }], ['s2-dark', { part: 2 }]]);
  assert.deepEqual((await reviewStates(compileVisual(EXAMPLES.pipeline).scene)).map(s => s.id), ['light', 'dark']);
  const entry = (id, reasons) => ({ record: { id, intent: 'i', specHash: 'h', componentVersions: {} }, spec: { title: id }, reasons });
  const reviewed = [];
  const rows = await reviewBank({
    entries: [entry('ok', ['semantic check unrun']), entry('held', ['semantic check unrun', 'derived from the held-out corpus lineage "x"']), entry('bad', ['semantic check unrun'])],
    compile: () => compileVisual(EXAMPLES.pipeline), facts: () => [], hash: async () => 'c', capture: async (scene, states) => ({ captures: states.map(s => ({ ...s, png: Buffer.from(s.id) })) }),
    review: async input => { reviewed.push(input.request); const fail = input.request.startsWith('bad'); return { captures: input.captures.map(c => ({ captureId: c.id, semantic: fail ? 'fail' : 'pass', visual: 'pass', findings: [] })) }; } });
  assert.deepEqual(reviewed, ['ok (i)', 'bad (i)'], 'a held-out derivative is never sent for review');
  assert.deepEqual(rows.map(r => [r.id, r.reviewed, r.semantic ?? null]), [['ok', true, 'pass'], ['held', false, null], ['bad', true, 'fail']]);
});

test('a provider usage-limit refusal pauses the remaining paid cases instead of running them', async () => {
  const { casesRoot, cases } = corpus();
  let calls = 0;
  const limited = async (body, model) => { calls++; return Response.json({ type: 'error', error: { message: 'You have reached your specified API usage limits.' } }, { status: 400 }); };
  const out = await runCorpus({ runId: 'v2-cap', system: 'v2', cases, transport: limited, capUsd: 1, prices: { 'claude-opus-5-5': [4, 20, 0.2] },
    runFlow: async (prompt, { ctx }) => { await ctx.call('author', { system: 's', tool: { name: 't', input_schema: {} }, content: prompt }); return { result: 'unknown', stages: [] }; },
    callExplainRole, render: async () => png(1, 1, 1), compose: async () => {}, casesRoot });
  assert.equal(calls, 1, 'the second case makes no call');
  assert.equal(out.rows[1].outcome, 'not_run');
  assert.match(out.paused, /provider_unavailable: HTTP 400 .*usage limits/);
  assert.equal(out.spentUsd, 0, 'a refused call is not billed');
});

// EXP-12 parity: the tooling captures what the product job captures. jobManifest is the manifest explain-job.js renderStage
// builds and hands to renderStates (caught there, so no browser opens); the flow and the bank review must produce the same
// entries for the same compiled spec, deduplicate to the same renders and refuse the same over-budget cards.
async function jobManifest(compiled) {
  const { renderStage } = await import('../../packages/control-plane/src/explain-job.js');
  let manifest = null;
  const stage = renderStage({ render: { ...explainRender, renderStates: async (env, given, built) => { manifest = built; return { compiledHash: built.compiledHash, captures: [] }; } }, browser: {} });
  await stage({ id: 'parity', compiled }, { env: {} });
  return manifest;
}
const mod = (id, label, extra = {}) => ({ id, component: 'module', version: 1, params: { label }, ...extra });
const stepsSpec = count => ({ version: 1, id: 'm', title: 'M', components: [mod('a', 'Request'), ...Array.from({ length: count - 1 }, (_, i) => mod(`n${i}`, `Stage ${i + 1}`, { step: `s${i + 1}` }))],
  presentation: { mode: 'steps', steps: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, title: `Step ${i}` })) } });
const pendulum = EXAMPLES['pendulum-experiment'];
const [lengthExperiment, massExperiment] = pendulum.presentation.experiments;
// Pager parts x lengths, and steps x masses: the combined states production captures.
const pagedPendulum = { ...pendulum, parts: [{ id: 'a', title: 'Pendulum' }, { id: 'b', title: 'Law' }], components: [{ ...pendulum.components[0], part: 0 }, { ...pendulum.components[1], part: 1 }],
  presentation: { ...pendulum.presentation, experiments: [lengthExperiment] } };
const steppedPendulum = { ...pendulum, components: [{ ...pendulum.components[0], step: 's0' }, { ...pendulum.components[1], step: 's1' }],
  presentation: { mode: 'steps', steps: [{ id: 's0', title: 'The pendulum' }, { id: 's1', title: 'The law' }], experiments: [massExperiment] } };
const withMasses = values => ({ ...pendulum, presentation: { ...pendulum.presentation, experiments: [lengthExperiment, { ...massExperiment, domain: { values } }] } });
const unsuffixed = (entries, round) => entries.map(entry => ({ ...entry, id: entry.id.replace(new RegExp(`-r${round}$`), '') }));
const refusal = promise => promise.then(() => null, error => ({ code: error.code, message: error.message }));

test('EXP-12: the flow and the bank review capture the job manifest: steps, experiment values, combined states', async () => {
  const { captureEntries } = await import('./explain-flow.mjs');
  const { reviewStates } = await import('./bank-review.mjs');
  const expected = {
    'three steps': [stepsSpec(3), ['t0-light', 't0-dark', 't1-light', 't1-dark', 't2-light', 't2-dark']],
    'four steps, light only': [stepsSpec(4), ['t0-light', 't1-light', 't2-light', 't3-light']],
    'experiment values': [pendulum, ['s0-light', 's1-light', 's2-light', 's3-light', 's4-light', 's5-light']],
    'parts x experiment values': [pagedPendulum, ['s0-light', 's1-light', 's2-light', 's3-light', 's4-light', 's5-light']],
    'steps x experiment values': [steppedPendulum, ['s0-t0-light', 's0-t1-light', 's1-t0-light', 's1-t1-light']],
    'parts': [EXAMPLES['request-path-parts'], ['s0-light', 's0-dark', 's1-light', 's1-dark', 's2-light', 's2-dark']],
  };
  for (const [name, [spec, ids]] of Object.entries(expected)) {
    const compiled = compileVisual(spec);
    const job = await jobManifest(compiled);
    assert.deepEqual(job.entries.map(entry => entry.id), ids, name);
    assert.deepEqual(unsuffixed(await captureEntries(compiled.scene, 2), 2), job.entries, name);
    assert.deepEqual(await reviewStates(compiled.scene), job.entries, name);
  }
  // What the entries carry: the step each frame shows, and every control and pager value of its state.
  const stepped = await jobManifest(compileVisual(steppedPendulum));
  assert.deepEqual(stepped.entries.map(entry => [entry.step, entry.inputs]), [['The pendulum', { pend_mass: 0 }], ['The law', { pend_mass: 0 }], ['The pendulum', { pend_mass: 1 }], ['The law', { pend_mass: 1 }]]);
  const paged = await jobManifest(compileVisual(pagedPendulum));
  assert.deepEqual(paged.entries.map(entry => entry.inputs), [{ part: 0, pend_length: 1 }, { part: 0, pend_length: 0 }, { part: 0, pend_length: 2 }, { part: 1, pend_length: 0 }, { part: 1, pend_length: 1 }, { part: 1, pend_length: 2 }]);
});

test('EXP-12: identical frames dedup to the same renders, and an over-budget card is refused the same way', async () => {
  const { captureEntries } = await import('./explain-flow.mjs');
  const { reviewBank, reviewStates } = await import('./bank-review.mjs');
  // A steps scene whose last two steps draw the same frame (explain-capture-manifest.test.js): captured once, the other an alias.
  const { scene } = compileVisual(stepsSpec(3));
  const same = { ...scene, duration: 3, presentation: { ...scene.presentation, steps: [...scene.presentation.steps, { id: 's3', title: 'Step 3', at: 3 }] } };
  const job = await jobManifest({ scene: same });
  const rendered = async entries => (await explainRender.checkManifest({ ...job, entries }, same)).entries.map(entry => [entry.id, entry.aliases]);
  assert.deepEqual(await rendered(job.entries), [['t0-light', []], ['t0-dark', []], ['t1-light', []], ['t1-dark', []], ['t2-light', ['t3-light']], ['t2-dark', ['t3-dark']]]);
  assert.deepEqual(await rendered(await captureEntries(same, 0)), [['t0-light-r0', []], ['t0-dark-r0', []], ['t1-light-r0', []], ['t1-dark-r0', []], ['t2-light-r0', ['t3-light-r0']], ['t2-dark-r0', ['t3-dark-r0']]]);
  assert.deepEqual(await rendered(await reviewStates(same)), await rendered(job.entries));
  // Over budget: seven steps, or nine control states, are more distinct frames than one review covers. The job refuses;
  // so do the flow and the bank review, with the same error, and the bank review records the card as not reviewed.
  for (const spec of [stepsSpec(7), withMasses([0.5, 1, 2])]) {
    const compiled = compileVisual(spec);
    assert.equal((await refusal(jobManifest(compiled)))?.code, 'over_budget');
    const production = await refusal(explainRender.captureManifest(compiled.scene, { reserved: explainRender.reserveRound({ cap: 6 }) }));
    assert.equal(production.code, 'over_budget');
    assert.deepEqual(await refusal(captureEntries(compiled.scene, 0)), production);
    assert.deepEqual(await refusal(reviewStates(compiled.scene)), production);
    const rows = await reviewBank({ entries: [{ record: { id: 'big', intent: 'i' }, spec, reasons: ['semantic check unrun'] }], compile: () => compiled, facts: () => [], hash: async () => 'c',
      capture: async () => { throw new Error('must not render'); }, review: async () => { throw new Error('must not review'); } });
    assert.deepEqual(rows, [{ id: 'big', reviewed: false, why: [production.message] }]);
  }
});

test('EXP-12: runFlow renders exactly the job manifest and hands the reviewer each capture with its step', async () => {
  const { runFlow } = await import('./explain-flow.mjs');
  const job = await jobManifest(compileVisual(steppedPendulum));
  let captured = null, reviewed = null;
  const ctx = { env: {}, call: async (role, request) => {
    if (role === 'author') return { input: { kind: 'spec', spec: steppedPendulum } };
    reviewed = request.content.filter(block => block.type === 'text' && block.text.startsWith('Capture ')).map(block => block.text);
    throw new Error('no model in this test');
  } };
  const capture = async (scene, entries) => { captured = entries; return { captures: entries.map(entry => ({ ...entry, aliases: [], png: png(2, 2, 1) })) }; };
  const out = await runFlow('Show what the mass does.', { ctx, capture });
  assert.equal(out.result, 'review_failed');
  assert.deepEqual(unsuffixed(captured, 0), job.entries);
  assert.deepEqual(reviewed, [0, 1].flatMap(mass => [['t0', 'The pendulum', 0], ['t1', 'The law', 1]].map(([t, step, time]) => `Capture s${mass}-${t}-light-r0 (theme light, step "${step}", time ${time}s, inputs {"pend_mass":${mass}}):`)));
});
