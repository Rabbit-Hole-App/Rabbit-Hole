// The converter's request contract and limits (docs/features/canvas-file-converter.md section 1).
// Pure: no I/O. Shared by the service (validation) and the child (output names, caps).

export const SCHEMA = 'file-convert/1';
export const RESULT_SCHEMA = 'file-convert-result/1';
const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({
  body_max_bytes: 16 * 1024,
  source_max_bytes: 64 * MiB,
  output_max_bytes: 50 * MiB,
  outputs_total_max_bytes: 100 * MiB,
  glb_max_bytes: 20 * MiB,            // the existing viewer's inspectGlb cap
  glb_max_accessor_elements: 5000000, // ditto
  glb_max_nodes: 5000,                // ditto
  slides_max_images: 300,
  text_max_bytes: 4 * MiB,
  audio_max_seconds: 4 * 3600,
  timeout_seconds: 300,
});

// Bump a converter's rev when its output for the same source and options changes.
export const CONVERTERS = Object.freeze({
  'office-pdf': { rev: 3, tools: ['libreoffice', 'poppler'], outputs: /^(preview\.pdf|text\.json|poster\.png)$/,
    options: { poster: v => typeof v === 'boolean' } },
  slides: { rev: 3, tools: ['libreoffice', 'poppler'], outputs: /^(preview\.pdf|text\.json|slide-\d{3}\.png)$/,
    options: { from: v => Number.isInteger(v) && v >= 1 && v <= 10000, to: v => Number.isInteger(v) && v >= 1 && v <= 10000, width: v => Number.isInteger(v) && v >= 320 && v <= 1920 } },
  'audio-playback': { rev: 1, tools: ['ffmpeg'], outputs: /^(playback\.m4a|probe\.json)$/,
    options: { bitrate_kbps: v => Number.isInteger(v) && v >= 64 && v <= 256 } },
  'step-glb': { rev: 1, tools: ['occt-import-js'], outputs: /^(model\.glb|structure\.json)$/,
    options: { quality: v => ['draft', 'normal', 'fine'].includes(v) } },
});

export const converterVersion = (name, tools = {}) =>
  `${name}/${CONVERTERS[name].rev}+${CONVERTERS[name].tools.map(t => `${t}-${tools[t] || 'unknown'}`).join('+')}`;

const HEX64 = /^[0-9a-f]{64}$/;
export const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const OUTPUT_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function origin(u) { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) && !x.username && !x.password ? x.origin : null; } catch { return null; } }

// Returns a list of errors; empty means valid. allowedOrigins: the control plane origins the
// converter may call (and send a callback token to).
export function validateJob(body, { allowedOrigins = [] } = {}) {
  const e = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body must be a JSON object'];
  const known = ['schema', 'job_id', 'attempt', 'converter', 'options', 'source', 'callback'];
  for (const k of Object.keys(body)) if (!known.includes(k)) e.push(`unknown field ${k}`);
  if (body.schema !== SCHEMA) e.push(`schema must be ${SCHEMA}`);
  if (typeof body.job_id !== 'string' || !JOB_ID.test(body.job_id)) e.push('job_id must match ^[A-Za-z0-9_-]{1,64}$');
  if (!Number.isInteger(body.attempt) || body.attempt < 1 || body.attempt > 100) e.push('attempt must be an integer 1..100');
  const conv = CONVERTERS[body.converter];
  if (!conv) e.push(`converter must be one of ${Object.keys(CONVERTERS).join(', ')}`);
  const options = body.options ?? {};
  if (typeof options !== 'object' || Array.isArray(options) || options === null) e.push('options must be an object');
  else if (conv) for (const [k, v] of Object.entries(options)) {
    if (!conv.options[k]) e.push(`options.${k} is not an option of ${body.converter}`);
    else if (!conv.options[k](v)) e.push(`options.${k} is out of range`);
  }
  if (conv && options.from && options.to && options.from > options.to) e.push('options.from must not exceed options.to');
  const s = body.source;
  if (!s || typeof s !== 'object') e.push('source is required');
  else {
    if (!origin(s.url)) e.push('source.url must be an http(s) URL');
    else if (!allowedOrigins.includes(origin(s.url))) e.push('source.url is not on an allowed origin');
    if (!Number.isInteger(s.bytes) || s.bytes < 1 || s.bytes > LIMITS.source_max_bytes) e.push(`source.bytes must be 1..${LIMITS.source_max_bytes}`);
    if (typeof s.sha256 !== 'string' || !HEX64.test(s.sha256)) e.push('source.sha256 must be 64 lowercase hex');
    if (s.media_type !== undefined && (typeof s.media_type !== 'string' || s.media_type.length > 200)) e.push('source.media_type must be a short string');
  }
  const c = body.callback;
  if (!c || typeof c !== 'object') e.push('callback is required');
  else {
    if (!origin(c.url)) e.push('callback.url must be an http(s) URL');
    else if (!allowedOrigins.includes(origin(c.url))) e.push('callback.url is not on an allowed origin');
    if (typeof c.token !== 'string' || c.token.length < 32 || c.token.length > 2048 || /\s/.test(c.token)) e.push('callback.token must be 32..2048 non-space characters');
    if (c.expires_at !== undefined && Number.isNaN(Date.parse(c.expires_at))) e.push('callback.expires_at must be an ISO time');
  }
  return e;
}

export const allowedOriginsFrom = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean).map(origin).filter(Boolean);

// Failures the control plane may retry (infrastructure), versus deterministic ones.
export const RETRYABLE = new Set(['source_unavailable', 'upload_failed', 'converter_restarted', 'converter_crashed', 'sandbox_failure']);
