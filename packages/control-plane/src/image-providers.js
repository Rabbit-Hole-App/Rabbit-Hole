// IMG-01 image providers: the server's model allowlist, the quote, and one adapter per provider (docs/features/image-jobs.md).
// Facts come from the official pages read 2026-10-23 (C:/s/spec/img-01/audit.md section H1); anything those pages did not
// state is null or 'unknown' here, never a guess and never zero. The HTTP adapters run only inside an ImageJobs alarm after
// admission, which never happens while IMAGE_GENERATE_ENABLED is not 'true'. Secrets are read by name from env inside the
// worker and are never logged; no image body or provider body is logged either.
//
// Adapter interface (both providers):
//   { provider, capabilities: { generate, edit, retrieve, idempotency }, generate(input), edit(input) }
//   input  { model, prompt, settings: { quality, aspect_ratio, resolution }, references: [{ bytes, mimeType }], signal }
//   result { bytes: Uint8Array, mimeType, providerModel, usage: object | null }
//   throws Error { code, providerRequestStarted, definiteResponse, status? }: providerRequestStarted false means nothing left
//   this worker (safe to release); started with a definite HTTP response means the provider answered; started without one
//   (timeout, network) means the outcome is unknown. retrieve/idempotency are false for all four models: neither provider
//   documents a way to look up or deduplicate a lost image request, so a lost request is never resubmitted.

const MAX_OUTPUT = 20 * 1024 * 1024, MAX_RESPONSE = 30 * 1024 * 1024, TIMEOUT_MS = 120000;
const opt = (...values) => Object.freeze(values);
// The sizes the OpenAI image-prompting page lists as common, by ratio and resolution (same table as the UI-15.1 schema).
export const OPENAI_SIZES = Object.freeze({ '1:1': { '1K': '1024x1024', '2K': '2048x2048' }, '3:2': { '1K': '1536x1024' }, '2:3': { '1K': '1024x1536' }, '16:9': { '2K': '2048x1152', '4K': '3840x2160' }, '9:16': { '4K': '2160x3840' } });
const openai = label => Object.freeze({ label, provider: 'openai', secret: 'OPENAI_API_KEY', qualities: opt('auto', 'low', 'medium', 'high', 'xhigh', 'max'), ratios: opt(...Object.keys(OPENAI_SIZES)), resolutions: opt('1K', '2K', '4K'), maxReferences: 4 });
// maxReferences: OpenAI shows four in an example and states no maximum (4 is a conservative cap); Google states 14 in total.
export const IMAGE_MODELS = Object.freeze({
  'gpt-image-2.5-sunburst': openai('GPT Image 2.5 Sunburst'),
  'gpt-image-2.5-flare': openai('GPT Image 2.5 Flare'),
  'gemini-nano-banana-2.1': Object.freeze({ label: 'Nano Banana 2.1', provider: 'google', secret: 'GEMINI_API_KEY', qualities: null, ratios: opt('1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'), resolutions: opt('1K', '2K', '4K'), maxReferences: 14 }),
  'gemini-3-pro-image': Object.freeze({ label: 'Nano Banana Pro', provider: 'google', secret: 'GEMINI_API_KEY', qualities: null, ratios: opt('1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'), resolutions: opt('1K', '2K', '4K'), maxReferences: 14 }),
});

// -> { value: { model, quality, aspect_ratio, resolution } } or { error }. A pair the model cannot make is refused, never changed.
export function imageSettings(settings, referenceCount = 0) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const m = IMAGE_MODELS[s.model];
  if (!m) return { error: 'Choose one of the available image models.' };
  if (!m.ratios.includes(s.aspect_ratio)) return { error: `${m.label} does not make that aspect ratio.` };
  if (!m.resolutions.includes(s.resolution)) return { error: `${m.label} does not make that resolution.` };
  if (m.qualities ? !m.qualities.includes(s.quality ?? 'auto') : s.quality != null) return { error: `${m.label} does not take that quality.` };
  if (m.provider === 'openai' && !OPENAI_SIZES[s.aspect_ratio]?.[s.resolution]) return { error: `${m.label} does not make ${s.aspect_ratio} at ${s.resolution}.` };
  if (!Number.isSafeInteger(referenceCount) || referenceCount < 0 || referenceCount > m.maxReferences) return { error: `${m.label} takes at most ${m.maxReferences} reference images.` };
  return { value: { model: s.model, quality: m.qualities ? s.quality ?? 'auto' : null, aspect_ratio: s.aspect_ratio, resolution: s.resolution } };
}

