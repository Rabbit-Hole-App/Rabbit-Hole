// IMG-01 provider adapters and quote (image-providers.js). Fixture transports only: no request leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_MODELS, imageSettings, imageQuote, measuredCostUsd, openaiImageAdapter, geminiImageAdapter, imageAdapter, providerConfigured } from '../src/image-providers.js';

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

test('Gemini Interactions: text and inline images in, the image read from either documented accessor', async () => {
  for (const reply of [{ steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: 'ok' }, { type: 'image', mime_type: 'image/png', data: PNG }] }] }, { output_image: { data: PNG } }]) {
    const { calls, transport } = recorder(async () => Response.json(reply));
    const out = await geminiImageAdapter({ apiKey: KEY, transport }).edit(gen('gemini-3-pro-image', { aspect_ratio: '16:9', resolution: '2K' }, [ref]));
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.response_format, { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' });
    assert.deepEqual(body.input, [{ type: 'text', text: 'A lighthouse at dusk.' }, { type: 'image', mime_type: 'image/png', data: PNG }]);
    assert.equal(out.mimeType, 'image/png');
    assert.equal(out.usage, null);
  }
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
