// IMG-01 integration (docs/features/image-jobs.md section 10): the SIGNED route end to end, with the real signer, the real default
// verifier and the real one-shot consume. A proposal is made by POST /api/learn/chat/image-proposals (chat-proposal-route.js), read
// back from the chat tables, and started through POST /api/learn/image-jobs (image-jobs.js) into the real ImageJobs object, the real
// ledger and a fake R2, on one SQLite built from repository-schema.sql. Only identity, the canvas lookup and the file reader are
// injected (as image-jobs.test.js does); the provider is the real HTTP adapter on a counted fixture transport. Nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { imageJobsRoute, ImageJobs } from '../src/image-jobs.js';
import { imageAdapter, imageQuote } from '../src/image-providers.js';
import { IMAGE_VALIDATED, imageReadiness } from '../src/image-settings.js';
import { proposalRecord, signProposal, verifyImageProposal } from '../src/generation-proposal.js';
import { resolveReferences } from '../src/generation-review-refs.js';
import { proposalView } from '../../web/src/generation-confirmation-schema.js';

import { APP, FOX, JPG, OWNER, PNG, hex, quiet, stack } from './image-int-stack.mjs';

test('the whole signed route: propose, read back, Generate, one image, one consume; a repeat is the same job and a second press is refused', async t => {
  const h = stack(t);
  const { res, body } = await h.propose({ settings: h.model });
  assert.equal(res.status, 201);
  const p = body.proposal;
  assert.match(p.sig, /^v3\./);
  assert.equal(p.command, 'generate-image');
  assert.deepEqual(p.input, { request: `/generate-image ${FOX}`, org: OWNER.org, app: APP });
  // The signed quote is the server's own: what imageQuote says for these settings and this prompt.
  const q = imageQuote(h.env, h.model, 0, new TextEncoder().encode(FOX).length);
  assert.equal(q.state, 'priced');
  assert.deepEqual(p.quote, { estimate_credits: q.estimate_credits, max_credits: q.max_credits, reserve_credits: q.reserve_credits });
  assert.deepEqual(p.usage, { estimate_credits: q.estimate_credits, max_credits: q.max_credits, reserve_credits: q.reserve_credits });
  assert.ok(q.estimate_credits <= q.max_credits && q.max_credits <= q.reserve_credits, 'estimate <= most it can cost <= hold');
  assert.equal(p.readiness.ready, true);
  // The card's view: priced and generatable.
  const view = proposalView(p);
  assert.deepEqual(view.validation_errors, []);
  assert.ok(view.allowed_actions.includes('generate'));
  assert.deepEqual(view.usage, { estimate_credits: q.estimate_credits, max_credits: q.max_credits, reserve_credits: q.reserve_credits }, 'the card gets all three, apart');
  // Stored on the chat exactly as a chat proposal is, with its one state.
  const stored = h.sqlite.prepare('SELECT meta_json FROM chat_message_meta WHERE message_id = ?').get(Number(body.message_id));
  assert.equal(JSON.parse(stored.meta_json).proposal.sig, p.sig);
  assert.equal((await h.state(p)).used, null);
  // GET of the card's proposal (the same route a reload uses) returns it.
  const read = await chatProposalFetch(new Request(`https://app/api/learn/chat/messages/${body.message_id}/proposal`), h.env, h.proposalDeps);
  assert.equal((await read.json()).proposal.sig, p.sig);

  const first = await h.generate(p);
  assert.equal(first.res.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.job.stage, 'queued');
  assert.equal((await h.state(p)).used.key, first.generationId, 'consumed once, keyed by the generation id');
  quiet(h);
  await h.object(h.nameOf(first.generationId)).alarm();
  assert.equal(h.job(first.generationId).stage, 'ready');
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(h.calls[0].init.body).input[0].text, FOX);
  const source = h.sqlite.prepare('SELECT * FROM file_sources').get();
  assert.equal(source.family, 'image'); assert.equal(source.status, 'stored'); assert.equal(source.owner_email, OWNER.email);
  assert.equal(source.sha256, await hex(h.bucket.objects.get(source.r2_key).bytes));
  // Reconnect with the same generation id: the same job, no second request. A different id for the used proposal: refused.
  const again = await h.generate(p);
  assert.equal(again.res.status, 200); assert.equal(again.body.job.stage, 'ready');
  const second = await h.generate(p, 'img-second-press-0001');
  assert.equal(second.res.status, 409); assert.equal(second.body.code, 'proposal_used');
  assert.match(second.body.error, /already made an image/);
  assert.equal(h.calls.length, 1);
});