// Published per-image output prices (USD) and input rates. null = not verified: that option cannot be quoted.
// Nano Banana 2.1 4K: the page's $0.113 disagrees with its own 2,520 tokens x $30/M = $0.0756, so it is unverified.
// Nano Banana 2.1 per input image: not stated. Pro: "about $0.0011" per input image. OpenAI: output tokens per quality and
// size are not on the pages read, so no OpenAI option has a price.
const PRICES = {
  'gemini-nano-banana-2.1': { output: { '1K': 0.0336, '2K': 0.0504, '4K': null }, referenceImage: null, textPerMillion: 1.5 },
  'gemini-3-pro-image': { output: { '1K': 0.134, '2K': 0.134, '4K': 0.24 }, referenceImage: 0.0011, textPerMillion: 2.0 },
};
const credits = usd => Math.ceil(Number((usd * 100).toFixed(6)));
// One generation's quote: the estimate from the published table and the reservation the job holds while it runs
// (IMAGE_GENERATE_RESERVED_USD, the owner's bound). -> { state: 'priced', ... } or { state: 'unknown', reason }. Unknown blocks
// Generate. The estimate excludes thinking tokens (billed by Google, count not published), so it is shown as an estimate only;
// the ledger settles at the reservation unless the provider reports usage this table can price.
export function imageQuote(env, settings, referenceCount = 0, promptBytes = 0) {
  const checked = imageSettings(settings, referenceCount);
  if (checked.error) return { state: 'unknown', reason: 'invalid_settings', message: checked.error };
  const { model, resolution } = checked.value, price = PRICES[model];
  if (!price) return { state: 'unknown', reason: 'pricing_unverified', message: 'The price for this model is not known yet, so it cannot be generated.' };
  const output = price.output[resolution];
  if (output == null || (referenceCount > 0 && price.referenceImage == null)) return { state: 'unknown', reason: 'pricing_unverified', message: 'The price for these settings is not known yet, so it cannot be generated.' };
  // A token is at least one UTF-8 byte, so prompt bytes bound the prompt's text tokens from above.
  const estimateUsd = Number((output + referenceCount * (price.referenceImage || 0) + promptBytes * price.textPerMillion / 1e6).toFixed(6));
  const reserveUsd = Number(String(env?.IMAGE_GENERATE_RESERVED_USD ?? '').trim() || NaN);
  if (!Number.isFinite(reserveUsd) || reserveUsd <= 0) return { state: 'unknown', reason: 'reserve_unset', message: 'Image generation has no spending bound configured.' };
  if (reserveUsd < estimateUsd) return { state: 'unknown', reason: 'reserve_below_estimate', message: 'Image generation is paused: its spending bound is below this estimate.' };
  return { state: 'priced', model, estimateUsd, reserveUsd, estimate_credits: credits(estimateUsd), reserve_credits: credits(reserveUsd), basis: 'published_per_image', excludes: ['thinking_tokens'] };
}

// Cost from provider-reported usage, where the rates are verified: OpenAI reports tokens (image output $30/M; image input $8/M;
// text input $5/M). Output tokens are all priced at the image output rate (an upper bound). Google usage is not parsed (its
// response usage shape is not on the pages read): null, so the ledger keeps the reservation as unknown cost.
export function measuredCostUsd(model, usage) {
  if (IMAGE_MODELS[model]?.provider !== 'openai' || !usage) return null;
  const n = key => (Number.isSafeInteger(usage[key]) && usage[key] >= 0 ? usage[key] : null);
  const input = n('input_tokens'), output = n('output_tokens');
  if (input == null || output == null) return null;
  const d = usage.input_tokens_details, text = Number.isSafeInteger(d?.text_tokens) ? d.text_tokens : 0, image = Number.isSafeInteger(d?.image_tokens) ? d.image_tokens : input - text;
  if (text + image !== input) return null;
  return Number(((text * 5 + image * 8 + output * 30) / 1e6).toFixed(6));
}

