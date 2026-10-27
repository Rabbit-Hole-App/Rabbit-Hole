// IMG-01: Generate on a generate-image card (generate-image.js), on a fake api. Nothing is paid; no server is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_GENERATION } from './agent/slash.js';
import { imageCard, imageGenerationId, imageGenerationOn, imageStatus, retryImageSave, runImageJob } from './generate-image.js';
import { proposalBlock, startAdapter } from './generation-proposal-chat.js';
import { problemOf } from './generation-review-client.js';

const SOURCE = `fs_${'a'.repeat(24)}`, SHA = 'b'.repeat(64);
const proposal = { proposal_id: 'gp-0123456789abcdef', version: 2, command: 'generate-image', input: { request: '/generate-image a fox', org: 'o', app: 'canvas-abcdef12' } };
const job = (stage, extra = {}) => ({ id: imageGenerationId(proposal), stage, reason: null, cost: null, saveRetryable: false, artifact: null, ...extra });
const ready = job('ready', { artifact: { sourceId: SOURCE, sha256: SHA, mimeType: 'image/jpeg', bytes: 700000 }, cost: 'estimated_upper_bound' });

// A fake api: the POST answers the first job, each poll the next. requests records method and path.
function server(first, ...polls) {
  const requests = [];
  const api = async (path, options = {}) => {
    requests.push({ method: options.method || 'GET', path, body: options.body && JSON.parse(options.body) });
    if (options.method === 'POST' && path === '/api/learn/image-jobs') return { job: first };
    return { job: polls.length > 1 ? polls.shift() : polls[0] };
  };
  return { api, requests };
}
const ops = () => { const cards = []; return { cards, insertCard: (card, { same }) => { cards.push({ card, same }); return { id: 'card-1', existed: false }; } }; };

test('the flag is off in the committed build, and only then does the card start an image', () => {
  assert.equal(IMAGE_GENERATION, false);
  assert.equal(imageGenerationOn({}), false);
  assert.equal(imageGenerationOn({ VITE_IMAGE_GENERATION: 'true' }), true);
  assert.equal(startAdapter(proposal, { insertCard() {} }), null, 'off: the card cannot Generate');
  assert.equal(proposalBlock(proposal), null, 'no output card is added by the shared generator');
});

test('Generate posts the signed proposal once under an id made from it, polls to ready and places the stored image as the file image card', async () => {
  const { api, requests } = server(job('queued'), job('submitting'), job('stored'), ready);
  const o = ops(), seen = [];
  const done = await runImageJob({ api, proposal, app: 'canvas-abcdef12', ops: o, onStatus: s => seen.push(s.text), wait: async () => {} });
  assert.equal(done.stage, 'ready'); assert.equal(done.cardId, 'card-1');
  assert.equal(requests.filter(r => r.method === 'POST').length, 1, 'one submission');
  assert.deepEqual(requests[0].body, { generationId: 'img-gp-0123456789abcdef', proposal, app: 'canvas-abcdef12' });
  assert.deepEqual(requests.slice(1).map(r => r.path), Array(3).fill('/api/learn/image-jobs/img-gp-0123456789abcdef'));
  assert.deepEqual(seen, ['Making your image.', 'Making your image.', 'Saving your image.', 'Added to the canvas.']);
  const { card, same } = o.cards[0];
  assert.equal(card.type, 'file'); assert.equal(card.kind, 'image');
  assert.deepEqual(card.fileRef.source, { id: SOURCE, rev: SHA });
  assert.equal(card.fileRef.meta.name, 'generated-image.jpg'); assert.equal(card.fileRef.meta.type, 'image/jpeg');
  assert.equal(card.promptUsed, '/generate-image a fox');
  assert.equal(same({ fileRef: { source: { id: SOURCE, rev: SHA } } }), true, 'a second ready finds the card instead of adding another');
  assert.equal(imageCard(ready, proposal).fileRef.status.preview, 'pending');
});

test('a repeated completion (a second press, a reload resuming the job) reveals the one card: one card, one job id, one submission each', async () => {
  const blocks = [], requests = [];
  // The canvas ops as LearnPage insertCard behaves: an equivalent card (same) is revealed, never added again.
  const canvas = { insertCard: (card, { same }) => { const found = blocks.find(same); if (found) return { id: found.id, existed: true }; blocks.push({ ...card, id: `card-${blocks.length + 1}` }); return { id: blocks.at(-1).id, existed: false }; } };
  const api = async (path, options = {}) => { requests.push([options.method || 'GET', path, options.body && JSON.parse(options.body).generationId]); return { job: ready }; };
  const first = await runImageJob({ api, proposal, app: 'a', ops: canvas, wait: async () => {} });
  const again = await runImageJob({ api, proposal, app: 'a', ops: canvas, wait: async () => {} });
  assert.equal(blocks.length, 1, 'exactly one card');
  assert.deepEqual([first.cardId, again.cardId], ['card-1', 'card-1']);
  assert.deepEqual(requests.map(r => r[2]), ['img-gp-0123456789abcdef', 'img-gp-0123456789abcdef'], 'the same generation id: the server answers the same job, consumed and charged once');
  assert.ok(requests.every(([, path]) => path === '/api/learn/image-jobs'), 'no file read or other route here: the card reads its own image');
});

