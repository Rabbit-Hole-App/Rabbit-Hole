// Per-call estimates for the ledger-bypass media calls (credits Phase 1 design, "Attempt recording"): integer micro-USD,
// each with its published source and the date it was read. An estimate is recorded with cost_state 'estimated', never as
// settled spend; a call with no source here is recorded 'unknown'. Measured costs replace these in the Phase 2 proposal.
import { toMicros } from './learn-usage.js';
import { PRICE_VERSION, priceUsage } from './pricing-registry.js';

// The registry version the estimates below were priced with; recordMedia stores it beside an estimated attempt.
export const ESTIMATE_PRICE = Object.freeze({ priceVersion: PRICE_VERSION });

const bytes = text => new TextEncoder().encode(String(text ?? '')).length;

// Legacy gpt-image-1 (dev-worker.js /api/learn/image, off unless LEGACY_IMAGE_GENERATION): the official OpenAI pricing page lists no rate for it
// (read 2026-10-23), so there is no registry row and the estimate is null: the attempt is recorded unknown, never zero. History of the
// old estimate: 272 image output tokens
// (https://developers.openai.com/api/docs/guides/image-generation, table "Low | 272 tokens", read 2026-10-16) at $40 per 1M
// image output tokens = 40 micros a token, plus the prompt's text input at $5 per 1M = 5 micros a token
// (https://developers.openai.com/api/docs/pricing, read 2026-10-16), its UTF-8 bytes standing in as a token upper bound.
export const imageEstimate = prompt => priceUsage({ provider: 'openai', model: 'gpt-image-1', quantities: { output_image: 272, input_text: bytes(prompt) } })?.micros ?? null; // no registry row: unknown, not 0

// OpenAI gpt-4o-transcribe (/api/learn/transcribe): "$0.006 / minute (estimated cost)"
// (https://developers.openai.com/api/docs/pricing, read 2026-10-16). The server does not know the clip's length; one
// minute is assumed because the route asks for a recording under a minute. ponytail: not measured.
export const TRANSCRIBE_ESTIMATE = priceUsage({ provider: 'openai', model: 'gpt-4o-transcribe', quantities: { audio_minute: 60 } }).micros; // 60 seconds; approximate
// Its replacement gpt-transcribe: "$0.0045 / minute" (same page, read 2026-10-26), billed per minute of audio duration; the same one-minute assumption. Used only when TRANSCRIBE_MODEL=gpt-transcribe.
export const TRANSCRIBE_NEXT_ESTIMATE = priceUsage({ provider: 'openai', model: 'gpt-transcribe', quantities: { audio_minute: 60 } }).micros;

// Exa search, type auto, up to 10 results: "$7 / 1k requests" (https://exa.ai/pricing, read 2026-10-16). Used only when
// the response carries no costDollars and the call asks for no contents (searchYouTube); summaries are not priced here.
export const EXA_SEARCH_ESTIMATE = priceUsage({ provider: 'exa', model: 'search', quantities: { request: 1 } }).micros;

// Exa's own reported cost of a call (costDollars.total in its response), in micros; null when it reports none.
export const exaCost = data => { const total = data?.costDollars?.total; return typeof total === 'number' ? toMicros(total) : null; };

// The most one Exa /search call can bill, for admission (owner L12 2026-10-20: a defensible maximum before the call):
// "$7 / 1k requests" for type auto with up to 10 results, "$1 / 1k results" for each result above 10 and "$1 / 1k pages,
// per content type" (https://exa.ai/pricing, read 2026-10-21). Integer micros: 7000 + 1000 a result past 10 + 1000 a page per
// content type.
export const exaSearchBound = (results, contentTypes = 0) => EXA_SEARCH_ESTIMATE + Math.max(0, results - 10) * 1000 + results * contentTypes * 1000;
