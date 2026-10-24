// The ONE runtime price registry (owner credits brief 2026-10-23). Keyed by provider, exact model, billing category and service
// tier; every charge record stores PRICE_VERSION. Rates are provider list prices in USD and stay server side: people see credits.
// Accounting is integer micro-USD. 1 USD = 100 credits = 1,000,000 micros, so 1 credit = 10,000 micros.
// A leaf module: it imports nothing, so ledger, models and estimates can all read it.
//
// status: 'verified' (the owner's rate table, standard API rates read 2026-10-23, caching/batch/extra tools excluded; or a
//         provider page the owner's table agrees with), 'approximate' (a published estimate, not an exact rate) or
//         'unverified' (a value the repo carried before the owner's table; kept, never invented, and listed in the report).
// Anthropic output_tokens already includes thinking, so thinking has no row of its own there; Google bills thinking as text
// output ('output_text'). Cache read/write rows are priced on top of input_tokens, which excludes them.
export const PRICE_VERSION = '2026-10-23.1';

export const PER = Object.freeze({ mtok: 1e6, mbyte: 1e6, hour: 3600, minute: 60, request: 1 });
const VERIFIED = 'verified', UNVERIFIED = 'unverified', APPROX = 'approximate';

// [provider, model, tier, category, usd, per, status, note]
const ROWS = [];
const row = (provider, model, tier, category, usd, per, status, note = null) => ROWS.push({ provider, model, tier, category, usd, per, status, note });

// Anthropic. Cache rows: the repo's values (a 5-minute write is 1.25x input, a 1-hour write 2x, a read the figures below);
// the owner has not confirmed them, except Sonnet 5.5 cached input, confirmed at $0.10 by Anthropic (owner 2026-10-23).
function anthropic(model, input, output, cacheRead, { cacheReadStatus = UNVERIFIED, fast = null } = {}) {
  row('anthropic', model, 'standard', 'input', input, PER.mtok, VERIFIED);
  row('anthropic', model, 'standard', 'output', output, PER.mtok, VERIFIED);
  row('anthropic', model, 'standard', 'cache_read', cacheRead, PER.mtok, cacheReadStatus);
  row('anthropic', model, 'standard', 'cache_write_5m', input * 1.25, PER.mtok, UNVERIFIED, '1.25x input, as the repo carried it');
  row('anthropic', model, 'standard', 'cache_write_1h', input * 2, PER.mtok, UNVERIFIED, '2x input, as the repo bound carried it');
  if (fast) for (const [category, usd] of Object.entries(fast)) row('anthropic', model, 'fast', category, usd, PER.mtok, UNVERIFIED, 'fast mode premium: twice standard, as the repo carried it');
}
const fast = (input, output, cacheRead) => ({ input: input * 2, output: output * 2, cache_read: cacheRead * 2, cache_write_5m: input * 2.5, cache_write_1h: input * 4 });
anthropic('claude-opus-5', 5, 25, 0.5, { fast: fast(5, 25, 0.5) });
anthropic('claude-opus-5-5', 4, 20, 0.2, { fast: fast(4, 20, 0.2) });
anthropic('claude-sonnet-5', 2, 10, 0.2); // its own row: Sonnet 5 keeps its rate when Sonnet 5.5 changes
anthropic('claude-sonnet-5-5', 2, 10, 0.1, { cacheReadStatus: VERIFIED });
anthropic('claude-haiku-4-5-20251001', 1, 5, 0.1);
// AWS Bedrock global profile of Opus 5.5: the launch rates the repo carried (https://aws.amazon.com/jp/blogs/news/aws-weekly-20260921/).
for (const model of ['global.anthropic.claude-opus-5-5', 'claude-opus-5-5']) {
  row('bedrock', model, 'standard', 'input', 4, PER.mtok, UNVERIFIED);
  row('bedrock', model, 'standard', 'output', 20, PER.mtok, UNVERIFIED);
  row('bedrock', model, 'standard', 'cache_read', 0.2, PER.mtok, UNVERIFIED);
}
// OpenAI planning model (optional path); https://developers.openai.com/api/docs/models/gpt-4.1-mini
for (const model of ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14']) {
  row('openai', model, 'standard', 'input', 0.4, PER.mtok, VERIFIED);
  row('openai', model, 'standard', 'output', 1.6, PER.mtok, VERIFIED);
  row('openai', model, 'standard', 'cache_read', 0.1, PER.mtok, UNVERIFIED);
}
// JEV 1.13 (practice grading, platform-funded: recorded apart, never in the user's balance): $0.042 per million input, free output.
for (const model of ['jev-1.13.0', 'jev-1.13']) {
  row('jev', model, 'standard', 'input', 0.042, PER.mtok, VERIFIED, 'platform-funded');
  row('jev', model, 'standard', 'output', 0, PER.mtok, VERIFIED, 'free output');
}
// Image models, per modality. There is NO universal price per image: a call's cost is its prompt, its references, any
// separately billed thinking and its output image, each at its own rate (image-jobs measured vs estimated vs reserved rules apply).
for (const model of ['gpt-image-2.5-sunburst-2026-09-08', 'gpt-image-2.5-flare']) {
  row('openai', model, 'standard', 'input_text', 5, PER.mtok, VERIFIED);
  row('openai', model, 'standard', 'input_image', 8, PER.mtok, VERIFIED);
  row('openai', model, 'standard', 'output_image', 30, PER.mtok, VERIFIED);
}
row('google', 'gemini-nano-banana-2.1', 'standard', 'input', 1.5, PER.mtok, VERIFIED);
row('google', 'gemini-nano-banana-2.1', 'standard', 'output_text', 7.5, PER.mtok, VERIFIED, 'text and thinking');
row('google', 'gemini-nano-banana-2.1', 'standard', 'output_image', 30, PER.mtok, VERIFIED);
row('google', 'gemini-3-pro-image', 'standard', 'input', 2, PER.mtok, VERIFIED);
row('google', 'gemini-3-pro-image', 'standard', 'output_text', 12, PER.mtok, VERIFIED, 'text and thinking');
row('google', 'gemini-3-pro-image', 'standard', 'output_image', 120, PER.mtok, VERIFIED);
// The repo's earlier OpenAI image model and transcription, outside the owner's table.
row('openai', 'gpt-image-1', 'standard', 'input_text', 5, PER.mtok, UNVERIFIED);
row('openai', 'gpt-image-1', 'standard', 'output_image', 40, PER.mtok, UNVERIFIED);
row('openai', 'gpt-4o-transcribe', 'standard', 'audio_minute', 0.006, PER.minute, APPROX, '"approximately $0.006 per minute"; the clip length is not known to the server');
// Other billing units. Fish S1 bills UTF-8 input bytes; Scribe v2 Realtime bills audio time; Exa bills per request.
row('fish', 's1', 'standard', 'input_bytes', 15, PER.mbyte, VERIFIED);
row('elevenlabs', 'scribe_v2_realtime', 'standard', 'audio_hour', 0.39, PER.hour, VERIFIED, 'seconds of audio observed server side');
row('exa', 'search', 'standard', 'request', 7, 1000, UNVERIFIED, 'type auto, up to 10 results: $7 per 1,000 requests (exa.ai/pricing, read 2026-10-16)');

