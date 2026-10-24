// IMG-01 provider adapters and quote (image-providers.js). Fixture transports only: no request leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_MODELS, imageSettings, imageQuote, measuredCostUsd, usageCost, imageCost, openaiImageAdapter, geminiImageAdapter, imageAdapter, providerConfigured } from '../src/image-providers.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const KEY = 'fixture-key-not-real';
const recorder = reply => { const calls = []; return { calls, transport: async (url, init) => { calls.push({ url, init }); return reply(url, init); } }; };
const ref = { bytes: Uint8Array.from(atob(PNG), c => c.charCodeAt(0)), mimeType: 'image/png' };
const gen = (model, settings, references = []) => ({ model, prompt: 'A lighthouse at dusk.', settings, references });

test('the four verified models, nothing else, each with its provider secret by name', () => {
  assert.deepEqual(Object.keys(IMAGE_MODELS), ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gemini-nano-banana-2.1', 'gemini-3-pro-image']);
  assert.deepEqual(Object.values(IMAGE_MODELS).map(m => m.secret), ['OPENAI_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GEMINI_API_KEY']);
  assert.equal(providerConfigured({ GEMINI_API_KEY: ' ' }, 'gemini-3-pro-image'), false);
  assert.equal(providerConfigured({ GEMINI_API_KEY: KEY }, 'gemini-3-pro-image'), true);
  assert.equal(imageAdapter({}, 'gpt-image-1'), null);
  for (const model of Object.keys(IMAGE_MODELS)) assert.deepEqual(imageAdapter({}, model).capabilities, { generate: true, edit: true, retrieve: false, idempotency: false });
});

test('settings are refused, never adjusted, when a model cannot make them', () => {
  assert.deepEqual(imageSettings({ model: 'gpt-image-2.5-flare', aspect_ratio: '16:9', resolution: '2K', quality: 'low' }).value, { model: 'gpt-image-2.5-flare', quality: 'low', aspect_ratio: '16:9', resolution: '2K' });
  assert.match(imageSettings({ model: 'gpt-image-2.5-flare', aspect_ratio: '16:9', resolution: '1K' }).error, /16:9 at 1K/);
  assert.ok(imageSettings({ model: 'gemini-3-pro-image', aspect_ratio: '1:8', resolution: '1K' }).error);
  assert.ok(imageSettings({ model: 'gemini-3-pro-image', aspect_ratio: '1:1', resolution: '1K', quality: 'high' }).error);
  assert.ok(imageSettings({ model: 'gpt-image-2.5-sunburst', aspect_ratio: '1:1', resolution: '1K' }, 5).error);
  assert.equal(imageSettings({ model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K' }, 14).value.model, 'gemini-nano-banana-2.1');
});

test('the quote is unknown, never zero, wherever pricing is unverified or no bound is configured', () => {
  const env = { IMAGE_GENERATE_RESERVED_USD: '0.5' };
  for (const [settings, refs] of [
    [{ model: 'gpt-image-2.5-sunburst', aspect_ratio: '1:1', resolution: '1K', quality: 'low' }, 0],
    [{ model: 'gpt-image-2.5-flare', aspect_ratio: '1:1', resolution: '1K' }, 0],
    [{ model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '4K' }, 0],
    [{ model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K' }, 1],
  ]) {
    const q = imageQuote(env, settings, refs);
    assert.equal(q.state, 'unknown', JSON.stringify(settings));
    assert.equal(q.estimateUsd, undefined);
  }
  const priced = imageQuote(env, { model: 'gemini-nano-banana-2.1', aspect_ratio: '16:9', resolution: '2K' }, 0, 1000);
  assert.equal(priced.state, 'priced');
  assert.equal(priced.estimateUsd, 0.0504 + 1000 * 1.5 / 1e6);
  assert.equal(priced.estimate_credits, 6); assert.equal(priced.reserve_credits, 50);
  assert.deepEqual(priced.excludes, ['thinking_tokens']);
  assert.equal(imageQuote(env, { model: 'gemini-3-pro-image', aspect_ratio: '1:1', resolution: '4K' }, 3).estimateUsd, Number((0.24 + 3 * 0.0011).toFixed(6)));
  assert.equal(imageQuote({}, { model: 'gemini-3-pro-image', aspect_ratio: '1:1', resolution: '1K' }).reason, 'reserve_unset');
  assert.equal(imageQuote({ IMAGE_GENERATE_RESERVED_USD: '0' }, { model: 'gemini-3-pro-image', aspect_ratio: '1:1', resolution: '1K' }).reason, 'reserve_unset');
  assert.equal(imageQuote({ IMAGE_GENERATE_RESERVED_USD: '0.1' }, { model: 'gemini-3-pro-image', aspect_ratio: '1:1', resolution: '4K' }).reason, 'reserve_below_estimate');
});

test('measured cost only from OpenAI-reported tokens at the verified rates; otherwise unknown', () => {
  assert.equal(measuredCostUsd('gpt-image-2.5-flare', { input_tokens: 30, output_tokens: 1000, input_tokens_details: { text_tokens: 20, image_tokens: 10 } }), Number(((20 * 5 + 10 * 8 + 1000 * 30) / 1e6).toFixed(6)));
  assert.equal(measuredCostUsd('gpt-image-2.5-flare', { input_tokens: 30, output_tokens: 1000 }), Number(((30 * 8 + 1000 * 30) / 1e6).toFixed(6)));
  assert.equal(measuredCostUsd('gpt-image-2.5-flare', { output_tokens: 1000 }), null);
  assert.equal(measuredCostUsd('gpt-image-2.5-flare', null), null);
  assert.equal(measuredCostUsd('gemini-3-pro-image', { input_tokens: 1, output_tokens: 1 }), null);
});

test('OpenAI generations: one JSON request to the Images API with the mapped size and PNG output', async () => {
  const { calls, transport } = recorder(async () => Response.json({ data: [{ b64_json: PNG }], usage: { input_tokens: 9, output_tokens: 99 } }));
  const out = await openaiImageAdapter({ apiKey: KEY, transport }).generate(gen('gpt-image-2.5-sunburst', { aspect_ratio: '3:2', resolution: '1K', quality: 'medium' }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'gpt-image-2.5-sunburst', prompt: 'A lighthouse at dusk.', n: 1, size: '1536x1024', quality: 'medium', output_format: 'png' });
  assert.equal(out.mimeType, 'image/png');
  assert.equal(out.providerModel, 'gpt-image-2.5-sunburst');
  assert.deepEqual(out.usage, { input_tokens: 9, output_tokens: 99 });
});

test('OpenAI edits: reference images go as multipart to the edits endpoint', async () => {
  const { calls, transport } = recorder(async () => Response.json({ data: [{ b64_json: PNG }] }));
  await openaiImageAdapter({ apiKey: KEY, transport }).edit(gen('gpt-image-2.5-flare', { aspect_ratio: '1:1', resolution: '1K' }, [ref, ref]));
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits');
  const form = calls[0].init.body;
  assert.equal(form.getAll('image[]').length, 2);
  assert.equal(form.get('size'), '1024x1024');
  assert.equal(form.get('quality'), 'auto');
  await assert.rejects(openaiImageAdapter({ apiKey: KEY, transport }).edit(gen('gpt-image-2.5-flare', { aspect_ratio: '1:1', resolution: '1K' })), e => e.code === 'invalid_input' && !e.providerRequestStarted);
});

// Shapes from the Interactions API reference (https://ai.google.dev/api/interactions-api): status, steps[model_output].content[], usage.
const JPG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xd9)), JPG2 = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9));
const interaction = (patch = {}) => ({ id: 'v1_fixture', status: 'completed', model: 'gemini-nano-banana-2.1', steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: 'ok' }, { type: 'image', mime_type: 'image/jpeg', data: JPG }] }],
  usage: { total_input_tokens: 12, input_tokens_by_modality: [{ modality: 'text', tokens: 12 }], total_cached_tokens: 0, total_output_tokens: 1130, output_tokens_by_modality: [{ modality: 'text', tokens: 10 }, { modality: 'image', tokens: 1120 }], total_thought_tokens: 300, total_tool_use_tokens: 0, total_tokens: 1442 }, ...patch });