test('a ready job reports what it charged in credits, only when the server settled one', () => {
  assert.deepEqual(imageStatus({ ...ready, charged_credits: 6 }), { tone: 'ready', text: 'Added to the canvas.', retry: false, charged: 6 });
  assert.deepEqual(imageStatus({ ...ready, charged_credits: null }), { tone: 'ready', text: 'Added to the canvas.', retry: false });
  assert.deepEqual(imageStatus(ready), { tone: 'ready', text: 'Added to the canvas.', retry: false });
});

test('failed and unknown outcomes are said in plain words, are never sent again, and nothing is placed', async () => {
  const cases = [
    [job('failed', { reason: 'provider_rejected', cost: 'unknown' }), /could not be made\. It may have been charged\. It was not tried again/],
    [job('failed', { reason: 'invalid_output', cost: 'unknown' }), /may have been charged/],
    [job('failed', { reason: 'reference_changed' }), /could not be started\. Nothing was charged/],
    [job('unknown', { reason: 'outcome_unknown', cost: 'unknown' }), /could not confirm whether this image was made\. It may have been charged\. It was not tried again/],
    [job('refused', { reason: 'allowance', message: 'Your monthly allowance is used up.' }), /^Your monthly allowance is used up\.$/],
    [job('cancelled', { reason: 'disabled' }), /switched off before this started\. Nothing was charged/],
  ];
  for (const [terminal, words] of cases) {
    const { api, requests } = server(job('queued'), terminal);
    const o = ops(), seen = [];
    const done = await runImageJob({ api, proposal, app: 'canvas-abcdef12', ops: o, onStatus: s => seen.push(s), wait: async () => {} });
    assert.equal(done.stage, terminal.stage);
    assert.match(seen.at(-1).text, words); assert.equal(seen.at(-1).tone, 'failed');
    assert.equal(requests.filter(r => r.method === 'POST').length, 1, `${terminal.stage}: not resubmitted`);
    assert.equal(o.cards.length, 0);
    assert.ok(!/\.\.\.|…/.test(seen.at(-1).text));
  }
});

test('a server refusal on the POST reaches the card as its plain message; a job that stays unread is reported, not resent', async () => {
  const refusal = Object.assign(new Error('409'), { status: 409, data: { code: 'image_not_ready', error: 'Nano Banana 2.1 has only been tested for creating without references at 1:1, 1K. Other settings cannot be generated yet.' } });
  await assert.rejects(runImageJob({ api: async () => { throw refusal; }, proposal, app: 'a', ops: ops(), wait: async () => {} }), error => problemOf(error).message === refusal.data.error);
  const calls = [];
  const lost = async (path, options = {}) => { calls.push(options.method || 'GET'); if (options.method === 'POST') return { job: job('submitting') }; throw Object.assign(new Error('network'), { status: 0 }); };
  await assert.rejects(runImageJob({ api: lost, proposal, app: 'a', ops: ops(), wait: async () => {} }), /Lost contact with the image\. It may still be made/);
  assert.equal(calls.filter(m => m === 'POST').length, 1);
  let clock = 0;
  await assert.rejects(runImageJob({ api: server(job('queued'), job('submitting')).api, proposal, app: 'a', ops: ops(), wait: async () => { clock += 120000; }, now: () => clock }), /taking much longer than expected/);
});

test('saving that stays stuck offers one retry-save and nothing else; the provider is never called again', async () => {
  assert.deepEqual(imageStatus(job('stored', { saveRetryable: true })), { tone: 'working', text: 'Saving your image.', retry: false });
  assert.deepEqual(imageStatus(job('recorded', { saveRetryable: true }), { stuck: true }), { tone: 'working', text: 'Your image was made but saving it is taking longer than expected.', retry: true });
  let clock = 0;
  const seen = [];
  const { api } = server(job('queued'), job('stored', { saveRetryable: true }), job('stored', { saveRetryable: true }), job('stored', { saveRetryable: true }), ready);
  await runImageJob({ api, proposal, app: 'a', ops: ops(), onStatus: s => seen.push(s), wait: async () => { clock += 20000; }, now: () => clock });
  assert.deepEqual(seen.map(s => s.retry), [false, false, false, true, false]);
  const sent = [];
  await retryImageSave(async (path, options) => { sent.push([path, options.method]); return { job: job('recorded') }; }, 'img-gp-0123456789abcdef');
  assert.deepEqual(sent, [['/api/learn/image-jobs/img-gp-0123456789abcdef/retry-save', 'POST']]);
});
