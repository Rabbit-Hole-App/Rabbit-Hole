// EXP-T02/T22 corpus runner with fakes: no model call, no browser.
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { intake, loadCases } from './cases.mjs';
import { runCorpus } from './corpus-run.mjs';

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
const fakeFlow = (byPrompt) => async (prompt, { ctx, ledger }) => {
  await ctx.call('author', { system: 's', tool: { name: 'author_tool', input_schema: {} }, content: [{ type: 'text', text: prompt }] });
  return byPrompt[prompt];
};
const transport = async (body, model) => Response.json({ model, usage: { input_tokens: 100, output_tokens: 10 }, content: [] });
const callExplainRole = async (env, role, request, { callModel }) => { await callModel(env, { max_tokens: 10, ...request, tools: [request.tool], messages: [] }, 'claude-opus-5-5'); return { input: {} }; };

test('v2 runs record history, a comparison for rendered results, a missing-result state otherwise, and no human verdict', async () => {
  const { casesRoot, cases } = corpus();
  const composed = [];
  const out = await runCorpus({ runId: 'v2-pilot', system: 'v2', cases, transport, capUsd: 1, prices: { 'claude-opus-5-5': [4, 20, 0.2] },
    runFlow: fakeFlow({ 'Explain A.': { result: 'accepted', accepted: true, spec: { v: 1 }, compiled: { scene }, review: { accepted: true }, stages: [], rounds: 0 },
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
  assert.equal(existsSync(join(casesRoot, 'cases', cases[1].id, 'generated', 'history', 'v2-pilot', 'generated.png')), false);
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
  const paged = { inputs: [{ name: 'part', type: 'index', of: 'parts', presentation: 'pager' }], exampleData: { parts: ['a', 'b'] } };
  assert.deepEqual(reviewStates(paged).map(s => s.id), ['part-0-light', 'part-0-dark', 'part-1-light', 'part-1-dark']);
  assert.deepEqual(reviewStates({}).map(s => s.id), ['light', 'dark']);
  const entry = (id, reasons) => ({ record: { id, intent: 'i', specHash: 'h', componentVersions: {} }, spec: { title: id }, reasons });
  const reviewed = [];
  const rows = await reviewBank({
    entries: [entry('ok', ['semantic check unrun']), entry('held', ['semantic check unrun', 'derived from the held-out corpus lineage "x"']), entry('bad', ['semantic check unrun'])],
    compile: () => ({ scene: {} }), facts: () => [], hash: async () => 'c', capture: async (scene, states) => ({ captures: states.map(s => ({ ...s, png: Buffer.from(s.id) })) }),
    review: async input => { reviewed.push(input.request); const fail = input.request.startsWith('bad'); return { captures: input.captures.map(c => ({ captureId: c.id, semantic: fail ? 'fail' : 'pass', visual: 'pass', findings: [] })) }; } });
  assert.deepEqual(reviewed, ['ok (i)', 'bad (i)'], 'a held-out derivative is never sent for review');
  assert.deepEqual(rows.map(r => [r.id, r.reviewed, r.semantic ?? null]), [['ok', true, 'pass'], ['held', false, null], ['bad', true, 'fail']]);
});