test('Gemini Interactions: text and inline images in, store:false, the LAST image of the REST steps out, usage kept', async () => {
  const two = interaction({ steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: JPG }] }, { type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: JPG2 }] }] });
  const { calls, transport } = recorder(async () => Response.json(two));
  const out = await geminiImageAdapter({ apiKey: KEY, transport }).edit(gen('gemini-3-pro-image', { aspect_ratio: '16:9', resolution: '2K' }, [ref]));
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.response_format, { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' }); // image/png is refused by the API
  assert.deepEqual(body.input, [{ type: 'text', text: 'A lighthouse at dusk.' }, { type: 'image', mime_type: 'image/png', data: PNG }]);
  assert.equal(body.store, false); assert.equal(body.background, undefined); assert.equal(body.previous_interaction_id, undefined);
  assert.equal(out.mimeType, 'image/jpeg', 'the real type, from the signature');
  assert.equal(btoa(String.fromCharCode(...out.bytes)), JPG2, 'the last image, as the SDK output_image documents');
  assert.equal(out.usage.total_output_tokens, 1130);
  // output_image is an SDK property, not a REST field: it is not read.
  await assert.rejects(geminiImageAdapter({ apiKey: KEY, transport: async () => Response.json({ status: 'completed', output_image: { data: PNG } }) }).generate(gen('gemini-3-pro-image', { aspect_ratio: '1:1', resolution: '1K' })), e => e.code === 'invalid_output');
});