test('refusals on the signed route: each stable code, with nothing consumed, reserved or sent', async t => {
  const h = stack(t);
  const made = async (settings, extra = {}) => (await h.propose({ settings, ...extra })).body.proposal;
  const ledger = () => h.sqlite.prepare('SELECT count(*) AS n FROM usage_operations').get().n;
  const cases = [];
  // Tampered: any signed field changed after signing.
  const tampered = await made(h.model);
  cases.push(['proposal_refused', { ...tampered, description: 'A different picture entirely.' }, tampered]);
  cases.push(['proposal_refused', { ...tampered, quote: { estimate_credits: 1, max_credits: 1, reserve_credits: 1 } }, tampered]);
  cases.push(['proposal_refused', { ...tampered, quote: { ...tampered.quote, max_credits: tampered.quote.max_credits + 1 } }, tampered]); // a raised maximum is not signed
  cases.push(['proposal_refused', { ...tampered, sig: `v2.${'0'.repeat(64)}` }, tampered]);
  cases.push(['proposal_refused', { ...tampered, sig: 'fixture-signed' }, tampered]);
  // Not ready: a combination no live run covered (Nano Banana 2.1 at 4K, the Pro model at 16:9), named on the card first.
  const fourK = await made({ ...h.model, resolution: '4K' });
  assert.equal(fourK.readiness.ready, false);
  assert.match(fourK.readiness.message, /Nano Banana 2\.1 has only been tested for creating without references at 1:1, 1K/);
  assert.ok(!proposalView(fourK).allowed_actions.includes('generate'));
  assert.ok(proposalView(fourK).validation_errors.some(e => e.path === 'readiness'));
  cases.push(['image_not_ready', fourK, fourK]);
  const wide = await made({ model: 'gemini-3-pro-image', aspect_ratio: '16:9', resolution: '1K' });
  cases.push(['image_not_ready', wide, wide]);
  // Unknown quote: a ready combination whose spending bound is not configured. The proposal exists, signs no quote, and the card says so.
  const noBound = { ...h.env, IMAGE_GENERATE_RESERVED_USD: '' };
  const openai = (await h.propose({ settings: h.model }, h.proposalDeps, noBound)).body.proposal;
  assert.equal(openai.readiness.ready, true);
  assert.equal(openai.quote, null);
  assert.deepEqual(openai.usage, { estimate_credits: null, max_credits: null, reserve_credits: null });
  const unknown = proposalView(openai);
  assert.deepEqual(unknown.usage, { estimate_credits: null, unknown: true });
  assert.ok(!unknown.allowed_actions.includes('generate'));
  cases.push(['quote_unknown', openai, openai, { IMAGE_GENERATE_RESERVED_USD: '' }]);
  // Quote mismatch: the server's price moved after approval.
  const priced = await made(h.model);
  cases.push(['quote_changed', priced, priced, { IMAGE_GENERATE_RESERVED_USD: '0.6' }]);
  // The MAXIMUM moved after approval (settings or pricing change): stale, the person reconfirms. The hold moving is stale too.
  const maxes = JSON.parse(h.env.IMAGE_MAX_CHARGE_USD_BY_MODEL);
  cases.push(['quote_changed', priced, priced, { IMAGE_MAX_CHARGE_USD_BY_MODEL: JSON.stringify({ ...maxes, [h.model.model]: maxes[h.model.model] - 0.01 }) }]);
  for (const [code, sent, original, patch] of cases) {
    const e = patch ? { ...h.env, ...patch } : h.env;
    const out = await h.generate(sent, `gen-${crypto.randomUUID()}`, h.routeDeps, e);
    assert.equal(out.res.status, 409, code);
    assert.equal(out.body.code, code);
    assert.equal((await h.state(original)).used, null, `${code}: the proposal is still unspent`);
  }
  quiet(h);
  assert.equal(ledger(), 0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM file_sources').get().n, 0);
});

test('off: no proposal and no job without IMAGE_GENERATE_ENABLED, and a v2 envelope is never an image proposal', async t => {
  const h = stack(t, { IMAGE_GENERATE_ENABLED: 'false' });
  const proposal = await h.propose({ settings: h.model });
  assert.equal(proposal.res.status, 503); assert.equal(proposal.body.code, 'image_generation_disabled');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM threads').get().n, 0);
  const on = stack(t);
  const p = (await on.propose({ settings: on.model })).body.proposal;
  const off = await on.generate(p, undefined, on.routeDeps, { ...on.env, IMAGE_GENERATE_ENABLED: 'false' });
  assert.equal(off.res.status, 503); assert.equal(off.body.code, 'image_generation_disabled');
  assert.equal(await verifyImageProposal(on.env, { ...p, sig: p.sig.replace(/^v3\./, 'v2.') }, OWNER.email), 'This image proposal is out of date. Ask for it again.');
  assert.equal(await verifyImageProposal(on.env, p, OWNER.email), null);
  assert.match(await verifyImageProposal(on.env, p, 'someone@example.test'), /not made for you/);
  // The server will not sign an image in a v2 envelope, and a client's own quote is never signed.
  await assert.rejects(signProposal(on.env, { command: 'generate-image', title: 'x', description: FOX, settings: on.model, input: { org: OWNER.org, app: APP } }, OWNER.email), /reviewed envelope/);
  const lie = await signProposal(on.env, { command: 'generate-image', title: 'Fox', description: FOX, settings: on.model, prompt: FOX, quote: { estimate_credits: 1, reserve_credits: 1 }, input: { org: OWNER.org, app: APP, request: FOX }, original_request: FOX }, OWNER.email, { envelope: 'v3' });
  assert.notDeepEqual(lie.quote, { estimate_credits: 1, reserve_credits: 1 });
});

test('references: bound to the revision attached, resolved again at create, and the bytes are the authorized ones', async t => {
  const h = stack(t);
  const bytes = Uint8Array.from(atob(PNG), c => c.charCodeAt(0)), sha256 = await hex(bytes), id = `fs_${'c'.repeat(24)}`;
  h.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, ?, ?, ?, 'board-1', 'image', 'ref.png', 'image/png', ?, ?, 'ref-key', 'stored', 1)").run(id, OWNER.org, OWNER.email, APP, bytes.length, sha256);
  h.sqlite.prepare("INSERT INTO file_source_refs (source_id, board_id) VALUES (?, 'board-1')").run(id);
  await h.bucket.put('ref-key', bytes);
  const ref = { id: 'r1', label: 'Image ref', kind: 'file', sourceId: id, revision: sha256, range: null };
  const settings = { model: 'gemini-3-pro-image', aspect_ratio: '1:1', resolution: '1K' };
  const prompt = 'Paint {{ref:r1}} as a winter scene.';
  // Created: its state is read now under the person's access.
  const { res, body } = await h.propose({ settings, prompt, references: [ref] });
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.deepEqual(body.references.map(s => s.state), ['ok']);
  assert.equal(body.proposal.description, 'Paint Image ref as a winter scene.', 'the provider reads the pill-free words');
  // Pro with a reference is priced but no live run covered an edit with it: named before confirmation, refused at create.
  assert.equal(body.proposal.readiness.ready, false);
  const blocked = await h.generate(body.proposal);
  assert.equal(blocked.body.code, 'image_not_ready');
  // The reference states: changed, not an image, not permitted, a kind this generator cannot read.
  const read = ref2 => resolveReferences(h.env, { command: 'generate-image', references: [ref2] }, { req: new Request('https://app/'), user: OWNER, app: APP }, { authorize: h.proposalDeps.authorize });
  assert.equal((await read({ ...ref, revision: 'd'.repeat(64) })).states[0].state, 'changed');
  assert.equal((await read({ ...ref, sourceId: `fs_${'d'.repeat(24)}` })).states[0].state, 'inaccessible');
  assert.equal((await read({ ...ref, kind: 'card', sourceId: 'card-1' })).states[0].state, 'unsupported');
  h.sqlite.prepare("UPDATE file_sources SET family = 'pdf' WHERE id = ?").run(id);
  assert.equal((await read(ref)).states[0].state, 'unsupported');
  h.sqlite.prepare("UPDATE file_sources SET family = 'image' WHERE id = ?").run(id);
  // With readiness passing (an injected policy, as image-jobs.test.js does), the same signed proposal runs and sends the reference.
  const run = await h.generate(body.proposal, undefined, { ...h.routeDeps, ready: () => ({ ready: true }) });
  assert.equal(run.res.status, 201, JSON.stringify(run.body));
  await h.object(h.nameOf(run.generationId)).alarm();
  assert.equal(h.job(run.generationId).stage, 'ready');
  assert.deepEqual(JSON.parse(h.calls[0].init.body).input[1], { type: 'image', mime_type: 'image/png', data: PNG });
  // Too many references for the model is a 400 with the path, and the draft is not stored.
  const many = await h.propose({ settings, prompt: Array.from({ length: 15 }, (_, i) => `{{ref:r${i + 1}}}`).join(' ') + ' together.', references: Array.from({ length: 15 }, (_, i) => ({ ...ref, id: `r${i + 1}`, label: `Ref ${i + 1}`, range: { page: i + 1 } })) });
  assert.equal(many.res.status, 400);
  assert.equal(many.body.errors[0].path, 'references');
});

