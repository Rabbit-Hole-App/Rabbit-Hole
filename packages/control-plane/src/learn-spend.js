// Runtime admission for paid Learn operations. Every production/dev paid call must pass here before a provider request.
// The platform cap is deliberately fail-closed: an unset cap or missing 0016 table refuses admission.
import { MODEL_PRICES } from './learn-models.js';

import { spendError, platformCaps, admitSpend, settleSpend, operationId, spendEnforced } from './learn-spend-ledger.js';
export { spendError, platformCaps, platformSpendStatus, admitSpend, settleSpend, operationId, spendEnforced } from './learn-spend-ledger.js';

// Prices for the existing picker models, verified 2026-10-12 (not aliases of 5.5):
// https://platform.claude.com/docs/en/models/opus-5/overview
// https://platform.claude.com/docs/en/models/sonnet-5/overview
// Keep this runtime extension separate from the evaluator's pinned price contract.
const prices = { ...MODEL_PRICES, 'claude-opus-5': [5, 25, 0.5], 'claude-sonnet-5': [2, 10, 0.2] };
// https://developers.openai.com/api/docs/models/gpt-4.1-mini
const openaiPrices = { 'gpt-4.1-mini': [0.4, 1.6, 0.1], 'gpt-4.1-mini-2025-04-14': [0.4, 1.6, 0.1] };
// AWS's published Opus 5.5 launch rates; only the global profile has a verified identity here.
// https://aws.amazon.com/jp/blogs/news/aws-weekly-20260921/
const bedrockPrices = { 'global.anthropic.claude-opus-5-5': [4, 20, 0.2], 'claude-opus-5-5': [4, 20, 0.2] };
const priceFor = (model, provider) => (provider === 'anthropic' ? prices : provider === 'openai' ? openaiPrices : provider === 'bedrock' ? bedrockPrices : {})[model];
// Conservative admission policy, independently implemented from the evaluator ledger.
// UTF-8 bytes + 1000 framing tokens is an assumption, not a published tokenizer/billing guarantee.
// If reported usage breaks the bound, keep the actual charge and block further admission.
export function requestSpendBound(body, model, provider = 'anthropic') {
  const price = priceFor(model, provider);
  if (!price || !Number.isSafeInteger(body?.max_tokens) || body.max_tokens <= 0) return null;
  let supported = true, cache = 1, images = 0, pdf = false;
  const normalized = JSON.parse(JSON.stringify(body));
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'image') {
      if (value.source?.type !== 'base64' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.source.media_type)) supported = false;
      else { images++; value.source.data = ''; }
    }
    if (value.type === 'document') {
      if (value.source?.type === 'base64' && value.source.media_type === 'application/pdf') { pdf = true; value.source.data = ''; }
      else if (value.source?.type !== 'text') supported = false;
    }
    if (typeof value.type === 'string' && /^(web_|code_execution|computer_)/.test(value.type)) supported = false;
    if (value.cache_control) cache = Math.max(cache, value.cache_control.ttl === '1h' ? 2 : 1.25);
    for (const child of Object.values(value)) visit(child);
  };
  visit(normalized);
  if (!supported || body.tools?.some(tool => tool.type && tool.type !== 'custom') || body.mcp_servers?.length || body.context_management?.edits?.length || body.fallbacks) return null;
  // Provider downscaling bounds image visual tokens, independent of compressed bytes:
  // https://platform.claude.com/docs/en/build-with-claude/vision
  // OpenAI mini: <=1536 patches x1.62, rounded up; https://developers.openai.com/api/docs/guides/images-vision
  const visual = images * (provider === 'openai' ? 2489 : model === 'claude-haiku-4-5-20251001' ? 1568 : 4784);
  // PDFs can expand compressed text/pages: reserve the model's entire documented context window.
  // https://platform.claude.com/docs/en/models/opus-5-5/overview (1M); Haiku 4.5: 200k.
  const contextLimit = provider === 'openai' ? 1047576 : model === 'claude-haiku-4-5-20251001' ? 200000 : 1000000;
  const input = pdf ? contextLimit : new TextEncoder().encode(JSON.stringify(normalized)).length + 1000 + visual;
  const multiplier = body.speed === 'fast' ? 2 : 1;
  return Math.ceil((input * price[0] * cache + body.max_tokens * price[1]) * multiplier) / 1e6;
}

const admission = Symbol('server spend admission');
const activeAdmissions = new WeakSet();
const refusal = reason => Response.json({ error: spendMessage(reason), code: 'spend_limited', reason }, { status: 429 });

