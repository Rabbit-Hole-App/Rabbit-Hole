// EXP-11-C03 (docs/features/explain.md), the OFFLINE normalization contract only: three provider response shapes -> one normalized result.
// No network, no credential, no model id is verified here. The shapes follow the public documentation as the harness authors understood it; every fixture in
// benchmarks/explain/adapter-fixtures/ uses obviously synthetic model ids. A real adapter (E7, needs verified access and a paid cap) must be checked against the
// provider's live behaviour before its numbers are trusted. A pure leaf like explanation-visuals.js.
//
// normalizeProviderResult(shape, raw, ctx) -> { output, requested:{provider,model}, served:{provider,model|null}, attempt, stop, error, usage:{input,output,cache,reasoning}, timing }
//   stop: 'end' | 'max_tokens' | 'refusal' | 'error' | 'unknown'.  error: null | { class, message }.  Usage fields are null when the provider did not say; null is never 0.
export const PROVIDER_SHAPES = Object.freeze(['anthropic', 'openai-compatible', 'gemini']);
export const NORMALIZED_ERROR_CLASSES = Object.freeze(['unsupported_images', 'missing_credentials', 'timeout', 'http_error', 'refusal', 'truncated_output', 'malformed_output', 'schema_incompatible', 'missing_identity', 'served_model_mismatch']);

const count = v => (Number.isFinite(v) && v >= 0 ? v : null);
const add = (...v) => (v.every(x => count(x) == null) ? null : v.reduce((n, x) => n + (count(x) ?? 0), 0));
const fail = (cls, message) => ({ class: cls, message });
const parseJson = text => { try { const value = JSON.parse(text); return value && typeof value === 'object' ? value : undefined; } catch { return undefined; } };

// Each parser returns { output (object | undefined when nothing readable), stop, model, usage }.
const PARSERS = {
  anthropic(raw, ctx) {
    const reason = raw.stop_reason;
    const part = (raw.content || []).find(p => p?.type === 'tool_use' && (!ctx.tool || p.name === ctx.tool));
    const u = raw.usage || {};
    return { output: part?.input && typeof part.input === 'object' ? part.input : undefined, model: raw.model ?? null,
      stop: reason === 'tool_use' || reason === 'end_turn' ? 'end' : reason === 'max_tokens' ? 'max_tokens' : reason === 'refusal' ? 'refusal' : 'unknown',
      usage: { input: count(u.input_tokens), output: count(u.output_tokens), cache: add(u.cache_creation_input_tokens, u.cache_read_input_tokens), reasoning: null } };
  },
  'openai-compatible'(raw) { // Celeris and Cerebras style chat completions in json_schema mode
    const choice = raw.choices?.[0], reason = choice?.finish_reason, u = raw.usage || {};
    const content = choice?.message?.content;
    return { output: typeof content === 'string' ? parseJson(content) : undefined, model: raw.model ?? null,
      stop: reason === 'stop' || reason === 'tool_calls' ? 'end' : reason === 'length' ? 'max_tokens' : reason === 'content_filter' ? 'refusal' : 'unknown',
      usage: { input: count(u.prompt_tokens), output: count(u.completion_tokens), cache: count(u.prompt_tokens_details?.cached_tokens), reasoning: count(u.completion_tokens_details?.reasoning_tokens) } };
  },
  gemini(raw) { // generateContent
    const candidate = raw.candidates?.[0], reason = candidate?.finishReason, u = raw.usageMetadata || {};
    const text = (candidate?.content?.parts || []).map(p => (typeof p?.text === 'string' ? p.text : '')).join('');
    const blocked = !candidate && raw.promptFeedback?.blockReason;
    // shortcut: whether candidatesTokenCount includes thinking tokens is not verified; reasoning is reported as given and output is not adjusted. Verify against a real response before costing Gemini.
    return { output: text ? parseJson(text) : undefined, model: raw.modelVersion ?? null,
      stop: blocked ? 'refusal' : reason === 'STOP' ? 'end' : reason === 'MAX_TOKENS' ? 'max_tokens' : ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason) ? 'refusal' : 'unknown',
      usage: { input: count(u.promptTokenCount), output: count(u.candidatesTokenCount), cache: count(u.cachedContentTokenCount), reasoning: count(u.thoughtsTokenCount) } };
  },
};