test('Gemini status: failed and cancelled are definite failures; incomplete and any other non-completed status is an unknown outcome', async () => {
  const run = status => geminiImageAdapter({ apiKey: KEY, transport: async () => Response.json(interaction({ status })) }).generate(gen('gemini-nano-banana-2.1', { aspect_ratio: '1:1', resolution: '1K' }));
  for (const status of ['failed', 'cancelled']) await assert.rejects(run(status), e => e.code === 'provider_failed' && e.providerRequestStarted && e.definiteResponse);
  for (const status of ['incomplete', 'in_progress', 'requires_action', 'new_status']) await assert.rejects(run(status), e => e.code === 'incomplete' && e.providerRequestStarted && !e.definiteResponse, status);
  assert.equal((await run('completed')).mimeType, 'image/jpeg');
});

test('Gemini cost from usage: priced only when the modality split adds up; thinking at the text rate; estimated otherwise', () => {
  const usage = interaction().usage;
  // NB 2.1: 12 x $1.5 + 1120 x $30 + (10 + 300) x $7.5, per million
  assert.equal(measuredCostUsd('gemini-nano-banana-2.1', usage), Number(((12 * 1.5 + 1120 * 30 + 310 * 7.5) / 1e6).toFixed(6)));
  assert.equal(measuredCostUsd('gemini-3-pro-image', usage), Number(((12 * 2 + 1120 * 120 + 310 * 12) / 1e6).toFixed(6)));
  const { output_tokens_by_modality, ...noSplit } = usage;
  for (const bad of [noSplit, { ...usage, total_thought_tokens: undefined }, { ...usage, total_output_tokens: 1131 }, { ...usage, total_tool_use_tokens: 5 }, { ...usage, total_input_tokens: -1 }, { ...usage, output_tokens_by_modality: [{ modality: 'image', tokens: '1130' }] }])
    assert.equal(measuredCostUsd('gemini-nano-banana-2.1', bad), null);
});

// Real usage payloads from the 2026-10-23 live runs (receipts img-A-1, img-B-1, img-C-4, img-D-1, img-E-1).
const REAL = {
  A: { input_tokens: 19, input_tokens_details: { image_tokens: 0, text_tokens: 19 }, output_tokens: 196, output_tokens_details: { image_tokens: 196, text_tokens: 0 }, total_tokens: 215 },
  B: { input_tokens: 551, input_tokens_details: { image_tokens: 512, text_tokens: 39 }, output_tokens: 196, output_tokens_details: { image_tokens: 196, text_tokens: 0 }, total_tokens: 747 },
  C: { total_tokens: 2453, total_input_tokens: 14, input_tokens_by_modality: [{ modality: 'text', tokens: 14 }], total_cached_tokens: 0, total_output_tokens: 1439, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }], total_tool_use_tokens: 0, total_thought_tokens: 1000 },
  D: { total_tokens: 1312, total_input_tokens: 14, input_tokens_by_modality: [{ modality: 'text', tokens: 14 }], total_cached_tokens: 0, total_output_tokens: 1218, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }], total_tool_use_tokens: 0, total_thought_tokens: 80 },
  E: { total_tokens: 3038, total_input_tokens: 1134, input_tokens_by_modality: [{ modality: 'text', tokens: 14 }, { modality: 'image', tokens: 1120 }], total_cached_tokens: 0, total_output_tokens: 1407, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }], total_tool_use_tokens: 0, total_thought_tokens: 497 },
};