const failure = (code, { started = false, definite = false, status } = {}) => Object.assign(new Error(`image provider ${code}`), { code, providerRequestStarted: started, definiteResponse: definite, ...(status ? { status } : {}) });
const kind = bytes => bytes?.[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'image/png'
  : bytes?.[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
  : bytes?.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP' ? 'image/webp' : null;
// shortcut: output is checked by its file signature and size only, not decoded; upgrade if a provider ever returns non-images.
const imageOf = (encoded, started) => {
  if (typeof encoded !== 'string' || !encoded || encoded.length > Math.ceil(MAX_OUTPUT / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw failure('invalid_output', { started, definite: true });
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), mimeType = kind(bytes);
  if (!mimeType) throw failure('invalid_output', { started, definite: true });
  return { bytes, mimeType };
};
const base64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

async function readJson(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw failure('invalid_output', { started: true, definite: true });
  const chunks = []; let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE) throw failure('invalid_output', { started: true, definite: true });
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw failure('invalid_output', { started: true, definite: true }); }
}

// One POST with a timeout; every failure says whether a request left and whether the provider answered.
async function post(transport, url, init, input) {
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  let response;
  try { response = await transport(url, { ...init, method: 'POST', redirect: 'manual', signal }); }
  catch { throw failure(signal.aborted ? 'timeout' : 'network', { started: true }); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw failure('provider_error', { started: true, definite: true, status: response.status }); }
  try { return await readJson(response, signal); }
  catch (error) { if (error.code) throw error; throw failure(signal.aborted ? 'timeout' : 'network', { started: true }); }
}
const configured = key => typeof key === 'string' && key.trim().length > 0;

// OpenAI Images API: generations (no references) and edits (reference images), one PNG.
export function openaiImageAdapter({ apiKey, transport = fetch } = {}) {
  const run = async (input, edit) => {
    if (!configured(apiKey)) throw failure('not_configured');
    const size = OPENAI_SIZES[input.settings.aspect_ratio]?.[input.settings.resolution];
    if (!size || (edit ? !input.references?.length : input.references?.length)) throw failure('invalid_input');
    const fields = { model: input.model, prompt: input.prompt, n: 1, size, quality: input.settings.quality || 'auto', output_format: 'png' };
    let init;
    if (edit) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
      // Unverified: the field name for several images ('image[]', as OpenAI's multi-image edit examples send).
      input.references.forEach((ref, i) => form.append('image[]', new Blob([ref.bytes], { type: ref.mimeType }), `reference-${i + 1}`));
      init = { headers: { Authorization: `Bearer ${apiKey}` }, body: form };
    } else init = { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) };
    const body = await post(transport, `https://api.openai.com/v1/images/${edit ? 'edits' : 'generations'}`, init, input);
    if (!Array.isArray(body?.data) || body.data.length !== 1) throw failure('invalid_output', { started: true, definite: true });
    return { ...imageOf(body.data[0]?.b64_json, true), providerModel: input.model, usage: body.usage && typeof body.usage === 'object' ? body.usage : null };
  };
  return { provider: 'openai', capabilities: { generate: true, edit: true, retrieve: false, idempotency: false }, generate: input => run(input, false), edit: input => run(input, true) };
}

// Google Gemini image generation through the Interactions API (POST /v1beta/interactions, x-goog-api-key). The image is read
// from output_image.data or the first image block of a model_output step: the page documents those accessors, not the full
// REST response, so this shape is unverified until the first owner-authorized call.
export function geminiImageAdapter({ apiKey, transport = fetch } = {}) {
  const run = async (input, edit) => {
    if (!configured(apiKey)) throw failure('not_configured');
    if (edit ? !input.references?.length : input.references?.length) throw failure('invalid_input');
    const parts = [{ type: 'text', text: input.prompt }, ...(input.references || []).map(ref => ({ type: 'image', mime_type: ref.mimeType, data: base64(ref.bytes) }))];
    const body = await post(transport, 'https://generativelanguage.googleapis.com/v1beta/interactions', { headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.model, input: parts, response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: input.settings.aspect_ratio, image_size: input.settings.resolution } }) }, input);
    const block = body?.output_image?.data ? body.output_image : (body?.steps || []).filter(step => step?.type === 'model_output').flatMap(step => step.content || []).find(part => part?.type === 'image');
    return { ...imageOf(block?.data, true), providerModel: typeof body?.model === 'string' ? body.model : input.model, usage: null };
  };
  return { provider: 'google', capabilities: { generate: true, edit: true, retrieve: false, idempotency: false }, generate: input => run(input, false), edit: input => run(input, true) };
}

// The adapter for a model, with its secret read by name. transport is injectable so tests use fixture transports only.
export function imageAdapter(env, model, transport) {
  const m = IMAGE_MODELS[model];
  if (!m) return null;
  return (m.provider === 'openai' ? openaiImageAdapter : geminiImageAdapter)({ apiKey: env?.[m.secret], ...(transport ? { transport } : {}) });
}
export const providerConfigured = (env, model) => configured(env?.[IMAGE_MODELS[model]?.secret]);
