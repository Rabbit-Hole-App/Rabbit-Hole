// The ONE runtime price registry (owner credits brief 2026-10-23). Keyed by provider, exact model, billing category and service
// tier; every charge record stores PRICE_VERSION. Rates are provider list prices in USD and stay server side: people see credits.
// Accounting is integer micro-USD. 1 USD = 100 credits = 1,000,000 micros, so 1 credit = 10,000 micros.
// A leaf module: it imports nothing, so ledger, models and estimates can all read it.
//
// status: 'verified' (stated by the provider's official pricing page or the owner's rate table; see source and retrieved on the
//         row), 'estimate' (a published approximation that is not the bill, with its basis in note) or 'unverified' (kept from
//         the repo, but no official figure could be retrieved; used only to bound or estimate, never presented as measured).
// Anthropic output_tokens already includes thinking, so thinking has no row of its own there; Google bills thinking as text
// output ('output_text'). Cache read/write rows are priced on top of input_tokens, which excludes them.
export const PRICE_VERSION = '2026-10-23.1';

export const PER = Object.freeze({ mtok: 1e6, mbyte: 1e6, hour: 3600, minute: 60, request: 1 });
const VERIFIED = 'verified', UNVERIFIED = 'unverified', ESTIMATE = 'estimate';
const OWNER = 'owner rate table 2026-10-23';
const ANTHROPIC_PRICING = 'https://platform.claude.com/docs/en/about-claude/pricing', ANTHROPIC_FAST = 'https://platform.claude.com/docs/en/build-with-claude/fast-mode';
const OPENAI_PRICING = 'https://developers.openai.com/api/docs/pricing', EXA_PRICING = 'https://exa.ai/pricing', BEDROCK_PRICING = 'https://aws.amazon.com/bedrock/pricing/';
const RETRIEVED = '2026-10-23';

// [provider, model, tier, category, usd, per, status, note, source]. retrieved is the day an official page was read (null for the owner table).
const ROWS = [];
const row = (provider, model, tier, category, usd, per, status, note = null, source = OWNER) => ROWS.push({ provider, model, tier, category, usd, per, status, note, source, retrieved: /^https/.test(source) ? RETRIEVED : null });