const KEY = (provider, model, category, tier = 'standard') => `${provider}|${model}|${category}|${tier}`;
export const REGISTRY = Object.freeze(new Map(ROWS.map(r => [KEY(r.provider, r.model, r.category, r.tier), Object.freeze({ ...r, microsPerUnit: Math.round(r.usd * 1e6) })])));

export const rateOf = (provider, model, category, tier = 'standard') => REGISTRY.get(KEY(provider, model, category, tier)) || null;
// USD per million tokens, for the callers that kept the [input, output, cache read] shape.
export const mtokRates = (provider, model, tier = 'standard') => {
  const [input, output, cacheRead] = ['input', 'output', 'cache_read'].map(category => rateOf(provider, model, category, tier)?.usd);
  return input == null || output == null ? null : [input, output, cacheRead ?? 0];
};
export const unverifiedRows = () => [...REGISTRY.values()].filter(r => r.status !== VERIFIED);

// One quantity at one row's rate, integer micro-USD rounded up. toFixed(6) first, as toMicros does: a float product of
// exact decimals must not tip a whole number over by 1e-10.
const micros = (row, quantity) => Math.ceil(Number(((quantity * row.microsPerUnit) / row.per).toFixed(6)));

// Prices a usage record: { provider, model, tier, quantities: { category: amount } }. Every category with a positive amount needs a
// row, or the cost is unknown (null): never a guess, never zero. -> { micros, priceVersion, tier, quantities, unverified: [categories] } | null.
// Rounded up once over the sum, not per category and never to a whole credit, so small calls accumulate accurately.
export function priceUsage({ provider = 'anthropic', model, tier = 'standard', quantities }) {
  let sum = 0;
  const unverified = [];
  for (const [category, amount] of Object.entries(quantities || {})) {
    if (!(amount > 0)) continue;
    const found = rateOf(provider, model, category, tier);
    if (!found) return null;
    sum += (amount * found.microsPerUnit) / found.per;
    if (found.status !== VERIFIED) unverified.push(category);
  }
  // quantities: the billable amounts this price covered, one per category, each counted once; telemetry reads them as recorded.
  return { micros: Math.ceil(Number(sum.toFixed(6))), priceVersion: PRICE_VERSION, tier, quantities: Object.fromEntries(Object.entries(quantities).filter(([, amount]) => amount > 0)), unverified };
}
export { micros as quantityMicros };

// A provider usage object to the registry's categories, each token counted once. Anthropic: input_tokens excludes cache
// tokens; cache_creation (per TTL) splits the writes, else cache_creation_input_tokens is a 5-minute write; output includes
// thinking. OpenAI chat usage is mapped to input/output by the caller.
export function anthropicQuantities(usage) {
  const split = usage?.cache_creation;
  const hasSplit = split && (Number.isSafeInteger(split.ephemeral_5m_input_tokens) || Number.isSafeInteger(split.ephemeral_1h_input_tokens));
  return {
    input: usage?.input_tokens || 0,
    output: usage?.output_tokens || 0,
    cache_read: usage?.cache_read_input_tokens || 0,
    cache_write_5m: hasSplit ? split.ephemeral_5m_input_tokens || 0 : usage?.cache_creation_input_tokens || 0,
    cache_write_1h: hasSplit ? split.ephemeral_1h_input_tokens || 0 : 0,
  };
}

// micro-USD to credits for owner/admin reports only (never a user string): 10,000 micros a credit, exact.
export const creditsOf = microsAmount => microsAmount / 10_000;
