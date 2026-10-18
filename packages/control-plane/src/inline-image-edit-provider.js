// Unexposed leaf adapter: caller must provide authorized bytes and durable spend/job admission.
// Existing provider/model: packages/web/dev-worker.js /api/learn/image.
// https://developers.openai.com/api/reference/resources/images/methods/edit
// No retry or fallback. Aborting a request does not prove provider cancellation or no billing.
const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_MASK = 4 * 1024 * 1024 - 1;
const MAX_OUTPUT = 10 * 1024 * 1024;
const MAX_RESPONSE = 14 * 1024 * 1024;
const TIMEOUT_MS = 120000;
const adapterFailure = Symbol('image-edit-adapter-failure');
const failure = (code, message) => Object.assign(new Error(message), { code, [adapterFailure]: true });

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

// Container validation only: no pixel decoder, alpha inspection or segmentation claim.
function pngInfo(bytes, maximum, code) {
  const bad = () => { throw failure(code, 'A bounded, structurally valid PNG is required.'); };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 57 || bytes.byteLength > maximum) bad();
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) bad();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, header, data = false, ended = false, chunks = 0;
  while (offset + 12 <= bytes.length) {
    if (++chunks > 4096) bad();
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) bad();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) bad();
    if (!header && type !== 'IHDR') bad();
    if (type === 'IHDR') {
      if (header || length !== 13) bad();
      const width = view.getUint32(offset + 8), height = view.getUint32(offset + 12);
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      if (!width || !height || width > 4096 || height > 4096 || width * height > 16777216) bad();
      // Deliberately narrow normalized-input profile; callers convert other image formats separately.
      if (depth !== 8 || ![2, 6].includes(color) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) bad();
      header = { width, height, alphaChannel: color === 6 };
    } else if (type === 'IDAT') {
      if (!length) bad();
      data = true;
    } else if (type === 'IEND') {
      if (length || !data || end !== bytes.length) bad();
      ended = true;
      break;
    } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT' || type[0] === type[0].toUpperCase()) bad();
    offset = end;
  }
  if (!ended) bad();
  return header;
}

async function boundedJson(response, signal) {
  if (!response.body) throw failure('invalid_output', 'Image provider returned no response body.');
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  const abort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_RESPONSE) throw failure('invalid_output', 'Image provider response exceeded the byte limit.');
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  signal.throwIfAborted();
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('invalid_output', 'Image provider returned invalid JSON.'); }
}

function reportedUsage(value) {
  const keys = ['input_tokens', 'output_tokens', 'total_tokens'];
  if (!value || keys.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)) return null;
  const usage = Object.fromEntries(keys.map(key => [key, value[key]]));
  const details = value.input_tokens_details;
  if (details && ['text_tokens', 'image_tokens'].every(key => Number.isSafeInteger(details[key]) && details[key] >= 0)) {
    usage.input_tokens_details = { text_tokens: details.text_tokens, image_tokens: details.image_tokens };
  }
  return usage;
}

export function imageEditProvider({ apiKey, transport = fetch } = {}) {
  return {
    async edit(input) {
      let started = false, signal;
      try {
        if (typeof apiKey !== 'string' || !apiKey.trim()) throw failure('not_configured', 'Image editing is not configured.');
        if (!input || !['remove_background', 'edit_image'].includes(input.operation)) throw failure('invalid_input', 'Unsupported image operation.');
        signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
        signal.throwIfAborted();
        const original = pngInfo(input.image, MAX_IMAGE, 'invalid_input');
        const regional = input.operation === 'edit_image';
        if (regional) {
          const mask = pngInfo(input.mask, MAX_MASK, 'invalid_input');
          if (!mask.alphaChannel || mask.width !== original.width || mask.height !== original.height) throw failure('invalid_input', 'The explicit alpha mask must match the original dimensions.');
          if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 2000) throw failure('invalid_input', 'A regional edit prompt of 1–2000 characters is required.');
        } else if (input.mask != null || input.prompt != null) throw failure('invalid_input', 'Background removal does not accept a mask or custom prompt.');
        const body = new FormData();
        for (const [key, value] of Object.entries({ model: 'gpt-image-1', n: '1', quality: 'low', size: '1024x1024', output_format: 'png', background: regional ? 'auto' : 'transparent' })) body.set(key, value);
        body.set('image', new Blob([input.image], { type: 'image/png' }), 'original.png');
        if (regional) body.set('mask', new Blob([input.mask], { type: 'image/png' }), 'mask.png');
        body.set('prompt', regional ? `Edit the transparent mask region according to this request. Preserve other content as closely as possible.\n${input.prompt.trim()}` : 'Remove the background and return the main subject on a transparent background. Preserve the subject as closely as possible.');
        signal.throwIfAborted();
        started = true;
        const response = await transport(ENDPOINT, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}` }, body, signal });
        if (!response.ok) { await response.body?.cancel().catch(() => {}); throw failure('provider_error', `Image provider request failed (${response.status}).`); }
        const result = await boundedJson(response, signal);
        signal.throwIfAborted();
        const encoded = Array.isArray(result.data) && result.data.length === 1 && result.data[0]?.b64_json;
        if (typeof encoded !== 'string' || !encoded.length || encoded.length > Math.ceil(MAX_OUTPUT / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw failure('invalid_output', 'Image provider returned no single bounded PNG.');
        const binary = atob(encoded), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const info = pngInfo(bytes, MAX_OUTPUT, 'invalid_output');
        if (info.width !== 1024 || info.height !== 1024 || (!regional && !info.alphaChannel)) throw failure('invalid_output', 'Image provider output dimensions or alpha channel are invalid.');
        return { bytes, mimeType: 'image/png', width: info.width, height: info.height, model: 'gpt-image-1', usage: reportedUsage(result.usage), validation: 'png-container', limitations: ['Fixed low-quality 1024×1024 output; original dimensions are not preserved.', 'PNG container validation does not verify decoded pixels, transparency, subject segmentation or unchanged subject pixels.', 'Provider-reported token usage is not settled billing.'] };
      } catch (error) {
        const code = signal?.aborted ? (input?.signal?.aborted ? 'cancelled' : 'timeout') : error?.[adapterFailure] ? error.code : 'provider_error';
        const message = error?.[adapterFailure] ? error.message : code === 'cancelled' ? 'Image editing was cancelled.' : code === 'timeout' ? 'Image editing timed out.' : 'Image provider request failed.';
        throw Object.assign(new Error(message), { code, providerRequestStarted: started, outcomeUnknown: started });
      }
    },
  };
}
