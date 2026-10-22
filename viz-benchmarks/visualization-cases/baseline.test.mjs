// EXP-T02 baseline runner with a fake transport: no live model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertFrozen, caseInput, generateCase, recordingModel, systemHashes } from './baseline.mjs';
import { sha256 } from './cases.mjs';

const image = Buffer.from('fake image bytes for the reference');
function fixture() {
  const casesRoot = mkdtempSync(join(tmpdir(), 'vc-base-'));
  const record = { id: 'case-1', family: 'f', split: 'heldout', generationReady: true, prompt: 'Explain how attention mixes values.',
    reference: { file: 'reference/ref.png', sha256: sha256(image), width: 10, height: 10 } };
  mkdirSync(join(casesRoot, 'cases', 'case-1', 'reference'), { recursive: true });
  writeFileSync(join(casesRoot, 'cases', 'case-1', 'reference', 'ref.png'), image);
  const frozenPath = join(casesRoot, 'baseline.json');
  writeFileSync(frozenPath, JSON.stringify({ systemSha: 'abc', modelPolicy: { model: 'claude-opus-5' }, files: systemHashes() }));
  return { casesRoot, record, frozen: assertFrozen(frozenPath) };
}
const PRICES = { 'claude-opus-5': [5, 25, 0.5] };
// The model asks one clarifying question: a complete, valid author turn with no scene.
const clarifying = async (body, model) => Response.json({ model, stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 100 },
  content: [{ type: 'tool_use', id: 't1', name: 'ask_clarifying_question', input: { question: 'Which attention variant?' } }] }, { headers: { 'request-id': 'req_1' } });

test('prompt-only sends the learner prompt alone; reference-guided adds the pixels with a declared role', () => {
  const { casesRoot, record } = fixture();
  const plain = caseInput(record, 'prompt-only', casesRoot);
  assert.equal(plain.documents, undefined);
  assert.equal(plain.context, null);
  assert.equal(plain.args, record.prompt);
  const guided = caseInput(record, 'reference-guided', casesRoot);
  assert.equal(guided.documents.length, 1);
  assert.equal(guided.documents[0].type, 'image');
  assert.match(guided.context, /reference diagram/);
  assert.throws(() => caseInput({ ...record, reference: { ...record.reference, sha256: 'x'.repeat(64) } }, 'reference-guided', casesRoot), /do not match/);
});

test('every call is recorded with requested/served model, usage, cost and redacted image bytes', async () => {
  const { casesRoot, record, frozen } = fixture();
  const sent = [];
  const transport = async (body, model) => { sent.push(body); return clarifying(body, model); };
  const out = await generateCase(record, 'reference-guided', { transport, capUsd: 1, prices: PRICES, casesRoot, frozen });
  assert.equal(out.outcome, 'clarification');
  assert.equal(out.scene, null);
  const [call] = out.prompt.stageCalls;
  assert.equal(call.stage, 'author');
  assert.equal(call.requestedModel, 'claude-opus-5');
  assert.equal(call.servedModel, 'claude-opus-5');
  assert.equal(call.requestId, 'req_1');
  assert.equal(call.costUsd, (1000 * 5 + 100 * 25) / 1e6);
  assert.equal(call.images, 1);
  assert.ok(JSON.stringify(sent[0]).includes(image.toString('base64')), 'the model really received the pixels');
  assert.ok(!JSON.stringify(out.prompt).includes(image.toString('base64')), 'the saved prompt holds only the hash');
  assert.ok(JSON.stringify(out.prompt).includes(sha256(image)));
  assert.equal(out.prompt.referenceImage.sha256, sha256(image));
});

test('the budget cap refuses a call before it is sent', async () => {
  const { casesRoot, record, frozen } = fixture();
  let sent = 0;
  const out = await generateCase(record, 'prompt-only', { transport: async (b, m) => { sent++; return clarifying(b, m); }, capUsd: 0.001, prices: PRICES, casesRoot, frozen });
  assert.equal(sent, 0);
  assert.match(out.outcome, /budget cap/);
  assert.equal(out.prompt.stageCalls[0].outcome, 'refused_budget');
  const unpriced = recordingModel(async () => Response.json({}), { capUsd: 100, prices: {} });
  const response = await unpriced.callModel({}, { messages: [], max_tokens: 10 }, 'unknown-model');
  assert.equal(response.status, 429, 'an unpriced model is never called');
});

test('a frozen baseline refuses to run once a system file changed', () => {
  const { casesRoot } = fixture();
  const path = join(casesRoot, 'stale.json');
  writeFileSync(path, JSON.stringify({ files: { ...systemHashes(), 'packages/control-plane/src/learn-artifact.js': '0'.repeat(64) } }));
  assert.throws(() => assertFrozen(path), /changed since freezing: packages\/control-plane\/src\/learn-artifact.js/);
});
