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
  // OpenAI marks sizes above 2560x1440 experimental (image-generation guide), so those options are never quoted.
  const [w, h] = (OPENAI_SIZES[checked.value.aspect_ratio]?.[resolution] || '').split('x').map(Number);
  if (IMAGE_MODELS[model].provider === 'openai' && w * h > 2560 * 1440) return { state: 'unknown', reason: 'experimental_size', message: 'OpenAI marks this size experimental, so it cannot be generated yet.' };
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

// Token rates in USD per million tokens, from the providers' own pricing pages read 2026-10-23: Google
// https://ai.google.dev/gemini-api/docs/pricing (paid, standard: input text/image/video, output text-and-thinking, output image);
// OpenAI https://developers.openai.com/api/pricing (both 2.5 models: text in $5, image in $8, image out $30; no text-output row is
// published). verified: true only where a page states the rate; a model without a verified row is never priced.
const RATES = {
  'gemini-nano-banana-2.1': { verified: true, input: { text: 1.5, image: 1.5 }, output: { text: 7.5, image: 30 } },
  'gemini-3-pro-image': { verified: true, input: { text: 2, image: 2 }, output: { text: 12, image: 120 } },
  'gpt-image-2.5-sunburst': { verified: true, input: { text: 5, image: 8 }, output: { image: 30 } },
  'gpt-image-2.5-flare': { verified: true, input: { text: 5, image: 8 }, output: { image: 30 } },
};
const maxOf = o => Math.max(...Object.values(o));
const tokens = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const usd = micro => Number((micro / 1e6).toFixed(6));
const splitOf = list => (Array.isArray(list) && list.every(p => typeof p?.modality === 'string' && tokens(p.tokens) != null) ? list : null);

// Google Interaction usage -> { measuredUsd, estimatedUpperBoundUsd } (each null when it cannot be stated).
//  measured: only when the usage reconciles exactly: output_tokens_by_modality adds up to total_output_tokens, thought tokens are
//    reported (billed at the text rate, apart from total_output_tokens: the API reference's example is 7 + 23 + 49 = 79) and no
//    tool-use tokens exist. Input tokens are priced per modality.
//  estimatedUpperBoundUsd: input tokens at the input rate by modality (any unattributed remainder at the highest input rate) +
//    max(total_output_tokens, every reported output component: modality tokens + thought + tool-use) x the model's HIGHEST output
//    rate (image). Assumption: nothing the provider reported can cost more than its highest per-token output rate. Real payloads
//    (2026-10-23 runs C, D, E) report thought tokens that exceed what total_output_tokens leaves over, which is why the max.
function googleUsage(model, usage) {
  const r = RATES[model], input = tokens(usage.total_input_tokens), output = tokens(usage.total_output_tokens);
  if (!r?.verified || input == null || output == null) return { measuredUsd: null, estimatedUpperBoundUsd: null };
  const thought = tokens(usage.total_thought_tokens), tool = tokens(usage.total_tool_use_tokens ?? 0);
  const inSplit = splitOf(usage.input_tokens_by_modality) || [], outSplit = splitOf(usage.output_tokens_by_modality);
  const inSum = inSplit.reduce((n, p) => n + p.tokens, 0), outSum = (outSplit || []).reduce((n, p) => n + p.tokens, 0);
  const inputMicro = inSplit.reduce((n, p) => n + p.tokens * (r.input[p.modality] ?? maxOf(r.input)), 0) + Math.max(0, input - inSum) * maxOf(r.input);
  const bound = inputMicro + Math.max(output, outSum + (thought ?? 0) + (tool ?? 0)) * maxOf(r.output);
  let measured = null;
  if (outSplit && thought != null && tool === 0 && outSum === output && inSum === input) {
    const image = outSplit.filter(p => p.modality === 'image').reduce((n, p) => n + p.tokens, 0);
    measured = inputMicro + image * r.output.image + (outSum - image + thought) * r.output.text;
  }
  return { measuredUsd: measured == null ? null : usd(measured), estimatedUpperBoundUsd: usd(bound) };
}

// OpenAI usage: measured when input_tokens reconciles with its text/image details and no text output tokens exist (no text-output
// rate is published); the upper bound prices every output token at the image rate and unattributed input at the image input rate.
function openaiUsage(model, usage) {
  const r = RATES[model], input = tokens(usage.input_tokens), output = tokens(usage.output_tokens);
  if (!r?.verified || input == null || output == null) return { measuredUsd: null, estimatedUpperBoundUsd: null };
  const d = usage.input_tokens_details, text = tokens(d?.text_tokens) ?? 0, image = tokens(d?.image_tokens) ?? Math.max(0, input - text);
  const micro = text * r.input.text + image * r.input.image + Math.max(0, input - text - image) * maxOf(r.input) + output * maxOf(r.output);
  const exact = text + image === input && !(tokens(usage.output_tokens_details?.text_tokens) > 0);
  return { measuredUsd: exact ? usd(micro) : null, estimatedUpperBoundUsd: usd(micro) };
}