// Anthropic: every figure is on the official pricing page (read 2026-10-23): a 5-minute write is 1.25x input, a 1-hour write 2x,
// a read 0.1x (0.05x on Opus 5.5 and Sonnet 5.5, so $0.20 and $0.10; Sonnet 5.5 was $0.20 until 2026-10-07). Fast mode is its own
// tier: $8/$40 on Opus 5.5 and $10/$50 on Opus 5, with the caching multipliers applied on top of the fast input price.
function anthropic(model, input, output, readMultiplier, fastRates = null) {
  row('anthropic', model, 'standard', 'input', input, PER.mtok, VERIFIED);
  row('anthropic', model, 'standard', 'output', output, PER.mtok, VERIFIED);
  row('anthropic', model, 'standard', 'cache_read', input * readMultiplier, PER.mtok, VERIFIED, `${readMultiplier}x input`, ANTHROPIC_PRICING);
  row('anthropic', model, 'standard', 'cache_write_5m', input * 1.25, PER.mtok, VERIFIED, '1.25x input', ANTHROPIC_PRICING);
  row('anthropic', model, 'standard', 'cache_write_1h', input * 2, PER.mtok, VERIFIED, '2x input', ANTHROPIC_PRICING);
  if (!fastRates) return;
  const [fastInput, fastOutput] = fastRates;
  const note = 'fast mode: caching multipliers apply on top of the fast input price';
  row('anthropic', model, 'fast', 'input', fastInput, PER.mtok, VERIFIED, null, ANTHROPIC_FAST);
  row('anthropic', model, 'fast', 'output', fastOutput, PER.mtok, VERIFIED, null, ANTHROPIC_FAST);
  row('anthropic', model, 'fast', 'cache_read', fastInput * readMultiplier, PER.mtok, VERIFIED, note, ANTHROPIC_FAST);
  row('anthropic', model, 'fast', 'cache_write_5m', fastInput * 1.25, PER.mtok, VERIFIED, note, ANTHROPIC_FAST);
  row('anthropic', model, 'fast', 'cache_write_1h', fastInput * 2, PER.mtok, VERIFIED, note, ANTHROPIC_FAST);
}
anthropic('claude-opus-5', 5, 25, 0.1, [10, 50]);
anthropic('claude-opus-5-5', 4, 20, 0.05, [8, 40]);
anthropic('claude-sonnet-5', 2, 10, 0.1); // its own row: Sonnet 5 keeps its rate when Sonnet 5.5 changes
anthropic('claude-sonnet-5-5', 2, 10, 0.05);
anthropic('claude-haiku-4-5-20251001', 1, 5, 0.1);
// AWS Bedrock global profile of Opus 5.5. AWS publishes no machine-readable rate (the model card sends to the pricing page, whose
// tables did not load as text on 2026-10-23), so these stay the repo's earlier figures, unverified. Reached only by an
// organisation's own AI settings (the organisation's AWS pays), never by the platform or a person's credits.
for (const model of ['global.anthropic.claude-opus-5-5', 'claude-opus-5-5']) {
  row('bedrock', model, 'standard', 'input', 4, PER.mtok, UNVERIFIED, 'launch rates from the AWS weekly roundup 2026-09-21; no retrievable AWS pricing table', BEDROCK_PRICING);
  row('bedrock', model, 'standard', 'output', 20, PER.mtok, UNVERIFIED, null, BEDROCK_PRICING);
  row('bedrock', model, 'standard', 'cache_read', 0.2, PER.mtok, UNVERIFIED, null, BEDROCK_PRICING);
}
// OpenAI planning model (optional path, needs OPENAI_API_KEY and LEARN_PLAN_MODEL); cached input is on the official page.
for (const model of ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14']) {
  row('openai', model, 'standard', 'input', 0.4, PER.mtok, VERIFIED);
  row('openai', model, 'standard', 'output', 1.6, PER.mtok, VERIFIED);
  row('openai', model, 'standard', 'cache_read', 0.1, PER.mtok, VERIFIED, null, OPENAI_PRICING);
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
// gpt-image-1 has no row: the official OpenAI pricing page (read 2026-10-23) does not list it, and the legacy route is off
// (LEGACY_IMAGE_GENERATION), so its cost is unknown, never a guessed number and never zero (learn-usage-estimates.js).
// gpt-4o-transcribe is billed per audio/text token ($2.50 in, $10 out per million, official page); the server does not see the
// token counts, so a call is an estimate from OpenAI's own "estimated cost $0.006 / minute" at the one minute the route allows.
// OpenAI marks the model deprecated (shutdown 2027-02-26, speech-to-text guide).
row('openai', 'gpt-4o-transcribe', 'standard', 'audio_minute', 0.006, PER.minute, ESTIMATE, 'OpenAI estimated cost per minute of audio; the bill is per token', OPENAI_PRICING);
row('openai', 'gpt-4o-transcribe', 'standard', 'input', 2.5, PER.mtok, VERIFIED, 'audio and text input tokens', OPENAI_PRICING);
row('openai', 'gpt-4o-transcribe', 'standard', 'output', 10, PER.mtok, VERIFIED, null, OPENAI_PRICING);
// Other billing units. Fish S1 bills UTF-8 input bytes; Scribe v2 Realtime bills audio time; Exa bills per request.
row('fish', 's1', 'standard', 'input_bytes', 15, PER.mbyte, VERIFIED);
row('elevenlabs', 'scribe_v2_realtime', 'standard', 'audio_hour', 0.39, PER.hour, VERIFIED, 'seconds of audio observed server side');
row('exa', 'search', 'standard', 'request', 7, 1000, VERIFIED, 'type auto, up to 10 results (+$1 per 1,000 results above 10, +$1 per 1,000 pages per content type)', EXA_PRICING);

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