test('the three cost values on the real payloads: OpenAI is measured; Gemini does not reconcile, so it is an estimated upper bound (never measured)', () => {
  assert.deepEqual(usageCost('gpt-image-2.5-flare', REAL.A), { measuredUsd: 0.005975, estimatedUpperBoundUsd: 0.005975 }); // 19 x 5 + 196 x 30
  assert.deepEqual(usageCost('gpt-image-2.5-sunburst', REAL.B), { measuredUsd: 0.010171, estimatedUpperBoundUsd: 0.010171 }); // 39 x 5 + 512 x 8 + 196 x 30
  // C: 14 x $1.5/M + max(1439, 1120 + 1000) = 2120 x $30/M
  assert.deepEqual(usageCost('gemini-nano-banana-2.1', REAL.C), { measuredUsd: null, estimatedUpperBoundUsd: Number(((14 * 1.5 + 2120 * 30) / 1e6).toFixed(6)) });
  assert.equal(usageCost('gemini-nano-banana-2.1', REAL.C).estimatedUpperBoundUsd, 0.063621);
  // D: 14 x $2/M + max(1218, 1120 + 80) = 1218 x $120/M
  assert.deepEqual(usageCost('gemini-3-pro-image', REAL.D), { measuredUsd: null, estimatedUpperBoundUsd: 0.146188 });
  // E: (14 + 1120) x $1.5/M + max(1407, 1120 + 497) = 1617 x $30/M
  assert.deepEqual(usageCost('gemini-nano-banana-2.1', REAL.E), { measuredUsd: null, estimatedUpperBoundUsd: Number(((1134 * 1.5 + 1617 * 30) / 1e6).toFixed(6)) });
  assert.equal(usageCost('gemini-nano-banana-2.1', REAL.E).estimatedUpperBoundUsd, 0.050211);
  assert.equal(measuredCostUsd('gemini-nano-banana-2.1', REAL.C), null);
});

test('imageCost keeps measured, estimated upper bound and reserved apart; an amount over the reservation is an explicit overrun; no usage is unknown', () => {
  assert.deepEqual(imageCost('gemini-nano-banana-2.1', REAL.C, 0.06), { state: 'estimated_upper_bound', measuredUsd: null, estimatedUpperBoundUsd: 0.063621, reservedMaxUsd: 0.06, settledUsd: 0.063621, overrun: { exceeded: true, amountUsd: 0.003621 } });
  assert.equal(imageCost('gemini-nano-banana-2.1', REAL.E, 0.065).overrun.exceeded, false);
  assert.equal(imageCost('gpt-image-2.5-flare', REAL.A, 0.03).state, 'measured');
  assert.equal(imageCost('gpt-image-2.5-flare', { ...REAL.A, output_tokens_details: { image_tokens: 100, text_tokens: 96 } }, 0.03).state, 'estimated_upper_bound', 'text output has no published rate: not measured');
  assert.equal(imageCost('gpt-image-2.5-flare', { ...REAL.A, input_tokens: 40 }, 0.03).state, 'estimated_upper_bound', 'input not accounted for by its details: the rest at the highest input rate');
  assert.equal(usageCost('gpt-image-2.5-flare', { ...REAL.A, input_tokens: 40 }).estimatedUpperBoundUsd, Number(((19 * 5 + 21 * 8 + 196 * 30) / 1e6).toFixed(6)));
  for (const usage of [null, undefined, {}, { total_tokens: 5 }, { total_input_tokens: 5 }, { input_tokens: 5 }]) {
    for (const model of ['gpt-image-2.5-flare', 'gemini-3-pro-image']) assert.deepEqual(imageCost(model, usage, 0.1), { state: 'unknown', measuredUsd: null, estimatedUpperBoundUsd: null, reservedMaxUsd: 0.1, settledUsd: null, overrun: { exceeded: false, amountUsd: 0 } });
  }
  // Unknown modalities and tool-use tokens are bounded, not ignored: highest input rate, highest output rate.
  const odd = usageCost('gemini-3-pro-image', { total_input_tokens: 10, input_tokens_by_modality: [{ modality: 'video', tokens: 4 }], total_output_tokens: 5, total_thought_tokens: 2, total_tool_use_tokens: 3 });
  assert.equal(odd.measuredUsd, null);
  assert.equal(odd.estimatedUpperBoundUsd, Number(((10 * 2 + 5 * 120) / 1e6).toFixed(6)));
});