// The private, single-call token prevents the Tutor wrapper and actual transport from reserving twice.
// It is neither a request field nor an API-key bypass and cannot authorize a different request/model/database.
export async function spendTransport(env, body, model, org, transport, identity = {}) {
  if (!spendEnforced(env)) return transport(env);
  if (!platformCaps(env).usd) return refusal('cap_unset');
  if (env.SUBSCRIPTION_ONLY === 'true') return transport(env);
  const provider = identity.provider || 'anthropic';
  const parent = env[admission];
  if (parent && activeAdmissions.has(parent) && parent.request === JSON.stringify(body) && parent.model === model && parent.provider === provider && parent.db === env.LEARN_DB) {
    activeAdmissions.delete(parent); // one transport, not reusable for retries or parallel calls
    return transport(env);
  }
  const reservedUsd = requestSpendBound(body, model, provider);
  if (reservedUsd == null) return refusal('spend_bound_unavailable');
  const opId = operationId(identity.category || 'provider');
  const gate = await admitSpend(env.LEARN_DB, env, { opId, userId: identity.userId || `provider:${org || 'platform'}`, org: org || 'platform', category: identity.category || 'provider', reservedUsd });
  if (gate.refused) return refusal(gate.reason);
  const token = { request: JSON.stringify(body), model, provider, db: env.LEARN_DB };
  activeAdmissions.add(token);
  const finish = async (result, error = null) => {
    const originalUsage = result?.usage;
    const usage = provider === 'openai' && originalUsage ? { input_tokens: originalUsage.prompt_tokens, output_tokens: originalUsage.completion_tokens, cache_read_input_tokens: 0 } : originalUsage;
    const valid = usage && ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)
      && ['cache_creation_input_tokens', 'cache_read_input_tokens'].every(key => usage[key] == null || Number.isSafeInteger(usage[key]) && usage[key] >= 0);
    // Price the served model, never assume the requested model proves the response's billing identity.
    const price = priceFor(result?.model, provider);
    let cost = valid && price ? Math.ceil((usage.input_tokens * price[0] + usage.output_tokens * price[1] + (usage.cache_creation_input_tokens || 0) * price[0] * 1.25 + (usage.cache_read_input_tokens || 0) * price[2]) * ((usage.speed || body.speed) === 'fast' ? 2 : 1)) / 1e6 : null;
    if (usage?.iterations?.length) cost = null; // Multiple billed fallback attempts need individual price identities.
    // The shared price helper accounts for five-minute cache writes. Without a reliable
    // per-TTL breakdown, a one-hour write keeps its conservative reservation.
    if (JSON.stringify(body).includes('\"ttl\":\"1h\"') && usage?.cache_creation_input_tokens > 0) cost = null;
    await settleSpend(env.LEARN_DB, opId, { status: error ? 'failed' : 'settled', calls: 1, costUsd: cost, model: result?.model || model, provider, error });
  };
  try {
    const response = await transport({ ...env, [admission]: token });
    activeAdmissions.delete(token);
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await finish(response.ok ? await response.clone().json().catch(() => null) : null, response.ok ? null : `http_${response.status}`);
      return response;
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '', result = null, complete = false;
    const parse = chunk => {
      pending += decoder.decode(chunk, { stream: true });
      const events = pending.split(/\r?\n\r?\n/); pending = events.pop();
      for (const event of events) {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        try {
          const value = JSON.parse(data);
          if (value.type === 'message_start') result = value.message;
          if (value.type === 'message_delta' && result) result.usage = { ...result.usage, ...value.usage };
          if (value.type === 'message_stop') complete = true;
        } catch { /* Non-usage event; an incomplete stream keeps its reservation. */ }
      }
      if (pending.length > 1024 * 1024) throw new Error('spend_stream_event_too_large');
    };
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) { await finish(complete ? result : null, complete ? null : 'stream_incomplete'); controller.close(); }
          else { parse(value); controller.enqueue(value); }
        } catch (error) {
          try { await reader.cancel(error); } catch { /* Preserve the original stream error. */ }
          await finish(null, 'stream_failed'); controller.error(error);
        }
      },
      async cancel(reason) { try { await reader.cancel(reason); } finally { await finish(null, 'stream_cancelled'); } },
    });
    return new Response(stream, { status: response.status, headers: response.headers });
  } catch (error) {
    activeAdmissions.delete(token);
    await finish(null, 'transport_failed');
    throw error;
  }
}

export const spendMessage = reason => reason === 'cap_unset'
  ? 'Paid Learn calls are paused until the platform daily dollar cap is configured.'
  : reason === 'spend_bound_unavailable'
    ? 'This model request is paused because its maximum dollar cost cannot be bounded with the configured prices.'
  : reason === 'daily_cap_reached'
    ? 'Paid Learn calls are paused because the platform daily dollar cap has been reached.'
    : 'Paid Learn calls are temporarily unavailable because spend controls are not ready.';