// The written card's tool input: title and body are required strings; more is an optional list of { label, text }; diagram is an optional object or null.
function schemaProblem(o) {
  if (typeof o.title !== 'string' || !o.title.trim()) return 'title is missing or not a string';
  if (typeof o.body !== 'string' || !o.body.trim()) return 'body is missing or not a string';
  if (o.more !== undefined && (!Array.isArray(o.more) || o.more.some(s => typeof s?.label !== 'string' || typeof s?.text !== 'string'))) return 'more must be a list of { label, text } strings';
  if (o.diagram !== undefined && o.diagram !== null && typeof o.diagram !== 'object') return 'diagram must be an object or null';
  return null;
}

// ctx: { provider, model, attempt, startedMs, endedMs, tool, credentialPresent, hasImages, capabilities:{images}, timedOut, httpStatus, servedAliases:[] }
export function normalizeProviderResult(shape, raw, ctx = {}) {
  if (!PROVIDER_SHAPES.includes(shape)) throw new Error(`Unknown provider response shape ${String(shape).slice(0, 40)}.`);
  const { provider = null, model = null, attempt = 1, startedMs = null, endedMs = null } = ctx;
  const result = (error, extra = {}) => ({ output: null, requested: { provider, model }, served: { provider, model: null }, attempt, stop: error ? 'error' : 'unknown', error,
    usage: { input: null, output: null, cache: null, reasoning: null }, timing: { startedMs, endedMs, durationMs: startedMs != null && endedMs != null ? endedMs - startedMs : null }, ...extra });
  // Capability and credential preflight: nothing was sent, so usage is genuinely absent rather than unknown, and nothing is dropped or weakened to continue.
  if (ctx.hasImages && ctx.capabilities?.images !== true) return result(fail('unsupported_images', 'This candidate cannot take the attached image, so the case was not sent and the image was not dropped.'));
  if (ctx.credentialPresent === false) return result(fail('missing_credentials', 'The credential is not configured, so nothing was sent.'));
  if (ctx.timedOut) return result(fail('timeout', 'The call timed out; the provider may still have used tokens, so usage stays unknown.'));
  if ((ctx.httpStatus != null && ctx.httpStatus >= 400) || raw == null || typeof raw !== 'object') return result(fail('http_error', `The provider returned ${ctx.httpStatus ?? 'no readable body'}; usage is unknown.`));
  const parsed = PARSERS[shape](raw, ctx);
  const base = result(null, { stop: parsed.stop, usage: parsed.usage, served: { provider, model: parsed.model } });
  if (parsed.stop === 'max_tokens') return { ...base, error: fail('truncated_output', 'The answer was cut off at the output limit.') };
  if (parsed.stop === 'refusal') return { ...base, error: fail('refusal', 'The provider declined or filtered the answer.') };
  if (parsed.output === undefined) return { ...base, error: fail('malformed_output', 'The answer held no readable JSON object for the card.') };
  const problem = schemaProblem(parsed.output);
  if (problem) return { ...base, error: fail('schema_incompatible', `The answer does not fit the card schema: ${problem}.`) };
  if (parsed.model == null || parsed.model === '') return { ...base, output: parsed.output, error: fail('missing_identity', 'The response did not say which model served it, so the identity is unproven.') };
  if (parsed.model !== model && !(ctx.servedAliases || []).includes(parsed.model)) return { ...base, output: parsed.output, error: fail('served_model_mismatch', `Requested ${model} but the response says ${parsed.model}.`) };
  return { ...base, output: parsed.output };
}