test('OpenAI 4xx: the stable reason code is kept, the message (which can echo the prompt) is not; no code when the body has none', async () => {
  const settings = { aspect_ratio: '1:1', resolution: '1K' };
  const fail = body => openaiImageAdapter({ apiKey: KEY, transport: async () => new Response(body, { status: 400 }) }).generate(gen('gpt-image-2.5-flare', settings));
  await assert.rejects(fail(JSON.stringify({ error: { type: 'image_generation_user_error', code: 'moderation_blocked', message: 'secret prompt text', moderation_details: {} } })),
    e => e.code === 'provider_error' && e.status === 400 && e.providerCode === 'moderation_blocked' && e.definiteResponse && !JSON.stringify(e).includes('secret prompt') && !e.message.includes('secret prompt'));
  for (const body of ['not json', '{}', JSON.stringify({ error: { code: 'has spaces and a sentence of prompt text' } }), JSON.stringify({ error: { code: 400 } })])
    await assert.rejects(fail(body), e => e.providerCode === undefined && e.status === 400);
  await assert.rejects(geminiImageAdapter({ apiKey: KEY, transport: async () => new Response(JSON.stringify({ error: { code: 400, message: 'x', status: 'INVALID_ARGUMENT' } }), { status: 400 }) }).generate(gen('gemini-3-pro-image', settings)), e => e.providerCode === 'INVALID_ARGUMENT');
});

test('OpenAI sizes above 2560x1440 are experimental: never quoted; the options themselves stay', () => {
  for (const settings of [{ aspect_ratio: '1:1', resolution: '2K' }, { aspect_ratio: '16:9', resolution: '4K' }, { aspect_ratio: '9:16', resolution: '4K' }]) {
    assert.ok(imageSettings({ model: 'gpt-image-2.5-flare', ...settings }).value);
    assert.equal(imageQuote({ IMAGE_GENERATE_RESERVED_USD: '5' }, { model: 'gpt-image-2.5-flare', ...settings }).reason, 'experimental_size');
  }
  assert.equal(imageQuote({ IMAGE_GENERATE_RESERVED_USD: '5' }, { model: 'gpt-image-2.5-flare', aspect_ratio: '1:1', resolution: '1K' }).reason, 'pricing_unverified');
});

test('every failure says whether a request left and whether the provider answered; the key is never in an error', async () => {
  const settings = { aspect_ratio: '1:1', resolution: '1K' };
  const cases = [
    [openaiImageAdapter({ apiKey: '', transport: async () => assert.fail('no request') }), 'gpt-image-2.5-flare', 'not_configured', false, false],
    [geminiImageAdapter({ apiKey: KEY, transport: async () => new Response('{"error":{"message":"bad"}}', { status: 400 }) }), 'gemini-3-pro-image', 'provider_error', true, true],
    [geminiImageAdapter({ apiKey: KEY, transport: async () => { throw new TypeError('connection reset'); } }), 'gemini-3-pro-image', 'network', true, false],
    [geminiImageAdapter({ apiKey: KEY, transport: async () => Response.json({ steps: [] }) }), 'gemini-3-pro-image', 'invalid_output', true, true],
    [openaiImageAdapter({ apiKey: KEY, transport: async () => Response.json({ data: [{ b64_json: btoa('plain text, not an image') }] }) }), 'gpt-image-2.5-flare', 'invalid_output', true, true],
    [openaiImageAdapter({ apiKey: KEY, transport: async () => new Response('not json') }), 'gpt-image-2.5-flare', 'invalid_output', true, true],
  ];
  for (const [adapter, model, code, started, definite] of cases) {
    await assert.rejects(adapter.generate(gen(model, settings)), error => {
      assert.equal(error.code, code); assert.equal(error.providerRequestStarted, started); assert.equal(error.definiteResponse, definite);
      assert.ok(!error.message.includes(KEY));
      return true;
    });
  }
  // A caller's abort (or the 120 s timeout) during the request: started, no definite answer.
  const controller = new AbortController();
  const hanging = geminiImageAdapter({ apiKey: KEY, transport: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))) });
  const pending = hanging.generate({ ...gen('gemini-3-pro-image', settings), signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.code === 'timeout' && error.providerRequestStarted && !error.definiteResponse);
});