test('editing a setting on the card re-quotes and re-checks readiness; the options stay selectable', async t => {
  const h = stack(t);
  const { body } = await h.propose({ settings: h.model });
  const put = async (settings, version) => {
    const res = await chatProposalFetch(new Request(`https://app/api/learn/chat/messages/${body.message_id}/proposal`, { method: 'PUT', body: JSON.stringify({ expected_version: version, settings }) }), h.env, h.proposalDeps);
    return { res, body: await res.json() };
  };
  const wide = await put({ ...h.model, aspect_ratio: '3:2' }, 1);
  assert.equal(wide.res.status, 200, JSON.stringify(wide.body));
  assert.equal(wide.body.proposal.version, 2);
  assert.equal(wide.body.proposal.readiness.ready, false);
  assert.ok(!proposalView(wide.body.proposal).allowed_actions.includes('generate'));
  const back = await put(h.model, 2);
  assert.equal(back.body.proposal.version, 3);
  assert.equal(back.body.proposal.readiness.ready, true);
  assert.deepEqual(back.body.proposal.quote, body.proposal.quote);
  // Only the newest revision starts.
  const old = await h.generate(body.proposal);
  assert.equal(old.res.status, 409); assert.equal(old.body.code, 'proposal_stale');
  quiet(h);
  const ok = await h.generate(back.body.proposal);
  assert.equal(ok.res.status, 201);
});