// Provider-reported usage -> { measuredUsd, estimatedUpperBoundUsd }; both null when there is no usable usage.
export function usageCost(model, usage) {
  if (!usage || typeof usage !== 'object') return { measuredUsd: null, estimatedUpperBoundUsd: null };
  const provider = IMAGE_MODELS[model]?.provider;
  return provider === 'google' ? googleUsage(model, usage) : provider === 'openai' ? openaiUsage(model, usage) : { measuredUsd: null, estimatedUpperBoundUsd: null };
}
export const measuredCostUsd = (model, usage) => usageCost(model, usage).measuredUsd;

// The three values, kept apart (owner 2026-10-23). reservedMaxUsd is what the job held; settledUsd is what the ledger and the
// learner are charged: measured if there is one, else the estimated upper bound (never labelled measured), else null (unknown: the
// ledger keeps the reservation as unknown cost). A settled amount above the reservation is an explicit overrun, never clipped.
export function imageCost(model, usage, reservedMaxUsd) {
  const { measuredUsd, estimatedUpperBoundUsd } = usageCost(model, usage);
  const settledUsd = measuredUsd ?? estimatedUpperBoundUsd;
  const over = settledUsd != null && settledUsd > reservedMaxUsd + 1e-9;
  return { state: measuredUsd != null ? 'measured' : estimatedUpperBoundUsd != null ? 'estimated_upper_bound' : 'unknown', measuredUsd, estimatedUpperBoundUsd, reservedMaxUsd, settledUsd,
    overrun: { exceeded: over, amountUsd: over ? Number((settledUsd - reservedMaxUsd).toFixed(6)) : 0 } };
}

const failure = (code, { started = false, definite = false, status, providerCode } = {}) => Object.assign(new Error(`image provider ${code}`), { code, providerRequestStarted: started, definiteResponse: definite, ...(status ? { status } : {}), ...(providerCode ? { providerCode } : {}) });
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

async function readJson(response, signal, limit = MAX_RESPONSE) {
  const reader = response.body?.getReader();
  if (!reader) throw failure('invalid_output', { started: true, definite: true });
  const chunks = []; let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw failure('invalid_output', { started: true, definite: true });
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw failure('invalid_output', { started: true, definite: true }); }
}

// The provider's stable reason code from an error body (OpenAI error.code such as moderation_blocked, Google error.status); never
// its message, which can echo the prompt. null when absent or not a short identifier.
async function errorCode(response, signal) {
  try { const e = (await readJson(response, signal, 65536))?.error; return [e?.code, e?.status].find(v => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v)) || null; }
  catch { return null; }
}

// One POST with a timeout; every failure says whether a request left and whether the provider answered.
async function post(transport, url, init, input) {
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  let response;
  try { response = await transport(url, { ...init, method: 'POST', redirect: 'manual', signal }); }
  catch { throw failure(signal.aborted ? 'timeout' : 'network', { started: true }); }
  if (!response.ok) { const providerCode = await errorCode(response, signal); await response.body?.cancel().catch(() => {}); throw failure('provider_error', { started: true, definite: true, status: response.status, providerCode }); }
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

// Google Gemini image generation through the Interactions API (POST /v1beta/interactions, x-goog-api-key). The image is the LAST
// image block of the model_output steps, which is what the SDK's output_image documents ("the last generated image block"); that
// property is SDK-only, so the REST steps are read. store:false: the API retains interactions (prompts and reference images)
// 55 days by default; the docs list only background execution and previous_interaction_id as incompatible with it, and this
// adapter uses neither. Whether image output works with store:false is first shown by a live call.
// mime_type: the docs' REST example asks for image/jpeg and a live request for image/png was refused (400, 2026-10-23: supported
// 'image/jpeg'), so Google images are JPEG. The stored type is the one the file signature shows (imageOf), never the one requested.
// status (Interaction resource): absent or completed is read; failed and cancelled are definite failures; incomplete, in_progress,
// requires_action or anything else is an unknown outcome (a partial result may have been billed). Nothing is ever resubmitted.
export function geminiImageAdapter({ apiKey, transport = fetch } = {}) {
  const run = async (input, edit) => {
    if (!configured(apiKey)) throw failure('not_configured');
    if (edit ? !input.references?.length : input.references?.length) throw failure('invalid_input');
    const parts = [{ type: 'text', text: input.prompt }, ...(input.references || []).map(ref => ({ type: 'image', mime_type: ref.mimeType, data: base64(ref.bytes) }))];
    const body = await post(transport, 'https://generativelanguage.googleapis.com/v1beta/interactions', { headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.model, input: parts, store: false, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: input.settings.aspect_ratio, image_size: input.settings.resolution } }) }, input);
    if (body?.status != null && body.status !== 'completed') throw body.status === 'failed' || body.status === 'cancelled' ? failure('provider_failed', { started: true, definite: true }) : failure('incomplete', { started: true });
    const block = (body?.steps || []).filter(step => step?.type === 'model_output').flatMap(step => step.content || []).filter(part => part?.type === 'image').at(-1);
    return { ...imageOf(block?.data, true), providerModel: typeof body?.model === 'string' ? body.model : input.model, usage: body?.usage && typeof body.usage === 'object' ? body.usage : null };
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