test('the validated list is exactly the live provider runs (A to E, then imgact-*); every other option is not ready and says what was tested', () => {
  assert.deepEqual(IMAGE_VALIDATED.map(r => `${r.model}/${r.operation}/${r.quality}/${r.aspect_ratio}/${r.resolution}/${r.max_references}`).sort(), [
    'gemini-3-pro-image/generate/null/1:1/1K/0', 'gemini-nano-banana-2.1/edit/null/1:1/1K/1', 'gemini-nano-banana-2.1/generate/null/1:1/1K/0', 'gemini-nano-banana-2.1/generate/null/16:9/1K/0',
    'gpt-image-2.5-flare/generate/low/1:1/1K/0', 'gpt-image-2.5-flare/generate/low/16:9/2K/0', 'gpt-image-2.5-sunburst/edit/low/1:1/1K/2', 'gpt-image-2.5-sunburst/generate/low/1:1/1K/0'].sort());
  for (const r of IMAGE_VALIDATED) assert.ok(r.evidence && /^(run [A-E]|imgact-)/.test(r.evidence), r.model);
  const ready = (s, n = 0) => imageReadiness({ quality: null, aspect_ratio: '1:1', resolution: '1K', ...s }, n);
  assert.equal(ready({ model: 'gpt-image-2.5-flare', quality: 'low' }).ready, true);
  assert.equal(ready({ model: 'gpt-image-2.5-sunburst', quality: 'low' }, 2).ready, true);
  assert.equal(ready({ model: 'gemini-nano-banana-2.1' }, 1).ready, true);
  for (const [s, n] of [
    [{ model: 'gpt-image-2.5-flare', quality: 'medium' }, 0], [{ model: 'gpt-image-2.5-flare', quality: 'low', resolution: '2K' }, 0], [{ model: 'gpt-image-2.5-flare' }, 0],
    [{ model: 'gpt-image-2.5-flare', quality: 'low' }, 1], [{ model: 'gpt-image-2.5-sunburst', quality: 'medium' }, 0], [{ model: 'gpt-image-2.5-sunburst', quality: 'low' }, 3],
    [{ model: 'gemini-nano-banana-2.1', resolution: '2K' }, 0], [{ model: 'gemini-nano-banana-2.1', aspect_ratio: '3:2' }, 0], [{ model: 'gemini-nano-banana-2.1' }, 2],
    [{ model: 'gemini-3-pro-image' }, 1], [{ model: 'gemini-3-pro-image', resolution: '4K' }, 0], [{ model: 'nope' }, 0], [{}, 0],
  ]) {
    const out = ready(s, n);
    assert.equal(out.ready, false, JSON.stringify([s, n]));
    assert.equal(out.code, 'image_not_ready');
    assert.ok(out.message.length > 10 && !/\.\.\.|…/.test(out.message));
  }
  assert.match(ready({ model: 'gpt-image-2.5-sunburst', quality: 'medium' }, 0).message, /GPT Image 2\.5 Sunburst has only been tested for creating without references at 1:1, 1K, low quality and editing with up to 2 reference images at 1:1, 1K, low quality\./);
});
